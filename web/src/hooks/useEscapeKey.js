import { useEffect } from 'react';

/**
 * Tutup dialog dengan tombol Esc (pola Google Drive). Hanya aktif saat `active` true,
 * dan dipasang pada fase capture agar didahulukan dari pintasan keyboard halaman.
 */
export default function useEscapeKey(active, onClose) {
  useEffect(() => {
    if (!active || !onClose) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // Dropdown kustom yang sedang terbuka menangani Esc sendiri
      if (document.querySelector('[role="listbox"]')) return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active, onClose]);
}
