import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Check } from '../icons.jsx';
import { SORT_KEYS } from '../utils/sort.js';

/**
 * Menu "Urutkan" kustom (pola Google Drive): tombol pil + daftar pilihan dengan centang.
 * Menggantikan <select> bawaan yang tampilannya tidak bisa diatur dan berbeda di tiap browser.
 */
export default function SortMenu({ sort, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const currentLabel = SORT_KEYS.find(([k]) => k === sort.key)?.[1] || 'Nama';
  const DirIcon = sort.dir === 'desc' ? ArrowDown : ArrowUp;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Urutkan: ${currentLabel} ${sort.dir === 'desc' ? 'menurun' : 'menaik'}`}
        className={`h-9 pl-3 pr-3 rounded-full border text-xs font-medium inline-flex items-center gap-2 transition-colors ${
          open ? 'bg-selected border-selected text-sky-950' : 'bg-surface border-slate-200/60 text-slate-700 hover:bg-surface-hover'
        }`}
      >
        <ArrowUpDown className="w-4 h-4 text-slate-500" />
        <span className="hidden sm:inline">{currentLabel}</span>
        <DirIcon className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 text-sm text-slate-700 select-none animate-in fade-in zoom-in-95 duration-150"
        >
          <p className="px-4 pb-1.5 pt-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Urutkan berdasarkan</p>
          {SORT_KEYS.map(([k, label]) => {
            const active = sort.key === k;
            return (
              <button
                key={k}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange({ key: k, dir: active ? (sort.dir === 'asc' ? 'desc' : 'asc') : 'asc' });
                  if (!active) setOpen(false);
                }}
                className={`w-full px-4 py-2 text-left flex items-center gap-3 transition-colors hover:bg-slate-50 ${active ? 'text-sky-700 font-medium' : ''}`}
              >
                <span className="w-4 h-4 flex items-center justify-center">{active && <Check className="w-5 h-5" />}</span>
                <span className="flex-1">{label}</span>
                {active && (
                  <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                    {sort.dir === 'desc' ? 'menurun' : 'menaik'}
                    <DirIcon className="w-3 h-3" />
                  </span>
                )}
              </button>
            );
          })}
          <div className="border-t border-slate-100 my-1"></div>
          <button
            role="menuitem"
            onClick={() => {
              onChange({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
              setOpen(false);
            }}
            className="w-full px-4 py-2 text-left flex items-center gap-3 transition-colors hover:bg-slate-50"
          >
            <span className="w-4 h-4 flex items-center justify-center">
              <DirIcon className="w-4 h-4 text-slate-400" />
            </span>
            <span className="flex-1">Balik urutan</span>
          </button>
        </div>
      )}
    </div>
  );
}
