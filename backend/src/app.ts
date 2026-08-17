import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { initConfig } from './config';
import logger from './logger';
import { requestLogger } from './middleware/requestLogger';
import { runMigrations } from './db/migrate';
import { closePool } from './db/pool';

// Validate all required environment variables before the server starts.
// Exits with a non-zero code and a clear error if anything is missing.
const config = initConfig();

const app = express();

// Middleware
app.use(helmet());
app.use(
  cors({
    // Allow the frontend origin to send cookies
    origin: config.frontendUrl,
    credentials: true,
  })
);
// Restrict body size to prevent memory-exhaustion DoS attacks.
// The limit is read from config so it can be tuned per environment via
// BODY_SIZE_LIMIT without a code change (default: 16kb).
app.use(express.json({ limit: config.bodySizeLimit }));
app.use(express.urlencoded({ extended: false, limit: config.bodySizeLimit }));
app.use(cookieParser());
app.use(requestLogger);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Import routes
import authRouter from './routes/auth';
import receiptsRouter from './routes/receipts';
import paymentLinksRouter from './routes/payment-links';
import merchantRouter from './routes/merchant';

// Mount routes
app.use('/api/auth', authRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/payment-links', paymentLinksRouter);
app.use('/api/merchant', merchantRouter);

// 413 handler — oversized request bodies rejected by express.json / express.urlencoded
// Must be declared before the generic error handler so it takes precedence.
app.use((err: Error & { type?: string; status?: number }, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large' || err.status === 413) {
    (req.log ?? logger).warn(
      { url: req.url, method: req.method, limit: config.bodySizeLimit },
      'Request body exceeded size limit'
    );
    return res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Payload too large',
        status: 413,
      },
    });
  }
  next(err);
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  (req.log ?? logger).error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      status: 500,
    },
  });
});

const PORT = config.port;

if (require.main === module) {
  runMigrations()
    .then(() => {
      const server = app.listen(PORT, () => {
        logger.info({ port: PORT }, `Receipta backend listening`);
      });

      // Graceful shutdown — drain the connection pool on SIGTERM/SIGINT
      const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Shutdown signal received');
        server.close(async () => {
          await closePool();
          logger.info('Server closed and DB pool drained');
          process.exit(0);
        });
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT',  () => shutdown('SIGINT'));
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to run database migrations — aborting startup');
      process.exit(1);
    });
}

export default app;
