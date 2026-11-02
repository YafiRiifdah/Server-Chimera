import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Trash2,
  FolderInput,
  Edit3,
  Info,
  X,
  ExternalLink,
  Palette,
  MoreVertical,
  Link2,
  ChevronRight,
  Star,
  StarOff,
  RotateCcw,
  Flame,
  UserPlus
} from '../icons.jsx';
import ColorPalette from './ColorPalette.jsx';

/**
 * Toolbar aksi berbentuk pil (pola Google Drive).
 * mode: 'drive' | 'list' | 'trash' | 'shared' (di dalam folder yang dibagikan ke saya; canEdit mengatur aksi tulis)
 */
export default function ActionBar({
  selectedItems,
  mode = 'drive',
  canEdit = false,
  onClearSelection,
  onOpen,
  onDownload,
  onRename,
  onMove,
  onDelete,
  onDetail,
  onChangeColor,
  onCopyLink,
  onToggleStar,
  onShare,
  onRestore,
  onDeleteForever
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Posisi menu ⋮ dihitung dari tombol dan dirender `fixed`: baris toolbar punya overflow-x-auto
  // (agar bisa digulir di HP), dan overflow itu memotong menu yang diposisikan absolut.
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const colorRef = useRef(null);
  const moreRef = useRef(null);
  const moreBtnRef = useRef(null);

  const openMore = () => {
    const rect = moreBtnRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 8, left: Math.max(8, Math.min(window.innerWidth - 216, rect.right - 208)) });
    setMoreOpen(true);
  };

  // Menu fixed tidak ikut bergulir bersama toolbar: tutup saat halaman digulir/diubah ukurannya
  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = () => setMoreOpen(false);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [moreOpen]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (colorRef.current && !colorRef.current.contains(e.target)) setColorOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!selectedItems || selectedItems.length === 0) return null;

  const count = selectedItems.length;
  const singleItem = count === 1 ? selectedItems[0] : null;
  const allStarred = selectedItems.every((i) => i.starred);
  const own = mode === 'drive' || mode === 'list';

  const iconBtn =
    'w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200/80 active:bg-slate-300 text-slate-700 transition-colors shrink-0';
  const menuItem = 'w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-3 transition-colors text-xs';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 bg-toolbar border border-slate-200/80 rounded-full px-3 py-1 text-slate-800 shadow-xs animate-in fade-in duration-100 select-none relative"
    >
      <button
        onClick={onClearSelection}
        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-200/80 text-slate-600 hover:text-slate-900 transition-colors shrink-0"
        title="Batal pilih (Esc)"
        aria-label="Batal pilih (Esc)"
      >
        <X className="w-5 h-5" />
      </button>
      <span className="text-sm font-medium text-slate-800 px-2 shrink-0">{count} dipilih</span>
      <div className="w-[1px] h-4 bg-slate-300/80 mx-1 shrink-0"></div>

      {mode === 'trash' ? (
        <>
          <button
            onClick={() => onRestore(selectedItems)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-full hover:bg-slate-200/80 text-sm font-medium"
            title="Pulihkan"
          >
            <RotateCcw className="w-5 h-5" /> <span>Pulihkan</span>
          </button>
          <button
            onClick={() => onDeleteForever(selectedItems)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-full hover:bg-red-100 text-red-600 text-sm font-medium"
            title="Hapus permanen"
          >
            <Flame className="w-5 h-5" /> <span>Hapus permanen</span>
          </button>
        </>
      ) : (
        <>
          {own && singleItem && (
            <button onClick={() => onShare(singleItem)} className={iconBtn} title="Bagikan">
              <UserPlus className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => onDownload(selectedItems)}
            className={iconBtn}
            title={count > 1 || singleItem?.type === 'folder' ? 'Download (zip)' : 'Download'}
          >
            <Download className="w-5 h-5" />
          </button>
          {own && (
            <button onClick={onMove} className={iconBtn} title="Pindahkan" aria-label="Pindahkan">
              <FolderInput className="w-5 h-5" />
            </button>
          )}
          {own && (
            <button
              onClick={() => onToggleStar(selectedItems)}
              className={iconBtn}
              title={allStarred ? 'Hapus dari Berbintang' : 'Tambahkan ke Berbintang'}
            >
              {allStarred ? <StarOff className="w-5 h-5" /> : <Star className="w-5 h-5" />}
            </button>
          )}
          {(own || canEdit) && (
            <button
              onClick={onDelete}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-100 text-slate-700 hover:text-red-600 transition-colors shrink-0"
              title="Hapus"
              aria-label="Hapus"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          {own && singleItem && (
            <button onClick={() => onCopyLink(singleItem)} className={iconBtn} title="Salin link">
              <Link2 className="w-5 h-5" />
            </button>
          )}

          <div className="relative shrink-0" ref={moreRef}>
            <button
              ref={moreBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                if (moreOpen) setMoreOpen(false);
                else openMore();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`${iconBtn} ${moreOpen ? 'bg-slate-200/90 text-slate-900' : ''}`}
              title="Tindakan lainnya"
              aria-label="Tindakan lainnya"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {moreOpen && (
              <div
                role="menu"
                style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[60] animate-in fade-in zoom-in-95 duration-100 text-sm text-slate-700 select-none"
              >
                {singleItem && (
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      onOpen(singleItem);
                    }}
                    className={menuItem}
                  >
                    <ExternalLink className="w-5 h-5 text-slate-400" /> <span>Buka</span>
                  </button>
                )}
                {singleItem && (own || canEdit) && (
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      onRename(singleItem);
                    }}
                    className={menuItem}
                  >
                    <Edit3 className="w-5 h-5 text-slate-400" /> <span>Ganti nama</span>
                  </button>
                )}
                {own && singleItem && singleItem.type === 'folder' && (
                  <div className="relative" ref={colorRef}>
                    <button onClick={() => setColorOpen((v) => !v)} className={menuItem}>
                      <Palette className="w-5 h-5 text-slate-400" /> <span className="flex-1">Ubah warna</span>
                      <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${colorOpen ? 'rotate-90' : ''}`} />
                    </button>
                    {colorOpen && (
                      <div className="px-3 py-2 bg-slate-50 rounded-xl m-2 border border-slate-100">
                        <ColorPalette
                          value={singleItem.color}
                          onSelect={(color) => {
                            setColorOpen(false);
                            setMoreOpen(false);
                            onChangeColor(singleItem, color);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {singleItem && (
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      onDetail(singleItem);
                    }}
                    className={menuItem}
                  >
                    <Info className="w-5 h-5 text-slate-400" /> <span>Detail</span>
                  </button>
                )}
                {(own || canEdit) && (
                  <>
                    <div className="border-t border-slate-100 my-1"></div>
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        onDelete();
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-3 transition-colors text-xs"
                    >
                      <Trash2 className="w-5 h-5 text-red-500" /> <span>Hapus</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
