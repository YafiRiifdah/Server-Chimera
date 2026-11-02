import React from 'react';
import { ChevronDown, X } from 'lucide-react';

/**
 * Chip filter hasil pencarian (pola Google Drive): Jenis dan Diubah.
 */
const TYPES = [
  ['', 'Semua jenis'],
  ['folder', 'Folder'],
  ['image', 'Gambar'],
  ['video', 'Video'],
  ['audio', 'Audio'],
  ['document', 'Dokumen']
];
const MODIFIED = [
  ['', 'Kapan saja'],
  ['today', 'Hari ini'],
  ['7d', '7 hari terakhir'],
  ['30d', '30 hari terakhir']
];

function Chip({ label, value, options, onChange }) {
  const active = value !== '';
  const current = options.find(([v]) => v === value)?.[1] || label;
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`appearance-none pl-3 pr-8 py-1.5 rounded-full text-xs font-medium border cursor-pointer outline-none focus:ring-2 focus:ring-sky-500/30 ${
          active ? 'bg-selected border-selected text-sky-950' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {v === '' ? label : l}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 text-slate-500">
        {active ? (
          <X
            className="w-3.5 h-3.5 pointer-events-auto cursor-pointer"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange('');
            }}
          />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </span>
      <span className="sr-only">{current}</span>
    </div>
  );
}

export default function SearchFilters({ query, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip label="Jenis" value={query.type || ''} options={TYPES} onChange={(type) => onChange({ ...query, type })} />
      <Chip label="Diubah" value={query.modified || ''} options={MODIFIED} onChange={(modified) => onChange({ ...query, modified })} />
    </div>
  );
}
