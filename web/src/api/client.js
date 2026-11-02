/**
 * API Client untuk backend Chimera
 */

async function request(endpoint, options = {}) {
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  }

  const res = await fetch(endpoint.startsWith('/s/') ? endpoint : `/api${endpoint}`, config);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || 'Terjadi kesalahan sistem');
    error.status = res.status;
    error.code = data.code || 'UNKNOWN_ERROR';
    error.data = data;
    throw error;
  }

  return data;
}

/**
 * XHR dengan progres dan bisa dibatalkan. Mengembalikan {promise, abort}.
 */
function xhrRequest({ method, url, body, headers = {}, onProgress }) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      };
    }
    xhr.onload = () => {
      let resp = {};
      try {
        resp = JSON.parse(xhr.responseText || '{}');
      } catch {
        // biarkan kosong
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(resp);
      } else {
        const err = new Error(resp.error || 'Gagal mengunggah berkas');
        err.code = resp.code;
        err.status = xhr.status;
        err.data = resp;
        reject(err);
      }
    };
    xhr.onerror = () => {
      const err = new Error('Koneksi terputus saat mengunggah');
      err.code = 'NETWORK_ERROR';
      err.retryable = true;
      reject(err);
    };
    xhr.onabort = () => {
      const err = new Error('Upload dibatalkan');
      err.name = 'AbortError';
      reject(err);
    };
    xhr.send(body);
  });
  return { promise, abort: () => xhr.abort() };
}

const q = (v) => encodeURIComponent(v ?? '');

export const api = {
  // Autentikasi
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  logoutAll: () => request('/auth/logout-all', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  changePassword: (oldPassword, newPassword) => request('/auth/password', { method: 'POST', body: { oldPassword, newPassword } }),
  getSessions: () => request('/auth/sessions'),
  endSession: (id) => request(`/auth/sessions/${id}`, { method: 'DELETE' }),

  // Berkas & Folder
  getFiles: (path = '') => request(`/files?path=${q(path)}`),
  getStat: (path) => request(`/files/stat?path=${q(path)}`),
  createFolder: (path, name) => request('/files/mkdir', { method: 'POST', body: { path, name } }),
  renameItem: (path, name) => request('/files/rename', { method: 'POST', body: { path, name } }),
  moveItems: (paths, to) => request('/files/move', { method: 'POST', body: { paths, to } }),
  copyItems: (paths, to) => request('/files/copy', { method: 'POST', body: { paths, to } }),
  deleteItems: (paths) => request('/files', { method: 'DELETE', body: { paths } }),
  getUsage: () => request('/files/usage'),
  setFolderColor: (path, color) => request('/files/color', { method: 'POST', body: { path, color } }),

  // Pencarian, Terbaru, Berbintang, Sampah (Tahap 2)
  search: ({ q: text = '', type = '', modified = '' }) => request(`/files/search?q=${q(text)}&type=${q(type)}&modified=${q(modified)}`),
  getRecent: () => request('/files/recent'),
  getStarred: () => request('/starred'),
  star: (path) => request('/starred', { method: 'POST', body: { path } }),
  unstar: (path) => request('/starred', { method: 'DELETE', body: { path } }),
  getTrash: () => request('/trash'),
  restoreTrash: (ids) => request('/trash/restore', { method: 'POST', body: { ids } }),
  deleteTrash: (ids) => request('/trash', { method: 'DELETE', body: { ids } }),
  emptyTrash: () => request('/trash/all', { method: 'DELETE' }),

  // Berbagi (Tahap 3)
  getShares: () => request('/shares'),
  createShare: (body) => request('/shares', { method: 'POST', body }),
  updateShare: (id, body) => request(`/shares/${id}`, { method: 'PATCH', body }),
  deleteShare: (id) => request(`/shares/${id}`, { method: 'DELETE' }),
  listUsers: () => request('/users/list'),
  getSharedWithMe: () => request('/shared-with-me'),
  getSharedFiles: (shareId, path = '') => request(`/shared/${shareId}/files?path=${q(path)}`),
  sharedMkdir: (shareId, path, name) => request(`/shared/${shareId}/mkdir`, { method: 'POST', body: { path, name } }),
  sharedRename: (shareId, path, name) => request(`/shared/${shareId}/rename`, { method: 'POST', body: { path, name } }),
  sharedDelete: (shareId, paths) => request(`/shared/${shareId}/files`, { method: 'DELETE', body: { paths } }),
  sharedUpload: (shareId, targetPath, entry, onProgress, conflict = 'keep-both') => {
    const formData = new FormData();
    formData.append('files', entry.file, entry.file.name);
    return xhrRequest({
      method: 'POST',
      url: `/api/shared/${shareId}/upload?path=${q(targetPath)}&conflict=${conflict}`,
      body: formData,
      onProgress
    });
  },

  // Halaman publik
  publicInfo: (token, path = '') => request(`/s/${q(token)}/info?path=${q(path)}`),
  publicUnlock: (token, password) => request(`/s/${q(token)}/unlock`, { method: 'POST', body: { password } }),

  // Admin
  adminUsers: () => request('/admin/users'),
  adminCreateUser: (body) => request('/admin/users', { method: 'POST', body }),
  adminUpdateUser: (id, body) => request(`/admin/users/${id}`, { method: 'PATCH', body }),
  adminResetPassword: (id, password) => request(`/admin/users/${id}/reset-password`, { method: 'POST', body: { password } }),
  adminShares: () => request('/admin/shares'),
  adminDeleteShare: (id) => request(`/admin/shares/${id}`, { method: 'DELETE' }),
  adminActivity: (params = {}) =>
    request(`/admin/activity?limit=${q(params.limit || 200)}&offset=${q(params.offset || 0)}&username=${q(params.username || '')}`),
  adminStats: () => request('/admin/stats'),
  adminReindex: () => request('/admin/reindex', { method: 'POST' }),

  // Upload multipart (file kecil) dengan path relatif & kebijakan konflik
  uploadFile: (targetPath, entry, onProgress, conflict = 'keep-both') => {
    const formData = new FormData();
    formData.append('relativePaths', JSON.stringify([entry.relativePath || entry.file.name]));
    formData.append('files', entry.file, entry.file.name);
    return xhrRequest({
      method: 'POST',
      url: `/api/files/upload?path=${q(targetPath)}&conflict=${conflict}`,
      body: formData,
      headers: { 'X-Upload-Total-Size': String(entry.file.size) },
      onProgress
    });
  },

  // Upload chunked / resumable (file besar)
  initUpload: (path, name, size, mtime) => request('/upload/init', { method: 'POST', body: { path, name, size, mtime } }),
  getUpload: (id) => request(`/upload/${id}`),
  putChunk: (id, n, blob, onProgress) =>
    xhrRequest({
      method: 'PUT',
      url: `/api/upload/${id}/chunk/${n}`,
      body: blob,
      headers: { 'Content-Type': 'application/octet-stream' },
      onProgress
    }),
  completeUpload: (id, conflict = 'keep-both') => request(`/upload/${id}/complete`, { method: 'POST', body: { conflict } }),
  cancelUpload: (id) => request(`/upload/${id}`, { method: 'DELETE' }),

  // Helper URL (milik sendiri; untuk konteks lain lihat utils/urls.js)
  getRawUrl: (path, dl = false) => `/api/files/raw?path=${q(path)}${dl ? '&dl=1' : ''}`,
  getThumbUrl: (path, w = 256) => `/api/files/thumb?path=${q(path)}&w=${w}`,
  getZipUrl: (paths) => `/api/files/zip?paths=${q(JSON.stringify(paths))}`
};
