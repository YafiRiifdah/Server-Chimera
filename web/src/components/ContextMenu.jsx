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
  ClipboardPaste,
  Archive
} from '../icons.jsx';
import ColorPalette from './ColorPalette.jsx';

const MENU_W = 272;
const SUB_W = 240;

const itemClass =
  'w-full px-4 py-2 text-left hover:bg-slate-50 flex items-center gap-4 transition-colors whitespace-nowrap [&>svg]:shrink-0';
const dangerClass =
  'w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-4 transition-colors whitespace-nowrap [&>svg]:shrink-0';
const Divider = () => <div className="border-t border-slate-100 my-1.5"></div>;
const Hint = ({ children }) => <span className="ml-auto pl-3 text-[11px] text-slate-400">{children}</span>;

/** Baris menu yang membuka submenu melayang (pola Google Drive): hover di desktop, klik di sentuh. */
function SubMenu({ id, icon: Icon, label, openId, setOpenId, flipLeft, inline, children, width = SUB_W }) {
  const open = openId === id;
  return (
    <div className="relative" onMouseEnter={() => !inline && setOpenId(id)}>
      <button type="button" onClick={() => setOpenId(open ? null : id)} className={itemClass} aria-haspopup="menu" aria-expanded={open}>
        <Icon className="w-5 h-5 text-slate-500" />
        <span className="flex-1">{label}</span>
        <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${inline && open ? 'rotate-90' : ''}`} />
      </button>
      {open && inline && (
        /* Layar sempit: submenu dibuka ke bawah (akordeon) karena tidak ada ruang untuk melayang ke samping */
        <div role="menu" className="bg-slate-50/80 border-y border-slate-100 py-1 animate-in fade-in slide-in-from-top-1 duration-100">
          {children}
        </div>
      )}
      {open && !inline && (
        <div
          role="menu"
          style={{ width }}
          className={`absolute top-0 ${flipLeft ? 'right-full mr-1' : 'left-full ml-1'} -mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-[60] animate-in fade-in zoom-in-95 duration-100`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Menu klik kanan / tombol ⋮, disusun seperti Google Drive:
 * Buka · Download · Ganti nama · Buat salinan │ Bagikan ▸ · Atur ▸ · Informasi ▸ │ Pindahkan ke sampah.
 * mode: 'drive' | 'list' | 'trash' | 'shared' (+canEdit).
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
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    setOpenId(null);
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
  const menuW = Math.min(MENU_W, window.innerWidth - 16);
  const inline = window.innerWidth < 640; // layar HP: submenu akordeon, menu tidak pernah keluar layar
  const left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - (inline ? 440 : 320)));
  const flipLeft = left + menuW + SUB_W + 16 > window.innerWidth;
  const act = (fn) => () => {
    onClose();
    fn();
  };
  const own = mode === 'drive' || mode === 'list';
  const isFolder = item?.type === 'folder';
  const sub = { openId, setOpenId, flipLeft, inline };

  return (
    <div
      ref={menuRef}
      style={{ top, left, width: menuW, maxHeight: window.innerHeight - 16 }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 text-sm text-slate-700 animate-in fade-in zoom-in-95 duration-100 select-none overflow-y-auto"
    >
      {item && mode === 'trash' ? (
        <>
          <button onClick={act(() => onRestore([item]))} className={itemClass}>
            <RotateCcw className="w-5 h-5 text-slate-500" /> <span>Pulihkan</span>
          </button>
          <button onClick={act(() => onDeleteForever([item]))} className={dangerClass}>
            <Flame className="w-5 h-5 text-red-500" /> <span>Hapus permanen</span>
          </button>
        </>
      ) : item ? (
        <>
          {!isFolder && (
            <button onClick={act(() => onOpen(item))} className={itemClass}>
              <ExternalLink className="w-5 h-5 text-slate-500" /> <span>Buka</span>
              <Hint>Enter</Hint>
            </button>
          )}
          <button onClick={act(() => onDownload([item]))} className={itemClass}>
            {isFolder ? <Archive className="w-5 h-5 text-slate-500" /> : <Download className="w-5 h-5 text-slate-500" />}
            <span>{isFolder ? 'Download (zip)' : 'Download'}</span>
          </button>
          {(own || canEdit) && (
            <button onClick={act(() => onRename(item))} className={itemClass}>
              <Edit3 className="w-5 h-5 text-slate-500" /> <span>Ganti nama</span>
              <Hint>F2</Hint>
            </button>
          )}
          {own && !isFolder && (
            <button onClick={act(() => onDuplicate(item))} className={itemClass}>
              <Copy className="w-5 h-5 text-slate-500" /> <span>Buat salinan</span>
            </button>
          )}

          <Divider />

          {own && (
            <SubMenu id="share" icon={UserPlus} label="Bagikan" {...sub}>
              <button onClick={act(() => onShare(item))} className={itemClass}>
                <UserPlus className="w-5 h-5 text-slate-500" /> <span>Bagikan</span>
              </button>
              <button onClick={act(() => onCopyLink(item))} className={itemClass}>
                <Link2 className="w-5 h-5 text-slate-500" /> <span>Salin link</span>
              </button>
            </SubMenu>
          )}
          {own && (
            <SubMenu id="organize" icon={FolderInput} label="Atur" {...sub} width={isFolder ? 248 : SUB_W}>
              <button onClick={act(() => onMove([item]))} className={itemClass}>
                <FolderInput className="w-5 h-5 text-slate-500" /> <span>Pindahkan</span>
              </button>
              <button onClick={act(() => onToggleStar(item))} className={itemClass}>
                {item.starred ? <StarOff className="w-5 h-5 text-slate-500" /> : <Star className="w-5 h-5 text-slate-500" />}
                <span>{item.starred ? 'Hapus dari Berbintang' : 'Tambahkan ke Berbintang'}</span>
              </button>
              {isFolder && (
                <>
                  <Divider />
                  <p className="px-4 pt-0.5 pb-1 flex items-center gap-4 text-slate-500">
                    <Palette className="w-5 h-5" /> <span className="text-slate-700">Ubah warna</span>
                  </p>
                  <div className="mx-2 mb-1 rounded-xl bg-slate-50 border border-slate-100">
                    <ColorPalette value={item.color} onSelect={(color) => act(() => onChangeColor(item, color))()} />
                  </div>
                </>
              )}
            </SubMenu>
          )}
          <SubMenu id="info" icon={Info} label={isFolder ? 'Informasi folder' : 'Informasi file'} {...sub}>
            <button onClick={act(() => onDetail(item))} className={itemClass}>
              <Info className="w-5 h-5 text-slate-500" /> <span>Detail</span>
            </button>
          </SubMenu>

          {(own || canEdit) && (
            <>
              <Divider />
              <button onClick={act(() => onDelete([item]))} className={itemClass}>
                <Trash2 className="w-5 h-5 text-slate-500" /> <span>Pindahkan ke sampah</span>
                <Hint>Delete</Hint>
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <button onClick={act(onNewFolder)} className={itemClass}>
            <FolderPlus className="w-5 h-5 text-slate-500" /> <span>Folder baru</span>
          </button>
          <Divider />
          <button onClick={act(onUploadFile)} className={itemClass}>
            <Upload className="w-5 h-5 text-slate-500" /> <span>Upload file</span>
          </button>
          <button onClick={act(onUploadFolder)} className={itemClass}>
            <FolderUp className="w-5 h-5 text-slate-500" /> <span>Upload folder</span>
          </button>
          {canPaste && (
            <>
              <Divider />
              <button onClick={act(onPaste)} className={itemClass}>
                <ClipboardPaste className="w-5 h-5 text-slate-500" /> <span>Tempel</span>
                <Hint>Ctrl+V</Hint>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
