'use client';

import { useState } from 'react';
import { apiUrl } from '../../lib/api';
import { StrKey } from '@stellar/stellar-sdk';

export function validateStellarPublicKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    return 'Stellar public key is required.';
  }
  if (!trimmed.startsWith('G')) {
    return 'Stellar public key must start with "G".';
  }
  if (trimmed.length !== 56) {
    return 'Stellar public key must be exactly 56 characters long.';
  }
  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    return 'Invalid Stellar public key format or checksum.';
  }
  return '';
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [publicKeyError, setPublicKeyError] = useState('');
  const [touchedPublicKey, setTouchedPublicKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePublicKeyChange = (value: string) => {
    setPublicKey(value);
    if (touchedPublicKey) {
      setPublicKeyError(validateStellarPublicKey(value));
    }
  };

  const handlePublicKeyBlur = () => {
    setTouchedPublicKey(true);
    setPublicKeyError(validateStellarPublicKey(publicKey));
  };

  const isPublicKeyValid = !validateStellarPublicKey(publicKey);
  const isSubmitDisabled = loading || !email.trim() || !password.trim() || !publicKey.trim() || !isPublicKeyValid;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouchedPublicKey(true);
    const keyErr = validateStellarPublicKey(publicKey);
    if (keyErr) {
      setPublicKeyError(keyErr);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, publicKey: publicKey.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Registration failed');
      }

      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Merchant Registration</h1>

        <form onSubmit={handleRegister} noValidate>
          <div className="mb-4">
            <label
              htmlFor="register-email"
              className="block text-sm font-medium mb-2"
            >
              Email
            </label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="email"
              required
              aria-required="true"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="register-password"
              className="block text-sm font-medium mb-2"
            >
              Password
            </label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="new-password"
              required
              aria-required="true"
              minLength={8}
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="register-public-key"
              className="block text-sm font-medium mb-2"
            >
              Stellar Public Key
            </label>
            <input
              id="register-public-key"
              type="text"
              value={publicKey}
              onChange={(e) => handlePublicKeyChange(e.target.value)}
              onBlur={handlePublicKeyBlur}
              placeholder="G..."
              className={`w-full px-4 py-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 ${
                touchedPublicKey && publicKeyError
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
              autoComplete="off"
              required
              aria-required="true"
              aria-invalid={touchedPublicKey && Boolean(publicKeyError)}
              aria-describedby={
                touchedPublicKey && publicKeyError
                  ? 'public-key-error public-key-hint'
                  : 'public-key-hint'
              }
            />
            {touchedPublicKey && publicKeyError && (
              <p
                id="public-key-error"
                role="alert"
                className="text-xs text-red-600 mt-1 font-medium"
              >
                {publicKeyError}
              </p>
            )}
            <p
              id="public-key-hint"
              className="text-xs text-gray-500 mt-1"
            >
              Your Stellar account public key for receiving payments
            </p>
            <div className="mt-2 text-xs">
              <a
                href="https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                How do I find my Stellar public key?
              </a>
            </div>
          </div>

          {error && (
            <div
              id="register-error"
              role="alert"
              aria-live="assertive"
              className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            aria-disabled={isSubmitDisabled}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <a
            href="/login"
            className="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          >
            Login
          </a>
        </p>
      </div>
    </main>
  );
}
