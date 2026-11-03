/**
 * Tema tampilan: 'light' (bawaan, seperti Google Drive) atau 'dark'.
 * Disimpan di localStorage dan diterapkan sebagai atribut data-theme di <html>
 * (index.html menerapkannya lebih awal agar tidak berkedip saat memuat).
 */
import { syncThemeColor } from '../hooks/useEscapeKey.js';

const KEY = 'chimera_theme';

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
  syncThemeColor();
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* penyimpanan tidak tersedia (mode privat) */
  }
  applyTheme(theme);
}
