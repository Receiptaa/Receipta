'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';

const stroopsToXLM = (stroops: number): number => {
  return stroops / 10000000;
};

/**
 * Allow-list: receipt IDs must be exactly 64 lowercase hex characters.
 * Rejects path-traversal sequences, slashes, dots, and any non-hex input
 * before a network request is ever made.
 */
const RECEIPT_ID_RE = /^[0-9a-f]{64}$/i;
const RECEIPT_ID_MAX_LEN = 128; // hard upper bound; valid IDs are 64 chars

function validateReceiptId(id: string): string | null {
  if (!id || id.trim() === '') return 'Invalid receipt ID';
  if (id.length > RECEIPT_ID_MAX_LEN) return 'Invalid receipt ID';
  if (!RECEIPT_ID_RE.test(id)) return 'Invalid receipt ID';
  return null; // valid
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const [receiptId, setReceiptId] = useState('');
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pre-populate and auto-verify when arriving from the pay page via ?id=
  // Validate the query-param before touching state so a malicious link
  // cannot inject path-traversal characters or an oversized string.
  useEffect(() => {
    const idFromQuery = searchParams.get('id');
    if (idFromQuery) {
      const validationError = validateReceiptId(idFromQuery);
      if (validationError) {
        setError(validationError);
        return;
      }
      setReceiptId(idFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    if (receiptId.length === 64) {
      handleVerify(receiptId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  const handleVerify = async (id = receiptId) => {
    const validationError = validateReceiptId(id);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setReceipt(null);

    try {
      // encodeURIComponent ensures any residual special characters cannot
      // influence the URL path, providing defence-in-depth even if the
      // allow-list above is ever relaxed.
      const response = await fetch(
        `${apiUrl}/api/receipts/${encodeURIComponent(id)}`
      );

      if (!response.ok) {
        throw new Error('Receipt not found');
      }

      const data = await response.json();
      setReceipt(data.receipt);
    } catch {
      setError('Receipt not found or invalid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Verify Receipt</h1>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <label
          htmlFor="verify-receipt-id"
          className="block text-sm font-medium mb-2"
        >
          Receipt ID
        </label>
        <input
          id="verify-receipt-id"
          type="text"
          value={receiptId}
          onChange={(e) => setReceiptId(e.target.value)}
          placeholder="Enter 64-character receipt ID"
          className="w-full px-4 py-2 border rounded-lg mb-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          maxLength={64}
          aria-describedby="receipt-id-hint"
        />
        <p id="receipt-id-hint" className="sr-only">
          Enter the full 64-character hexadecimal receipt ID to look up a transaction.
        </p>

        <button
          onClick={() => handleVerify()}
          disabled={loading}
          aria-disabled={loading}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {loading ? 'Verifying…' : 'Verify Receipt'}
        </button>

        {error && (
          <div
            id="verify-error"
            role="alert"
            aria-live="assertive"
            className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg"
          >
            {error}
          </div>
        )}
      </div>

      {receipt && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2
            className={`text-xl font-bold mb-4 ${
              receipt.status === 'Confirmed' ? 'text-green-600' :
              receipt.status === 'Pending' ? 'text-yellow-600' :
              'text-red-600'
            }`}
          >
            {receipt.status === 'Confirmed' ? '✓ Receipt Confirmed' :
             receipt.status === 'Pending' ? '⏳ Receipt Pending — payment not yet confirmed' :
             '✗ Receipt Failed — this payment did not complete'}
          </h2>

          <dl className="space-y-3">
            <div>
              <dt className="font-medium inline">Status:</dt>
              <dd className="inline">
                <span
                  className={`ml-2 px-3 py-1 rounded-full text-sm ${
                    receipt.status === 'Confirmed'
                      ? 'bg-green-100 text-green-800'
                      : receipt.status === 'Pending'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {receipt.status}
                </span>
              </dd>
            </div>

            <div>
              <dt className="font-medium inline">Amount:</dt>
              <dd className="inline ml-2">
                {stroopsToXLM(receipt.amount).toFixed(7)} XLM ({receipt.amount.toLocaleString()} stroops)
              </dd>
            </div>

            <div>
              <dt className="font-medium inline">Sender:</dt>
              <dd className="inline ml-2 text-sm font-mono break-all">{receipt.sender}</dd>
            </div>

            <div>
              <dt className="font-medium inline">Receiver:</dt>
              <dd className="inline ml-2 text-sm font-mono break-all">{receipt.receiver}</dd>
            </div>

            <div>
              <dt className="font-medium inline">Timestamp:</dt>
              <dd className="inline ml-2">{new Date(receipt.timestamp * 1000).toLocaleString()}</dd>
            </div>

            {receipt.fee_amount > 0 && (
              <div>
                <dt className="font-medium inline">Platform Fee:</dt>
                <dd className="inline ml-2">
                  {stroopsToXLM(receipt.fee_amount).toFixed(7)} XLM ({receipt.fee_amount.toLocaleString()} stroops)
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-2">Status Explanation:</h3>
            <p className="text-sm text-gray-600">
              {receipt.status === 'Confirmed'
                ? 'This payment has been successfully confirmed on the Stellar network. The transaction is complete and irreversible.'
                : receipt.status === 'Pending'
                ? 'This payment is still being processed on the Stellar network. It has not yet been confirmed. Please check back later.'
                : 'This payment failed to complete. The transaction was not successful and no funds were transferred.'}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-8 max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Verify Receipt</h1>
          <div className="text-gray-500">Loading…</div>
        </main>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
