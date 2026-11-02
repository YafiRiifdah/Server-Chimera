import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from '../icons.jsx';

/**
 * Notifikasi kecil di kiri bawah, pola Google Drive ("Dipindahkan ke Sampah", dsb.).
 * Menggantikan alert()/confirm() yang memblokir.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message, type = 'info', duration = 4000) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  return { toasts, show, dismiss };
}

const ICONS = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-400" />,
  info: <Info className="w-5 h-5 text-sky-400" />
};

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2 select-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="flex items-center gap-3 bg-ink text-on-accent text-sm px-4 py-3 rounded-xl shadow-2xl max-w-md animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {ICONS[t.type] || ICONS.info}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="p-1 rounded-full hover:bg-white/10 text-[#94a3b8] hover:text-[#ffffff]"
            aria-label="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
