import React, { useEffect, useRef, useState } from 'react';
import {
  FolderPlus,
  Upload,
  FolderUp,
  Download,
  Edit3,
  FolderInput,
  Trash2,
  Info,
  ExternalLink,
  Palette,
  ChevronRight,
  Link2,
  Star,
  StarOff,
  RotateCcw,
  Flame,
  UserPlus,
  Copy,
  ClipboardPaste
} from 'lucide-react';
import ColorPalette from './ColorPalette.jsx';

/**
 * Menu klik kanan. mode: 'drive' | 'list' | 'trash' | 'shared' (+canEdit).
 */
export default function ContextMenu({
  menuState,
  mode = 'drive',
  canEdit = false,
  canPaste = false,
  onClose,
  onNewFolder,
  onUploadFile,
  onUploadFolder,
  onPaste,
  onOpen,
  onDownload,
  onRename,
  onMove,
  onDuplicate,
  onDelete,
  onDetail,
  onChangeColor,
  onCopyLink,
  onToggleStar,
  onShare,
  onRestore,
  onDeleteForever
}) {
  const menuRef = useRef(null);
  const [showColors, setShowColors] = useState(false);

  useEffect(() => {
    setShowColors(false);
  }, [menuState.visible, menuState.item]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!menuState.visible) return null;

  const { x, y, item } = menuState;
  const style = { top: Math.min(y, window.innerHeight - (showColors ? 500 : 380)), left: Math.min(x, window.innerWidth - 230) };
  const itemClass = 'w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-3 transition-colors';
  const dangerClass = 'w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-3 transition-colors';
  const act = (fn) => () => {
    onClose();
    fn();
  };
  const own = mode === 'drive' || mode === 'list';

  return (
    <div
      ref={menuRef}
      style={style}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 text-sm text-slate-700 animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      {item && mode === 'trash' ? (
        <>
          <button onClick={act(() => onRestore([item]))} className={itemClass}>
            <RotateCcw className="w-4 h-4 text-slate-400" /> <span>Pulihkan</span>
          </button>
          <button onClick={act(() => onDeleteForever([item]))} className={dangerClass}>
            <Flame className="w-4 h-4 text-red-500" /> <span>Hapus permanen</span>
          </button>
        </>
      ) : item ? (
        <>
          <button onClick={act(() => onOpen(item))} className={itemClass}>
            <ExternalLink className="w-4 h-4 text-slate-400" /> <span>Buka</span>
          </button>
          <button onClick={act(() => onDownload([item]))} className={itemClass}>
            <Download className="w-4 h-4 text-slate-400" /> <span>{item.type === 'folder' ? 'Download (zip)' : 'Download'}</span>
          </button>
          {own && (
            <>
              <button onClick={act(() => onShare(item))} className={itemClass}>
                <UserPlus className="w-4 h-4 text-slate-400" /> <span>Bagikan</span>
              </button>
              <button onClick={act(() => onCopyLink(item))} className={itemClass}>
                <Link2 className="w-4 h-4 text-slate-400" /> <span>Salin link</span>
              </button>
            </>
          )}

          {(own || canEdit) && <div className="border-t border-slate-100 my-1"></div>}

          {(own || canEdit) && (
            <button onClick={act(() => onRename(item))} className={itemClass}>
              <Edit3 className="w-4 h-4 text-slate-400" /> <span>Ganti nama</span>
            </button>
          )}
          {own && (
            <>
              <button onClick={act(() => onMove([item]))} className={itemClass}>
                <FolderInput className="w-4 h-4 text-slate-400" /> <span>Pindahkan</span>
              </button>
              <button onClick={act(() => onDuplicate(item))} className={itemClass}>
                <Copy className="w-4 h-4 text-slate-400" /> <span>Buat salinan</span>
              </button>
              <button onClick={act(() => onToggleStar(item))} className={itemClass}>
                {item.starred ? <StarOff className="w-4 h-4 text-slate-400" /> : <Star className="w-4 h-4 text-slate-400" />}
                <span>{item.starred ? 'Hapus dari Berbintang' : 'Tambahkan ke Berbintang'}</span>
              </button>
              {item.type === 'folder' && (
                <>
                  <button onClick={() => setShowColors((v) => !v)} className={itemClass} aria-expanded={showColors}>
                    <Palette className="w-4 h-4 text-slate-400" /> <span className="flex-1">Ubah warna</span>
                    <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${showColors ? 'rotate-90' : ''}`} />
                  </button>
                  {showColors && (
                    <div className="mx-2 mb-1 rounded-xl bg-slate-50 border border-slate-100">
                      <ColorPalette value={item.color} onSelect={(color) => act(() => onChangeColor(item, color))()} />
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <button onClick={act(() => onDetail(item))} className={itemClass}>
            <Info className="w-4 h-4 text-slate-400" /> <span>Detail</span>
          </button>

          {(own || canEdit) && (
            <>
              <div className="border-t border-slate-100 my-1"></div>
              <button onClick={act(() => onDelete([item]))} className={dangerClass}>
                <Trash2 className="w-4 h-4 text-red-500" /> <span>Hapus</span>
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <button onClick={act(onNewFolder)} className={itemClass}>
            <FolderPlus className="w-4 h-4 text-slate-400" /> <span>Folder baru</span>
          </button>
          <div className="border-t border-slate-100 my-1"></div>
          <button onClick={act(onUploadFile)} className={itemClass}>
            <Upload className="w-4 h-4 text-slate-400" /> <span>Upload file</span>
          </button>
          <button onClick={act(onUploadFolder)} className={itemClass}>
            <FolderUp className="w-4 h-4 text-slate-400" /> <span>Upload folder</span>
          </button>
          {canPaste && (
            <>
              <div className="border-t border-slate-100 my-1"></div>
              <button onClick={act(onPaste)} className={itemClass}>
                <ClipboardPaste className="w-4 h-4 text-slate-400" /> <span>Tempel</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
