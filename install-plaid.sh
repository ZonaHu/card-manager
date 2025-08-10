#!/bin/bash

echo "Installing Plaid dependencies..."

# Install frontend Plaid package
echo "Installing react-plaid-link for frontend..."
npm install react-plaid-link

# Install backend Plaid package  
echo "Installing plaid SDK for backend..."
cd server
npm install plaid
cd ..

echo "✅ Plaid packages installed!"
echo ""
echo "Next steps:"
echo "1. Get Plaid credentials from https://dashboard.plaid.com"
echo "2. Update server/.env with your PLAID_CLIENT_ID and PLAID_SECRET"
echo "3. Uncomment the usePlaidLink import in src/components/PlaidLink.tsx"
echo "4. Restart both servers"
echo ""
echo "See PLAID_SETUP.md for detailed instructions!"