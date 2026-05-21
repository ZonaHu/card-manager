import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { API_BASE_URL } from '../config/api';

interface PlaidUpdateLinkProps {
  itemId: string;
  institutionName: string;
  onSuccess: () => void;
  onExit: () => void;
}

/**
 * Wraps Plaid Link in update mode for a specific item that returned
 * ITEM_LOGIN_REQUIRED (or similar). Fetches a one-shot link token bound to the
 * existing access_token on the server, opens the SDK, and posts completion
 * so the server can clear needs_reauth.
 */
const PlaidUpdateLink: React.FC<PlaidUpdateLinkProps> = ({ itemId, institutionName, onSuccess, onExit }) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/plaid/create-link-token-update`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item_id: itemId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to prepare update');
        if (!cancelled) setLinkToken(data.link_token);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [itemId]);

  const onLinkSuccess = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/plaid/update-complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId })
      });
    } catch {
      /* best-effort; next sync will clear the flag anyway if creds are fixed */
    }
    onSuccess();
  }, [itemId, onSuccess]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onLinkSuccess,
    onExit
  });

  useEffect(() => {
    if (ready && linkToken) open();
  }, [ready, linkToken, open]);

  if (error) {
    return (
      <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl p-6 w-full max-w-md">
          <h3 className="text-lg font-semibold text-red-600 mb-2">Reauth Error</h3>
          <p className="text-gray-700 mb-4">
            Could not start update for {institutionName}: {error}
          </p>
          <button onClick={onExit} className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg">
            Close
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default PlaidUpdateLink;
