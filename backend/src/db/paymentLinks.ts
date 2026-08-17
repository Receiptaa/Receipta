/**
 * db/paymentLinks.ts
 *
 * Data-access layer for the `payment_links` table.
 * All SQL is parameterised — no string interpolation of user input.
 */

import { getPool } from './pool';

export type PaymentLinkStatus = 'active' | 'expired' | 'paid';

export interface PaymentLinkRow {
  id: string;
  merchantId: string;
  merchantName: string;
  amount: string;
  currency: string;
  description: string;
  receiverAddress: string;
  status: PaymentLinkStatus;
  createdAt: Date;
  expiresAt: Date;
}

function toPaymentLinkRow(row: Record<string, unknown>): PaymentLinkRow {
  return {
    id:              row.id               as string,
    merchantId:      row.merchant_id      as string,
    merchantName:    row.merchant_name    as string,
    amount:          row.amount           as string,
    currency:        row.currency         as string,
    description:     row.description      as string,
    receiverAddress: row.receiver_address as string,
    status:          row.status           as PaymentLinkStatus,
    createdAt:       row.created_at       as Date,
    expiresAt:       row.expires_at       as Date,
  };
}

/** Insert a new payment link. */
export async function createPaymentLink(
  link: Omit<PaymentLinkRow, 'createdAt' | 'status'>,
): Promise<PaymentLinkRow> {
  const { rows } = await getPool().query(
    `INSERT INTO payment_links
       (id, merchant_id, merchant_name, amount, currency,
        description, receiver_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      link.id,
      link.merchantId,
      link.merchantName,
      link.amount,
      link.currency,
      link.description,
      link.receiverAddress,
      link.expiresAt,
    ],
  );
  return toPaymentLinkRow(rows[0]);
}

/** Fetch a single payment link by ID. Returns null if not found. */
export async function getPaymentLinkById(id: string): Promise<PaymentLinkRow | null> {
  const { rows } = await getPool().query(
    `SELECT * FROM payment_links WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rows.length ? toPaymentLinkRow(rows[0]) : null;
}

/**
 * Mark expired links as 'expired' and return the (potentially updated) row.
 * This is a lightweight DB-side expiry sweep called on every public GET.
 */
export async function resolvePaymentLinkStatus(id: string): Promise<PaymentLinkRow | null> {
  const { rows } = await getPool().query(
    `UPDATE payment_links
     SET status = CASE
       WHEN status = 'active' AND expires_at < NOW() THEN 'expired'
       ELSE status
     END
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  return rows.length ? toPaymentLinkRow(rows[0]) : null;
}
