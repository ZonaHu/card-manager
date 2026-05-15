import React from 'react';
import { X, Shield, Lock, Eye, Database, ExternalLink, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface AboutProps {
  onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  useEscapeKey(true, onClose);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="about-title" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8" />
              <div>
                <h2 id="about-title" className="text-2xl font-bold">About Card Manager</h2>
                <p className="text-blue-100">Security, Privacy & How It Works</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-10 h-10 bg-white bg-opacity-20 rounded-full flex items-center justify-center hover:bg-opacity-30 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-8">
            {/* What is Card Manager */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-900">What is Card Manager?</h3>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-gray-700 leading-relaxed">
                  Card Manager is a personal financial dashboard that helps you track and analyze your credit cards, bank accounts, and transactions in one place. 
                  It automatically categorizes your spending, provides insights into your financial habits, and helps you manage multiple accounts efficiently.
                </p>
              </div>
            </section>

            {/* How It Works */}
            <section>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">1</div>
                    <h4 className="font-medium">Connect Your Accounts</h4>
                  </div>
                  <p className="text-sm text-gray-600">Link your bank accounts and credit cards securely through Plaid's banking API.</p>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">2</div>
                    <h4 className="font-medium">Automatic Sync</h4>
                  </div>
                  <p className="text-sm text-gray-600">Your transactions are automatically imported and categorized using smart algorithms.</p>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">3</div>
                    <h4 className="font-medium">Smart Analytics</h4>
                  </div>
                  <p className="text-sm text-gray-600">View spending patterns, category breakdowns, and financial insights in real-time.</p>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-bold">4</div>
                    <h4 className="font-medium">Manage & Track</h4>
                  </div>
                  <p className="text-sm text-gray-600">Edit transactions, track balances, and monitor your financial health over time.</p>
                </div>
              </div>
            </section>

            {/* Security & Trust */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-green-600" />
                <h3 className="text-xl font-semibold text-gray-900">Security & Trust</h3>
              </div>
              
              <div className="space-y-4">
                {/* Plaid Security */}
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <h4 className="font-medium text-green-900">Powered by Plaid</h4>
                  </div>
                  <p className="text-green-800 text-sm mb-2">
                    We use Plaid, a trusted financial technology company used by major apps like Venmo, Robinhood, and Mint.
                  </p>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>• Bank-level 256-bit SSL encryption</li>
                    <li>• SOC 2 Type II certified</li>
                    <li>• Used by 11,000+ financial institutions</li>
                    <li>• Read-only access to your accounts</li>
                  </ul>
                </div>

                {/* Data Security */}
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-5 h-5 text-blue-600" />
                    <h4 className="font-medium text-blue-900">Data Security</h4>
                  </div>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Your banking credentials are never stored on our servers</li>
                    <li>• All data is encrypted both in transit and at rest</li>
                    <li>• Secure token-based authentication</li>
                    <li>• Local data storage with encrypted database</li>
                  </ul>
                </div>

                {/* Privacy */}
                <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-5 h-5 text-purple-600" />
                    <h4 className="font-medium text-purple-900">Privacy Protection</h4>
                  </div>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>• Your financial data stays on your local system</li>
                    <li>• No sharing of personal information with third parties</li>
                    <li>• You control your data - delete anytime</li>
                    <li>• Anonymous usage analytics only (no personal data)</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* What Data We Access */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-gray-600" />
                <h3 className="text-xl font-semibold text-gray-900">What Data We Access</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-medium text-green-900 mb-2">What We DO Access</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• Account names and types</li>
                    <li>• Account balances</li>
                    <li>• Transaction history and descriptions</li>
                    <li>• Transaction categories and dates</li>
                    <li>• Institution names</li>
                  </ul>
                </div>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-900 mb-2">What We DON'T Access</h4>
                  <ul className="text-sm text-red-800 space-y-1">
                    <li>• Your banking passwords or credentials</li>
                    <li>• Social Security Numbers</li>
                    <li>• Full account numbers</li>
                    <li>• Ability to move money</li>
                    <li>• Personal identification documents</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Potential Concerns */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                <h3 className="text-xl font-semibold text-gray-900">Addressing Common Concerns</h3>
              </div>
              
              <div className="space-y-3">
                <details className="bg-gray-50 rounded-lg p-4 cursor-pointer">
                  <summary className="font-medium text-gray-900 select-none">Is it safe to share my banking information?</summary>
                  <div className="mt-2 text-sm text-gray-700 space-y-2">
                    <p>Yes, when using established services like Plaid. Your credentials go directly to Plaid's secure servers, not to us. Plaid is regulated and audited, with the same security standards as your bank.</p>
                  </div>
                </details>
                
                <details className="bg-gray-50 rounded-lg p-4 cursor-pointer">
                  <summary className="font-medium text-gray-900 select-none">Can you move money from my accounts?</summary>
                  <div className="mt-2 text-sm text-gray-700">
                    <p>No. We only have read-only access to view transactions and balances. We cannot initiate transfers, payments, or any account changes.</p>
                  </div>
                </details>
                
                <details className="bg-gray-50 rounded-lg p-4 cursor-pointer">
                  <summary className="font-medium text-gray-900 select-none">What happens if there's a data breach?</summary>
                  <div className="mt-2 text-sm text-gray-700 space-y-2">
                    <p>Your banking credentials are not stored on our systems, so they cannot be compromised. Transaction data is encrypted and stored locally. Even in a worst-case scenario, sensitive login information remains protected by Plaid.</p>
                  </div>
                </details>
                
                <details className="bg-gray-50 rounded-lg p-4 cursor-pointer">
                  <summary className="font-medium text-gray-900 select-none">How do I disconnect my accounts?</summary>
                  <div className="mt-2 text-sm text-gray-700">
                    <p>You can disconnect any account at any time through your bank's online portal or by deleting your account in Card Manager. All associated data will be permanently removed.</p>
                  </div>
                </details>
              </div>
            </section>

            {/* Learn More */}
            <section>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Learn More</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <a
                  href="https://plaid.com/safety/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-gray-500" />
                  <span className="text-sm">Plaid Security & Privacy</span>
                </a>
                
                <a
                  href="https://plaid.com/how-we-handle-data/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-gray-500" />
                  <span className="text-sm">How Plaid Handles Data</span>
                </a>
              </div>
            </section>

            {/* Bottom Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-sm text-blue-800">
                <strong>Your trust is our priority.</strong> If you have any questions or concerns about security, 
                please don't hesitate to reach out or review our security practices.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;