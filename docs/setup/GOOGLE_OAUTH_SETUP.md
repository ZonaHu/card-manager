# Google OAuth Setup Guide

Your Card Manager app now has Google OAuth authentication built-in! Here's how to enable it:

## 1. Google Cloud Console Setup

1. **Go to Google Cloud Console**
   - Visit https://console.cloud.google.com
   - Sign in with your Google account

2. **Create or Select Project**
   - Create a new project or select an existing one
   - Note down the project ID

3. **Enable Google+ API**
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" 
   - Click on it and press "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Choose "Web application"
   - Set the name (e.g., "Card Manager")
   - Add Authorized redirect URIs:
     ```
     http://localhost:3001/api/auth/google/callback
     ```
   - Click "Create"
   - **Copy the Client ID and Client Secret**

## 2. Update Server Configuration

1. **Update the `.env` file in the server directory:**
   ```env
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   PORT=3001
   GOOGLE_CLIENT_ID=your-actual-google-client-id-here
   GOOGLE_CLIENT_SECRET=your-actual-google-client-secret-here
   SESSION_SECRET=your-session-secret-here
   ```

2. **Replace the placeholder values:**
   - Replace `your-actual-google-client-id-here` with your Google Client ID
   - Replace `your-actual-google-client-secret-here` with your Google Client Secret
   - Replace `your-session-secret-here` with a random string for session security

## 3. Start the Backend Server

1. **Install dependencies:**
   ```bash
   cd server
   npm install
   ```

2. **Start the server:**
   ```bash
   node index.js
   ```

   You should see: `Server running on port 3001`

## 4. Enable Google Login in Frontend

1. **Edit the Auth component:**
   - Open `src/components/Auth.tsx`
   - In the `handleGoogleLogin` function, comment out the alert
   - Uncomment this line:
     ```javascript
     window.location.href = 'http://localhost:3001/api/auth/google';
     ```

## 5. Test the Google OAuth Flow

1. **Visit your app:** http://localhost:5173
2. **Click "Continue with Google"**
3. **You should be redirected to Google's consent screen**
4. **After approval, you'll be redirected back and logged in**

## Troubleshooting

- **"redirect_uri_mismatch" error:** Make sure the redirect URI in Google Console exactly matches `http://localhost:3001/api/auth/google/callback`
- **Backend not responding:** Ensure the backend server is running on port 3001
- **CORS errors:** Make sure the backend CORS is configured for `http://localhost:5173`

## How It Works

1. User clicks "Continue with Google"
2. Redirected to Google OAuth consent screen
3. User approves the application
4. Google redirects back to your callback URL
5. Backend receives the authorization code
6. Backend exchanges it for user profile information
7. Backend creates or links user account in SQLite database
8. Backend generates a JWT token
9. User is redirected to frontend with the token
10. Frontend stores the token and logs user in

Your app now supports both email/password AND Google OAuth authentication!