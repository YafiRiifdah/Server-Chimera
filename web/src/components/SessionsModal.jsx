import React, { useEffect, useState } from 'react';
import { X, Monitor, LogOut } from 'lucide-react';
import { api } from '../api/client.js';
import { formatDate } from './FileIcon.jsx';

function describeAgent(ua = '') {
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad/i.test(ua)
        ? 'iOS'
        : /Mac/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Perangkat';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua)
      ? 'Chrome'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : 'Browser';
  return `${browser} di ${os}`;
}

/** Sesi aktif + "Keluar dari semua perangkat" (Master Prompt §5.1). */
export default function SessionsModal({ isOpen, onClose, onLoggedOutEverywhere, showToast }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      setSessions((await api.getSessions()).sessions);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) reload();
  }, [isOpen]);

  if (!isOpen) return null;

  const end = async (id) => {
    try {
      await api.endSession(id);
      showToast('Sesi diakhiri', 'success');
      reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const logoutAll = async () => {
    try {
      await api.logoutAll();
    } finally {
      onLoggedOutEverywhere();
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-base">Sesi aktif</h3>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl max-h-72 overflow-y-auto">
          {loading && <li className="px-3 py-4 text-xs text-slate-400">Memuat…</li>}
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Monitor className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800 truncate">
                  {describeAgent(s.userAgent)}
                  {s.current && (
                    <span className="ml-2 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                      Sesi ini
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {s.ip} • terakhir aktif {formatDate(s.lastSeenAt)}
                </div>
              </div>
              {!s.current && (
                <button onClick={() => end(s.id)} className="text-xs text-red-600 hover:underline shrink-0">
                  Akhiri
                </button>
              )}
            </li>
          ))}
        </ul>

        <button
          onClick={logoutAll}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold"
        >
          <LogOut className="w-4 h-4" /> Keluar dari semua perangkat
        </button>
      </div>
    </div>
  );
}
