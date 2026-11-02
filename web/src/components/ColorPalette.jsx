import React from 'react';
import { Check } from '../icons.jsx';
import { FOLDER_COLORS, DEFAULT_FOLDER_COLOR } from '../utils/folderColors.js';

/**
 * Kisi 25 lingkaran warna (pola "Ubah warna" Google Drive).
 * Warna aktif diberi tanda centang. Klik = pilih.
 */
export default function ColorPalette({ value, onSelect }) {
  const active = value || DEFAULT_FOLDER_COLOR;
  return (
    <div className="grid grid-cols-5 gap-2 p-2" role="listbox" aria-label="Pilih warna folder">
      {FOLDER_COLORS.map((c) => {
        const isActive = c.hex === active;
        return (
          <button
            key={c.hex}
            type="button"
            role="option"
            aria-selected={isActive}
            title={c.name}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(c.hex === DEFAULT_FOLDER_COLOR ? null : c.hex);
            }}
            className="w-6 h-6 rounded-full flex items-center justify-center ring-offset-1 hover:ring-2 hover:ring-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
            style={{ backgroundColor: c.hex }}
          >
            {isActive && <Check className="w-4 h-4 text-on-accent drop-shadow" />}
          </button>
        );
      })}
    </div>
  );
}
