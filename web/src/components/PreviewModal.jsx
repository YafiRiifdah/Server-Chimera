import useEscapeKey from '../hooks/useEscapeKey.js';
import React, { useState, useEffect, useRef } from 'react';
import { X, Download, ChevronLeft, ChevronRight, ExternalLink, FileQuestion, FileText, Music, ZoomIn, ZoomOut } from '../icons.jsx';
import { rawUrl as rawUrlFor, thumbUrl } from '../utils/urls.js';
import { getFileCategory, formatFileSize } from './FileIcon.jsx';

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/**
 * Lightbox pratinjau (Master Prompt §5.5): gambar (zoom scroll/pinch, geser), video, audio, PDF, teks;
 * navigasi ← → (tombol, keyboard, geser kiri/kanan di layar sentuh); HEIC dikonversi server ke JPEG.
 */
export default function PreviewModal({ activeFile, fileList, onClose, onNavigateFile }) {
  // Hanya untuk meredupkan bilah judul PWA; Esc ditangani sendiri di bawah
  useEscapeKey(true);
  const [textContent, setTextContent] = useState(null);
  const [loadingText, setLoadingText] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null); // {x, y, ox, oy}
  const pinchRef = useRef(null); // {dist, zoom}
  const swipeRef = useRef(null); // {x, y, t}

  const onlyFiles = (fileList || []).filter((it) => it.type !== 'folder');
  const currentIndex = onlyFiles.findIndex((f) => f.path === activeFile?.path);
  const prevFile = currentIndex > 0 ? onlyFiles[currentIndex - 1] : null;
  const nextFile = currentIndex < onlyFiles.length - 1 ? onlyFiles[currentIndex + 1] : null;

  const rawUrl = activeFile ? rawUrlFor(activeFile) : '';
  const downloadUrl = activeFile ? rawUrlFor(activeFile, true) : '';
  const canDownload = activeFile?.canDownload !== false;
  const category = activeFile ? getFileCategory(activeFile.name, activeFile.mime) : 'file';
  const ext = activeFile ? (activeFile.name.split('.').pop() || '').toLowerCase() : '';
  // HEIC/HEIF tidak bisa dirender browser: minta server mengonversi lewat thumbnail besar
  const imageSrc = ['heic', 'heif'].includes(ext) ? thumbUrl(activeFile, 2048) : rawUrl;

  // Reset zoom tiap ganti file
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [activeFile?.path]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prevFile) onNavigateFile(prevFile);
      if (e.key === 'ArrowRight' && nextFile) onNavigateFile(nextFile);
      if ((e.key === '+' || e.key === '=') && category === 'image') setZoom((z) => Math.min(MAX_ZOOM, z * 1.25));
      if (e.key === '-' && category === 'image') setZoom((z) => Math.max(MIN_ZOOM, z / 1.25));
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, prevFile, nextFile, onNavigateFile, category]);

  useEffect(() => {
    if (category === 'code' || category === 'document') {
      if (
        [
          'txt',
          'md',
          'json',
          'js',
          'jsx',
          'ts',
          'tsx',
          'html',
          'css',
          'py',
          'sh',
          'sql',
          'c',
          'cpp',
          'csv',
          'log',
          'yml',
          'yaml',
          'xml'
        ].includes(ext)
      ) {
        setLoadingText(true);
        fetch(rawUrl)
          .then((res) => res.text())
          .then((text) => {
            setTextContent(text.length > 500000 ? `${text.slice(0, 500000)}\n\n… (dipotong, file terlalu besar untuk pratinjau)` : text);
            setLoadingText(false);
          })
          .catch(() => {
            setTextContent('Gagal memuat pratinjau teks.');
            setLoadingText(false);
          });
        return;
      }
    }
    setTextContent(null);
  }, [activeFile, category, rawUrl, ext]);

  if (!activeFile) return null;

  // ---------- Zoom & geser gambar ----------
  const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
  const onWheel = (e) => {
    if (category !== 'image') return;
    e.preventDefault();
    setZoom((z) => {
      const next = clampZoom(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };
  const onPointerDown = (e) => {
    if (category !== 'image' || zoom === 1 || e.pointerType === 'touch') return;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    setOffset({ x: dragRef.current.ox + (e.clientX - dragRef.current.x), y: dragRef.current.oy + (e.clientY - dragRef.current.y) });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const toggleZoom = () => {
    if (category !== 'image') return;
    setZoom((z) => (z > 1 ? 1 : 2));
    setOffset({ x: 0, y: 0 });
  };

  // ---------- Sentuh: geser kiri/kanan antar file, cubit untuk zoom ----------
  const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e) => {
    if (e.touches.length === 2 && category === 'image') {
      pinchRef.current = { dist: touchDist(e.touches), zoom };
      swipeRef.current = null;
    } else if (e.touches.length === 1) {
      swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), ox: offset.x, oy: offset.y };
    }
  };
  const onTouchMove = (e) => {
    if (pinchRef.current && e.touches.length === 2) {
      e.preventDefault();
      setZoom(clampZoom((pinchRef.current.zoom * touchDist(e.touches)) / pinchRef.current.dist));
    } else if (swipeRef.current && zoom > 1 && e.touches.length === 1) {
      // Saat diperbesar, satu jari menggeser gambar
      const dx = e.touches[0].clientX - swipeRef.current.x;
      const dy = e.touches[0].clientY - swipeRef.current.y;
      setOffset({ x: swipeRef.current.ox + dx, y: swipeRef.current.oy + dy });
    }
  };
  const onTouchEnd = (e) => {
    if (pinchRef.current) {
      pinchRef.current = null;
      return;
    }
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || zoom > 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 80 && Date.now() - s.t < 800) {
      if (dx < 0 && nextFile) onNavigateFile(nextFile);
      if (dx > 0 && prevFile) onNavigateFile(prevFile);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col justify-between text-on-accent animate-in fade-in duration-150 select-none"
      role="dialog"
      aria-label={`Pratinjau ${activeFile.name}`}
    >
      <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3 truncate min-w-0">
          <FileText className="w-5 h-5 text-sky-400 shrink-0" />
          <div className="truncate">
            <span className="font-semibold text-sm truncate">{activeFile.name}</span>
            <span className="text-xs text-[#94a3b8] ml-2 hidden sm:inline">({formatFileSize(activeFile.size)})</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {category === 'image' && (
            <>
              <button
                onClick={() => setZoom((z) => clampZoom(z / 1.25))}
                className="p-2 rounded-full hover:bg-white/10 text-[#cbd5e1] hover:text-[#ffffff] hidden sm:block"
                title="Perkecil (-)"
                aria-label="Perkecil"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-xs text-[#94a3b8] w-10 text-center hidden sm:inline">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => clampZoom(z * 1.25))}
                className="p-2 rounded-full hover:bg-white/10 text-[#cbd5e1] hover:text-[#ffffff] hidden sm:block"
                title="Perbesar (+)"
                aria-label="Perbesar"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
            </>
          )}
          <a
            href={rawUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-full hover:bg-white/10 text-[#cbd5e1] hover:text-[#ffffff] transition-colors"
            title="Buka di tab baru"
            aria-label="Buka di tab baru"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
          {canDownload && (
            <a
              href={downloadUrl}
              download={activeFile.name}
              className="p-2 rounded-full hover:bg-white/10 text-[#cbd5e1] hover:text-[#ffffff] transition-colors"
              title="Download"
              aria-label="Download"
            >
              <Download className="w-5 h-5" />
            </a>
          )}
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-[#cbd5e1] hover:text-[#ffffff] transition-colors"
            title="Tutup (Esc)"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 relative flex items-center justify-center p-2 sm:p-6 overflow-hidden touch-pan-y"
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {prevFile && (
          <button
            onClick={() => onNavigateFile(prevFile)}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/70 text-on-accent transition-all shadow-lg border border-white/10 z-10"
            title={`Sebelumnya: ${prevFile.name}`}
            aria-label="File sebelumnya"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <div className="max-w-full max-h-full flex items-center justify-center overflow-hidden w-full h-full">
          {category === 'image' && (
            <img
              src={imageSrc}
              alt={activeFile.name}
              draggable={false}
              onDoubleClick={toggleZoom}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transition: dragRef.current ? 'none' : 'transform 80ms',
                cursor: zoom > 1 ? 'grab' : 'zoom-in'
              }}
              className="max-h-[82vh] max-w-full object-contain rounded-lg shadow-2xl"
            />
          )}

          {category === 'video' && (
            <video src={rawUrl} controls autoPlay playsInline className="max-h-[82vh] max-w-full rounded-lg shadow-2xl" />
          )}

          {category === 'audio' && (
            <div className="bg-ink p-8 rounded-3xl border border-white/10 shadow-2xl flex flex-col items-center gap-4 w-80 sm:w-96 max-w-full">
              <div className="w-20 h-20 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <Music className="w-10 h-10" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm break-all">{activeFile.name}</p>
                <p className="text-xs text-[#94a3b8] mt-1">{formatFileSize(activeFile.size)}</p>
              </div>
              <audio src={rawUrl} controls className="w-full mt-2" />
            </div>
          )}

          {category === 'pdf' && (
            <iframe src={rawUrl} title={activeFile.name} className="w-full sm:w-[85vw] max-w-4xl h-[82vh] rounded-lg shadow-2xl bg-white" />
          )}

          {(category === 'code' || category === 'document') && textContent !== null && (
            <div className="w-full sm:w-[85vw] max-w-3xl max-h-[82vh] bg-ink rounded-2xl p-4 sm:p-6 overflow-auto border border-white/10 text-left font-mono text-xs text-[#e2e8f0] select-text">
              {loadingText ? (
                <p className="text-[#94a3b8]">Memuat teks...</p>
              ) : (
                <pre className="whitespace-pre-wrap break-all">{textContent}</pre>
              )}
            </div>
          )}

          {category !== 'image' && category !== 'video' && category !== 'audio' && category !== 'pdf' && textContent === null && (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-ink/60 rounded-3xl border border-white/10 max-w-sm">
              <FileQuestion className="w-16 h-16 text-slate-500 mb-4" />
              <h3 className="font-semibold text-base mb-1 break-all">{activeFile.name}</h3>
              <p className="text-xs text-[#94a3b8] mb-6">
                Tidak ada pratinjau yang tersedia untuk jenis berkas ini ({formatFileSize(activeFile.size)}).
              </p>
              {canDownload && (
                <a
                  href={downloadUrl}
                  download={activeFile.name}
                  className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-on-accent font-medium px-5 py-2.5 rounded-xl text-sm transition-all shadow-md"
                >
                  <Download className="w-5 h-5" />
                  <span>Download file</span>
                </a>
              )}
            </div>
          )}
        </div>

        {nextFile && (
          <button
            onClick={() => onNavigateFile(nextFile)}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 hover:bg-black/70 text-on-accent transition-all shadow-lg border border-white/10 z-10"
            title={`Berikutnya: ${nextFile.name}`}
            aria-label="File berikutnya"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      <div className="h-10 px-4 flex items-center justify-center text-xs text-[#94a3b8] bg-black/40 border-t border-white/10 text-center">
        <span className="hidden sm:inline">
          Esc untuk menutup • panah ← → berpindah file{category === 'image' ? ' • scroll atau klik dua kali untuk zoom' : ''}
        </span>
        <span className="sm:hidden">Geser kiri/kanan untuk berpindah file{category === 'image' ? ' • cubit untuk zoom' : ''}</span>
      </div>
    </div>
  );
}
