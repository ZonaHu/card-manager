# 💳 Card Manager - Personal Finance Tracker

A modern, secure personal finance application that connects to your bank accounts via Plaid to automatically sync and track your card transactions, balances, and spending patterns.

## ✨ Features

- **🏦 Bank Integration**: Connect multiple bank accounts securely via Plaid API
- **⚡ Transaction Sync**: Two sync modes - Quick Sync (30 days) and Full Sync (customizable range)
- **📊 Analytics**: Monthly spending analysis with category breakdowns and visual charts
- **🔒 Secure Authentication**: JWT-based auth with optional Google OAuth integration
- **🌍 Multi-Currency**: Full support for USD and CAD with automatic regional settings
- **📱 Responsive Design**: Beautiful, mobile-first interface built with React and Tailwind CSS
- **🛡️ Security First**: Environment-based configuration, encrypted passwords, secure API keys
- **🚀 Easy Deployment**: One-command setup script and comprehensive documentation

## 🚀 Quick Start

### ⚡ TL;DR - Get Running in 2 Minutes

```bash
# 1. Clone and setup
git clone https://github.com/YOUR-USERNAME/card-manager.git
cd card-manager
./setup.sh

# 2. Add Plaid credentials to server/.env (get free sandbox keys from plaid.com)
# 3. Start servers
cd server && npm start &          # Backend
cd .. && npm run dev              # Frontend (http://localhost:5173)
```

### Prerequisites

