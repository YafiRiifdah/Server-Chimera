import React, { useState, useEffect } from 'react';
import { FolderPlus, Edit3, FolderInput, KeyRound, X, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import FolderIcon from './FolderIcon.jsx';
import { formatFileSize, formatDate } from './FileIcon.jsx';
import { api } from '../api/client.js';

/**
 * Modal Buat Folder Baru
 */
export function NewFolderModal({ isOpen, onClose, onSubmit }) {
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    setLoading(true);
    setError('');
    try {
      await onSubmit(folderName.trim());
      setFolderName('');
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal membuat folder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <FolderPlus className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">Folder baru</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              autoFocus
              placeholder="Folder tanpa judul"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
            />
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !folderName.trim()}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-on-accent shadow-sm transition-all"
            >
              {loading ? 'Membuat...' : 'Buat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal Ganti Nama
 */
export function RenameModal({ item, isOpen, onClose, onSubmit }) {
  const [newName, setNewName] = useState(item?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !item) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === item.name) {
      onClose();
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit(item, newName.trim());
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal mengganti nama');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <Edit3 className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">Ganti nama</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
            />
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !newName.trim()}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-on-accent shadow-sm transition-all"
            >
              {loading ? 'Menyimpan...' : 'Oke'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal Pindahkan Item: pemilih folder yang bisa dijelajahi (naik/turun),
 * mirip dialog "Pindahkan ke" Google Drive. Folder yang sedang dipindahkan
 * (dan turunannya) tidak bisa dipilih sebagai tujuan.
 */
export function MoveModal({ items, currentPath, isOpen, onClose, onSubmit }) {
  const [browsePath, setBrowsePath] = useState(currentPath || '');
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const movingPaths = (items || []).map((i) => i.path);
  const isInsideMoving = (p) => movingPaths.some((mp) => p === mp || p.startsWith(`${mp}/`));

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingFolders(true);
    api
      .getFiles(browsePath)
      .then((data) => {
        if (cancelled) return;
        setFolders((data.entries || []).filter((e) => e.type === 'folder'));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Gagal memuat folder');
      })
      .finally(() => {
        if (!cancelled) setLoadingFolders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [browsePath, isOpen]);

  if (!isOpen || !items || items.length === 0) return null;

  const segments = browsePath ? browsePath.split('/').filter(Boolean) : [];
  const parentPath = segments.slice(0, -1).join('/');
  // Dari Drive Saya: lokasi sekarang = folder aktif. Dari Pencarian/Berbintang/Terbaru (currentPath null):
  // "sudah di sini" hanya jika semua item memang berada di folder yang sedang dijelajahi.
  const parentOfPath = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const sameLocation = currentPath === null ? movingPaths.every((p) => parentOfPath(p) === browsePath) : browsePath === (currentPath || '');
  const canMoveHere = !sameLocation && !isInsideMoving(browsePath);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canMoveHere) return;
    setLoading(true);
    setError('');
    try {
      await onSubmit(items, browsePath);
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal memindahkan item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <FolderInput className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">
              Pindahkan {items.length === 1 ? `"${items[0].name}"` : `${items.length} item`}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lokasi yang sedang dijelajahi */}
        <div className="flex items-center gap-1 text-xs text-slate-600 mb-2 flex-wrap">
          {segments.length > 0 && (
            <button
              type="button"
              onClick={() => setBrowsePath(parentPath)}
              className="p-1 rounded-md hover:bg-slate-100 text-slate-500"
              title="Naik satu folder"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setBrowsePath('')}
            className={`px-2 py-1 rounded-md hover:bg-slate-100 ${segments.length === 0 ? 'font-semibold text-slate-900' : ''}`}
          >
            Drive Saya
          </button>
          {segments.map((seg, idx) => {
            const segPath = segments.slice(0, idx + 1).join('/');
            const isLast = idx === segments.length - 1;
            return (
              <React.Fragment key={segPath}>
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <button
                  type="button"
                  onClick={() => setBrowsePath(segPath)}
                  className={`px-2 py-1 rounded-md hover:bg-slate-100 truncate max-w-[140px] ${isLast ? 'font-semibold text-slate-900' : ''}`}
                  title={seg}
                >
                  {seg}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border border-slate-200 rounded-2xl p-2 h-56 overflow-y-auto space-y-1">
            {loadingFolders && <p className="text-xs text-slate-400 px-3 py-2">Memuat...</p>}
            {!loadingFolders && folders.length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-6 text-center">Tidak ada sub-folder di sini</p>
            )}
            {!loadingFolders &&
              folders.map((f) => {
                const disabled = isInsideMoving(f.path);
                return (
                  <button
                    key={f.path}
                    type="button"
                    disabled={disabled}
                    onClick={() => setBrowsePath(f.path)}
                    title={disabled ? 'Folder ini sedang dipindahkan' : `Buka ${f.name}`}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
                      disabled ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FolderIcon color={f.color} className={`w-4 h-4 shrink-0 ${disabled ? 'opacity-30' : ''}`} />
                      <span className="truncate">{f.name}</span>
                    </span>
                    {!disabled && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                  </button>
                );
              })}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-slate-400 truncate">
              {sameLocation ? 'Item sudah berada di sini' : `Tujuan: ${browsePath || 'Drive Saya'}`}
            </span>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading || !canMoveHere}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-on-accent shadow-sm transition-all"
              >
                {loading ? 'Memindahkan...' : 'Pindahkan ke sini'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal Ganti Password
 */
export function ChangePasswordModal({ isOpen, onClose, onSubmit }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password baru minimal 8 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak cocok');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await onSubmit(oldPassword, newPassword);
      setSuccess('Password berhasil diperbarui');
      setTimeout(() => {
        onClose();
        setSuccess('');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }, 1000);
    } catch (err) {
      setError(err.message || 'Gagal memperbarui password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <KeyRound className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">Ganti Password</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Password Saat Ini</label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Password Baru (min 8 karakter)</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Konfirmasi Password Baru</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all text-slate-800"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          {success && <p className="text-xs text-emerald-600 font-semibold">{success}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-on-accent shadow-sm transition-all"
            >
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Modal Detail & Informasi Berkas/Folder
 */
export function DetailModal({ item, isOpen, onClose }) {
  if (!isOpen || !item) return null;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <Info className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">Detail Item</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="pb-2 border-b border-slate-100">
            <span className="text-slate-400 font-medium block mb-0.5">Nama</span>
            <span className="text-slate-800 font-semibold text-sm break-all">{item.name}</span>
          </div>

          <div className="pb-2 border-b border-slate-100">
            <span className="text-slate-400 font-medium block mb-0.5">Tipe</span>
            <span className="text-slate-700 capitalize">{item.type === 'folder' ? 'Folder' : item.mime || 'Berkas'}</span>
          </div>

          <div className="pb-2 border-b border-slate-100">
            <span className="text-slate-400 font-medium block mb-0.5">Ukuran</span>
            <span className="text-slate-700">
              {item.type === 'folder' ? '—' : `${formatFileSize(item.size)} (${item.size?.toLocaleString('id-ID')} byte)`}
            </span>
          </div>

          <div className="pb-2 border-b border-slate-100">
            <span className="text-slate-400 font-medium block mb-0.5">Lokasi</span>
            <span className="text-slate-700 font-mono text-[11px] break-all">{item.path || 'Root'}</span>
          </div>

          <div>
            <span className="text-slate-400 font-medium block mb-0.5">Terakhir Diubah</span>
            <span className="text-slate-700">{formatDate(item.mtime)}</span>
          </div>
        </div>

        <div className="flex justify-end pt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
