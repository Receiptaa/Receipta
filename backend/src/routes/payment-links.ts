import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import logger from '../logger';
import { createPaymentLink, resolvePaymentLinkStatus } from '../db/paymentLinks';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/payment-links
// Create a new payment link (authenticated).
// ---------------------------------------------------------------------------
router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { amount, currency, description, receiverAddress, merchantName } = req.body;

    if (!amount || !currency || !receiverAddress) {
      return res.status(400).json({
        error: {
          code: 'MISSING_FIELDS',
          message: 'Amount, currency, and receiver address are required',
        },
      });
    }

    const linkId    = `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const paymentLink = await createPaymentLink({
      id:              linkId,
      merchantId:      req.merchant!.merchantId,
      merchantName:    merchantName || '',
      amount,
      currency,
      description:     description || '',
      receiverAddress,
      expiresAt,
    });

    res.status(201).json({
      paymentLink: {
        ...paymentLink,
        url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pay/${linkId}`,
      },
    });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Error creating payment link');
    res.status(500).json({
      error: {
        code: 'LINK_CREATION_FAILED',
        message: 'Failed to create payment link',
      },
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/payment-links/:id  — PUBLIC endpoint (customer-facing /pay/:id)
//
// Returns ONLY the fields a customer needs to complete a payment.
// Sensitive fields (merchantId, receiverAddress, createdAt) are intentionally
// omitted to prevent merchant enumeration and data leakage.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // resolvePaymentLinkStatus atomically marks expired links before returning
    const link = await resolvePaymentLinkStatus(id);

    if (!link) {
      return res.status(404).json({
        error: {
          code: 'LINK_NOT_FOUND',
          message: 'Payment link not found',
        },
      });
    }

    if (link.status === 'expired') {
      return res.status(410).json({
        error: {
          code: 'LINK_EXPIRED',
          message: 'Payment link has expired',
        },
      });
    }

    // Explicitly project only safe, customer-relevant fields.
    const publicView = {
      amount:       link.amount,
      currency:     link.currency,
      description:  link.description,
      merchantName: link.merchantName,
      expiresAt:    link.expiresAt,
      status:       link.status,
    };

    res.json({ paymentLink: publicView });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Error fetching payment link');
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch payment link',
      },
    });
  }
});

export default router;
