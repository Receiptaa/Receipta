/**
 * db/merchants.ts
 *
 * Data-access layer for the `merchants` table.
 * All SQL is parameterised — no string interpolation of user input.
 */

import { getPool } from './pool';

export interface MerchantRow {
  id: string;
  email: string;
  passwordHash: string;
  publicKey: string;
  createdAt: Date;
}

/** Map a raw DB row (snake_case) to a typed object (camelCase). */
function toMerchantRow(row: Record<string, unknown>): MerchantRow {
  return {
    id:           row.id           as string,
    email:        row.email        as string,
    passwordHash: row.password_hash as string,
    publicKey:    row.public_key   as string,
    createdAt:    row.created_at   as Date,
  };
}

/** Insert a new merchant. Throws on duplicate email (unique constraint). */
export async function createMerchant(
  id: string,
  email: string,
  passwordHash: string,
  publicKey: string,
): Promise<MerchantRow> {
  const { rows } = await getPool().query(
    `INSERT INTO merchants (id, email, password_hash, public_key)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, email, passwordHash, publicKey],
  );
  return toMerchantRow(rows[0]);
}

/** Look up a merchant by email. Returns null if not found. */
export async function getMerchantByEmail(email: string): Promise<MerchantRow | null> {
  const { rows } = await getPool().query(
    `SELECT * FROM merchants WHERE email = $1 LIMIT 1`,
    [email],
  );
  return rows.length ? toMerchantRow(rows[0]) : null;
}

/** Look up a merchant by ID. Returns null if not found. */
export async function getMerchantById(id: string): Promise<MerchantRow | null> {
  const { rows } = await getPool().query(
    `SELECT * FROM merchants WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows.length ? toMerchantRow(rows[0]) : null;
}
