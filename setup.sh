#!/bin/bash

# Card Manager Setup Script
echo "Card Manager - Setup Script"
echo "==============================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "OK: Node.js found: $(node --version)"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not available"
    exit 1
fi

echo "OK: npm found: $(npm --version)"

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "ERROR: Frontend dependency installation failed"
    exit 1
fi

# Install backend dependencies
echo ""
echo "Installing backend dependencies..."
cd server
npm install

if [ $? -ne 0 ]; then
    echo "ERROR: Backend dependency installation failed"
    exit 1
fi

cd ..

# Create environment files if they don't exist
echo ""
echo "Setting up environment files..."

if [ ! -f .env ]; then
    cp .env.example .env
    echo "OK: Created .env (frontend)"
else
    echo "WARNING: .env already exists (frontend)"
fi

if [ ! -f server/.env ]; then
    cp server/.env.example server/.env
    echo "OK: Created server/.env (backend)"
else
    echo "WARNING: server/.env already exists (backend)"
fi

echo ""
echo "Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Edit server/.env with your API credentials:"
echo "   - Get Plaid credentials from: https://dashboard.plaid.com/"
echo "   - Get Google OAuth credentials from: https://console.cloud.google.com/"
echo ""
echo "2. Start the development servers:"
echo "   Terminal 1: cd server && npm run dev"
echo "   Terminal 2: npm run dev"
echo ""
echo "3. Open your browser to: http://localhost:5173"
echo ""
echo "For detailed instructions, see README.md"
