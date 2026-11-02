import React, { useState } from 'react';
import useEscapeKey from '../hooks/useEscapeKey.js';
import { X } from '../icons.jsx';

/**
 * Dialog konflik nama saat upload (Master Prompt §5.4):
 * "Ganti file yang ada / Simpan keduanya / Lewati", dengan "terapkan ke semua".
 * props.conflicts: daftar nama; onResolve(policy, applyAll) dipanggil per keputusan.
 */
export default function ConflictModal({ conflict, remaining, onResolve, onCancel }) {
  useEscapeKey(!!conflict, onCancel);
  const [applyAll, setApplyAll] = useState(false);
  if (!conflict) return null;

  const choose = (policy) => onResolve(policy, applyAll);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-800">File sudah ada</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
            title="Batalkan upload"
            aria-label="Batalkan upload"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          File bernama <span className="font-semibold text-slate-800 break-all">&quot;{conflict}&quot;</span> sudah ada di folder ini. Apa
          yang ingin Anda lakukan?
        </p>

        <div className="space-y-2">
          <button
            onClick={() => choose('replace')}
            className="w-full text-left px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <div className="text-sm font-semibold text-slate-800">Ganti file yang ada</div>
            <div className="text-xs text-slate-500">File lama ditimpa dengan yang baru.</div>
          </button>
          <button
            onClick={() => choose('keep-both')}
            className="w-full text-left px-4 py-3 rounded-2xl border border-sky-200 bg-sky-50 hover:bg-sky-100 transition-colors"
          >
            <div className="text-sm font-semibold text-sky-900">Simpan keduanya</div>
            <div className="text-xs text-sky-800/80">File baru disimpan dengan akhiran &quot;(1)&quot;.</div>
          </button>
          <button
            onClick={() => choose('skip')}
            className="w-full text-left px-4 py-3 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <div className="text-sm font-semibold text-slate-800">Lewati</div>
            <div className="text-xs text-slate-500">File ini tidak diunggah.</div>
          </button>
        </div>

        {remaining > 0 && (
          <label className="flex items-center gap-2 mt-4 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="rounded" />
            Terapkan ke semua ({remaining} file lain yang bentrok)
          </label>
        )}
      </div>
    </div>
  );
}
