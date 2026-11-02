import React from 'react';
import { X } from '../icons.jsx';
import Select from './Select.jsx';

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
  return (
    <div className="relative inline-flex items-center">
      <Select
        variant="chip"
        value={value}
        onChange={onChange}
        options={options.map(([v, l]) => [v, v === '' ? label : l])}
        aria-label={label}
        className={`${active ? 'bg-selected border-selected text-sky-950 pr-8' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
      />
      {active && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 p-0.5 rounded-full text-slate-600 hover:bg-sky-200/60"
          title={`Hapus filter ${label.toLowerCase()}`}
          aria-label={`Hapus filter ${label.toLowerCase()}`}
        >
          <X className="w-4 h-4" />
        </button>
      )}
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
