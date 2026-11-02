/**
 * URL raw/thumb/zip yang tergantung konteks item:
 *  - milik sendiri            → /api/files/...
 *  - diterima dari pengguna   → /api/shared/<shareId>/...
 *  - halaman link publik      → /s/<token>/...
 */
function base(item) {
  if (item.publicToken) return { prefix: `/s/${encodeURIComponent(item.publicToken)}`, pathKey: 'path' };
  if (item.shareId) return { prefix: `/api/shared/${item.shareId}`, pathKey: 'path' };
  return { prefix: '/api/files', pathKey: 'path' };
}

export function rawUrl(item, dl = false) {
  const { prefix } = base(item);
  return `${prefix}/raw?path=${encodeURIComponent(item.path || '')}${dl ? '&dl=1' : ''}`;
}

export function thumbUrl(item, w = 256) {
  const { prefix } = base(item);
  return `${prefix}/thumb?path=${encodeURIComponent(item.path || '')}&w=${w}&v=${encodeURIComponent(item.mtime || '')}`;
}

export function zipUrl(items) {
  const first = items[0];
  if (first.publicToken) return `/s/${encodeURIComponent(first.publicToken)}/zip?path=${encodeURIComponent(first.path || '')}`;
  const { prefix } = base(first);
  return `${prefix}/zip?paths=${encodeURIComponent(JSON.stringify(items.map((i) => i.path)))}`;
}
