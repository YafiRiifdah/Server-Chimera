import React, { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage.jsx';
import DrivePage from './pages/DrivePage.jsx';
import PublicSharePage from './pages/PublicSharePage.jsx';
import { api } from './api/client.js';
import { publicTokenFromLocation } from './utils/router.js';
import { Loader2 } from './icons.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const publicToken = publicTokenFromLocation();

  useEffect(() => {
    if (publicToken) {
      setCheckingAuth(false);
      return;
    }
    async function checkAuth() {
      try {
        const data = await api.getMe();
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [publicToken]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  // Halaman link publik: tanpa login
  if (publicToken) return <PublicSharePage token={publicToken} />;

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
          <span className="text-xs text-slate-400 font-medium tracking-wide">Memuat Chimera...</span>
        </div>
      </div>
    );
  }

  return user ? <DrivePage user={user} onLogout={handleLogout} /> : <LoginPage onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
}
