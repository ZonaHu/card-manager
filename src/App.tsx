import React, { useState, useEffect } from 'react';
import Auth from './components/Auth';
import CardManagerRefactored from './components/CardManagerRefactored';
import ErrorBoundary from './components/ErrorBoundary';
import { API_BASE_URL } from './config/api';

interface User {
  id: number;
  name: string;
  email: string;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Auth flows through an httpOnly cookie. Ask the server who we are rather than
    // trusting anything from localStorage. Also strips any stale ?auth=ok/failed
    // parameter the OAuth callback left behind.
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch {
        /* not logged in */
      } finally {
        if (!cancelled) setLoading(false);
        if (window.location.search.includes('auth=')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = (_token: string, u: User) => {
    setUser(u);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <Auth onLogin={handleLogin} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <CardManagerRefactored user={user} token="" onLogout={handleLogout} />
    </ErrorBoundary>
  );
};

export default App;
