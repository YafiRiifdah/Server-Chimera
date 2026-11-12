import { useEffect, useRef, useState } from 'react';

/**
 * Virtualisasi sederhana (Master Prompt §9: folder 10.000 file tetap responsif).
 * Menghitung baris mana yang terlihat di dalam kontainer scroll (`scrollRef`) dan
 * mengembalikan rentang + padding pengganti baris yang tidak dirender.
 * `anchorRef` dipasang pada elemen pembungkus blok agar offset dari atas kontainer diketahui.
 */
export function useVirtualRows({ scrollRef, rowCount, rowHeight, enabled, overscan = 6 }) {
  const [range, setRange] = useState({ start: 0, end: rowCount });
  const anchorRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setRange({ start: 0, end: rowCount });
      return undefined;
    }
    const el = scrollRef.current;
    if (!el) return undefined;

    const update = () => {
      const anchor = anchorRef.current;
      const anchorTop = anchor ? anchor.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop : 0;
      const viewTop = el.scrollTop - anchorTop;
      const viewH = el.clientHeight;
      const start = Math.max(0, Math.floor(viewTop / rowHeight) - overscan);
      const end = Math.min(rowCount, Math.ceil((viewTop + viewH) / rowHeight) + overscan);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [scrollRef, rowCount, rowHeight, enabled, overscan]);

  const start = enabled ? range.start : 0;
  const end = enabled ? Math.min(range.end, rowCount) : rowCount;
  return { start, end, anchorRef, padTop: start * rowHeight, padBottom: Math.max(0, (rowCount - end) * rowHeight) };
}

/**
 * Jumlah kolom petak dari lebar area yang tersedia dan lebar minimum kartu (gap 12 px).
 * Minimal 2 kolom agar layar HP tetap menampilkan dua kartu berdampingan.
 */
export function columnsFor(width, minCardWidth, gap = 12) {
  return Math.max(2, Math.floor((width + gap) / (minCardWidth + gap)));
}

/** Lebar minimum kartu petak (px): folder lebih lebar agar nama terbaca, file mengikuti thumbnail. */
export const FOLDER_MIN_W = 210;
export const FILE_MIN_W = 172;
