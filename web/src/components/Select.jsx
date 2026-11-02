import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from '../icons.jsx';

/**
 * Dropdown kustom pengganti <select> bawaan (pola menu Google Drive): tombol + daftar pilihan dengan centang.
 * options: [[value, label], ...]. Daftar dirender `position: fixed` dari posisi tombol agar tidak terpotong
 * oleh modal yang bisa digulir. Tutup dengan klik di luar, Esc, gulir, atau ubah ukuran jendela.
 *
 * variant: 'field' (kotak isian di form) | 'chip' (pil filter) | 'pill' (pil kecil di header).
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder = 'Pilih…',
  variant = 'field',
  className = '',
  menuClassName = '',
  'aria-label': ariaLabel,
  disabled = false,
  renderValue
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const current = options.find(([v]) => v === value);
  const label = current ? current[1] : placeholder;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuH = Math.min(320, options.length * 36 + 16);
    const below = r.bottom + 6 + menuH <= window.innerHeight;
    setPos({
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 176) - 8),
      top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - menuH),
      minWidth: Math.max(r.width, 176)
    });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const base =
    variant === 'chip'
      ? 'inline-flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors'
      : variant === 'pill'
        ? 'inline-flex items-center gap-1.5 h-9 pl-3 pr-2.5 rounded-full border text-xs font-medium bg-surface border-slate-200/60 text-slate-700 hover:bg-surface-hover'
        : 'inline-flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all';

  const pick = (v) => {
    setOpen(false);
    if (v !== value) onChange(v);
    btnRef.current?.focus();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const i = options.findIndex(([v]) => v === value);
            const n = e.key === 'ArrowDown' ? Math.min(options.length - 1, i + 1) : Math.max(0, i - 1);
            if (options[n]) onChange(options[n][0]);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${base} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      >
        <span className={`truncate ${current ? '' : 'text-slate-400'}`}>{renderValue ? renderValue(current) : label}</span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && (
        <ul
          ref={menuRef}
          role="listbox"
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth }}
          className={`z-[70] max-h-80 overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 text-sm text-slate-700 select-none animate-in fade-in zoom-in-95 duration-100 ${menuClassName}`}
        >
          {options.map(([v, l]) => {
            const active = v === value;
            return (
              <li key={String(v)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => pick(v)}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-slate-50 transition-colors whitespace-nowrap ${
                    active ? 'text-sky-700 font-medium' : ''
                  }`}
                >
                  <span className="w-5 h-5 flex items-center justify-center shrink-0">{active && <Check className="w-5 h-5" />}</span>
                  <span className="flex-1">{l}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
