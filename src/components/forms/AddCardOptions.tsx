import React from 'react';
import { ExternalLink, Plus } from 'lucide-react';

interface AddCardOptionsProps {
  onConnectBank: () => void;
  onAddManually: () => void;
  onClose: () => void;
}

// Modal that branches the "Add Card" flow into Plaid Link vs manual entry.
// Plaid Link is the recommended path; manual is the fallback for accounts
// that aren't covered by Plaid (foreign banks, cash envelopes, etc.).
export const AddCardOptions: React.FC<AddCardOptionsProps> = ({ onConnectBank, onAddManually, onClose }) => {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="add-card-options-title" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 id="add-card-options-title" className="text-xl font-semibold mb-2 text-gray-900">Add Card or Account</h3>
        <p className="text-gray-600 mb-6">Choose how you'd like to add your financial account</p>

        <div className="space-y-4">
          <button
            onClick={onConnectBank}
            className="w-full p-4 border-2 border-blue-200 bg-blue-50 rounded-lg hover:border-blue-300 hover:bg-blue-100 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center group-hover:bg-blue-700 transition-colors">
                <ExternalLink className="text-white" size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-gray-900">Connect Bank Account</h4>
                <p className="text-sm text-gray-600">Securely link with Plaid for automatic syncing</p>
              </div>
            </div>
          </button>

          <button
            onClick={onAddManually}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                <Plus className="text-gray-600" size={20} />
              </div>
              <div className="text-left">
                <h4 className="font-semibold text-gray-900">Add Card Manually</h4>
                <p className="text-sm text-gray-600">Enter card details manually for basic tracking</p>
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
