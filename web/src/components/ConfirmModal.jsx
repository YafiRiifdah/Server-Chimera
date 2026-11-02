import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Konfirmasi untuk tindakan yang tidak bisa dibatalkan (hapus permanen, kosongkan Sampah).
 * Hapus biasa TIDAK memakai ini karena bisa dipulihkan dari Sampah.
 */
export default function ConfirmModal({ open, title, message, confirmLabel = 'Hapus permanen', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-50 text-red-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          </div>
          <button onClick={onCancel} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
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
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-on-accent shadow-sm transition-all"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
