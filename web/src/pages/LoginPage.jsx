import React, { useState } from 'react';
import { Logo, Lock, User, AlertCircle, ArrowRight } from '../icons.jsx';
import { api } from '../api/client.js';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setError('');

    try {
      const data = await api.login(username, password);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Login gagal. Silakan periksa kembali username dan password Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-slate-200 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-white/80 backdrop-blur-md rounded-3xl shadow-xl border border-white/60 p-8 sm:p-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand Icon & Heading */}
        <div className="flex flex-col items-center text-center mb-8">
          <Logo className="w-16 h-16 text-sky-600 mb-3" />
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Chimera</h1>
          <p className="text-sm text-slate-500 mt-1">Drive pribadi di server sendiri</p>
        </div>

        {/* Form Login */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200/80 flex items-start gap-2.5 text-red-600 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-1">Username</label>
            <div className="relative flex items-center">
              <User className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 ml-1">Password</label>
            <div className="relative flex items-center">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full mt-2 py-3 px-4 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 text-on-accent font-semibold rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 text-sm"
          >
            {loading ? (
              <span>Memverifikasi...</span>
            ) : (
              <>
                <span>Masuk</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Self-hosted personal cloud storage &bull; Aman & Cepat</p>
        </div>
      </div>
    </div>
  );
}
