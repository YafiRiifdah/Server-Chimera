import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, X, AlertCircle, Loader2, Ban, RefreshCw, SkipForward } from 'lucide-react';
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

export default function UploadProgressWidget({ uploadQueue, onCancel, onRetry, onClose }) {
  const [minimized, setMinimized] = useState(false);

  if (!uploadQueue || uploadQueue.length === 0) return null;

  const total = uploadQueue.length;
  const completed = uploadQueue.filter((f) => f.status === 'completed').length;
  const skipped = uploadQueue.filter((f) => f.status === 'skipped').length;
  const failed = uploadQueue.filter((f) => f.status === 'error').length;
  const cancelled = uploadQueue.filter((f) => f.status === 'cancelled').length;
  const active = total - completed - failed - cancelled - skipped;
  const isAllDone = active === 0;

  const totalBytes = uploadQueue.reduce((acc, f) => acc + (f.size || 0), 0);
  const loadedBytes = uploadQueue.reduce((acc, f) => {
    if (f.status === 'completed' || f.status === 'skipped') return acc + (f.size || 0);
    if (f.status === 'uploading') return acc + (f.loaded || 0);
    return acc;
  }, 0);
  const overallPercent = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0;

  let headerText;
  if (!isAllDone) headerText = `Mengupload ${active} item (${overallPercent}%)`;
  else if (failed > 0) headerText = `${completed} upload selesai, ${failed} gagal`;
  else headerText = `${completed} upload selesai${skipped ? `, ${skipped} dilewati` : ''}`;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-700 animate-in slide-in-from-bottom-4 duration-200 select-none">
      <div className="bg-ink text-on-accent px-4 py-3 flex items-center justify-between text-xs font-semibold">
        <div className="flex items-center gap-2">
          {!isAllDone ? (
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
          ) : failed > 0 ? (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}
          <span>{headerText}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title={minimized ? 'Perluas' : 'Perkecil'}
          >
            {minimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {isAllDone && (
            <button onClick={onClose} className="p-1 rounded hover:bg-white/20 transition-colors" title="Tutup" aria-label="Tutup">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!minimized && (
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 p-2 text-xs">
          {uploadQueue.map((item) => (
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
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {item.status === 'error' && (
                  <button
                    onClick={() => onRetry(item.id)}
                    className="p-1 rounded-full text-sky-600 hover:bg-sky-50"
                    title={item.chunked ? 'Coba lagi (melanjutkan dari potongan terakhir)' : 'Coba lagi'}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
                {item.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                {item.status === 'skipped' && <SkipForward className="w-4 h-4 text-slate-300" />}
                {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                {item.status === 'cancelled' && <Ban className="w-4 h-4 text-slate-300" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
