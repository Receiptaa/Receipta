/**
 * db/migrate.ts
 *
 * Idempotent schema migration.  Safe to run on every startup — all statements
 * use IF NOT EXISTS so a running production database is never destructively
 * altered.
 *
 * Run standalone:
 *   npx ts-node src/db/migrate.ts
 *
 * Or programmatically (called from app.ts on startup):
 *   import { runMigrations } from './db/migrate';
 *   await runMigrations();
 */

import { getPool } from './pool';
import pino from 'pino';

const logger = pino({ name: 'migrate' });

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ------------------------------------------------------------------
    // merchants
    // Stores one row per registered merchant (merchant = app user).
    // ------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id            TEXT        PRIMARY KEY,
        email         TEXT        NOT NULL UNIQUE,
        password_hash TEXT        NOT NULL,
        public_key    TEXT        NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ------------------------------------------------------------------
    // receipts
    // Stores payment receipt metadata.  receipt_id is the 64-char hex
    // hash returned by the Soroban contract / simulation.
    // ------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id          TEXT        PRIMARY KEY,
        merchant_id TEXT        NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        amount      TEXT        NOT NULL,
        currency    TEXT        NOT NULL,
        status      TEXT        NOT NULL CHECK (status IN ('Pending','Confirmed','Failed')),
        sender      TEXT        NOT NULL,
        receiver    TEXT        NOT NULL,
        timestamp   BIGINT      NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS receipts_merchant_id_idx
        ON receipts (merchant_id, created_at DESC)
    `);

    // ------------------------------------------------------------------
    // payment_links
    // ------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_links (
        id               TEXT        PRIMARY KEY,
        merchant_id      TEXT        NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        merchant_name    TEXT        NOT NULL DEFAULT '',
        amount           TEXT        NOT NULL,
        currency         TEXT        NOT NULL,
        description      TEXT        NOT NULL DEFAULT '',
        receiver_address TEXT        NOT NULL,
        status           TEXT        NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active','expired','paid')),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at       TIMESTAMPTZ NOT NULL
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS payment_links_merchant_id_idx
        ON payment_links (merchant_id, created_at DESC)
    `);

    await client.query('COMMIT');
    logger.info('Database migrations applied successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'Migration failed — transaction rolled back');
    throw err;
  } finally {
    client.release();
  }
}

// Allow running this file directly: `npx ts-node src/db/migrate.ts`
if (require.main === module) {
  // Minimal env setup for standalone runs
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }
  runMigrations()
    .then(() => {
      logger.info('Migration complete');
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
