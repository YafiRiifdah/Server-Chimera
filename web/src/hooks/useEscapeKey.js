import { useEffect } from 'react';

/** Warna bilah judul jendela PWA (meta theme-color) per tema: normal dan saat dialog terbuka (diredupkan 40% hitam, sama dengan overlay). */
const THEME_COLOR = {
  light: { normal: '#ffffff', dimmed: '#999999' },
  dark: { normal: '#0f172a', dimmed: '#090e19' }
};

let openDialogs = 0;

export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  meta.setAttribute('content', openDialogs > 0 ? THEME_COLOR[theme].dimmed : THEME_COLOR[theme].normal);
}

/**
 * Perilaku umum dialog: tutup dengan Esc (pola Google Drive), dan selama dialog terbuka
 * bilah judul jendela PWA ikut diredupkan lewat meta theme-color, karena overlay halaman
 * tidak bisa menutupi bilah judul yang digambar sistem operasi.
 * Hanya aktif saat `active` true; Esc dipasang pada fase capture agar didahulukan dari pintasan halaman.
 */
export default function useEscapeKey(active, onClose) {
  useEffect(() => {
    if (!active) return undefined;
    openDialogs += 1;
    syncThemeColor();
    return () => {
      openDialogs = Math.max(0, openDialogs - 1);
      syncThemeColor();
    };
  }, [active]);

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
