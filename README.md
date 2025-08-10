# 💳 Card Manager - Personal Finance Tracker

A modern, secure personal finance application that connects to your bank accounts via Plaid to automatically sync and track your card transactions, balances, and spending patterns.

## ✨ Features

- **🏦 Bank Integration**: Connect multiple bank accounts securely via Plaid
- **⚡ Transaction Sync**: Automatic and manual transaction synchronization
- **📊 Analytics**: Monthly spending analysis and category breakdowns
- **🔒 Secure Authentication**: JWT-based auth with Google OAuth support
- **🌍 Multi-Currency**: Support for USD and CAD with regional settings
- **📱 Responsive Design**: Beautiful, mobile-friendly interface

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Plaid Account** (for bank connectivity)
- **Google OAuth** credentials (optional, for Google login)

### 1. Clone & Setup

```bash
# Clone the repository
git clone https://github.com/YOUR-USERNAME/card-manager.git
cd card-manager

# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
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

### 3. Database Setup

The application uses SQLite and will automatically create the database file on first run:

```bash
cd server
node index.js  # This creates database.db with all required tables
```

### 4. Start the Application

#### Option A: Development Mode (Recommended)

```bash
# Terminal 1 - Start backend server
cd server
npm run dev  # or npm start

# Terminal 2 - Start frontend dev server
cd ..  # back to root directory
npm run dev
```

#### Option B: Production Build

```bash
# Build frontend
npm run build

# Start backend (serves both API and static files)
cd server
npm start
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

1. **Create Google Project**: Visit [Google Cloud Console](https://console.cloud.google.com)
2. **Enable OAuth2**: Enable Google+ API
3. **Create Credentials**: Create OAuth 2.0 client ID
4. **Set Redirect URI**: `http://localhost:3001/api/auth/google/callback`

## 💡 Usage

### Getting Started

1. **Launch Application**: Navigate to `http://localhost:5173`
2. **Register/Login**: Create an account or use Google OAuth
3. **Set Region**: Choose your country (US/Canada) for currency support
4. **Connect Bank**: Click "Connect Bank" to link your accounts via Plaid
5. **Sync Transactions**: Use sync buttons to import transaction history

### Transaction Sync Options

#### Quick Sync (⚡)
- Syncs recent transactions (last 30 days)
- Fast and efficient for regular updates
- Perfect for daily/weekly usage

#### Full Sync (📈)
- Comprehensive history sync (last 3 months by default)
- Imports complete transaction history
- Great for initial setup or catching up

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

1. **Plaid Connection Failed**
   - Verify PLAID_CLIENT_ID and PLAID_SECRET in server/.env
   - Check PLAID_ENV is set correctly (sandbox/development/production)
   - Ensure Plaid account is properly configured

2. **Database Errors**
   - Delete server/database.db and restart server to recreate
   - Check file permissions in server directory

3. **Google OAuth Issues**
   - Verify redirect URI matches Google Console settings
   - Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET

4. **Transaction Sync Problems**
   - Ensure bank accounts are connected via Plaid
   - Check server logs for API errors
   - Try reconnecting bank account if sync fails

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