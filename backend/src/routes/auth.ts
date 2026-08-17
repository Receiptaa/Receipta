import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getConfig } from '../config';
import logger from '../logger';
import { validatePassword, PASSWORD_POLICY_ERROR } from '../middleware/validatePassword';
import { createMerchant, getMerchantByEmail } from '../db/merchants';

const router = Router();

// Cookie configuration shared by login and register
const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,                                          // inaccessible to JavaScript
  secure: process.env.NODE_ENV === 'production',          // HTTPS-only in production
  sameSite: 'strict' as const,                            // no cross-site sending
  maxAge: 7 * 24 * 60 * 60 * 1000,                       // 7 days in ms
  path: '/',
};

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const { email, password, publicKey } = req.body;

    if (!email || !password || !publicKey) {
      return res.status(400).json({
        error: {
          code: 'MISSING_FIELDS',
          message: 'Email, password, and Stellar public key are required',
        },
      });
    }

    // Validate password policy before doing any work.
    // validatePassword accepts `unknown` so it also guards against malformed
    // bodies where `password` arrives as a non-string (object, array, etc.).
    const pwResult = validatePassword(password);
    if (!pwResult.valid) {
      (req.log ?? logger).debug(
        { reason: pwResult.reason },
        'Registration rejected: password policy violation',
      );
      return res.status(400).json({
        error: {
          code: 'WEAK_PASSWORD',
          message: PASSWORD_POLICY_ERROR,
        },
      });
    }

    // Check for duplicate email via the database
    const existing = await getMerchantByEmail(email);
    if (existing) {
      return res.status(409).json({
        error: {
          code: 'EMAIL_EXISTS',
          message: 'Email already registered',
        },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // Use a UUID so merchant IDs are non-sequential and cannot be enumerated.
    const merchantId = crypto.randomUUID();

    await createMerchant(merchantId, email, passwordHash, publicKey);

    const token = jwt.sign(
      { merchantId, email, publicKey },
      getConfig().jwtSecret,
      { expiresIn: '7d' },
    );

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.status(201).json({
      merchant: {
        id: merchantId,
        email,
        publicKey,
      },
    });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Registration error');
    res.status(500).json({
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to register merchant',
      },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: {
          code: 'MISSING_FIELDS',
          message: 'Email and password are required',
        },
      });
    }

    const merchant = await getMerchantByEmail(email);

    // Use a constant-time compare regardless of whether the merchant exists
    // to avoid user-enumeration via timing differences.
    const dummyHash =
      '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const hashToCompare = merchant ? merchant.passwordHash : dummyHash;
    const isValid = await bcrypt.compare(password, hashToCompare);

    if (!merchant || !isValid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    const token = jwt.sign(
      { merchantId: merchant.id, email: merchant.email, publicKey: merchant.publicKey },
      getConfig().jwtSecret,
      { expiresIn: '7d' },
    );

    res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    res.json({
      merchant: {
        id: merchant.id,
        email: merchant.email,
        publicKey: merchant.publicKey,
      },
    });
  } catch (error) {
    (req.log ?? logger).error({ err: error }, 'Login error');
    res.status(500).json({
      error: {
        code: 'LOGIN_FAILED',
        message: 'Failed to login',
      },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

export default router;
