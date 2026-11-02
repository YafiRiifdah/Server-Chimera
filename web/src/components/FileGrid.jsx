import React, { useEffect, useState } from 'react';
import { MoreVertical, Star } from '../icons.jsx';
import FileIcon, { formatFileSize, formatDate } from './FileIcon.jsx';
import Thumbnail from './Thumbnail.jsx';
import { hasDragItems } from '../utils/dnd.js';
import { longPressHandlers } from '../utils/touch.js';
import { useVirtualRows, gridColumns } from '../hooks/useVirtualRows.js';

const FOLDER_ROW_H = 56 + 12; // tinggi kartu folder + gap
const FILE_ROW_H = 176 + 12; // tinggi kartu file (h-44) + gap
const VIRTUAL_MIN = 120; // mulai virtualisasi di atas jumlah ini

/**
 * Tampilan petak. `mode`: 'drive' | 'list' (Terbaru/Berbintang/Pencarian) | 'trash' | 'shared'.
 * Di luar 'drive' tidak ada drop ke folder; di 'trash' tidak ada drag sama sekali.
 */
export default function FileGrid({
  items,
  selectedKeys,
  mode = 'drive',
  touch = false,
  scrollRef,
  onItemClick,
  onItemDoubleClick,
  onItemLongPress,
  onContextMenu,
  onItemDragStart,
  onItemDrop
}) {
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [cols, setCols] = useState(() => gridColumns(window.innerWidth));

  useEffect(() => {
    const onResize = () => setCols(gridColumns(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const folders = items.filter((it) => it.type === 'folder');
  const files = items.filter((it) => it.type !== 'folder');
  const canDrag = mode !== 'trash' && !touch;
  const canDrop = mode === 'drive';
  const virtual = items.length > VIRTUAL_MIN && !!scrollRef;

  const folderRows = Math.ceil(folders.length / cols);
  const fileRows = Math.ceil(files.length / cols);
  const vFolders = useVirtualRows({ scrollRef, rowCount: folderRows, rowHeight: FOLDER_ROW_H, enabled: virtual });
  const vFiles = useVirtualRows({ scrollRef, rowCount: fileRows, rowHeight: FILE_ROW_H, enabled: virtual });

  const visibleFolders = folders.slice(vFolders.start * cols, vFolders.end * cols);
  const visibleFiles = files.slice(vFiles.start * cols, vFiles.end * cols);

  const handleDragOver = (e, targetFolder) => {
    if (!canDrop || targetFolder.type !== 'folder' || !hasDragItems(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(targetFolder.key);
  };
  const handleDragLeave = () => setDragOverFolder(null);
  const handleDrop = (e, targetFolder) => {
    if (!canDrop || !hasDragItems(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    onItemDrop(e, targetFolder.path);
  };

  const openMenuFromButton = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    onContextMenu({ clientX: Math.max(8, rect.right - 208), clientY: rect.bottom + 4, preventDefault() {}, stopPropagation() {} }, item);
  };

  const contextMenu = (e, item) => {
    if (touch) {
      e.preventDefault(); // di layar sentuh, tekan lama = pilih (menu lewat tombol ⋮)
      return;
    }
    onContextMenu(e, item);
  };

  const cardClass = (isSelected, extra = '') =>
    `group relative rounded-2xl transition-all cursor-pointer ${
      isSelected
        ? 'bg-selected text-sky-950 ring-2 ring-sky-600 border border-sky-600 shadow-xs'
        : 'bg-surface hover:bg-surface-hover text-slate-800 border border-transparent'
    } ${extra}`;

  const subtitle = (item) => {
    if (mode === 'trash') return `Dihapus ${formatDate(item.deletedAt)}`;
    if (item.ownerUsername) return `dari @${item.ownerUsername}`;
    if (mode === 'list') return item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : 'Drive Saya';
    return item.type === 'folder' ? '' : formatFileSize(item.size);
  };

  const gridClass = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3';

  return (
    <div className="space-y-6 select-none">
      {folders.length > 0 && (
        <div ref={vFolders.anchorRef}>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">Folder ({folders.length})</h2>
          {virtual && <div style={{ height: vFolders.padTop }} />}
          <div className={gridClass}>
            {visibleFolders.map((folder) => {
              const isSelected = selectedKeys.has(folder.key);
              const isDragTarget = dragOverFolder === folder.key;
              return (
                <div
                  key={folder.key}
                  data-item-key={folder.key}
                  draggable={canDrag}
                  onDragStart={(e) => canDrag && onItemDragStart(e, folder)}
                  onDragOver={(e) => handleDragOver(e, folder)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, folder)}
                  onClick={(e) => onItemClick(folder, e)}
                  onDoubleClick={() => onItemDoubleClick(folder)}
                  onContextMenu={(e) => contextMenu(e, folder)}
                  {...(touch ? longPressHandlers(() => onItemLongPress?.(folder)) : {})}
                  className={cardClass(
                    isSelected,
                    `flex items-center justify-between gap-2 px-3.5 py-3 h-14 ${isDragTarget ? 'ring-2 ring-sky-500 bg-sky-50' : ''}`
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileIcon item={folder} className="w-6 h-6 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate flex items-center gap-1" title={folder.name}>
                        <span className="truncate">{folder.name}</span>
                        {folder.starred && <Star className="w-3 h-3 text-slate-500 fill-slate-500 shrink-0" />}
                      </div>
                      {mode !== 'drive' && subtitle(folder) && (
                        <div className="text-[10px] text-slate-500 truncate">{subtitle(folder)}</div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => openMenuFromButton(e, folder)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="p-1 rounded-full text-slate-500 hover:text-slate-900 hover:bg-black/10 transition-colors shrink-0"
                    title="Menu opsi"
                    aria-label="Menu opsi"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
          {virtual && <div style={{ height: vFolders.padBottom }} />}
        </div>
      )}

      {files.length > 0 && (
        <div ref={vFiles.anchorRef}>
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">File ({files.length})</h2>
          {virtual && <div style={{ height: vFiles.padTop }} />}
          <div className={gridClass}>
            {visibleFiles.map((file) => {
              const isSelected = selectedKeys.has(file.key);
              return (
                <div
                  key={file.key}
                  data-item-key={file.key}
                  draggable={canDrag}
                  onDragStart={(e) => canDrag && onItemDragStart(e, file)}
                  onClick={(e) => onItemClick(file, e)}
                  onDoubleClick={() => onItemDoubleClick(file)}
                  onContextMenu={(e) => contextMenu(e, file)}
                  {...(touch ? longPressHandlers(() => onItemLongPress?.(file)) : {})}
                  className={cardClass(isSelected, 'flex flex-col overflow-hidden h-44')}
                >
                  <Thumbnail item={file} width={320} className="flex-1 min-h-0 rounded-t-2xl" />
                  <div className="px-3 py-2 bg-white/60 border-t border-slate-200/60 flex items-center gap-2">
                    <FileIcon item={file} className="w-4 h-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-700 truncate flex items-center gap-1" title={file.name}>
                        <span className="truncate">{file.name}</span>
                        {file.starred && <Star className="w-3 h-3 text-slate-500 fill-slate-500 shrink-0" />}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{subtitle(file)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => openMenuFromButton(e, file)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="p-1 rounded-full text-slate-500 hover:text-slate-900 hover:bg-black/10 transition-colors shrink-0"
                      title="Menu opsi"
                      aria-label="Menu opsi"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {virtual && <div style={{ height: vFiles.padBottom }} />}
        </div>
      )}

      {items.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <FileIcon item={{ type: 'folder' }} className="w-8 h-8 opacity-40" />
          </div>
          <p className="text-sm font-medium text-slate-600">
            {mode === 'trash' ? 'Sampah kosong' : mode === 'list' ? 'Tidak ada item' : 'Folder ini kosong'}
          </p>
          {mode === 'drive' && !touch && <p className="text-xs text-slate-400 mt-1">Tarik dan lepaskan file ke sini untuk mengunggah</p>}
          {mode === 'drive' && touch && (
            <p className="text-xs text-slate-400 mt-1">Ketuk + Baru untuk mengunggah dari galeri atau kamera</p>
          )}
        </div>
      )}
    </div>
  );
}
