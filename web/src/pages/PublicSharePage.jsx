import React, { useEffect, useState } from 'react';
import { Logo, Lock, Download, ChevronRight, FolderArchive, Eye, AlertCircle, Loader2, List, LayoutGrid } from '../icons.jsx';
import { api } from '../api/client.js';
import FileIcon, { formatFileSize, formatDate } from '../components/FileIcon.jsx';
import Thumbnail from '../components/Thumbnail.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import { rawUrl, zipUrl } from '../utils/urls.js';

/**
 * Halaman link publik /s/<token> (Master Prompt §5.6): nama, ukuran, pratinjau, tombol Download;
 * folder bisa dijelajah dan "Download semua (zip)". Tanpa login.
 */
export default function PublicSharePage({ token }) {
  const [info, setInfo] = useState(null);
  const [path, setPath] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [preview, setPreview] = useState(null);
  // Tampilan folder: petak (bawaan, enak untuk foto/video) atau daftar; diingat di browser pengunjung
  const [viewMode, setViewModeState] = useState(() => {
    try {
      return localStorage.getItem('chimera_public_view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const setViewMode = (mode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem('chimera_public_view', mode);
    } catch {
      /* penyimpanan tidak tersedia */
    }
  };

  const load = async (sub = path) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.publicInfo(token, sub);
      setInfo(data);
      setPath(sub);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load('');
  }, [token]);

  const unlock = async (e) => {
    e.preventDefault();
    setUnlockError('');
    try {
      await api.publicUnlock(token, password);
      await load('');
    } catch (err) {
      setUnlockError(err.message);
    }
  };

  const canDownload = info?.permission === 'download' && !info?.limitReached;
  const toItem = (e) => ({ ...e, publicToken: token, key: e.path, canDownload });

  const segments = path ? path.split('/').filter(Boolean) : [];
  const isFolderView = !!info && info.unlocked && info.type === 'folder';
  const folders = isFolderView ? info.entries.filter((e) => e.type === 'folder') : [];
  const files = isFolderView ? info.entries.filter((e) => e.type !== 'folder') : [];
  const openEntry = (e) => (e.type === 'folder' ? load(e.path) : setPreview(toItem(e)));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center gap-3">
        <Logo className="w-10 h-10 text-sky-600" />
        <div className="flex flex-col">
          <span className="font-bold text-lg leading-none">Chimera</span>
          <span className="text-xs text-slate-400 font-medium">Dibagikan lewat link</span>
        </div>
      </header>

      <main className={`${isFolderView && viewMode === 'grid' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto p-4 sm:p-8`}>
        {loading && (
          <div className="py-20 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Memuat...
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center">
            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h1 className="text-lg font-semibold mb-1">{error.status === 410 ? 'Link tidak berlaku lagi' : 'Link tidak ditemukan'}</h1>
            <p className="text-sm text-slate-500">{error.message}</p>
          </div>
        )}

        {!loading && info && info.requiresPassword && !info.unlocked && (
          <form onSubmit={unlock} className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-semibold">{info.name}</h1>
                <p className="text-xs text-slate-500">Link ini dilindungi password</p>
              </div>
            </div>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
            />
            {unlockError && <p className="text-xs text-red-500 mt-2">{unlockError}</p>}
            <button
              type="submit"
              className="mt-4 w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-on-accent text-sm font-semibold"
            >
              Buka
            </button>
          </form>
        )}

        {!loading && info && info.unlocked && info.type === 'file' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="w-full sm:w-56 h-40 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                <Thumbnail item={toItem({ ...info, path: '' })} width={512} className="w-full h-full" iconClassName="w-16 h-16" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold break-all">{info.name}</h1>
                <p className="text-sm text-slate-500 mt-1">
                  {formatFileSize(info.size)} • Diubah {formatDate(info.mtime)}
                </p>
                {info.expiresAt && <p className="text-xs text-slate-400 mt-1">Berlaku sampai {formatDate(info.expiresAt)}</p>}
                {info.maxDownloads && (
                  <p className="text-xs text-slate-400">
                    Download {info.downloadCount} dari {info.maxDownloads}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-5">
                  <button
                    onClick={() => setPreview(toItem({ ...info, path: '', type: 'file' }))}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-sm hover:bg-slate-50"
                  >
                    <Eye className="w-5 h-5" /> Pratinjau
                  </button>
                  {canDownload ? (
                    <a
                      href={rawUrl({ publicToken: token, path: '' }, true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-on-accent text-sm font-semibold"
                    >
                      <Download className="w-5 h-5" /> Download
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 self-center">
                      {info.limitReached ? 'Batas download sudah tercapai' : 'Pemilik hanya mengizinkan melihat'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && info && info.unlocked && info.type === 'folder' && (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <nav className="flex items-center gap-1 text-sm min-w-0 flex-wrap">
                <button
                  onClick={() => load('')}
                  className={`px-2 py-1 rounded-lg hover:bg-slate-100 font-semibold ${segments.length === 0 ? 'text-slate-900' : 'text-slate-600'}`}
                >
                  {info.name}
                </button>
                {segments.map((seg, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                    <button
                      onClick={() => load(segments.slice(0, idx + 1).join('/'))}
                      className={`px-2 py-1 rounded-lg hover:bg-slate-100 truncate max-w-[160px] ${idx === segments.length - 1 ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
                    >
                      {seg}
                    </button>
                  </React.Fragment>
                ))}
              </nav>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <div className="flex items-center bg-surface p-0.5 rounded-full border border-slate-200/60">
                  <button
                    onClick={() => setViewMode('list')}
                    title="Tampilan daftar"
                    aria-label="Tampilan daftar"
                    aria-pressed={viewMode === 'list'}
                    className={`p-1.5 px-3 rounded-full ${viewMode === 'list' ? 'bg-selected text-sky-950' : 'text-slate-600 hover:bg-surface-hover'}`}
                  >
                    <List className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    title="Tampilan petak"
                    aria-label="Tampilan petak"
                    aria-pressed={viewMode === 'grid'}
                    className={`p-1.5 px-3 rounded-full ${viewMode === 'grid' ? 'bg-selected text-sky-950' : 'text-slate-600 hover:bg-surface-hover'}`}
                  >
                    <LayoutGrid className="w-5 h-5" />
                  </button>
                </div>
                {canDownload ? (
                  <a
                    href={zipUrl([{ publicToken: token, path }])}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-on-accent text-sm font-semibold shrink-0"
                  >
                    <FolderArchive className="w-5 h-5" /> <span className="hidden sm:inline">Download semua (zip)</span>
                    <span className="sm:hidden">Zip</span>
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">
                    {info.limitReached ? 'Batas download sudah tercapai' : 'Hanya bisa dilihat'}
                  </span>
                )}
              </div>
            </div>

            {viewMode === 'grid' && (
              <div className="p-4 sm:p-5 space-y-5">
                {info.entries.length === 0 && <p className="py-12 text-center text-sm text-slate-400">Folder ini kosong</p>}
                {folders.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Folder ({folders.length})</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {folders.map((e) => (
                        <button
                          key={e.path}
                          onClick={() => openEntry(e)}
                          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-surface hover:bg-surface-hover text-left min-w-0"
                          title={e.name}
                        >
                          <FileIcon item={e} className="w-6 h-6 shrink-0" />
                          <span className="truncate text-sm font-medium text-slate-800">{e.name}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {files.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">File ({files.length})</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {files.map((e) => (
                        <button
                          key={e.path}
                          onClick={() => openEntry(e)}
                          className="group rounded-2xl bg-surface hover:bg-surface-hover text-left overflow-hidden min-w-0"
                          title={e.name}
                        >
                          <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                            <Thumbnail item={toItem(e)} width={320} className="w-full h-full" iconClassName="w-12 h-12" />
                          </div>
                          <div className="px-3 py-2 flex items-center gap-2 min-w-0">
                            <FileIcon item={e} className="w-5 h-5 shrink-0" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-slate-800">{e.name}</div>
                              <div className="text-[11px] text-slate-400">{formatFileSize(e.size)}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {viewMode === 'list' && (
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="text-left py-3 px-5">Nama</th>
                    <th className="text-left py-3 px-4 w-40 hidden sm:table-cell">Diubah</th>
                    <th className="text-right py-3 px-5 w-28">Ukuran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {info.entries.map((e) => (
                    <tr key={e.path} onClick={() => openEntry(e)} className="hover:bg-slate-50 cursor-pointer">
                      <td className="py-2 px-5">
                        <div className="flex items-center gap-3">
                          <Thumbnail item={toItem(e)} width={64} className="w-7 h-7 rounded-md shrink-0" iconClassName="w-5 h-5" />
                          <span className="truncate">{e.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-xs text-slate-400 hidden sm:table-cell">{formatDate(e.mtime)}</td>
                      <td className="py-2 px-5 text-xs text-slate-400 text-right">{e.type === 'folder' ? '—' : formatFileSize(e.size)}</td>
                    </tr>
                  ))}
                  {info.entries.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-slate-400">
                        Folder ini kosong
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">Chimera • Drive pribadi di server sendiri</p>
      </main>

      {preview && (
        <PreviewModal
          activeFile={preview}
          fileList={info?.type === 'folder' ? info.entries.map(toItem) : [preview]}
          onClose={() => setPreview(null)}
          onNavigateFile={(next) => setPreview(next)}
        />
      )}
    </div>
  );
}
