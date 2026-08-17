import { Router } from 'express';
import { stellarClient } from '../stellar/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createReceipt } from '../db/receipts';
import logger from '../logger';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/receipts  — authenticated
//
// Creates a receipt record by calling the Soroban contract (or simulation),
// persists the result to the database, and returns the new receipt.
//
// Body:
//   sender   string  — customer's Stellar public key (G...)
//   amount   string  — amount in stroops
//   currency string  — asset code, e.g. "XLM"
//   token    string  — Stellar asset contract address (or "native" for XLM)
// ---------------------------------------------------------------------------

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { sender, amount, currency, token } = req.body;
    const { merchantId, publicKey: receiver } = req.merchant!;

    // --- Input validation ---------------------------------------------------
    if (!sender || !amount || !currency) {
      return res.status(400).json({
        error: {
          code: 'MISSING_FIELDS',
          message: 'sender, amount, and currency are required',
        },
      });
    }

    if (!/^G[A-Z2-7]{55}$/.test(sender)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_SENDER',
          message: 'sender must be a valid Stellar public key (G...)',
        },
      });
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_AMOUNT',
          message: 'amount must be a positive number',
        },
      });
    }

    if (sender === receiver) {
      return res.status(400).json({
        error: {
          code: 'SELF_PAYMENT',
          message: 'sender and receiver must be different addresses',
        },
      });
    }

    // --- Call Soroban contract (or simulation) ------------------------------
    const { receiptId, status } = await stellarClient.createReceipt(
      sender,
      receiver,
      amount,
      token || 'native',
    );

    // --- Persist to the database --------------------------------------------
    const record = await createReceipt({
      id:        receiptId,
      merchantId,
      amount,
      currency,
      status,
      sender,
      receiver,
      timestamp: Math.floor(Date.now() / 1000),
    });

    res.status(201).json({ receipt: record });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Error creating receipt');
    res.status(500).json({
      error: { code: 'RECEIPT_CREATION_FAILED', message: 'Failed to create receipt' },
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/receipts/:id  — public receipt lookup
// ---------------------------------------------------------------------------

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.length !== 64) {
      return res.status(400).json({
        error: {
          code: 'INVALID_RECEIPT_ID',
          message: 'Receipt ID must be a 64-character hex string',
        },
      });
    }

    const receipt = await stellarClient.getReceipt(id);

    if (!receipt) {
      return res.status(404).json({
        error: { code: 'RECEIPT_NOT_FOUND', message: 'Receipt not found' },
      });
    }

    res.json({ receipt });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Error fetching receipt');
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch receipt' },
    });
  }
});

export default router;
