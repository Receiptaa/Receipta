import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getConfig } from '../config';
import logger from '../logger';
import { validatePassword, PASSWORD_POLICY_ERROR } from '../middleware/validatePassword';

const router = Router();

// Cookie configuration shared by login and register
const COOKIE_NAME = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,                        // inaccessible to JavaScript
  secure: process.env.NODE_ENV === 'production', // HTTPS-only in production
  sameSite: 'strict' as const,           // no cross-site sending
  maxAge: 7 * 24 * 60 * 60 * 1000,      // 7 days in ms
  path: '/',
};

// In-memory store for demo - replace with database in production
const merchants = new Map<string, { id: string; email: string; passwordHash: string; publicKey: string }>();

// POST /api/auth/register - Merchant registration
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
      // Log the internal reason at debug level for ops visibility — never
      // expose it in the response.
      (req.log ?? logger).debug(
        { reason: pwResult.reason },
        'Registration rejected: password policy violation'
      );
      return res.status(400).json({
        error: {
          code: 'WEAK_PASSWORD',
          message: PASSWORD_POLICY_ERROR,
        },
      });
    }

    if (merchants.has(email)) {
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

    merchants.set(email, {
      id: merchantId,
      email,
      passwordHash,
      publicKey,
    });

    const token = jwt.sign(
      { merchantId, email, publicKey },
      getConfig().jwtSecret,
      { expiresIn: '7d' }
    );

    // Set the JWT as an HttpOnly cookie — never exposed to JS
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

// POST /api/auth/login - Merchant login
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

    const merchant = merchants.get(email);

    if (!merchant) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    const isValid = await bcrypt.compare(password, merchant.passwordHash);

    if (!isValid) {
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
      { expiresIn: '7d' }
    );

    // Set the JWT as an HttpOnly cookie — never exposed to JS
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

// POST /api/auth/logout - Clear the auth cookie server-side
router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

export default router;
