import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  FolderPlus,
  Upload,
  FolderUp,
  HardDrive,
  Users,
  Clock,
  Star,
  Trash2,
  Cloud,
  Link2,
  ShieldCheck,
  Camera,
  X
} from 'lucide-react';
import { hasDragItems } from '../utils/dnd.js';

/**
 * Sidebar kiri (pola Google Drive). Di layar kecil menjadi drawer (open/onClose).
 */
export default function Sidebar({
  user,
  section,
  currentPath,
  open = false,
  onClose,
  onNavigateSection,
  onNavigateRoot,
  onNewFolder,
  onUploadFilesClick,
  onUploadFolderClick,
  onCameraClick,
  onDropItems,
  usage
}) {
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setNewDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { id: 'shared', label: 'Dibagikan kepada saya', icon: Users },
    { id: 'recent', label: 'Terbaru', icon: Clock },
    { id: 'starred', label: 'Berbintang', icon: Star },
    { id: 'trash', label: 'Sampah', icon: Trash2 },
    { id: 'links', label: 'Link saya', icon: Link2 }
  ];
  if (user?.role === 'admin') navItems.push({ id: 'admin', label: 'Admin', icon: ShieldCheck });

  const usedGB = usage ? (usage.used / (1024 * 1024 * 1024)).toFixed(1) : '0';
  const quotaGB = usage ? (usage.quota / (1024 * 1024 * 1024)).toFixed(0) : '100';
  const percentUsed = usage && usage.quota > 0 ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0;

  const isRootActive = section === 'drive' && currentPath === '';
  const navClass = (active) =>
    `flex items-center gap-3.5 px-4 py-2.5 rounded-full text-sm font-medium transition-colors w-full ${active ? 'bg-sky-100 text-sky-800' : 'text-slate-600 hover:bg-slate-100'}`;
  const menuBtn = 'w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors';
  const pick = (fn) => () => {
    setNewDropdownOpen(false);
    fn();
    onClose?.();
  };
  const go = (fn) => () => {
    fn();
    onClose?.();
  };

  return (
    <>
      {/* Latar drawer di layar kecil */}
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={`w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-4 shrink-0 select-none
          fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:static md:translate-x-0 md:z-auto
          ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
        aria-label="Navigasi utama"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between md:hidden">
            <span className="font-bold text-slate-800">Chimera</span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
              title="Tutup menu"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setNewDropdownOpen(!newDropdownOpen)}
              className="flex items-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-5 py-3 rounded-2xl shadow-md hover:shadow-lg transition-all border border-slate-200 w-auto group"
              aria-haspopup="menu"
              aria-expanded={newDropdownOpen}
            >
              <Plus className="w-6 h-6 text-sky-600 transition-transform group-hover:rotate-90 duration-200" />
              <span className="text-sm">Baru</span>
            </button>

            {newDropdownOpen && (
              <div
                role="menu"
                className="absolute left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-40 animate-in fade-in zoom-in-95 duration-100"
              >
                <button role="menuitem" onClick={pick(onNewFolder)} className={menuBtn}>
                  <FolderPlus className="w-4 h-4 text-slate-500" /> Folder baru
                </button>
                <div className="border-t border-slate-100 my-1"></div>
                <button role="menuitem" onClick={pick(onUploadFilesClick)} className={menuBtn}>
                  <Upload className="w-4 h-4 text-slate-500" /> Upload file
                </button>
                <button role="menuitem" onClick={pick(onUploadFolderClick)} className={`${menuBtn} hidden sm:flex`}>
                  <FolderUp className="w-4 h-4 text-slate-500" /> Upload folder
                </button>
                {onCameraClick && (
                  <button role="menuitem" onClick={pick(onCameraClick)} className={`${menuBtn} sm:hidden`}>
                    <Camera className="w-4 h-4 text-slate-500" /> Ambil foto / video
                  </button>
                )}
              </div>
            )}
          </div>

          <nav className="flex flex-col gap-1 mt-2">
            <button
              onClick={go(onNavigateRoot)}
              onDragOver={(e) => {
                if (!hasDragItems(e)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverRoot(true);
              }}
              onDragLeave={() => setDragOverRoot(false)}
              onDrop={(e) => {
                if (!hasDragItems(e)) return;
                e.preventDefault();
                setDragOverRoot(false);
                onDropItems?.(e);
              }}
              className={`${navClass(isRootActive)} ${dragOverRoot ? 'ring-2 ring-sky-500 bg-sky-50' : ''}`}
              aria-current={isRootActive ? 'page' : undefined}
            >
              <HardDrive className={`w-4 h-4 ${isRootActive ? 'text-sky-700' : 'text-slate-500'}`} />
              <span>Drive Saya</span>
            </button>

            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={go(() => onNavigateSection(item.id))}
                  className={navClass(active)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-sky-700' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <Cloud className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Penyimpanan</span>
          </div>
          <div
            className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mb-2"
            role="progressbar"
            aria-valuenow={percentUsed}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Pemakaian penyimpanan"
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${percentUsed > 90 ? 'bg-red-500' : percentUsed > 70 ? 'bg-amber-500' : 'bg-sky-600'}`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {usedGB} GB dari {quotaGB} GB digunakan ({percentUsed}%)
          </p>
        </div>
      </aside>
    </>
  );
}
