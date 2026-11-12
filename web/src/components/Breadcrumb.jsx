import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from '../icons.jsx';
import { hasDragItems } from '../utils/dnd.js';

/**
 * Judul folder besar + breadcrumb (pola Google Drive).
 *  - title     : hanya judul (Terbaru, Berbintang, Sampah, Pencarian, Link saya, Admin)
 *  - root      : {label, onClick} akar khusus (mis. "Dibagikan kepada saya › Nama folder") tanpa drop
 *  - default   : "Drive Saya" + segmen path, bisa jadi target drop
 */
export default function Breadcrumb({ title, root, currentPath, onNavigate, onDropItems, onOpenMenu }) {
  const [dragOverTarget, setDragOverTarget] = useState(null);

  if (title) {
    return (
      <nav className="flex items-center gap-1.5 select-none py-1">
        <span className="px-3 py-1.5 text-xl sm:text-2xl font-normal text-slate-800 truncate">{title}</span>
      </nav>
    );
  }

  const segments = currentPath ? currentPath.split('/').filter(Boolean) : [];
  const droppable = !root && onDropItems;

  const handleDragOver = (e, targetPath) => {
    if (!droppable || !hasDragItems(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(targetPath);
  };
  const handleDragLeave = () => setDragOverTarget(null);
  const handleDrop = (e, targetPath) => {
    if (!droppable || !hasDragItems(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    onDropItems?.(e, targetPath);
  };

  const crumb = (active, dragOver, extra = '') =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xl sm:text-2xl font-normal transition-colors truncate max-w-[calc(100vw-5rem)] sm:max-w-[360px] ${
      active ? 'text-slate-800' : 'text-slate-600'
    } hover:bg-slate-100 ${dragOver ? 'ring-2 ring-sky-500 bg-sky-50' : ''} ${extra}`;

  return (
    <nav className="flex items-center gap-1.5 select-none py-1 flex-wrap">
      {root ? (
        <>
          <button onClick={root.onClick} className={crumb(false, false)} title={root.label}>
            <span className="truncate">{root.label}</span>
          </button>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          <button onClick={() => onNavigate('')} className={crumb(segments.length === 0, false)} title={root.name}>
            <span className="truncate">{root.name}</span>
          </button>
        </>
      ) : (
        <button
          onClick={(e) => (segments.length === 0 ? onOpenMenu?.(e) : onNavigate(''))}
          title={segments.length === 0 ? 'Menu folder ini' : 'Ke Drive Saya'}
          onDragOver={(e) => handleDragOver(e, '')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, '')}
          className={crumb(true, dragOverTarget === '')}
        >
          <span>Drive Saya</span>
          {segments.length === 0 && <ChevronDown className="w-5 h-5 text-slate-600 mt-0.5" />}
        </button>
      )}

      {segments.map((seg, idx) => {
        const segPath = segments.slice(0, idx + 1).join('/');
        const isLast = idx === segments.length - 1;
        return (
          <React.Fragment key={segPath}>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
            <button
              onClick={(e) => (isLast && !root ? onOpenMenu?.(e) : onNavigate(segPath))}
              onDragOver={(e) => handleDragOver(e, segPath)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, segPath)}
              className={crumb(isLast, dragOverTarget === segPath)}
              title={isLast && !root ? 'Menu folder ini' : seg}
            >
              <span className="truncate">{seg}</span>
              {isLast && !root && <ChevronDown className="w-5 h-5 text-slate-600 mt-0.5" />}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
