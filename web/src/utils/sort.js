/** Urutkan item: folder selalu di atas (Master Prompt §5.3). */
export const SORT_KEYS = [
  ['name', 'Nama'],
  ['mtime', 'Terakhir diubah'],
  ['size', 'Ukuran']
];

export function loadSort() {
  try {
    const s = JSON.parse(localStorage.getItem('chimera_sort') || 'null');
    if (s && SORT_KEYS.some(([k]) => k === s.key) && ['asc', 'desc'].includes(s.dir)) return s;
  } catch {
    // abaikan
  }
  return { key: 'name', dir: 'asc' };
}

export function saveSort(sort) {
  try {
    localStorage.setItem('chimera_sort', JSON.stringify(sort));
  } catch {
    // abaikan
  }
}

export function sortItems(items, sort) {
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    let c = 0;
    if (sort.key === 'name') c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    else if (sort.key === 'mtime') c = (a.mtime || a.deletedAt || '').localeCompare(b.mtime || b.deletedAt || '');
    else if (sort.key === 'size') c = (a.size || 0) - (b.size || 0);
    if (c === 0) c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    return c * dir;
  });
}
