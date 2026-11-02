import React from 'react';
import useEscapeKey from '../hooks/useEscapeKey.js';
import { X } from '../icons.jsx';

/**
 * Dialog konfirmasi. tone='danger' (merah) untuk tindakan yang tidak bisa dibatalkan
 * (hapus permanen, kosongkan Sampah); tone='primary' (biru) untuk pindah ke Sampah.
 */
export default function ConfirmModal({ open, title, message, confirmLabel = 'Hapus permanen', tone = 'danger', onConfirm, onCancel }) {
  useEscapeKey(open, onCancel);
  if (!open) return null;
  const danger = tone === 'danger';
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onCancel} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`px-5 py-2 rounded-xl text-xs font-semibold text-on-accent shadow-sm transition-all ${
              danger ? 'bg-red-600 hover:bg-red-500' : 'bg-sky-600 hover:bg-sky-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
