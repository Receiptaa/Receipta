/**
 * db/pool.ts
 *
 * Single shared pg.Pool instance for the whole application.
 * The pool is lazily created on first access so that tests that never
 * touch the database do not require a DATABASE_URL to be set.
 */

import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    // DATABASE_URL is validated at startup in config.ts; if we reach here it
    // is guaranteed to be set.
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Keep the connection count low — this is a demo API.
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: true }
          : false,
    });

    _pool.on('error', (err) => {
      // Log unexpected idle-client errors without crashing the process.
      // Individual query errors are surfaced through the calling code.
      console.error('[pg pool] unexpected idle client error', err);
    });
  }
  return _pool;
}

/** Gracefully close all pool connections (used in tests and on SIGTERM). */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
