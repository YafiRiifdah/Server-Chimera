import React, { useEffect, useState } from 'react';
import useEscapeKey from '../hooks/useEscapeKey.js';
import { X, Link2, UserPlus, Activity } from '../icons.jsx';
import { api } from '../api/client.js';
import FileIcon, { formatFileSize, formatDate } from './FileIcon.jsx';
import Thumbnail from './Thumbnail.jsx';

const ACTION_LABEL = {
  upload: 'Diunggah',
  mkdir: 'Dibuat',
  rename: 'Diganti nama',
  move: 'Dipindahkan',
  copy: 'Disalin',
  open: 'Dibuka',
  restore: 'Dipulihkan',
  trash: 'Dipindahkan ke Sampah',
  share_link: 'Link dibuat',
  share_user: 'Dibagikan ke pengguna',
  unshare: 'Berbagi dicabut',
  public_download: 'Diunduh lewat link',
  download_zip: 'Diunduh sebagai zip'
};

/**
 * Panel Detail (Master Prompt §5.3): pratinjau kecil, tipe, ukuran, lokasi, dibuat, diubah,
 * siapa saja yang punya akses, aktivitas terakhir. Detail server hanya untuk item milik sendiri.
 */
export default function DetailPanel({ item, isOpen, onClose }) {
  useEscapeKey(isOpen && !!item, onClose);
  const [stat, setStat] = useState(null);

  useEffect(() => {
    setStat(null);
    if (!isOpen || !item || item.shareId || item.trashId) return;
    api
      .getStat(item.path)
      .then(setStat)
      .catch(() => setStat(null));
  }, [isOpen, item?.path, item?.shareId, item?.trashId]);

  if (!isOpen || !item) return null;
  const location = item.path && item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : 'Drive Saya';

  const Row = ({ label, children }) => (
    <div className="pb-2 border-b border-slate-100">
      <span className="text-slate-400 font-medium block mb-0.5">{label}</span>
      <span className="text-slate-700 break-all">{children}</span>
    </div>
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 select-none animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 w-full sm:max-w-md p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6 max-h-[92vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">Detail</h3>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100" title="Tutup" aria-label="Tutup">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Thumbnail item={item} width={128} className="w-16 h-16 rounded-xl shrink-0" iconClassName="w-9 h-9" />
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 text-sm break-all flex items-center gap-1.5">
              <FileIcon item={item} className="w-4 h-4 shrink-0" />
              <span>{item.name}</span>
            </div>
            <div className="text-xs text-slate-500 capitalize">{item.type === 'folder' ? 'Folder' : item.mime || 'Berkas'}</div>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <Row label="Ukuran">
            {item.type === 'folder'
              ? stat
                ? `${formatFileSize(stat.size)} • ${stat.itemCount} item`
                : '—'
              : `${formatFileSize(item.size)} (${(item.size || 0).toLocaleString('id-ID')} byte)`}
          </Row>
          <Row label="Lokasi">
            {item.ownerUsername
              ? `Dibagikan oleh @${item.ownerUsername}`
              : item.originalPath
                ? `Sampah (asal: ${item.originalPath})`
                : location}
          </Row>
          {stat?.ctime && <Row label="Dibuat">{formatDate(stat.ctime)}</Row>}
          <Row label="Terakhir diubah">{formatDate(item.mtime || item.deletedAt)}</Row>

          {stat && (
            <>
              <div className="pb-2 border-b border-slate-100">
                <span className="text-slate-400 font-medium block mb-1">Siapa yang punya akses</span>
                {stat.shares.length === 0 ? (
                  <span className="text-slate-700">Hanya Anda</span>
                ) : (
                  <ul className="space-y-1">
                    {stat.shares.map((s) => (
                      <li key={s.id} className="flex items-center gap-1.5 text-slate-700">
                        {s.type === 'link' ? <Link2 className="w-4 h-4 text-slate-400" /> : <UserPlus className="w-4 h-4 text-slate-400" />}
                        {s.type === 'link'
                          ? `Siapa saja dengan link (${s.permission === 'view' ? 'lihat' : 'lihat & download'})`
                          : `@${s.targetUsername} (${s.permission === 'edit' ? 'edit' : 'lihat'})`}
                        {s.expiresAt && <span className="text-slate-400">• s/d {formatDate(s.expiresAt)}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <span className="text-slate-400 font-medium block mb-1 flex items-center gap-1">
                  <Activity className="w-4 h-4" /> Aktivitas terakhir
                </span>
                {stat.activity.length === 0 ? (
                  <span className="text-slate-500">Belum ada catatan</span>
                ) : (
                  <ul className="space-y-1">
                    {stat.activity.slice(0, 6).map((a, i) => (
                      <li key={i} className="flex justify-between gap-2 text-slate-700">
                        <span>
                          {ACTION_LABEL[a.action] || a.action}
                          {a.meta?.onBehalfOf ? ` oleh @${a.username}` : ''}
                        </span>
                        <span className="text-slate-400 shrink-0">{a.at}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
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
