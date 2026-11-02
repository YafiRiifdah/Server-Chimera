import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Topbar from '../components/Topbar.jsx';
import Sidebar from '../components/Sidebar.jsx';
import Breadcrumb from '../components/Breadcrumb.jsx';
import ActionBar from '../components/ActionBar.jsx';
import FileGrid from '../components/FileGrid.jsx';
import FileList from '../components/FileList.jsx';
import ContextMenu from '../components/ContextMenu.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import UploadProgressWidget from '../components/UploadProgressWidget.jsx';
import SearchFilters from '../components/SearchFilters.jsx';
import SortMenu from '../components/SortMenu.jsx';
import ConflictModal from '../components/ConflictModal.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import ShareModal from '../components/ShareModal.jsx';
import SessionsModal from '../components/SessionsModal.jsx';
import LinksView from '../components/LinksView.jsx';
import AdminView from '../components/AdminView.jsx';
import DetailPanel from '../components/DetailPanel.jsx';
import ToastContainer, { useToasts } from '../components/Toast.jsx';
import { NewFolderModal, RenameModal, MoveModal, ChangePasswordModal } from '../components/Modals.jsx';
import { api } from '../api/client.js';
import {
  locationState,
  urlForPath,
  urlForSection,
  isKnownLocation,
  previewNameFromLocation,
  linkForItem,
  parentOf
} from '../utils/router.js';
import { setDragItems, getDragItems, isValidDropTarget } from '../utils/dnd.js';
import { entriesFromFileList, entriesFromDataTransfer } from '../utils/fileEntries.js';
import { uploadEntry, uploadSharedEntry, discardSession, CHUNKED_THRESHOLD } from '../utils/uploader.js';
import { copyText } from '../utils/clipboard.js';
import { rawUrl, zipUrl } from '../utils/urls.js';
import { isTouchDevice } from '../utils/touch.js';
import { loadSort, saveSort, sortItems } from '../utils/sort.js';
import { gridColumns } from '../hooks/useVirtualRows.js';
import { UploadCloud, List, LayoutGrid, Info, Trash2, Users } from '../icons.jsx';

// Upload bersamaan dibatasi 3 file (Master Prompt §5.4)
const MAX_CONCURRENT_UPLOADS = 3;

const SECTION_TITLES = {
  recent: 'Terbaru',
  starred: 'Berbintang',
  trash: 'Sampah',
  shared: 'Dibagikan kepada saya',
  links: 'Link saya',
  admin: 'Admin'
};

function withKeys(entries) {
  return entries.map((e) => ({ ...e, key: e.trashId || (e.shareId && e.path === '' ? `share:${e.shareId}` : e.path) }));
}

