/**
 * db/receipts.ts
 *
 * Data-access layer for the `receipts` table.
 * All SQL is parameterised — no string interpolation of user input.
 */

import { getPool } from './pool';

export type ReceiptStatus = 'Pending' | 'Confirmed' | 'Failed';

export interface ReceiptRow {
  id: string;
  merchantId: string;
  amount: string;
  currency: string;
  status: ReceiptStatus;
  sender: string;
  receiver: string;
  /** Unix epoch seconds */
  timestamp: number;
  createdAt: Date;
}

function toReceiptRow(row: Record<string, unknown>): ReceiptRow {
  return {
    id:         row.id          as string,
    merchantId: row.merchant_id as string,
    amount:     row.amount      as string,
    currency:   row.currency    as string,
    status:     row.status      as ReceiptStatus,
    sender:     row.sender      as string,
    receiver:   row.receiver    as string,
    timestamp:  Number(row.timestamp),
    createdAt:  row.created_at  as Date,
  };
}

/** Insert a new receipt record. */
export async function createReceipt(receipt: Omit<ReceiptRow, 'createdAt'>): Promise<ReceiptRow> {
  const { rows } = await getPool().query(
    `INSERT INTO receipts
       (id, merchant_id, amount, currency, status, sender, receiver, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      receipt.id,
      receipt.merchantId,
      receipt.amount,
      receipt.currency,
      receipt.status,
      receipt.sender,
      receipt.receiver,
      receipt.timestamp,
    ],
  );
  return toReceiptRow(rows[0]);
}

/** Paginated list of receipts for a merchant, ordered newest-first. */
export async function getReceiptsByMerchant(
  merchantId: string,
  page: number,
  limit: number,
): Promise<{ receipts: ReceiptRow[]; total: number }> {
  const offset = (page - 1) * limit;

  const [dataResult, countResult] = await Promise.all([
    getPool().query(
      `SELECT * FROM receipts
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset],
    ),
    getPool().query(
      `SELECT COUNT(*)::int AS total FROM receipts WHERE merchant_id = $1`,
      [merchantId],
    ),
  ]);

  return {
    receipts: dataResult.rows.map(toReceiptRow),
    total: countResult.rows[0].total as number,
  };
}

/** Aggregate stats for a merchant's receipts. */
export async function getReceiptStatsByMerchant(merchantId: string): Promise<{
  totalReceipts: number;
  confirmedReceipts: number;
  pendingReceipts: number;
  failedReceipts: number;
  totalVolume: string;
}> {
  const { rows } = await getPool().query(
    `SELECT
       COUNT(*)                                                 AS total_receipts,
       COUNT(*) FILTER (WHERE status = 'Confirmed')            AS confirmed_receipts,
       COUNT(*) FILTER (WHERE status = 'Pending')              AS pending_receipts,
       COUNT(*) FILTER (WHERE status = 'Failed')               AS failed_receipts,
       COALESCE(
         SUM(amount::numeric) FILTER (WHERE status = 'Confirmed'),
         0
       )                                                        AS total_volume
     FROM receipts
     WHERE merchant_id = $1`,
    [merchantId],
  );

  const row = rows[0];
  return {
    totalReceipts:     Number(row.total_receipts),
    confirmedReceipts: Number(row.confirmed_receipts),
    pendingReceipts:   Number(row.pending_receipts),
    failedReceipts:    Number(row.failed_receipts),
    totalVolume:       String(row.total_volume),
  };
}
