import React, { useEffect, useState } from 'react';
import useEscapeKey from '../hooks/useEscapeKey.js';
import { X, UserPlus, Link2, Copy, Trash2, Lock, Check } from '../icons.jsx';
import { api } from '../api/client.js';
import { copyText } from '../utils/clipboard.js';
import FileIcon from './FileIcon.jsx';
import Select from './Select.jsx';
import InputModal from './InputModal.jsx';
import PasswordInput from './PasswordInput.jsx';

const USER_PERMS = [
  ['view', 'Lihat'],
  ['edit', 'Edit']
];
const LINK_PERMS = [
  ['download', 'Lihat & download'],
  ['view', 'Hanya lihat']
];
const EXPIRY_OPTIONS = [
  ['never', 'Tanpa kedaluwarsa'],
  ['1d', '1 hari'],
  ['7d', '7 hari'],
  ['30d', '30 hari']
];

/**
 * Dialog "Bagikan" satu tempat (Master Prompt §5.6): ke pengguna lain dan link publik.
 */
export default function ShareModal({ item, isOpen, onClose, showToast }) {
  useEscapeKey(isOpen && !!item, onClose);
  const [users, setUsers] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form berbagi ke pengguna
  const [targetUsername, setTargetUsername] = useState('');
  const [userPermission, setUserPermission] = useState('view');

  // Form link publik
  const [linkPermission, setLinkPermission] = useState('download');
  const [expiresIn, setExpiresIn] = useState('never');
  const [linkPassword, setLinkPassword] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState(null); // share yang sedang dipasangi password
  const [error, setError] = useState('');

  const reload = async () => {
    if (!item) return;
    setLoading(true);
    try {
      const [u, s] = await Promise.all([api.listUsers(), api.getShares()]);
      setUsers(u.users);
      setShares(s.shares.filter((x) => x.path === item.path));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      reload();
    }
  }, [isOpen, item?.path]);

  if (!isOpen || !item) return null;

  const userShares = shares.filter((s) => s.type === 'user');
  const linkShares = shares.filter((s) => s.type === 'link');
  const availableUsers = users.filter((u) => !userShares.some((s) => s.targetUsername === u.username));

  const run = async (fn, okMsg) => {
    setError('');
    try {
      await fn();
      if (okMsg) showToast(okMsg, 'success');
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const shareToUser = () =>
    run(async () => {
      if (!targetUsername) throw new Error('Pilih pengguna dulu');
      await api.createShare({ path: item.path, type: 'user', targetUsername, permission: userPermission });
      setTargetUsername('');
    }, `Dibagikan ke ${targetUsername}`);

  const createLink = async () => {
    setCreating(true);
    await run(async () => {
      const res = await api.createShare({
        path: item.path,
        type: 'link',
        permission: linkPermission,
        expiresIn,
        password: linkPassword || undefined,
        maxDownloads: maxDownloads ? Number(maxDownloads) : undefined
      });
      setLinkPassword('');
      setMaxDownloads('');
      const ok = await copyText(res.share.url);
      showToast(ok ? 'Link dibuat dan disalin' : 'Link dibuat', 'success');
    });
    setCreating(false);
  };

  const copy = async (url) => {
    const ok = await copyText(url);
    showToast(ok ? 'Link disalin' : 'Gagal menyalin link', ok ? 'success' : 'error');
  };

  const select = 'px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20';
  const small = '!py-1.5 !px-2.5 !rounded-lg !text-xs !bg-white';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 w-full sm:max-w-lg p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6 max-h-[92vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileIcon item={item} className="w-6 h-6 shrink-0" />
            <h3 className="text-lg font-semibold text-slate-800 truncate">Bagikan &quot;{item.name}&quot;</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        {/* ---- Bagikan ke pengguna ---- */}
        <section className="mb-5">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4" /> Bagikan ke pengguna
          </h4>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select
              value={targetUsername}
              onChange={setTargetUsername}
              placeholder="Pilih pengguna…"
              aria-label="Pengguna"
              options={availableUsers.map((u) => [u.username, `${u.displayName} (@${u.username})`])}
              className={`${small} w-full sm:flex-1 min-w-0`}
            />
            <div className="flex gap-2">
              <Select
                value={userPermission}
                onChange={setUserPermission}
                options={USER_PERMS}
                aria-label="Izin"
                className={`${small} flex-1 sm:flex-none`}
              />
              <button
                onClick={shareToUser}
                disabled={!targetUsername}
                className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-on-accent text-xs font-semibold"
              >
                Bagikan
              </button>
            </div>
          </div>
          {userShares.length > 0 && (
            <ul className="mt-3 divide-y divide-slate-100 border border-slate-100 rounded-xl">
              {userShares.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="w-7 h-7 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0">
                    {s.targetUsername.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 truncate min-w-0">@{s.targetUsername}</span>
                  <Select
                    value={s.permission}
                    onChange={(permission) => run(() => api.updateShare(s.id, { permission }))}
                    options={USER_PERMS}
                    aria-label="Izin"
                    className={small}
                  />
                  <button
                    onClick={() => run(() => api.deleteShare(s.id), 'Akses dicabut')}
                    className="p-1.5 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50"
                    title="Cabut akses"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Link publik ---- */}
        <section>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Link2 className="w-4 h-4" /> Link publik
          </h4>

          {linkShares.map((s) => (
            <div key={s.id} className="border border-slate-100 rounded-xl p-3 mb-2 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={s.url || ''}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono truncate select-text"
                />
                <button
                  onClick={() => copy(s.url)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-on-accent font-semibold"
                  title="Salin link"
                >
                  <Copy className="w-4 h-4" /> Salin
                </button>
                <button
                  onClick={() => run(() => api.deleteShare(s.id), 'Link dicabut')}
                  className="p-1.5 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50"
                  title="Cabut link"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-slate-600">
                <Select
                  value={s.permission}
                  onChange={(permission) => run(() => api.updateShare(s.id, { permission }))}
                  options={LINK_PERMS}
                  aria-label="Izin link"
                  className={small}
                />
                <Select
                  value={s.expiresAt ? '' : 'never'}
                  onChange={(expiresIn) => expiresIn && run(() => api.updateShare(s.id, { expiresIn }))}
                  options={[
                    ...(s.expiresAt ? [['', `Berlaku s/d ${new Date(s.expiresAt).toLocaleDateString('id-ID')}`]] : []),
                    ...EXPIRY_OPTIONS
                  ]}
                  aria-label="Kedaluwarsa"
                  className={small}
                />
                <span className="inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {s.hasPassword ? (
                    <button onClick={() => run(() => api.updateShare(s.id, { password: null }), 'Password dihapus')} className="underline">
                      hapus password
                    </button>
                  ) : (
                    <button onClick={() => setPasswordFor(s)} className="underline">
                      pasang password
                    </button>
                  )}
                </span>
                <span className="text-slate-400">
                  {s.downloadCount} download{s.maxDownloads ? ` / maks ${s.maxDownloads}` : ''}
                </span>
                {s.expired && <span className="text-red-500 font-semibold">Kedaluwarsa</span>}
              </div>
            </div>
          ))}

          <div className="border border-dashed border-slate-200 rounded-xl p-3 text-xs space-y-2">
            <p className="text-slate-500 font-medium">Buat link baru</p>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <Select
                value={linkPermission}
                onChange={setLinkPermission}
                options={LINK_PERMS}
                aria-label="Izin link"
                className={`${small} w-full sm:w-auto`}
              />
              <Select
                value={expiresIn}
                onChange={setExpiresIn}
                options={EXPIRY_OPTIONS}
                aria-label="Kedaluwarsa"
                className={`${small} w-full sm:w-auto`}
              />
              <PasswordInput
                wrapperClassName="w-full sm:w-44"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                placeholder="Password (opsional)"
                className={select}
              />
              <input
                type="number"
                min="1"
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
                placeholder="Maks download"
                className={`${select} w-full sm:w-32`}
              />
            </div>
            <button
              onClick={createLink}
              disabled={creating || loading}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-ink hover:bg-ink/90 disabled:opacity-50 text-on-accent font-semibold"
            >
              {creating ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
              {creating ? 'Membuat…' : 'Buat link & salin'}
            </button>
          </div>
        </section>
      </div>
      <InputModal
        open={!!passwordFor}
        title="Pasang password"
        message="Siapa pun yang membuka link ini harus memasukkan password."
        label="Password link"
        type="password"
        placeholder="Minimal 4 karakter"
        confirmLabel="Pasang"
        validate={(v) => (v.length < 4 ? 'Password minimal 4 karakter' : null)}
        onConfirm={(pw) => {
          const target = passwordFor;
          setPasswordFor(null);
          run(() => api.updateShare(target.id, { password: pw }), 'Password dipasang');
        }}
        onCancel={() => setPasswordFor(null)}
      />
    </div>
  );
}