export default function DrivePage({ user, onLogout }) {
  // Lokasi (bagian, path, query, shareId) dari URL
  const [loc, setLoc] = useState(() => locationState());
  const locRef = useRef(loc);
  locRef.current = loc;
  const { section, path: currentPath, query, shareId } = loc;
  const mode = section === 'drive' ? 'drive' : section === 'trash' ? 'trash' : section === 'shared' && shareId ? 'shared' : 'list';
  const isOwnContext = mode === 'drive' || mode === 'list';
  const touch = useMemo(() => isTouchDevice(), []);

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('chimera_view_mode') || 'grid');
  const [sort, setSort] = useState(() => loadSort());
  const [searchQuery, setSearchQuery] = useState(() => locationState().query.q || '');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Data
  const [items, setItems] = useState([]);
  const [shareInfo, setShareInfo] = useState(null);
  const canEdit = mode === 'shared' && shareInfo?.permission === 'edit';
  const [usage, setUsage] = useState(null);
  const usageRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const loadSeqRef = useRef(0);

  // Terbaru mempertahankan urutan server (terbaru dulu) saat urutan default
  const sortedItems = useMemo(() => {
    if (section === 'recent' && sort.key === 'name' && sort.dir === 'asc') return items;
    return sortItems(items, sort);
  }, [items, sort, section]);

  // Seleksi + jangkar Shift+klik
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const anchorKeyRef = useRef(null);

  // Papan klip internal untuk Ctrl+C / Ctrl+X / Ctrl+V
  const clipboardRef = useRef(null); // {mode:'copy'|'cut', items:[...]}
  const [clipboardSize, setClipboardSize] = useState(0);

  // Drag-select kotak (mouse)
  const [marquee, setMarquee] = useState(null); // {x1,y1,x2,y2}
  const marqueeRef = useRef(null);
  const mainRef = useRef(null);

  const [previewFile, setPreviewFile] = useState(null);
  const pendingPreviewNameRef = useRef(previewNameFromLocation());

  // Antrean upload
  const [uploadQueue, setUploadQueue] = useState([]);
  const pendingJobsRef = useRef([]);
  const jobsByIdRef = useRef(new Map());
  const activeUploadsRef = useRef(0);
  const uploadIdRef = useRef(0);
  const refreshTimerRef = useRef(null);

  const [conflictState, setConflictState] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [isDraggingOverWindow, setIsDraggingOverWindow] = useState(false);
  const dragCounterRef = useRef(0);

  // Modal
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameItem, setRenameItem] = useState(null);
  const [moveItemsList, setMoveItemsList] = useState(null);
  const [detailItem, setDetailItem] = useState(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [shareItem, setShareItem] = useState(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const anyModalOpen = !!(
    previewFile ||
    newFolderOpen ||
    renameItem ||
    moveItemsList ||
    detailItem ||
    changePasswordOpen ||
    conflictState ||
    confirmState ||
    shareItem ||
    sessionsOpen
  );

  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, item: null });
  const { toasts, show: showToast, dismiss: dismissToast } = useToasts();
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('chimera_view_mode', viewMode);
  }, [viewMode]);
  useEffect(() => {
    saveSort(sort);
  }, [sort]);

  // ---------- Routing URL ----------
  useEffect(() => {
    if (!isKnownLocation()) window.history.replaceState(null, '', urlForPath(locRef.current.path));
    const onPopState = () => {
      const next = locationState();
      setLoc(next);
      setSearchQuery(next.query.q || '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextSection, params = {}) => {
    const next = {
      section: nextSection,
      path: params.path || '',
      shareId: nextSection === 'shared' ? params.shareId || null : undefined,
      query: nextSection === 'search' ? { q: params.q || '', type: params.type || '', modified: params.modified || '' } : {}
    };
    const url = urlForSection(nextSection, { ...next.query, path: next.path, shareId: next.shareId });
    if (url === window.location.pathname + window.location.search) return;
    window.history.pushState(null, '', url);
    setLoc(next);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, []);

  const navigateTo = useCallback((path) => navigate('drive', { path }), [navigate]);

  // ---------- Memuat data ----------
  const loadItems = useCallback(async () => {
    const target = locRef.current;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      let entries = [];
      if (target.section === 'drive') entries = (await api.getFiles(target.path)).entries;
      else if (target.section === 'recent') entries = (await api.getRecent()).entries;
      else if (target.section === 'starred') entries = (await api.getStarred()).entries;
      else if (target.section === 'trash') {
        entries = (await api.getTrash()).entries.map((t) => ({
          name: t.name,
          path: t.originalPath,
          originalPath: t.originalPath,
          type: t.type,
          size: t.size,
          mime: t.mime,
          deletedAt: t.deletedAt,
          trashId: t.id
        }));
      } else if (target.section === 'search') {
        entries = target.query.q || target.query.type || target.query.modified ? (await api.search(target.query)).entries : [];
      } else if (target.section === 'shared' && !target.shareId) {
        entries = (await api.getSharedWithMe()).entries;
        setShareInfo(null);
      } else if (target.section === 'shared' && target.shareId) {
        const data = await api.getSharedFiles(target.shareId, target.path);
        entries = data.entries.map((e) => ({ ...e, shareId: target.shareId }));
        setShareInfo(data.share);
      }
      if (seq !== loadSeqRef.current) return;
      entries = withKeys(entries || []);
      setItems(entries);

      const wanted = pendingPreviewNameRef.current;
      if (wanted && target.section === 'drive') {
        pendingPreviewNameRef.current = null;
        const found = entries.find((e) => e.type === 'file' && e.name === wanted);
        if (found) setPreviewFile(found);
        else showToast(`File "${wanted}" tidak ditemukan di folder ini`, 'error');
        window.history.replaceState(null, '', urlForPath(target.path));
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      if (err.status === 404 && target.section === 'drive' && target.path) {
        showToast('Folder tidak ditemukan, kembali ke Drive Saya', 'error');
        window.history.replaceState(null, '', urlForPath(''));
        setLoc({ section: 'drive', path: '', query: {} });
      } else if (err.status === 404 && target.section === 'shared' && target.shareId) {
        showToast('Item yang dibagikan sudah tidak tersedia', 'error');
        window.history.replaceState(null, '', '/shared');
        setLoc({ section: 'shared', shareId: null, path: '', query: {} });
      } else {
        showToast(`Gagal memuat: ${err.message}`, 'error');
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [showToast]);

  const loadUsage = useCallback(async () => {
    try {
      const data = await api.getUsage();
      usageRef.current = data;
      setUsage(data);
    } catch {
      // Tidak kritis
    }
  }, []);

  useEffect(() => {
    setSelectedKeys(new Set());
    anchorKeyRef.current = null;
    if (section !== 'links' && section !== 'admin') loadItems();
    else setItems([]);
    loadUsage();
  }, [loc, section, loadItems, loadUsage]);

  // Throttle (bukan debounce): saat ribuan file kecil selesai beruntun, daftar tetap
  // menyegar paling lambat tiap 2 detik, dan sekali lagi setelah penyelesaian terakhir.
  const lastRefreshRef = useRef(0);
  const refreshSoon = useCallback(() => {
    const REFRESH_EVERY = 2000;
    if (refreshTimerRef.current) return; // sudah dijadwalkan
    const wait = Math.max(300, REFRESH_EVERY - (Date.now() - lastRefreshRef.current));
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      lastRefreshRef.current = Date.now();
      loadItems();
      loadUsage();
    }, wait);
  }, [loadItems, loadUsage]);

  const uploadTarget = () => {
    const l = locRef.current;
    if (l.section === 'drive') return { path: l.path, shareId: null };
    if (l.section === 'shared' && l.shareId) return { path: l.path, shareId: l.shareId };
    return { path: '', shareId: null };
  };

  // ---------- Upload ----------
  const patchUpload = useCallback((id, patch) => {
    setUploadQueue((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const pumpUploads = useCallback(() => {
    while (activeUploadsRef.current < MAX_CONCURRENT_UPLOADS && pendingJobsRef.current.length > 0) {
      const job = pendingJobsRef.current.shift();
      if (job.cancelled) continue;
      activeUploadsRef.current++;
      patchUpload(job.id, { status: 'uploading', error: null });
      let lastT = Date.now();
      let lastLoaded = 0;
      const onProgress = (loaded, total) => {
        const now = Date.now();
        let speed;
        if (now - lastT >= 500) {
          speed = ((loaded - lastLoaded) * 1000) / (now - lastT);
          lastT = now;
          lastLoaded = loaded;
        }
        patchUpload(job.id, { progress: Math.round((loaded / total) * 100), loaded, ...(speed !== undefined ? { speed } : {}) });
      };
      const req = job.shareId
        ? uploadSharedEntry({ shareId: job.shareId, targetPath: job.targetPath, entry: job.entry, conflict: job.conflict, onProgress })
        : uploadEntry({ targetPath: job.targetPath, entry: job.entry, conflict: job.conflict, onProgress });
      job.abort = req.abort;

      req.promise
        .then((result) => {
          const skipped =
            result?.skipped === true || (Array.isArray(result?.skipped) && result.skipped.length > 0 && !(result.files || []).length);
          patchUpload(job.id, { status: skipped ? 'skipped' : 'completed', progress: 100, speed: 0 });
          const t = uploadTarget();
          if (job.targetPath === t.path && job.shareId === t.shareId) refreshSoon();
          else loadUsage();
        })
        .catch((err) => {
          if (err.name === 'AbortError')
            patchUpload(job.id, { status: job.cancelled ? 'cancelled' : 'error', error: job.cancelled ? null : 'Terhenti', speed: 0 });
          else patchUpload(job.id, { status: 'error', error: err.message, speed: 0 });
        })
        .finally(() => {
          activeUploadsRef.current--;
          pumpUploads();
        });
    }
  }, [patchUpload, refreshSoon, loadUsage]);

  const askConflicts = (names) => new Promise((resolve) => setConflictState({ names, index: 0, policies: new Map(), resolve }));
  const handleConflictResolve = (policy, applyAll) => {
    setConflictState((st) => {
      if (!st) return null;
      const policies = new Map(st.policies);
      if (applyAll) {
        for (let i = st.index; i < st.names.length; i++) policies.set(st.names[i], policy);
        st.resolve(policies);
        return null;
      }
      policies.set(st.names[st.index], policy);
      if (st.index + 1 >= st.names.length) {
        st.resolve(policies);
        return null;
      }
      return { ...st, policies, index: st.index + 1 };
    });
  };
  const handleConflictCancel = () => {
    setConflictState((st) => {
      st?.resolve(null);
      return null;
    });
  };

  const enqueueUploads = useCallback(
    async (entries) => {
      if (!entries || entries.length === 0) return;
      const target = uploadTarget();
      if (target.shareId && shareInfo?.permission !== 'edit') {
        showToast('Anda hanya punya izin lihat di folder ini', 'error');
        return;
      }
      const totalBytes = entries.reduce((acc, e) => acc + e.file.size, 0);
      const u = usageRef.current;
      if (!target.shareId && u && u.quota > 0 && u.used + totalBytes > u.quota) {
        showToast(
          `Penyimpanan tidak mencukupi: butuh ${(totalBytes / (1024 * 1024)).toFixed(1)} MB, sisa ${(Math.max(0, u.quota - u.used) / (1024 * 1024)).toFixed(1)} MB`,
          'error',
          6000
        );
        return;
      }
      let existing = new Set();
      try {
        const data = target.shareId ? await api.getSharedFiles(target.shareId, target.path) : await api.getFiles(target.path);
        existing = new Set(data.entries.filter((e) => e.type === 'file').map((e) => e.name));
      } catch {
        // lanjut tanpa dialog
      }
      const conflictNames = [];
      for (const e of entries) {
        const rel = (e.relativePath || e.file.name).replace(/\\/g, '/');
        if (!rel.includes('/') && existing.has(e.file.name) && !conflictNames.includes(e.file.name)) conflictNames.push(e.file.name);
      }
      let policies = new Map();
      if (conflictNames.length > 0) {
        policies = await askConflicts(conflictNames);
        if (!policies) return;
      }
      const newItems = entries.map((entry) => {
        const id = ++uploadIdRef.current;
        const rel = (entry.relativePath || entry.file.name).replace(/\\/g, '/');
        const conflict = !rel.includes('/') ? policies.get(entry.file.name) || 'keep-both' : 'keep-both';
        const job = { id, entry, targetPath: target.path, shareId: target.shareId, conflict, cancelled: false, abort: null };
        jobsByIdRef.current.set(id, job);
        pendingJobsRef.current.push(job);
        return {
          id,
          name: rel,
          size: entry.file.size,
          progress: 0,
          loaded: 0,
          status: 'queued',
          chunked: !target.shareId && entry.file.size > CHUNKED_THRESHOLD
        };
      });
      setUploadQueue((prev) => [...prev, ...newItems]);
      pumpUploads();
    },
    [pumpUploads, showToast, shareInfo]
  );

  const cancelUpload = useCallback(
    async (id) => {
      const job = jobsByIdRef.current.get(id);
      if (!job) return;
      job.cancelled = true;
      if (job.abort) job.abort();
      else patchUpload(id, { status: 'cancelled' });
      if (!job.shareId) await discardSession(job.targetPath, job.entry);
    },
    [patchUpload]
  );

  const retryUpload = useCallback(
    (id) => {
      const job = jobsByIdRef.current.get(id);
      if (!job) return;
      job.cancelled = false;
      job.abort = null;
      patchUpload(id, { status: 'queued', error: null, progress: 0, loaded: 0 });
      pendingJobsRef.current.push(job);
      pumpUploads();
    },
    [patchUpload, pumpUploads]
  );

  const handleInputChange = (e) => {
    enqueueUploads(entriesFromFileList(e.target.files));
    e.target.value = '';
  };

  useEffect(() => {
    const isOsFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const onEnter = (e) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      dragCounterRef.current++;
      setIsDraggingOverWindow(true);
    };
    const onLeave = (e) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        setIsDraggingOverWindow(false);
        dragCounterRef.current = 0;
      }
    };
    const onOver = (e) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = async (e) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDraggingOverWindow(false);
      try {
        enqueueUploads(await entriesFromDataTransfer(e.dataTransfer));
      } catch (err) {
        showToast(`Gagal membaca file yang dilepas: ${err.message}`, 'error');
      }
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [enqueueUploads, showToast]);

  // ---------- Seleksi ----------
  const selectedItemsList = sortedItems.filter((f) => selectedKeys.has(f.key));

  const handleOpenItem = (item) => {
    if (mode === 'trash') return showToast('Pulihkan item ini dulu untuk membukanya', 'info');
    if (item.shareId && section === 'shared' && !shareId) {
      if (item.type === 'folder') return navigate('shared', { shareId: item.shareId, path: '' });
      return setPreviewFile({ ...item, path: '', canDownload: true });
    }
    if (mode === 'shared') {
      if (item.type === 'folder') return navigate('shared', { shareId, path: item.path });
      return setPreviewFile(item);
    }
    if (item.type === 'folder') navigateTo(item.path);
    else setPreviewFile(item);
  };

  const handleItemClick = (item, event) => {
    event.stopPropagation();
    const withCtrl = event.ctrlKey || event.metaKey;

    // Layar sentuh: ketuk = buka jika belum ada pilihan; jika ada, ketuk = tambah/kurangi pilihan
    if (touch && !withCtrl && !event.shiftKey) {
      if (selectedKeys.size === 0) return handleOpenItem(item);
      const next = new Set(selectedKeys);
      if (next.has(item.key)) next.delete(item.key);
      else next.add(item.key);
      setSelectedKeys(next);
      anchorKeyRef.current = item.key;
      return;
    }

    if (event.shiftKey && anchorKeyRef.current) {
      const order = sortedItems.map((f) => f.key);
      const a = order.indexOf(anchorKeyRef.current);
      const b = order.indexOf(item.key);
      if (a !== -1 && b !== -1) {
        const [from, to] = a < b ? [a, b] : [b, a];
        const next = new Set(withCtrl ? selectedKeys : []);
        order.slice(from, to + 1).forEach((k) => next.add(k));
        setSelectedKeys(next);
        return;
      }
    }
    const next = new Set(withCtrl ? selectedKeys : []);
    if (withCtrl && next.has(item.key)) next.delete(item.key);
    else next.add(item.key);
    setSelectedKeys(next);
    anchorKeyRef.current = item.key;
  };

  // Tekan lama di layar sentuh = pilih (Master Prompt §5.3)
  const handleItemLongPress = (item) => {
    const next = new Set(selectedKeys);
    next.add(item.key);
    setSelectedKeys(next);
    anchorKeyRef.current = item.key;
  };

  const handleContextMenu = (e, item = null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item && !(mode === 'drive' || (mode === 'shared' && canEdit))) return;
    if (item && !selectedKeys.has(item.key)) {
      setSelectedKeys(new Set([item.key]));
      anchorKeyRef.current = item.key;
    }
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, item });
  };

  // Drag-select kotak di area kosong (mouse saja)
  const onMainMouseDown = (e) => {
    if (touch || e.button !== 0 || anyModalOpen) return;
    if (!(section === 'drive' || mode === 'list' || mode === 'shared' || mode === 'trash')) return;
    if (e.target.closest('[data-item-key], button, a, input, select, textarea, [role="menu"]')) return;
    const start = { x: e.clientX, y: e.clientY, additive: e.ctrlKey || e.metaKey, base: new Set(selectedKeys) };
    marqueeRef.current = start;
    const onMove = (ev) => {
      const s = marqueeRef.current;
      if (!s) return;
      if (!s.active && Math.hypot(ev.clientX - s.x, ev.clientY - s.y) < 6) return;
      s.active = true;
      const rect = {
        left: Math.min(s.x, ev.clientX),
        top: Math.min(s.y, ev.clientY),
        right: Math.max(s.x, ev.clientX),
        bottom: Math.max(s.y, ev.clientY)
      };
      setMarquee(rect);
      const next = new Set(s.additive ? s.base : []);
      mainRef.current?.querySelectorAll('[data-item-key]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top) next.add(el.dataset.itemKey);
      });
      setSelectedKeys(next);
      ev.preventDefault();
    };
    const onUp = () => {
      const s = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!s?.active) setSelectedKeys(new Set()); // klik biasa di area kosong = batal pilih
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ---------- Aksi ----------
  const triggerDownload = (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    if (filename) link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownload = (list) => {
    const arr = Array.isArray(list) ? list : [list];
    if (arr.length === 0) return;
    if (arr.length === 1 && arr[0].type === 'file') triggerDownload(rawUrl(arr[0], true), arr[0].name);
    else triggerDownload(zipUrl(arr));
  };

  const handleDeleteSelected = (targetItems = null) => {
    const list = targetItems || selectedItemsList;
    if (list.length === 0) return;
    const label = list.length === 1 ? `"${list[0].name}"` : `${list.length} item`;
    setConfirmState({
      title: 'Pindahkan ke Sampah?',
      message: `${label} akan dipindahkan ke Sampah${mode === 'shared' ? ' pemilik' : ''} dan bisa dipulihkan dalam 30 hari.`,
      confirmLabel: 'Pindahkan ke Sampah',
      tone: 'primary',
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res =
            mode === 'shared'
              ? await api.sharedDelete(
                  shareId,
                  list.map((i) => i.path)
                )
              : await api.deleteItems(list.map((i) => i.path));
          setSelectedKeys(new Set());
          showToast(`${res.deleted} item dipindahkan ke Sampah${mode === 'shared' ? ' pemilik' : ''}`, 'success');
          loadItems();
          loadUsage();
        } catch (err) {
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
      }
    });
  };

  const handleRestore = async (list) => {
    try {
      const res = await api.restoreTrash(list.map((i) => i.trashId));
      setSelectedKeys(new Set());
      showToast(`${res.restored.length} item dipulihkan`, 'success');
      loadItems();
      loadUsage();
    } catch (err) {
      showToast(`Gagal memulihkan: ${err.message}`, 'error');
    }
  };

  const handleDeleteForever = (list) => {
    setConfirmState({
      title: 'Hapus permanen?',
      message: `${list.length} item akan dihapus selamanya dan tidak bisa dipulihkan.`,
      confirmLabel: 'Hapus permanen',
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await api.deleteTrash(list.map((i) => i.trashId));
          setSelectedKeys(new Set());
          showToast(`${res.deleted} item dihapus permanen`, 'success');
          loadItems();
          loadUsage();
        } catch (err) {
          showToast(`Gagal menghapus: ${err.message}`, 'error');
        }
      }
    });
  };

  const handleEmptyTrash = () => {
    setConfirmState({
      title: 'Kosongkan Sampah?',
      message: 'Semua item di Sampah akan dihapus selamanya dan tidak bisa dipulihkan.',
      confirmLabel: 'Kosongkan',
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await api.emptyTrash();
          showToast(`Sampah dikosongkan (${res.deleted} item)`, 'success');
          loadItems();
          loadUsage();
        } catch (err) {
          showToast(`Gagal mengosongkan Sampah: ${err.message}`, 'error');
        }
      }
    });
  };

  const handleToggleStar = async (list) => {
    const arr = Array.isArray(list) ? list : [list];
    const makeStarred = !arr.every((i) => i.starred);
    const keys = new Set(arr.map((i) => i.key));
    setItems((prev) => prev.map((f) => (keys.has(f.key) ? { ...f, starred: makeStarred } : f)));
    try {
      for (const it of arr) {
        if (makeStarred && !it.starred) await api.star(it.path);
        if (!makeStarred && it.starred) await api.unstar(it.path);
      }
      showToast(makeStarred ? 'Ditambahkan ke Berbintang' : 'Dihapus dari Berbintang', 'success');
      if (section === 'starred') loadItems();
    } catch (err) {
      showToast(`Gagal mengubah bintang: ${err.message}`, 'error');
      loadItems();
    }
  };

  const handleCreateFolder = async (folderName) => {
    const t = uploadTarget();
    if (t.shareId) {
      if (!canEdit) throw new Error('Anda hanya punya izin lihat di folder ini');
      await api.sharedMkdir(t.shareId, t.path, folderName);
      return loadItems();
    }
    await api.createFolder(t.path, folderName);
    if (section === 'drive') loadItems();
    else showToast(`Folder "${folderName}" dibuat di Drive Saya`, 'success');
  };

  const handleRenameSubmit = async (item, newName) => {
    if (mode === 'shared') await api.sharedRename(shareId, item.path, newName);
    else await api.renameItem(item.path, newName);
    loadItems();
  };

  const moveItems = async (list, destinationPath) => {
    const res = await api.moveItems(
      list.map((i) => i.path),
      destinationPath
    );
    setSelectedKeys(new Set());
    showToast(`${res.moved} item dipindahkan ke ${destinationPath ? destinationPath.split('/').pop() : 'Drive Saya'}`, 'success');
    loadItems();
  };

  const copyItems = async (list, destinationPath) => {
    try {
      const res = await api.copyItems(
        list.map((i) => i.path),
        destinationPath
      );
      showToast(`${res.copied.length} item disalin`, 'success');
      loadItems();
      loadUsage();
    } catch (err) {
      showToast(`Gagal menyalin: ${err.message}`, 'error');
    }
  };

  // "Buat salinan": salinan di folder yang sama dengan nama "(1)"
  const handleDuplicate = (item) => copyItems([item], parentOf(item.path));

  // Papan klip internal (Ctrl+C / Ctrl+X / Ctrl+V dan menu Tempel)
  const setClipboard = (modeKind, list) => {
    if (!list.length) return;
    clipboardRef.current = { mode: modeKind, items: list.map((i) => ({ path: i.path, name: i.name, type: i.type })) };
    setClipboardSize(list.length);
    showToast(`${list.length} item ${modeKind === 'copy' ? 'disalin' : 'dipotong'}. Tekan Ctrl+V di folder tujuan.`, 'info');
  };
  const handlePaste = async () => {
    const clip = clipboardRef.current;
    if (!clip || section !== 'drive') return;
    const dest = currentPath;
    if (clip.mode === 'cut') {
      const toMove = clip.items.filter((it) => parentOf(it.path) !== dest);
      if (!isValidDropTarget(clip.items, dest)) return showToast('Tidak bisa memindahkan folder ke dalam dirinya sendiri', 'error');
      if (toMove.length) {
        try {
          await moveItems(toMove, dest);
        } catch (err) {
          showToast(`Gagal memindahkan: ${err.message}`, 'error');
        }
      }
      clipboardRef.current = null;
      setClipboardSize(0);
    } else {
      await copyItems(clip.items, dest);
    }
  };

  const handleItemDragStart = (e, item) => {
    if (!isOwnContext) return;
    let dragged;
    if (selectedKeys.has(item.key)) dragged = selectedItemsList;
    else {
      dragged = [item];
      setSelectedKeys(new Set([item.key]));
      anchorKeyRef.current = item.key;
    }
    setDragItems(e, dragged);
  };

  const handleInternalDrop = async (e, destinationPath) => {
    const dragged = getDragItems(e);
    if (!dragged || dragged.length === 0) return;
    if (!isValidDropTarget(dragged, destinationPath)) return;
    const toMove = dragged.filter((it) => parentOf(it.path) !== destinationPath);
    if (toMove.length === 0) return;
    try {
      await moveItems(toMove, destinationPath);
    } catch (err) {
      showToast(`Gagal memindahkan: ${err.message}`, 'error');
    }
  };

  const handleChangeColor = async (item, color) => {
    const previous = item.color || null;
    setItems((prev) => prev.map((f) => (f.key === item.key ? { ...f, color } : f)));
    try {
      await api.setFolderColor(item.path, color);
    } catch (err) {
      setItems((prev) => prev.map((f) => (f.key === item.key ? { ...f, color: previous } : f)));
      showToast(`Gagal mengubah warna: ${err.message}`, 'error');
    }
  };

  const handleCopyLink = async (item) => {
    const target = Array.isArray(item) ? item[0] : item;
    if (!target) return;
    const ok = await copyText(linkForItem(target));
    showToast(ok ? 'Link disalin' : 'Gagal menyalin link. Salin manual dari bilah alamat.', ok ? 'success' : 'error');
  };

  const handleChangePassword = async (oldPassword, newPassword) => api.changePassword(oldPassword, newPassword);

  const handleSearchSubmit = (q) => {
    const trimmed = (q || '').trim();
    if (trimmed) navigate('search', { q: trimmed, type: query.type, modified: query.modified });
  };
  const handleSearchClear = () => {
    setSearchQuery('');
    if (section === 'search') navigate('drive', { path: '' });
  };
  const handleFilterChange = (next) => navigate('search', { q: next.q ?? query.q, type: next.type, modified: next.modified });

  // ---------- Pintasan keyboard (Master Prompt §5.3) ----------
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (anyModalOpen) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const order = sortedItems;

      if (e.key === 'Escape') {
        setSelectedKeys(new Set());
        setContextMenu({ visible: false, x: 0, y: 0, item: null });
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedKeys(new Set(order.map((f) => f.key)));
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'c' && isOwnContext && selectedItemsList.length) {
        e.preventDefault();
        setClipboard('copy', selectedItemsList);
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'x' && isOwnContext && selectedItemsList.length) {
        e.preventDefault();
        setClipboard('cut', selectedItemsList);
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'v' && section === 'drive' && clipboardRef.current) {
        e.preventDefault();
        handlePaste();
        return;
      }
      if (e.key === 'Delete' && selectedKeys.size > 0) {
        e.preventDefault();
        if (mode === 'trash') handleDeleteForever(selectedItemsList);
        else if (isOwnContext || canEdit) handleDeleteSelected();
        return;
      }
      if (e.key === 'F2' && selectedKeys.size === 1 && (isOwnContext || canEdit)) {
        e.preventDefault();
        setRenameItem(selectedItemsList[0]);
        return;
      }
      if (e.key === 'Enter' && selectedKeys.size === 1) {
        e.preventDefault();
        handleOpenItem(selectedItemsList[0]);
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && order.length) {
        e.preventDefault();
        const idx = order.findIndex((f) => f.key === anchorKeyRef.current);
        let next;
        if (idx === -1) next = 0;
        else {
          const cols = viewMode === 'grid' ? gridColumns(mainRef.current?.clientWidth || window.innerWidth) : 1;
          const delta = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : cols;
          next = Math.min(order.length - 1, Math.max(0, idx + delta));
        }
        const item = order[next];
        const sel = new Set(e.shiftKey ? selectedKeys : []);
        sel.add(item.key);
        setSelectedKeys(sel);
        anchorKeyRef.current = item.key;
        mainRef.current?.querySelector(`[data-item-key="${CSS.escape(item.key)}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const headerTitle =
    section === 'search' ? `Hasil untuk "${query.q || 'semua'}"` : mode === 'shared' ? null : SECTION_TITLES[section] || null;
  const breadcrumbRoot =
    mode === 'shared' ? { label: 'Dibagikan kepada saya', name: shareInfo?.name || '…', onClick: () => navigate('shared') } : null;
  const listMode = mode === 'shared' ? 'shared' : mode;
  const showListChrome = section !== 'links' && section !== 'admin';
  const uploadTargetLabel = () => {
    const t = uploadTarget();
    if (t.shareId) return `${shareInfo?.name || 'folder berbagi'}${t.path ? ` / ${t.path}` : ''}`;
    return t.path ? `Drive Saya / ${t.path}` : 'Drive Saya';
  };

  const listProps = {
    items: sortedItems,
    selectedKeys,
    mode: listMode,
    touch,
    scrollRef: mainRef,
    onItemClick: handleItemClick,
    onItemDoubleClick: handleOpenItem,
    onItemLongPress: handleItemLongPress,
    onContextMenu: handleContextMenu,
    onItemDragStart: handleItemDragStart,
    onItemDrop: handleInternalDrop
  };

  return (
    <div
      className="h-screen bg-slate-50 flex flex-col relative select-none overflow-hidden"
      onContextMenu={(e) => (mode === 'drive' || (mode === 'shared' && canEdit) ? handleContextMenu(e, null) : e.preventDefault())}
    >
      <Topbar
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={handleSearchClear}
        onLogout={onLogout}
        onChangePasswordClick={() => setChangePasswordOpen(true)}
        onSessionsClick={() => setSessionsOpen(true)}
        onAdminClick={() => navigate('admin')}
        onMenuClick={() => setSidebarOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          user={user}
          section={section}
          currentPath={currentPath}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNavigateSection={(id) => navigate(id)}
          onNavigateRoot={() => navigateTo('')}
          onNewFolder={() => setNewFolderOpen(true)}
          onUploadFilesClick={() => fileInputRef.current?.click()}
          onUploadFolderClick={() => folderInputRef.current?.click()}
          onCameraClick={() => cameraInputRef.current?.click()}
          onDropItems={(e) => handleInternalDrop(e, '')}
          usage={usage}
        />

        <main ref={mainRef} onMouseDown={onMainMouseDown} className="flex-1 flex flex-col p-3 sm:p-6 overflow-y-auto min-w-0">
          <div className="flex items-center justify-between gap-2 sm:gap-4 mb-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <Breadcrumb
                title={headerTitle}
                root={breadcrumbRoot}
                currentPath={currentPath}
                onNavigate={(p) => (mode === 'shared' ? navigate('shared', { shareId, path: p }) : navigateTo(p))}
                onDropItems={mode === 'drive' ? handleInternalDrop : undefined}
                onOpenMenu={(e) => handleContextMenu(e, null)}
              />
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {section === 'trash' && items.length > 0 && (
                <button
                  onClick={handleEmptyTrash}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-full border border-slate-300 text-sm text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Trash2 className="w-5 h-5" /> <span className="hidden sm:inline">Kosongkan sampah</span>
                </button>
              )}
              {mode === 'shared' && shareInfo && (
                <span className="text-xs text-slate-500 hidden md:inline-flex items-center gap-1">
                  <Users className="w-4 h-4" /> dari @{shareInfo.ownerUsername} • {canEdit ? 'bisa edit' : 'hanya lihat'}
                </span>
              )}
              {showListChrome && (
                <>
                  {/* Urutkan (di tampilan daftar, judul kolom juga bisa diklik) */}
                  <SortMenu sort={sort} onChange={setSort} />
                  <div className="flex items-center bg-surface p-0.5 rounded-full border border-slate-200/60">
                    <button
                      onClick={() => setViewMode('list')}
                      title="Tampilan daftar"
                      aria-label="Tampilan daftar"
                      aria-pressed={viewMode === 'list'}
                      className={`p-1.5 px-2.5 rounded-full flex items-center gap-1 transition-all ${viewMode === 'list' ? 'bg-selected text-sky-950 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      <List className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      title="Tampilan petak"
                      aria-label="Tampilan petak"
                      aria-pressed={viewMode === 'grid'}
                      className={`p-1.5 px-2.5 rounded-full flex items-center gap-1 transition-all ${viewMode === 'grid' ? 'bg-selected text-sky-950 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      <LayoutGrid className="w-5 h-5" />
                    </button>
                  </div>
                  <button
                    onClick={() =>
                      selectedItemsList.length === 1
                        ? setDetailItem(selectedItemsList[0])
                        : showToast('Pilih satu item untuk melihat detail', 'info')
                    }
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                    title="Detail"
                    aria-label="Detail item terpilih"
                  >
                    <Info className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {showListChrome && (
            <div className="min-h-12 mb-2 flex items-center overflow-x-auto">
              {selectedItemsList.length > 0 ? (
                <ActionBar
                  selectedItems={selectedItemsList}
                  mode={listMode}
                  canEdit={canEdit}
                  onClearSelection={() => setSelectedKeys(new Set())}
                  onOpen={handleOpenItem}
                  onDownload={handleDownload}
                  onRename={(item) => setRenameItem(item)}
                  onMove={() => setMoveItemsList(selectedItemsList)}
                  onDelete={() => handleDeleteSelected()}
                  onDetail={(item) => setDetailItem(item)}
                  onChangeColor={handleChangeColor}
                  onCopyLink={handleCopyLink}
                  onToggleStar={handleToggleStar}
                  onShare={(item) => setShareItem(item)}
                  onRestore={handleRestore}
                  onDeleteForever={handleDeleteForever}
                />
              ) : section === 'search' ? (
                <SearchFilters query={query} onChange={handleFilterChange} />
              ) : section === 'trash' ? (
                <p className="text-xs text-slate-500 px-1">Item di Sampah dihapus permanen secara otomatis setelah 30 hari.</p>
              ) : section === 'shared' && !shareId ? (
                <p className="text-xs text-slate-500 px-1">File dan folder yang dibagikan pengguna lain kepada Anda.</p>
              ) : clipboardSize > 0 && section === 'drive' ? (
                <p className="text-xs text-slate-500 px-1">
                  {clipboardSize} item di papan klip • tekan <kbd className="px-1 rounded bg-slate-100 border border-slate-200">Ctrl+V</kbd>{' '}
                  untuk menempel di sini
                </p>
              ) : null}
            </div>
          )}

          <div key={`${section}|${shareId || ''}|${currentPath}|${query.q || ''}`} className="flex-1 chimera-page-enter">
            {section === 'links' ? (
              <LinksView showToast={showToast} onOpenPath={(p) => navigateTo(parentOf(p))} />
            ) : section === 'admin' ? (
              user.role === 'admin' ? (
                <AdminView showToast={showToast} currentUser={user} />
              ) : (
                <p className="text-sm text-slate-500">Halaman ini khusus administrator.</p>
              )
            ) : loading && items.length === 0 ? (
              <div className="py-20 text-center text-sm text-slate-400">Memuat...</div>
            ) : viewMode === 'grid' ? (
              <FileGrid {...listProps} />
            ) : (
              <FileList {...listProps} sort={sort} onSortChange={setSort} />
            )}
          </div>
        </main>
      </div>

      {marquee && (
        <div
          className="chimera-marquee"
          style={{ left: marquee.left, top: marquee.top, width: marquee.right - marquee.left, height: marquee.bottom - marquee.top }}
        />
      )}

      <input type="file" multiple ref={fileInputRef} onChange={handleInputChange} className="hidden" />
      <input type="file" multiple webkitdirectory="" directory="" ref={folderInputRef} onChange={handleInputChange} className="hidden" />
      <input
        type="file"
        accept="image/*,video/*"
        capture="environment"
        ref={cameraInputRef}
        onChange={handleInputChange}
        className="hidden"
      />

      {isDraggingOverWindow && (
        <div className="fixed inset-0 z-50 bg-sky-600/85 backdrop-blur-xs flex flex-col items-center justify-center text-on-accent pointer-events-none animate-in fade-in duration-100">
          <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-4 border border-white/20 animate-bounce">
            <UploadCloud className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold">Lepaskan untuk mengupload</h2>
          <p className="text-sm text-sky-100 mt-2 font-medium">
            ke <span className="font-bold underline">{uploadTargetLabel()}</span>
          </p>
        </div>
      )}

      <ContextMenu
        menuState={contextMenu}
        mode={listMode}
        canEdit={canEdit}
        canPaste={section === 'drive' && clipboardSize > 0}
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, item: null })}
        onNewFolder={() => setNewFolderOpen(true)}
        onUploadFile={() => fileInputRef.current?.click()}
        onUploadFolder={() => folderInputRef.current?.click()}
        onPaste={handlePaste}
        onOpen={handleOpenItem}
        onDownload={handleDownload}
        onRename={(item) => setRenameItem(item)}
        onMove={(list) => setMoveItemsList(list)}
        onDuplicate={handleDuplicate}
        onDelete={(list) => handleDeleteSelected(list)}
        onDetail={(item) => setDetailItem(item)}
        onChangeColor={handleChangeColor}
        onCopyLink={handleCopyLink}
        onToggleStar={handleToggleStar}
        onShare={(item) => setShareItem(item)}
        onRestore={handleRestore}
        onDeleteForever={handleDeleteForever}
      />

      {previewFile && (
        <PreviewModal
          activeFile={previewFile}
          fileList={sortedItems}
          onClose={() => setPreviewFile(null)}
          onNavigateFile={(next) => setPreviewFile(next)}
        />
      )}

      <UploadProgressWidget uploadQueue={uploadQueue} onCancel={cancelUpload} onRetry={retryUpload} onClose={() => setUploadQueue([])} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <ConflictModal
        conflict={conflictState ? conflictState.names[conflictState.index] : null}
        remaining={conflictState ? conflictState.names.length - conflictState.index - 1 : 0}
        onResolve={handleConflictResolve}
        onCancel={handleConflictCancel}
      />
      <ConfirmModal
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
      />

      <NewFolderModal isOpen={newFolderOpen} onClose={() => setNewFolderOpen(false)} onSubmit={handleCreateFolder} />
      <RenameModal
        key={renameItem?.key || 'rename'}
        item={renameItem}
        isOpen={!!renameItem}
        onClose={() => setRenameItem(null)}
        onSubmit={handleRenameSubmit}
      />
      <MoveModal
        key={moveItemsList ? moveItemsList.map((i) => i.key).join('|') : 'move'}
        items={moveItemsList}
        currentPath={section === 'drive' ? currentPath : null}
        isOpen={!!moveItemsList}
        onClose={() => setMoveItemsList(null)}
        onSubmit={moveItems}
      />
      <DetailPanel item={detailItem} isOpen={!!detailItem} onClose={() => setDetailItem(null)} />
      <ChangePasswordModal isOpen={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} onSubmit={handleChangePassword} />
      <ShareModal
        item={shareItem}
        isOpen={!!shareItem}
        onClose={() => {
          setShareItem(null);
          loadItems();
        }}
        showToast={showToast}
      />
      <SessionsModal isOpen={sessionsOpen} onClose={() => setSessionsOpen(false)} onLoggedOutEverywhere={onLogout} showToast={showToast} />
    </div>
  );
}
