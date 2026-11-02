import React, { useEffect, useState } from 'react';
import { Users, Link2, Activity, HardDrive, RefreshCw, UserPlus, KeyRound, Ban, CheckCircle2, Trash2 } from '../icons.jsx';
import Select from './Select.jsx';
import { api } from '../api/client.js';
import { formatFileSize, formatDate } from './FileIcon.jsx';

const GB = 1024 * 1024 * 1024;

/** Halaman Admin (Master Prompt §5.8). */
export default function AdminView({ showToast }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [shares, setShares] = useState([]);
  const [activity, setActivity] = useState([]);
  const [activityUser, setActivityUser] = useState('');
  const [loading, setLoading] = useState(false);

  // Form tambah user
  const [form, setForm] = useState({ username: '', password: '', displayName: '', quotaGb: '100', role: 'user' });
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'users') {
        const [u, s] = await Promise.all([api.adminUsers(), api.adminStats()]);
        setUsers(u.users);
        setStats(s);
      } else if (tab === 'shares') setShares((await api.adminShares()).shares);
      else if (tab === 'activity') setActivity((await api.adminActivity({ username: activityUser })).entries);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tab, activityUser]);

  const act = async (fn, ok) => {
    try {
      await fn();
      if (ok) showToast(ok, 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const createUser = (e) => {
    e.preventDefault();
    act(async () => {
      await api.adminCreateUser({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim() || form.username.trim(),
        role: form.role,
        quotaBytes: Math.round(Number(form.quotaGb || 100) * GB)
      });
      setForm({ username: '', password: '', displayName: '', quotaGb: '100', role: 'user' });
      setShowAdd(false);
    }, 'Pengguna dibuat');
  };

  const changeQuota = (u) => {
    const v = window.prompt(`Kuota untuk @${u.username} (GB):`, String(Math.round(u.quotaBytes / GB)));
    if (v === null) return;
    const gb = Number(v);
    if (!Number.isFinite(gb) || gb <= 0) return showToast('Kuota harus angka > 0', 'error');
    act(() => api.adminUpdateUser(u.id, { quotaBytes: Math.round(gb * GB) }), 'Kuota diperbarui');
  };

  const resetPassword = (u) => {
    const pw = window.prompt(`Password baru untuk @${u.username} (min 8 karakter):`);
    if (!pw) return;
    act(() => api.adminResetPassword(u.id, pw), `Password @${u.username} direset, semua sesinya diakhiri`);
  };

  const tabBtn = (id, label, Icon) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${tab === id ? 'bg-selected text-sky-950' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  const input =
    'px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20';

  return (
    <div className="space-y-4 select-none">
      <div className="flex items-center gap-2 flex-wrap">
        {tabBtn('users', 'Pengguna', Users)}
        {tabBtn('shares', 'Link publik', Link2)}
        {tabBtn('activity', 'Aktivitas', Activity)}
        <div className="flex-1" />
        <button
          onClick={() => act(() => api.adminReindex(), 'Indeks dibangun ulang')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-slate-100"
        >
          <RefreshCw className="w-5 h-5" /> Pindai ulang indeks
        </button>
      </div>

      {tab === 'users' && (
        <>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Disk tersisa', formatFileSize(stats.diskFree), HardDrive],
                ['Kapasitas disk', formatFileSize(stats.diskTotal), HardDrive],
                ['Dipakai semua user', formatFileSize(stats.usedBytes), Users],
                ['Pengguna aktif', `${stats.activeUsers} / ${stats.usersCount}`, Users]
              ].map(([label, value, Icon]) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-200/80 p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </div>
                  <div className="text-lg font-semibold text-slate-800">{value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 text-on-accent text-sm font-semibold"
            >
              <UserPlus className="w-5 h-5" /> Tambah pengguna
            </button>
          </div>

          {showAdd && (
            <form
              onSubmit={createUser}
              className="bg-white rounded-2xl border border-slate-200/80 p-4 grid grid-cols-1 md:grid-cols-5 gap-2"
            >
              <input
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Username"
                className={input}
              />
              <input
                required
                type="password"
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Password (min 8)"
                className={input}
              />
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Nama tampilan"
                className={input}
              />
              <input
                type="number"
                min="1"
                value={form.quotaGb}
                onChange={(e) => setForm({ ...form, quotaGb: e.target.value })}
                placeholder="Kuota (GB)"
                className={input}
              />
              <div className="flex gap-2">
                <Select
                  value={form.role}
                  onChange={(role) => setForm({ ...form, role })}
                  options={[
                    ['user', 'User'],
                    ['admin', 'Admin']
                  ]}
                  aria-label="Peran"
                  className="flex-1"
                />
                <button type="submit" className="px-4 py-2 rounded-xl bg-ink hover:bg-ink/90 text-on-accent text-sm font-semibold">
                  Simpan
                </button>
              </div>
            </form>
          )}

          <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Pengguna</th>
                  <th className="py-3 px-4 w-56 hidden md:table-cell">Pemakaian</th>
                  <th className="py-3 px-4 w-28 hidden lg:table-cell">Status</th>
                  <th className="py-3 px-4 w-40 hidden lg:table-cell">Terakhir login</th>
                  <th className="py-3 px-3 w-40 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const pct = u.quotaBytes > 0 ? Math.min(100, Math.round((u.usedBytes / u.quotaBytes) * 100)) : 0;
                  return (
                    <tr key={u.id} className={u.disabled ? 'opacity-60' : ''}>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-800">
                          {u.displayName} <span className="text-xs text-slate-400">@{u.username}</span>
                          {u.role === 'admin' && (
                            <span className="ml-2 text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 md:hidden">
                          {formatFileSize(u.usedBytes)} / {formatFileSize(u.quotaBytes)}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 hidden md:table-cell">
                        <div className="text-xs text-slate-600">
                          {formatFileSize(u.usedBytes)} dari {formatFileSize(u.quotaBytes)} ({pct}%)
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className={`h-full ${pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-sky-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-xs hidden lg:table-cell">
                        {u.disabled ? (
                          <span className="text-red-600 font-semibold">Nonaktif</span>
                        ) : (
                          <span className="text-emerald-600 font-semibold">Aktif</span>
                        )}
                        <span className="text-slate-400"> • {u.activeSessions} sesi</span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-500 hidden lg:table-cell">
                        {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Belum pernah'}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => changeQuota(u)}
                          className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200/80"
                          title="Atur kuota"
                        >
                          <HardDrive className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => resetPassword(u)}
                          className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200/80"
                          title="Reset password"
                        >
                          <KeyRound className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() =>
                            act(
                              () => api.adminUpdateUser(u.id, { disabled: !u.disabled }),
                              u.disabled ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan'
                            )
                          }
                          className={`p-1.5 rounded-full ${u.disabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-600 hover:bg-red-50'}`}
                          title={u.disabled ? 'Aktifkan' : 'Nonaktifkan'}
                        >
                          {u.disabled ? <CheckCircle2 className="w-5 h-5" /> : <Ban className="w-5 h-5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'shares' && (
        <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/70 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Pemilik</th>
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4 w-36 hidden md:table-cell">Jenis</th>
                <th className="py-3 px-4 w-36 hidden lg:table-cell">Berlaku</th>
                <th className="py-3 px-4 w-24 hidden md:table-cell">Download</th>
                <th className="py-3 px-3 w-16 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shares.map((s) => (
                <tr key={s.id}>
                  <td className="py-2.5 px-4 text-xs">@{s.ownerUsername}</td>
                  <td className="py-2.5 px-4 truncate max-w-xs" title={s.path}>
                    {s.path}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-500 hidden md:table-cell">
                    {s.type === 'link' ? `Link (${s.permission})` : `ke @${s.targetUsername} (${s.permission})`}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-500 hidden lg:table-cell">
                    {s.expired ? 'Kedaluwarsa' : s.expiresAt ? formatDate(s.expiresAt) : 'Selamanya'}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-500 hidden md:table-cell">{s.type === 'link' ? s.downloadCount : '—'}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() => act(() => api.adminDeleteShare(s.id), 'Berbagi dicabut')}
                      className="p-1.5 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Cabut"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
              {shares.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Belum ada berbagi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-3">
          <Select
            value={activityUser}
            onChange={setActivityUser}
            options={[['', 'Semua pengguna'], ...users.map((u) => [u.username, `@${u.username}`])]}
            aria-label="Pengguna"
            className="w-full sm:w-64"
          />
          <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-200 font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-40">Waktu</th>
                  <th className="py-3 px-4 w-28">Pengguna</th>
                  <th className="py-3 px-4 w-36">Aksi</th>
                  <th className="py-3 px-4">Path</th>
                  <th className="py-3 px-4 w-32 hidden md:table-cell">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activity.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 px-4 text-slate-500">{a.createdAt}</td>
                    <td className="py-2 px-4">@{a.username || '?'}</td>
                    <td className="py-2 px-4 font-mono">{a.action}</td>
                    <td className="py-2 px-4 truncate max-w-xs" title={a.path || ''}>
                      {a.path || ''}
                    </td>
                    <td className="py-2 px-4 text-slate-400 hidden md:table-cell">{a.ip || ''}</td>
                  </tr>
                ))}
                {activity.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Belum ada aktivitas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">Log dipangkas otomatis setelah 90 hari.</p>
        </div>
      )}
    </div>
  );
}
