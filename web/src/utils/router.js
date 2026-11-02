/**
 * URL mencerminkan lokasi (Master Prompt §5.2):
 *   /drive/<path>                 Drive Saya
 *   /recent  /starred  /trash     Terbaru, Berbintang, Sampah
 *   /search?q=&type=&modified=    Hasil pencarian
 *   /shared                       Dibagikan kepada saya (daftar)
 *   /shared/<shareId>/<path>      Menjelajah di dalam item yang dibagikan
 *   /links                        Link saya (berbagi yang saya kelola)
 *   /admin                        Halaman Admin
 *   /s/<token>                    Halaman link publik (tanpa login; ditangani App)
 */
const DRIVE = '/drive';

function decodeSeg(seg) {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

function pathFromSegments(segs) {
  return segs.filter(Boolean).map(decodeSeg).join('/');
}

/** Keadaan lokasi saat ini dari window.location. */
export function locationState() {
  const p = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const segs = p.replace(/^\/+/, '').split('/');
  const head = segs[0];

  if (head === 'drive') return { section: 'drive', path: pathFromSegments(segs.slice(1)), query: {} };
  if (head === 'search') {
    return {
      section: 'search',
      path: '',
      query: { q: params.get('q') || '', type: params.get('type') || '', modified: params.get('modified') || '' }
    };
  }
  if (head === 'shared') {
    const shareId = segs[1] && /^\d+$/.test(segs[1]) ? Number(segs[1]) : null;
    return { section: 'shared', shareId, path: shareId ? pathFromSegments(segs.slice(2)) : '', query: {} };
  }
  if (['recent', 'starred', 'trash', 'links', 'admin'].includes(head)) return { section: head, path: '', query: {} };
  return { section: 'drive', path: '', query: {} };
}

export function urlForPath(path) {
  if (!path) return DRIVE;
  return `${DRIVE}/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
}

export function urlForSection(section, query = {}) {
  if (section === 'drive') return urlForPath(query.path || '');
  if (section === 'search') {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.type) params.set('type', query.type);
    if (query.modified) params.set('modified', query.modified);
    const qs = params.toString();
    return `/search${qs ? `?${qs}` : ''}`;
  }
  if (section === 'shared' && query.shareId) {
    const sub = (query.path || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return `/shared/${query.shareId}${sub ? `/${sub}` : ''}`;
  }
  return `/${section}`;
}

export function isKnownLocation() {
  return /^\/(drive|recent|starred|trash|search|shared|links|admin)(\/|$)/.test(window.location.pathname);
}

/** Token halaman publik jika URL berbentuk /s/<token>. */
export function publicTokenFromLocation() {
  const m = /^\/s\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname);
  return m ? m[1] : null;
}

/** Nama file yang diminta dibuka lewat ?file=<nama> (dipakai "Salin link" untuk file). */
export function previewNameFromLocation() {
  return new URLSearchParams(window.location.search).get('file');
}

export function parentOf(path) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

/**
 * Link absolut untuk item milik sendiri: folder → /drive/<path>; file → folder induknya + ?file=<nama>.
 */
export function linkForItem(item) {
  const origin = window.location.origin;
  if (item.type === 'folder') return `${origin}${urlForPath(item.path)}`;
  return `${origin}${urlForPath(parentOf(item.path))}?file=${encodeURIComponent(item.name)}`;
}
