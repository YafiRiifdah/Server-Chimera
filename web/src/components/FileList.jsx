import React, { useState } from 'react';
import { MoreVertical, Star, ArrowUp, ArrowDown } from '../icons.jsx';
import { formatFileSize, formatDate } from './FileIcon.jsx';
import Thumbnail from './Thumbnail.jsx';
import { hasDragItems } from '../utils/dnd.js';
import { longPressHandlers } from '../utils/touch.js';
import { useVirtualRows } from '../hooks/useVirtualRows.js';

const ROW_H = 45;
const VIRTUAL_MIN = 150;

/**
 * Tampilan daftar. `mode`: 'drive' | 'list' (kolom Lokasi) | 'trash' (Lokasi asal, Dihapus) | 'shared'.
 * Judul kolom bisa diklik untuk mengurutkan (Master Prompt §5.3).
 */
export default function FileList({
  items,
  selectedKeys,
  mode = 'drive',
  touch = false,
  scrollRef,
  sort,
  onSortChange,
  onItemClick,
  onItemDoubleClick,
  onItemLongPress,
  onContextMenu,
  onItemDragStart,
  onItemDrop
}) {
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const canDrag = mode !== 'trash' && !touch;
  const canDrop = mode === 'drive';
  const virtual = items.length > VIRTUAL_MIN && !!scrollRef;
  const v = useVirtualRows({ scrollRef, rowCount: items.length, rowHeight: ROW_H, enabled: virtual });
  const visible = items.slice(v.start, v.end);

  const handleDragOver = (e, targetFolder) => {
    if (!canDrop || targetFolder.type !== 'folder' || !hasDragItems(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(targetFolder.key);
  };
  const handleDragLeave = () => setDragOverFolder(null);
  const handleDrop = (e, targetFolder) => {
    if (!canDrop || targetFolder.type !== 'folder' || !hasDragItems(e)) return;
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
      e.preventDefault();
      return;
    }
    onContextMenu(e, item);
  };

  const locationOf = (item) => {
    if (item.ownerUsername) return `dari @${item.ownerUsername}`;
    const p = mode === 'trash' ? item.originalPath : item.path;
    const parent = p && p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    return parent || 'Drive Saya';
  };

  const extraHeader = mode === 'trash' ? 'Lokasi asal' : mode === 'list' ? 'Lokasi' : null;
  const dateHeader = mode === 'trash' ? 'Dihapus' : 'Terakhir diubah';
  const colCount = extraHeader ? 5 : 4;

  const SortHeader = ({ k, label, className = '' }) => {
    const active = sort?.key === k;
    const Icon = sort?.dir === 'desc' ? ArrowDown : ArrowUp;
    return (
      <th className={`py-3 px-4 ${className}`}>
        {onSortChange ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSortChange({ key: k, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' });
            }}
            className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-800 ${active ? 'text-slate-800' : ''}`}
            aria-label={`Urutkan berdasarkan ${label}`}
          >
            {label}
            {active && <Icon className="w-3 h-3" />}
          </button>
        ) : (
          label
        )}
      </th>
    );
  };

  return (
    <div ref={v.anchorRef} className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden select-none">
      <table className="w-full text-left text-sm table-fixed">
        <thead className="bg-slate-50/70 border-b border-slate-200 text-xs font-semibold text-slate-500">
          <tr>
            <SortHeader k="name" label="Nama" />
            {extraHeader && <th className="py-3 px-4 w-48 hidden md:table-cell uppercase tracking-wider">{extraHeader}</th>}
            <SortHeader k="mtime" label={dateHeader} className="w-44 hidden sm:table-cell" />
            <SortHeader k="size" label="Ukuran" className="w-28 text-right" />
            <th className="py-3 px-3 w-12 text-right"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {virtual && v.padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colCount} style={{ height: v.padTop, padding: 0 }} />
            </tr>
          )}
          {visible.map((item) => {
            const isSelected = selectedKeys.has(item.key);
            const isDragTarget = dragOverFolder === item.key;
            return (
              <tr
                key={item.key}
                data-item-key={item.key}
                draggable={canDrag}
                onDragStart={(e) => canDrag && onItemDragStart(e, item)}
                onDragOver={(e) => handleDragOver(e, item)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, item)}
                onClick={(e) => onItemClick(item, e)}
                onDoubleClick={() => onItemDoubleClick(item)}
                onContextMenu={(e) => contextMenu(e, item)}
                {...(touch ? longPressHandlers(() => onItemLongPress?.(item)) : {})}
                style={{ height: ROW_H }}
                className={`transition-colors cursor-pointer group ${
                  isSelected ? 'bg-sky-100/70 text-sky-950 font-medium' : 'hover:bg-slate-50/80 text-slate-700'
                } ${isDragTarget ? 'ring-2 ring-inset ring-sky-500 bg-sky-50' : ''}`}
              >
                <td className="py-1.5 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Thumbnail item={item} width={64} className="w-7 h-7 rounded-md shrink-0" iconClassName="w-5 h-5" />
                    <span className="truncate" title={item.name}>
                      {item.name}
                    </span>
                    {item.starred && <Star className="w-4 h-4 text-slate-500 fill-slate-500 shrink-0" />}
                  </div>
                </td>
                {extraHeader && (
                  <td className="py-1.5 px-4 text-xs text-slate-500 hidden md:table-cell truncate" title={locationOf(item)}>
                    {locationOf(item)}
                  </td>
                )}
                <td className="py-1.5 px-4 text-xs text-slate-400 hidden sm:table-cell">
                  {formatDate(mode === 'trash' ? item.deletedAt : item.mtime)}
                </td>
                <td className="py-1.5 px-4 text-xs text-slate-400 text-right">
                  {item.type === 'folder' ? '—' : formatFileSize(item.size)}
                </td>
                <td className="py-1.5 px-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => openMenuFromButton(e, item)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-full hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center justify-center"
                    title="Menu opsi"
                    aria-label="Menu opsi"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            );
          })}
          {virtual && v.padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colCount} style={{ height: v.padBottom, padding: 0 }} />
            </tr>
          )}

          {items.length === 0 && (
            <tr>
              <td colSpan={colCount} className="py-16 text-center text-slate-400">
                {mode === 'trash' ? 'Sampah kosong' : mode === 'list' ? 'Tidak ada item' : 'Folder ini kosong'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
