import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, X, AlertCircle, Loader2, Ban, RefreshCw, SkipForward } from '../icons.jsx';
import { formatFileSize } from './FileIcon.jsx';

/**
 * Panel progres upload di pojok kanan bawah (pola Google Drive):
 * daftar file, persen, kecepatan, batal per file, coba lagi, minimize, "N upload selesai".
 */
function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec < 1) return '';
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${Math.round(bytesPerSec / 1024)} KB/s`;
}

/** "kurang dari 1 menit" / "sekitar 3 menit" / "sekitar 1 jam 5 menit" (pola Google Drive) */
function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return 'kurang dari 1 menit';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `sekitar ${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `sekitar ${hours} jam${rest ? ` ${rest} menit` : ''}`;
}

export default function UploadProgressWidget({ uploadQueue, onCancel, onRetry, onClose }) {
  const [minimized, setMinimized] = useState(false);
  // Estimasi sisa waktu: dihitung dari laju byte sejak batch dimulai, dihaluskan (EMA) agar tidak melompat-lompat.
  const batchRef = useRef({ startedAt: 0, startLoaded: 0, eta: null });
  const [, forceTick] = useState(0);

  const queue = uploadQueue || [];
  const total = queue.length;
  const completed = queue.filter((f) => f.status === 'completed').length;
  const skipped = queue.filter((f) => f.status === 'skipped').length;
  const failed = queue.filter((f) => f.status === 'error').length;
  const cancelled = queue.filter((f) => f.status === 'cancelled').length;
  const finishedCount = completed + skipped + failed + cancelled;
  const active = total - finishedCount;
  const isAllDone = active === 0;

  const totalBytes = queue.reduce((acc, f) => acc + (f.size || 0), 0);
  const loadedBytes = queue.reduce((acc, f) => {
    if (f.status === 'completed' || f.status === 'skipped') return acc + (f.size || 0);
    if (f.status === 'uploading') return acc + (f.loaded || 0);
    return acc;
  }, 0);
  const overallPercent = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;

  // Perbarui estimasi tiap detik walau tidak ada event progres (file besar yang lambat)
  useEffect(() => {
    if (isAllDone || total === 0) return undefined;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isAllDone, total]);

  let etaText = '';
  if (total === 0 || isAllDone) {
    batchRef.current = { startedAt: 0, startLoaded: 0, eta: null };
  } else {
    const b = batchRef.current;
    if (!b.startedAt) {
      b.startedAt = Date.now();
      b.startLoaded = loadedBytes;
      b.eta = null;
    }
    const elapsed = (Date.now() - b.startedAt) / 1000;
    if (elapsed >= 1) {
      const sentBytes = loadedBytes - b.startLoaded;
      const remainingBytes = totalBytes - loadedBytes;
      const remainingItems = active;
      // Gabungkan laju byte (file besar) dan laju item (file kecil yang biaya utamanya per permintaan)
      const bytesEta = sentBytes > 0 ? remainingBytes / (sentBytes / elapsed) : Infinity;
      const itemsEta = finishedCount > 0 ? remainingItems / (finishedCount / elapsed) : Infinity;
      const raw = Math.min(bytesEta, itemsEta);
      if (Number.isFinite(raw)) {
        b.eta = b.eta == null ? raw : b.eta * 0.7 + raw * 0.3;
        etaText = formatEta(b.eta);
      } else {
        etaText = 'menghitung…';
      }
    } else {
      etaText = 'menghitung…';
    }
  }

  if (total === 0) return null;

  const fmt = (n) => n.toLocaleString('id-ID');
  // Hitungan "1/1000": nomor item yang sedang diproses, dari 1 sampai total
  const currentNo = Math.min(total, finishedCount + 1);
  let headerText;
  if (!isAllDone) headerText = `Mengupload ${fmt(currentNo)}/${fmt(total)} item`;
  else if (failed > 0) headerText = `${fmt(completed)} upload selesai, ${fmt(failed)} gagal`;
  else headerText = `${fmt(completed)} upload selesai${skipped ? `, ${fmt(skipped)} dilewati` : ''}`;

  // Jangan merender ribuan baris: tampilkan yang sedang berjalan, beberapa yang antre,
  // yang gagal (agar bisa dicoba lagi), dan sisanya diringkas.
  const MAX_QUEUED = 10;
  const MAX_FINISHED = 40;
  const uploading = uploadQueue.filter((f) => f.status === 'uploading');
  const errored = uploadQueue.filter((f) => f.status === 'error');
  const queued = uploadQueue.filter((f) => f.status === 'queued');
  const finished = uploadQueue.filter((f) => ['completed', 'skipped', 'cancelled'].includes(f.status));
  const visible = [...uploading, ...errored, ...queued.slice(0, MAX_QUEUED), ...finished.slice(-MAX_FINISHED).reverse()];
  const hiddenCount = total - visible.length;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-700 animate-in slide-in-from-bottom-4 duration-200 select-none">
      <div className="bg-ink text-on-accent px-4 py-3 flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-2">
          {!isAllDone ? (
            <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
          ) : failed > 0 ? (
            <AlertCircle className="w-5 h-5 text-amber-400" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
          <div className="min-w-0">
            <p className="truncate">{headerText}</p>
            {!isAllDone && (
              <p className="text-[10px] font-normal text-white/70 truncate">
                {overallPercent}% • {etaText === 'menghitung…' ? 'Menghitung sisa waktu…' : `Sisa waktu ${etaText}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title={minimized ? 'Perluas' : 'Perkecil'}
          >
            {minimized ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
          {isAllDone && (
            <button onClick={onClose} className="p-1 rounded hover:bg-white/20 transition-colors" title="Tutup" aria-label="Tutup">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {!isAllDone && (
        <div className="h-1 bg-slate-100 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-sky-500 transition-all duration-500 ease-out" style={{ width: `${overallPercent}%` }} />
        </div>
      )}

      {!minimized && (
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 p-2 text-xs">
          {hiddenCount > 0 && (
            <p className="py-1.5 px-2 text-[10px] text-slate-400">
              {fmt(queued.length)} menunggu giliran • {fmt(finished.length)} selesai • menampilkan {fmt(visible.length)} dari {fmt(total)}
            </p>
          )}
          {visible.map((item) => (
            <div key={item.id} className="py-2 px-2 flex items-center justify-between gap-3">
              <div className="truncate flex-1">
                <p className="font-medium text-slate-800 truncate" title={item.name}>
                  {item.name}
                </p>
                {item.status === 'uploading' && (
                  <>
                    <div className="w-full bg-slate-100 h-1 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="bg-sky-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${item.progress || 0}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatFileSize(item.loaded || 0)} dari {formatFileSize(item.size)}
                      {item.speed ? ` • ${formatSpeed(item.speed)}` : ''}
                      {item.chunked ? ' • dapat dilanjutkan' : ''}
                    </p>
                  </>
                )}
                {item.status === 'queued' && <p className="text-[10px] text-slate-400 mt-0.5">Menunggu giliran</p>}
                {item.status === 'cancelled' && <p className="text-[10px] text-slate-400 mt-0.5">Dibatalkan</p>}
                {item.status === 'skipped' && <p className="text-[10px] text-slate-400 mt-0.5">Dilewati (sudah ada)</p>}
                {item.error && <p className="text-[10px] text-red-500 mt-0.5 truncate">{item.error}</p>}
              </div>

              <div className="shrink-0 flex items-center gap-1.5">
                {item.status === 'uploading' && (
                  <span className="text-[10px] font-semibold text-sky-600 w-8 text-right">{item.progress || 0}%</span>
                )}
                {(item.status === 'uploading' || item.status === 'queued') && (
                  <button
                    onClick={() => onCancel(item.id)}
                    className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-red-500"
                    title="Batalkan"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {item.status === 'error' && (
                  <button
                    onClick={() => onRetry(item.id)}
                    className="p-1 rounded-full text-sky-600 hover:bg-sky-50"
                    title={item.chunked ? 'Coba lagi (melanjutkan dari potongan terakhir)' : 'Coba lagi'}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
                {item.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {item.status === 'skipped' && <SkipForward className="w-5 h-5 text-slate-300" />}
                {item.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                {item.status === 'cancelled' && <Ban className="w-5 h-5 text-slate-300" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
