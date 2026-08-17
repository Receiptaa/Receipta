import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import logger from '../logger';
import { getReceiptsByMerchant, getReceiptStatsByMerchant } from '../db/receipts';
import { getPaymentLinkById } from '../db/paymentLinks';

const router = Router();

// ---------------------------------------------------------------------------
// Re-export the ReceiptRow type under the legacy name so receipts.ts can
// import it from this module without a circular dependency change.
// ---------------------------------------------------------------------------
export type { ReceiptRow as MerchantReceipt } from '../db/receipts';

// ---------------------------------------------------------------------------
// GET /api/merchant/receipts
// Query params: ?page=1&limit=20  (both optional, defaults shown)
// ---------------------------------------------------------------------------

router.get('/receipts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const merchantId = req.merchant!.merchantId;

    const page  = Math.max(1, parseInt((req.query.page  as string) ?? '1',  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10) || 20));

    const { receipts, total } = await getReceiptsByMerchant(merchantId, page, limit);

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      receipts,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Error fetching merchant receipts');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch receipts' },
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/merchant/stats
// ---------------------------------------------------------------------------

router.get('/stats', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const stats = await getReceiptStatsByMerchant(merchantId);
    res.json({ stats });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Error fetching merchant stats');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch statistics' },
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/merchant/payment-links/:id
// Returns the full payment link record, but only to the owning merchant.
// ---------------------------------------------------------------------------

router.get('/payment-links/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const link = await getPaymentLinkById(id);

    if (!link) {
      return res.status(404).json({
        error: { code: 'LINK_NOT_FOUND', message: 'Payment link not found' },
      });
    }

    // Ownership check — a merchant may only read their own links.
    if (link.merchantId !== req.merchant!.merchantId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    res.json({ paymentLink: link });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Error fetching merchant payment link');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch payment link' },
    });
  }
});

export default router;
