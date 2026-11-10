import React, { useEffect, useState } from 'react';
import useEscapeKey from '../hooks/useEscapeKey.js';
import { X } from '../icons.jsx';
import PasswordInput from './PasswordInput.jsx';

/**
 * Dialog satu kolom isian (pengganti window.prompt): judul, keterangan, input, Batal/OK.
 * type: 'text' | 'number' | 'password' (password memakai tombol lihat/sembunyikan).
 * validate(value) mengembalikan pesan error atau null.
 */
export default function InputModal({
  open,
  title,
  message,
  label,
  type = 'text',
  initialValue = '',
  placeholder,
  suffix,
  min,
  confirmLabel = 'Simpan',
  validate,
  onConfirm,
  onCancel
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState(null);
  useEscapeKey(open, onCancel);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const err = validate ? validate(value) : null;
    if (err) return setError(err);
    onConfirm(value);
  };

  const inputClass =
    'px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 w-full sm:max-w-sm p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6 max-h-[92vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button type="button" onClick={onCancel} className="p-1 rounded-full text-slate-400 hover:bg-slate-100" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>
        {message && <p className="text-sm text-slate-600 mb-4">{message}</p>}
        <form onSubmit={submit} className="space-y-4">
          <div>
            {label && <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>}
            {type === 'password' ? (
              <PasswordInput
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                className={inputClass}
              />
            ) : (
              <div className="relative">
                <input
                  autoFocus
                  type={type}
                  min={min}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder}
                  onFocus={(e) => e.target.select()}
                  className={`${inputClass} w-full ${suffix ? 'pr-12' : ''}`}
                />
                {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
              </div>
            )}
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-on-accent shadow-sm transition-all"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
