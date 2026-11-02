import React, { useEffect, useState } from 'react';
import { Copy, Trash2, Link2, UserPlus, AlertTriangle } from 'lucide-react';
import { api } from '../api/client.js';
import { copyText } from '../utils/clipboard.js';
import { formatDate } from './FileIcon.jsx';

/** Halaman "Link saya": semua berbagi yang saya kelola (Master Prompt §5.6). */
export default function LinksView({ showToast, onOpenPath }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      setShares((await api.getShares()).shares);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const revoke = async (s) => {
    try {
      await api.deleteShare(s.id);
      showToast(s.type === 'link' ? 'Link dicabut' : 'Akses dicabut', 'success');
      reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const copy = async (url) => {
    const ok = await copyText(url);
    showToast(ok ? 'Link disalin' : 'Gagal menyalin', ok ? 'success' : 'error');
  };

  if (loading) return <div className="py-20 text-center text-sm text-slate-400">Memuat…</div>;

  if (shares.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center text-slate-400">
        <Link2 className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-600">Belum ada yang dibagikan</p>
        <p className="text-xs mt-1">Klik kanan file atau folder lalu pilih &quot;Bagikan&quot;.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden select-none">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50/70 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <tr>
            <th className="py-3 px-4">Item</th>
            <th className="py-3 px-4 w-40">Dibagikan ke</th>
            <th className="py-3 px-4 w-32 hidden md:table-cell">Izin</th>
            <th className="py-3 px-4 w-40 hidden lg:table-cell">Berlaku</th>
            <th className="py-3 px-4 w-28 hidden md:table-cell">Download</th>
            <th className="py-3 px-3 w-24 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {shares.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50/80">
              <td className="py-2.5 px-4">
                <button onClick={() => onOpenPath(s.path)} className="text-left hover:underline truncate max-w-md block" title={s.path}>
                  {s.name}
                </button>
                <div className="text-[11px] text-slate-400 truncate max-w-md">
                  {s.path.includes('/') ? s.path.slice(0, s.path.lastIndexOf('/')) : 'Drive Saya'}
                  {!s.exists && (
                    <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="w-3 h-3" /> item sudah tidak ada
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2.5 px-4 text-xs">
                {s.type === 'link' ? (
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    <Link2 className="w-3.5 h-3.5" /> Siapa saja dengan link
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    <UserPlus className="w-3.5 h-3.5" /> @{s.targetUsername}
                  </span>
                )}
              </td>
              <td className="py-2.5 px-4 text-xs text-slate-500 hidden md:table-cell">
                {s.permission === 'view' ? 'Hanya lihat' : s.permission === 'download' ? 'Lihat & download' : 'Edit'}
                {s.hasPassword && ' • password'}
              </td>
              <td className="py-2.5 px-4 text-xs text-slate-500 hidden lg:table-cell">
                {s.expired ? (
                  <span className="text-red-500 font-semibold">Kedaluwarsa</span>
                ) : s.expiresAt ? (
                  `s/d ${formatDate(s.expiresAt)}`
                ) : (
                  'Selamanya'
                )}
              </td>
              <td className="py-2.5 px-4 text-xs text-slate-500 hidden md:table-cell">
                {s.type === 'link' ? `${s.downloadCount}${s.maxDownloads ? ` / ${s.maxDownloads}` : ''}` : '—'}
              </td>
              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                {s.type === 'link' && s.url && (
                  <button
                    onClick={() => copy(s.url)}
                    className="p-1.5 rounded-full text-slate-500 hover:bg-slate-200/80 hover:text-slate-800"
                    title="Salin link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => revoke(s)}
                  className="p-1.5 rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"
                  title="Cabut"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
