/**
 * config.ts — centralised environment variable validation.
 *
 * Call validateEnv() once at startup (before the server begins listening).
 * If any required variable is missing or invalid the process exits immediately
 * with a clear error message so the misconfiguration is caught before any
 * traffic is served.
 */

// NOTE: We import a minimal pino instance here rather than the application
// logger to avoid a circular dependency (logger → config → logger).
import pino from 'pino';
const configLogger = pino({ name: 'config' });

interface AppConfig {
  jwtSecret: string;
  databaseUrl: string;
  nodeEnv: string;
  port: number;
  frontendUrl: string;
  stellarRpcUrl: string;
  contractId: string;
  bodySizeLimit: string;
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validateEnv(): AppConfig {
  const errors: string[] = [];

  // ── Required secrets ───────────────────────────────────────────────────────

  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (!jwtSecret) {
    errors.push('JWT_SECRET is not set');
  } else if (jwtSecret.length < 32) {
    errors.push(
      `JWT_SECRET is too short (${jwtSecret.length} chars). Minimum length is 32 characters.`
    );
  }

  // ── Database ───────────────────────────────────────────────────────────────

  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl) {
    errors.push('DATABASE_URL is not set (e.g. postgres://user:pass@localhost:5432/receipta)');
  }

  // ── Stellar / contract (warn in dev, error in production) ─────────────────

  const contractId   = process.env.CONTRACT_ID   ?? '';
  const stellarRpcUrl = process.env.STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org';
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  if (nodeEnv === 'production') {
    if (!contractId) {
      errors.push('CONTRACT_ID is not set (required in production)');
    }
  } else {
    if (!contractId) {
      configLogger.warn(
        'CONTRACT_ID is not set — Soroban calls will use simulated receipt creation'
      );
    }
  }

  // ── Bail out if anything is wrong ─────────────────────────────────────────

  if (errors.length > 0) {
    configLogger.error(
      { errors },
      'Server startup aborted — environment misconfiguration. See backend/.env.example for the full list of required variables.'
    );
    process.exit(1);
  }

  // ── Optional with defaults ────────────────────────────────────────────────

  const port = parseInt(process.env.PORT ?? '3001', 10);
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

  // Maximum allowed JSON / urlencoded body size.
  // Keep this small — legitimate API payloads are well under 16 KB.
  // Override via BODY_SIZE_LIMIT, e.g. "32kb" or "1mb".
  const bodySizeLimit = process.env.BODY_SIZE_LIMIT ?? '16kb';

  return {
    jwtSecret,
    databaseUrl,
    nodeEnv,
    port,
    frontendUrl,
    stellarRpcUrl,
    contractId,
    bodySizeLimit,
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// Exported so routes/middleware can import the already-validated config object
// without re-running validation on every request.

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    throw new Error(
      'getConfig() called before validateEnv(). Call validateEnv() in app.ts first.'
    );
  }
  return _config;
}

export function initConfig(): AppConfig {
  _config = validateEnv();
  return _config;
}
