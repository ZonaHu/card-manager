import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { ExternalLink, AlertCircle, CheckCircle, Loader } from 'lucide-react';

interface PlaidLinkProps {
  token: string;
  onSuccess: (accounts: any[]) => void;
  onClose: () => void;
  isNewUser: boolean;
}

const PlaidLink: React.FC<PlaidLinkProps> = ({ token, onSuccess, onClose, isNewUser }) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch link token from backend
  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/plaid/create-link-token', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Plaid link token error:', errorData);
          throw new Error(errorData.error || 'Failed to create link token');
        }

        const data = await response.json();
        setLinkToken(data.link_token);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLinkToken();
  }, [token]);

  const onSuccessCallback = useCallback(async (public_token: string, metadata: any) => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:3001/api/plaid/exchange-public-token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          public_token,
          institution: metadata.institution,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to connect accounts');
      }

      const data = await response.json();
      onSuccess(data.accounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, onSuccess]);

  // Real Plaid Link integration
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onSuccessCallback,
    onExit: onClose,
  });

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl p-6 w-full max-w-md text-center">
          <Loader className="animate-spin w-12 h-12 text-blue-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Setting up bank connection...</h3>
          <p className="text-gray-600">Please wait while we prepare your secure connection.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl p-6 w-full max-w-md">
          <div className="text-center mb-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-red-600">Connection Error</h3>
          </div>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg">
        {isNewUser && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-800 mb-2">Welcome to Card Manager! 👋</h3>
                <p className="text-blue-700 text-sm mb-3">
                  Connect your bank accounts to automatically import your cards and transactions. This is the fastest way to get started!
                </p>
                <div className="space-y-1 text-xs text-blue-600">
                  <p>✅ Bank-level security with 256-bit encryption</p>
                  <p>✅ Read-only access to your accounts</p>
                  <p>✅ Supports 11,000+ financial institutions</p>
                  <p>✅ Automatic transaction categorization</p>
                  <p>🧪 Running in Sandbox Mode (test data)</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mb-6">
          <ExternalLink className="w-12 h-12 text-blue-600 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-gray-900">Connect Your Bank</h2>
          <p className="text-gray-600 mt-2">
            Securely link your bank accounts to automatically import cards and transactions.
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-gray-800 mb-2">How it works:</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">1</div>
              <span>Choose your bank from 11,000+ supported institutions</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">2</div>
              <span>Log in with your online banking credentials</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-semibold">3</div>
              <span>We'll import your accounts and recent transactions</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <button
            onClick={open}
            disabled={!ready}
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <ExternalLink size={18} />
            Connect with Plaid
          </button>
          <button
            onClick={() => {
              console.log('Manual Entry clicked');
              onClose();
            }}
            className="flex-1 bg-gray-300 text-gray-700 py-3 px-4 rounded-lg font-semibold hover:bg-gray-400"
          >
            Manual Entry
          </button>
        </div>

        <div className="text-xs text-gray-500 text-center space-y-1">
          <p>🔒 Your credentials are encrypted and never stored</p>
          <p>📱 Powered by Plaid - trusted by millions</p>
          <p>🏦 Read-only access - we cannot make transactions</p>
        </div>
      </div>
    </div>
  );
};

export default PlaidLink;