- **Node.js** (v16+) - [Download here](https://nodejs.org/)
- **Plaid Account** (free) - [Get sandbox keys](https://dashboard.plaid.com/)
- **Google OAuth** (optional) - [Setup guide](https://console.cloud.google.com/)

### 1. Clone & Setup

```bash
# Clone the repository
git clone https://github.com/YOUR-USERNAME/card-manager.git
cd card-manager

# Run the automated setup script (recommended)
./setup.sh
```

**OR manual setup:**
```bash
# Install dependencies
npm install
cd server && npm install && cd ..

# Create environment files
cp .env.example .env
cp server/.env.example server/.env
```

### 2. Environment Configuration

Create environment files by copying the template files and adding your credentials:

```bash
# Copy environment template files
cp .env.example .env
cp server/.env.example server/.env
```

Then edit the environment files with your API credentials:

#### Backend Environment (server/.env)
```bash
# Server Configuration
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-session-secret-here

# Plaid Configuration
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret-key
PLAID_ENV=sandbox  # sandbox, development, or production

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-secret
```

### 3. Start the Application

#### 🎯 Simple 2-Step Start

```bash
# Step 1: Start the backend server (in terminal 1)
cd server
npm start

# Step 2: Start the frontend (in terminal 2)
cd ..
npm run dev
```

#### 🚀 Access Your Application

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001

The database (SQLite) will be created automatically on first run with all required tables.

#### 🔧 Development Mode (with auto-restart)

```bash
# Backend with auto-restart on file changes
cd server
npm run dev  # requires nodemon: npm install -g nodemon

# Frontend (already has hot reload)
npm run dev
```

## 🔧 Configuration Guide

### Plaid Setup

1. **Create Plaid Account**: Visit [Plaid Dashboard](https://dashboard.plaid.com)
2. **Get Credentials**: Copy your Client ID and Secret Key
3. **Set Environment**: 
   - `sandbox` - For development/testing
   - `development` - For testing with real banks (limited)
   - `production` - For live deployment

### Google OAuth Setup (Optional)

**⚠️ Note**: Google OAuth requires setup to work. If you get "OAuth client not found" error, either:
- Complete the Google OAuth setup below, OR  
- Use email/password registration instead (works without any setup)

#### To Enable Google OAuth:

1. **Create Google Project**: Visit [Google Cloud Console](https://console.cloud.google.com)
2. **Create New Project**: Name it "Card Manager" or similar
3. **Enable APIs**: Search for and enable "Google+ API"
4. **Create OAuth Consent Screen**:
   - Choose "External" user type
   - Add your email as a test user
5. **Create Credentials**:
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Authorized redirect URIs: `http://localhost:3001/api/auth/google/callback`
6. **Copy Credentials**: Update your `server/.env` file:
   ```bash
   GOOGLE_CLIENT_ID=your-actual-client-id-here
   GOOGLE_CLIENT_SECRET=your-actual-client-secret-here
   ```
7. **Restart Backend**: Stop and restart your backend server

#### 🚀 Skip Google OAuth (Easier):
Just use the "Register with Email" option instead - it works immediately without any setup!

## 💡 Usage Guide

### 🏁 Getting Started

1. **Launch Application**: Open http://localhost:5173 in your browser
2. **Create Account**: Register with email/password or use Google OAuth
3. **Set Regional Preferences**: Choose your country (US/Canada) for proper currency display
4. **Connect Your Bank**: Click "Connect Bank" to securely link accounts via Plaid
5. **Sync Transaction History**: Use the sync buttons to import your financial data

### ⚡ Transaction Sync Features

Your connected accounts will show two powerful sync options:

#### 🔥 Quick Sync (Purple Button)
- **Purpose**: Daily/weekly updates
- **Range**: Last 30 days
- **Speed**: ⚡ Fast (typically 2-5 seconds)
- **Best for**: Regular maintenance, checking recent activity

#### 📊 Full Sync (Blue Button)  
- **Purpose**: Complete history import
- **Range**: Last 3 months (customizable via API)
- **Speed**: 🔄 Thorough (30 seconds to 2 minutes depending on transaction volume)
- **Best for**: Initial setup, comprehensive analysis, catching up after time away

### 🎯 Pro Tips

- **First Time**: Use Full Sync to import your complete history
- **Regular Use**: Quick Sync daily or weekly to stay current
- **Multiple Accounts**: Each connected bank account syncs independently
- **Duplicate Protection**: Smart deduplication prevents duplicate transactions
- **Balance Updates**: Both sync modes update your current account balances

### API Endpoints

#### Authentication
```bash
POST /api/auth/register     # Create account
POST /api/auth/login        # Login with email/password
GET  /api/auth/google       # Google OAuth login
```

#### Cards Management
```bash
GET    /api/cards           # Get user's cards
POST   /api/cards           # Add manual card
DELETE /api/cards/:id       # Delete card
```

#### Plaid Integration
```bash
POST /api/plaid/create-link-token      # Create Plaid Link token
POST /api/plaid/exchange-public-token  # Connect bank account
POST /api/plaid/sync-transactions      # Quick sync (30 days)
POST /api/plaid/sync-all-transactions  # Full sync (customizable)
```

#### Transaction Sync Examples

**Quick Sync:**
```bash
curl -X POST http://localhost:3001/api/plaid/sync-transactions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Full Sync (3 months):**
```bash
curl -X POST http://localhost:3001/api/plaid/sync-all-transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"months": 3}'
```

**Custom Date Range:**
```bash
curl -X POST http://localhost:3001/api/plaid/sync-all-transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"startDate": "2024-01-01", "endDate": "2024-12-31"}'
```

## 🏗️ Project Structure

```
card-manager/
├── src/                          # Frontend React app
│   ├── components/
│   │   ├── Auth.tsx             # Authentication component
│   │   ├── CardManagerWithAuth.tsx  # Main app component
│   │   ├── PlaidLink.tsx        # Plaid Link integration
│   │   └── RegionSelector.tsx   # Country/currency selector
│   ├── utils/
│   │   └── currency.ts          # Currency formatting utilities
│   └── main.jsx                 # App entry point
├── server/                       # Backend Express server
│   ├── index.js                 # Main server file
│   ├── database.db              # SQLite database
│   └── package.json
├── package.json                  # Frontend dependencies
└── README.md                    # This file
```

## 📊 Database Schema

### Tables

- **users**: User accounts and preferences
- **cards**: Connected bank accounts/cards
- **transactions**: Transaction history with Plaid sync tracking

### Key Features

- **Duplicate Prevention**: Uses Plaid transaction IDs to prevent duplicates
- **Multi-Currency**: Supports USD/CAD with proper conversion
- **Source Tracking**: Distinguishes manual vs. Plaid-synced transactions

## 🔐 Security

- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt for secure password storage
- **CORS Protection**: Configured for local development
- **Environment Variables**: Sensitive data stored in .env files
- **Plaid Security**: OAuth-style secure bank connections

## 🛠️ Development

### Available Scripts

**Frontend:**
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

**Backend:**
```bash
npm start        # Start production server
npm run dev      # Start with nodemon (auto-restart)
```

### Testing

```bash
# Test transaction sync endpoints
node test-transaction-sync.js

# Check backend connectivity
node check-backend.js

# Test Plaid integration
node test-plaid.js
```

## 🚨 Troubleshooting

### Common Issues

#### 1. 🔐 Google OAuth Error: "OAuth client not found" / Error 401: invalid_client

**Problem**: You see this error when clicking "Sign in with Google"

**Solutions**:
- **Quick Fix**: Use "Register with Email" instead (no setup required)
- **Complete Fix**: Follow the Google OAuth setup guide above to get real credentials
- **Temporary**: Comment out Google OAuth in `server/.env`:
  ```bash
  # GOOGLE_CLIENT_ID=your-google-oauth-client-id-here
  # GOOGLE_CLIENT_SECRET=your-google-oauth-secret-here
  ```

#### 2. 🏦 Plaid Connection Issues

**Problem**: "Failed to create link token" or connection errors

**Solutions**:
- Verify your `PLAID_CLIENT_ID` and `PLAID_SECRET` in `server/.env`
- Ensure `PLAID_ENV=sandbox` for testing (free tier)
- Check Plaid dashboard: https://dashboard.plaid.com/
- Make sure you've completed Plaid account verification

#### 3. 💾 Database Problems

**Problem**: Database errors or corrupted data

**Solutions**:
- Delete `server/database.db` and restart server (recreates fresh database)
- Check file permissions in server directory
- Ensure SQLite is working: `sqlite3 --version`

#### 4. ⚡ Transaction Sync Not Working

**Problem**: Sync buttons don't work or return errors

**Solutions**:
- Ensure you have Plaid-connected accounts (not manually added cards)
- Check server console for error messages
- Try disconnecting and reconnecting your bank account
- Verify Plaid credentials are correct

#### 5. 🚀 Server Won't Start

**Problem**: Backend server fails to start

**Solutions**:
- Check if port 3001 is already in use: `lsof -i :3001`
- Verify Node.js version: `node --version` (needs v16+)
- Install dependencies: `npm install` in both root and server directories
- Check for syntax errors in `server/.env`

### Debug Mode

Enable detailed logging by setting environment variable:
```bash
DEBUG=true npm start
```

## 📝 License

This project is licensed under the ISC License.

## 📦 Setting Up Your Own Repository

If you want to create your own private repository of this project:

### Option 1: Using GitHub CLI (Recommended)

```bash
# Authenticate with GitHub
gh auth login

# Create private repository and push
gh repo create card-manager --private --source=. --push

# Set up the repository description
gh repo edit --description "Personal finance tracker with Plaid integration and transaction sync"
```

### Option 2: Manual Setup

1. **Create GitHub Repository:**
   - Go to [GitHub](https://github.com) and create a new private repository named `card-manager`
   - Don't initialize with README, .gitignore, or license (we already have these)

2. **Add Remote and Push:**
   ```bash
   # Add your repository as remote origin
   git remote add origin https://github.com/YOUR-USERNAME/card-manager.git
   
   # Push to your repository
   git branch -M main
   git push -u origin main
   ```

3. **Verify Setup:**
   ```bash
   # Check remote is set correctly
   git remote -v
   
   # Verify your repository status
   git status
   ```

### Important Security Notes

- ✅ **Included in repo:** Template files (`.env.example`), source code, documentation
- ❌ **Excluded from repo:** `.env` files, database files, API keys, node_modules
- 🔒 **Your `.env` files are protected** by `.gitignore` and will never be committed
- 👥 **Collaborators** will need to create their own `.env` files with their API credentials

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review existing issues in the repository
3. Create a new issue with detailed information

---

Built with ❤️ using React, Express, SQLite, and Plaid API