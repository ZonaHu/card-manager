import React, { useState, useEffect } from 'react';
import { Globe, DollarSign, CheckCircle } from 'lucide-react';

interface RegionSelectorProps {
  token: string;
  onRegionSelected: (country: string, currency: string) => void;
  onClose: () => void;
}

const RegionSelector: React.FC<RegionSelectorProps> = ({ token, onRegionSelected, onClose }) => {
  const [selectedRegion, setSelectedRegion] = useState('US');
  const [loading, setLoading] = useState(false);

  const regions = [
    {
      code: 'US',
      name: 'United States',
      currency: 'USD',
      currencyName: 'US Dollar',
      flag: '🇺🇸',
      features: [
        '11,000+ financial institutions',
        'Major banks: Chase, Wells Fargo, Bank of America',
        'Credit cards, checking, savings, investments'
      ]
    },
    {
      code: 'CA',
      name: 'Canada',
      currency: 'CAD',
      currencyName: 'Canadian Dollar',
      flag: '🇨🇦',
      features: [
        '200+ Canadian financial institutions',
        'Major banks: RBC, TD, Scotiabank, BMO',
        'Credit cards, chequing, savings accounts'
      ]
    }
  ];

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const region = regions.find(r => r.code === selectedRegion)!;
      
      const response = await fetch('http://localhost:3001/api/user/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          country: region.code,
          currency: region.currency
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      onRegionSelected(region.code, region.currency);
    } catch (error) {
      console.error('Error updating region:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl">
        <div className="text-center mb-6">
          <Globe className="w-12 h-12 text-blue-600 mx-auto mb-3" />
          <h2 className="text-2xl font-semibold text-gray-900">Choose Your Region</h2>
          <p className="text-gray-600 mt-2">
            Select your country to connect the right banks and use the correct currency.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {regions.map((region) => (
            <div
              key={region.code}
              className={`border-2 rounded-xl p-6 cursor-pointer transition-all ${
                selectedRegion === region.code
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedRegion(region.code)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{region.flag}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{region.name}</h3>
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <DollarSign size={14} />
                      {region.currency} - {region.currencyName}
                    </div>
                  </div>
                </div>
                {selectedRegion === region.code && (
                  <CheckCircle className="w-6 h-6 text-blue-500" />
                )}
              </div>

              <div className="space-y-1 text-sm text-gray-600">
                {region.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-2">
            <span className="text-amber-600">⚠️</span>
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Important:</p>
              <p>You can only connect to banks in your selected region. Choose the country where your bank accounts are located.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Setting up...
              </>
            ) : (
              <>Continue with {regions.find(r => r.code === selectedRegion)?.name}</>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegionSelector;