import React, { useId } from 'react';
import {
  MdAdd,
  MdArrowDownward,
  MdArrowForward,
  MdArrowUpward,
  MdCheck,
  MdChevronLeft,
  MdChevronRight,
  MdCloudUpload,
  MdClose,
  MdExpandLess,
  MdExpandMore,
  MdMenu,
  MdMoreVert,
  MdOutlineAdminPanelSettings,
  MdOutlineArchive,
  MdOutlineAudiotrack,
  MdOutlineBlock,
  MdOutlineCheckCircle,
  MdOutlineCloud,
  MdOutlineDarkMode,
  MdOutlineLightMode,
  MdOutlineCloudUpload,
  MdOutlineCode,
  MdOutlineComputer,
  MdOutlineContentCopy,
  MdOutlineContentPaste,
  MdOutlineCreateNewFolder,
  MdOutlineDelete,
  MdOutlineDeleteForever,
  MdOutlineDescription,
  MdOutlineDriveFileMove,
  MdOutlineDriveFileRenameOutline,
  MdOutlineDriveFolderUpload,
  MdOutlineErrorOutline,
  MdOutlineFileDownload,
  MdOutlineFolderZip,
  MdOutlineGridView,
  MdOutlineHistory,
  MdOutlineInfo,
  MdOutlineInsertDriveFile,
  MdOutlineKey,
  MdOutlineLink,
  MdOutlineLock,
  MdOutlineLogout,
  MdOutlineOpenInNew,
  MdOutlinePalette,
  MdOutlinePeople,
  MdOutlinePerson,
  MdOutlinePersonAddAlt,
  MdOutlinePhotoCamera,
  MdOutlinePictureAsPdf,
  MdOutlineRefresh,
  MdOutlineRestoreFromTrash,
  MdOutlineSchedule,
  MdOutlineSearch,
  MdOutlineSkipNext,
  MdOutlineStar,
  MdOutlineStarBorder,
  MdOutlineStorage,
  MdOutlineSwapVert,
  MdOutlineUploadFile,
  MdOutlineViewList,
  MdOutlineVisibility,
  MdOutlineVisibilityOff,
  MdOutlineWarningAmber,
  MdOutlineZoomIn,
  MdOutlineZoomOut
} from 'react-icons/md';

/**
 * Satu-satunya tempat ikon didefinisikan. Memakai Material Icons (Google, Apache-2.0) dari paket
 * `react-icons`, dibundel lokal (tanpa CDN) — set ikon yang sama dengan Google Drive.
 * Nama ekspor adalah nama semantik yang dipakai komponen; ganti set ikon cukup di berkas ini.
 */
export const Activity = MdOutlineHistory;
export const AlertCircle = MdOutlineErrorOutline;
export const AlertTriangle = MdOutlineWarningAmber;
export const Archive = MdOutlineFolderZip;
export const ArrowDown = MdArrowDownward;
export const ArrowRight = MdArrowForward;
export const ArrowUp = MdArrowUpward;
export const ArrowUpDown = MdOutlineSwapVert;
export const Ban = MdOutlineBlock;
export const Camera = MdOutlinePhotoCamera;
export const Check = MdCheck;
export const CheckCircle2 = MdOutlineCheckCircle;
export const ChevronDown = MdExpandMore;
export const ChevronLeft = MdChevronLeft;
export const ChevronRight = MdChevronRight;
export const ChevronUp = MdExpandLess;
export const ClipboardPaste = MdOutlineContentPaste;
export const Clock = MdOutlineSchedule;
export const Cloud = MdOutlineCloud;
export const Copy = MdOutlineContentCopy;
export const Download = MdOutlineFileDownload;
export const Edit3 = MdOutlineDriveFileRenameOutline;
export const ExternalLink = MdOutlineOpenInNew;
export const Eye = MdOutlineVisibility;
export const EyeOff = MdOutlineVisibilityOff;
export const File = MdOutlineInsertDriveFile;
export const FileCode = MdOutlineCode;
export const FilePdf = MdOutlinePictureAsPdf;
export const FileQuestion = MdOutlineInsertDriveFile;
export const FileText = MdOutlineDescription;
export const Flame = MdOutlineDeleteForever;
export const FolderArchive = MdOutlineFolderZip;
export const FolderInput = MdOutlineDriveFileMove;
export const FolderPlus = MdOutlineCreateNewFolder;
export const FolderUp = MdOutlineDriveFolderUpload;
export const HardDrive = MdOutlineStorage;
export const Info = MdOutlineInfo;
export const KeyRound = MdOutlineKey;
export const LayoutGrid = MdOutlineGridView;
export const Link2 = MdOutlineLink;
export const List = MdOutlineViewList;
export const Lock = MdOutlineLock;
export const LogOut = MdOutlineLogout;
export const Menu = MdMenu;
export const Monitor = MdOutlineComputer;
export const Moon = MdOutlineDarkMode;
export const Sun = MdOutlineLightMode;
export const MoreVertical = MdMoreVert;
export const Music = MdOutlineAudiotrack;
export const Palette = MdOutlinePalette;
export const Plus = MdAdd;
export const RefreshCw = MdOutlineRefresh;
export const RotateCcw = MdOutlineRestoreFromTrash;
export const Search = MdOutlineSearch;
export const ShieldCheck = MdOutlineAdminPanelSettings;
export const SkipForward = MdOutlineSkipNext;
export const Star = MdOutlineStarBorder;
export const StarOff = MdOutlineStar;
/** Glyph "delete" Material lebih kecil dari ikon lain di set yang sama; diperbesar sedikit agar seimbang. */
export const Trash2 = ({ style, ...props }) => <MdOutlineDelete {...props} style={{ transform: 'scale(1.18)', ...style }} />;
export const Upload = MdOutlineUploadFile;
export const UploadCloud = MdOutlineCloudUpload;
export const User = MdOutlinePerson;
export const UserPlus = MdOutlinePersonAddAlt;
export const Users = MdOutlinePeople;
export const X = MdClose;
export const ZoomIn = MdOutlineZoomIn;
export const ZoomOut = MdOutlineZoomOut;
export { MdOutlineArchive as ArchiveBox };

/** Logo merek Chimera (awan + panah unggah), dipakai di topbar, halaman login, halaman link publik, dan ikon PWA. */
export const Logo = MdCloudUpload;

/** Indikator memuat: cincin CSS (Material tidak punya ikon spinner). Tambahkan `animate-spin` lewat className. */
export function Loader2({ className = '' }) {
  return <span className={`inline-block rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden="true" />;
}

/**
 * Ikon jenis berkas foto dan video (gambar sendiri, bukan dari Material): bingkai foto dengan
 * gunung dan matahari, serta papan klap dengan tombol putar. Warna mengikuti `currentColor`
 * (kelas text-*), ukuran mengikuti kelas w-* / h-*; kanvas diberi margin agar bobot visualnya
 * setara dengan ikon Material di sebelahnya.
 */
export function Image({ className = '', style, ...props }) {
  return (
    <svg viewBox="-52 -52 616 616" fill="currentColor" className={className} style={style} aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M28 58h456a28 28 0 0 1 28 28v342a28 28 0 0 1-28 28H28a28 28 0 0 1-28-28V86a28 28 0 0 1 28-28Zm4 32v230l122-136q16-16 32 0l132 149 68-65q14-12 28 0l66 55V90Zm354 40a45 45 0 1 0 0 90 45 45 0 0 0 0-90Z"
      />
    </svg>
  );
}

export function Video({ className = '', style, ...props }) {
  const id = useId();
  return (
    <svg viewBox="0 0 512 512" fill="currentColor" className={className} style={style} aria-hidden="true" {...props}>
      <mask id={id}>
        <rect width="512" height="512" fill="#fff" />
        {/* garis pemisah papan klap */}
        <rect x="40" y="147" width="432" height="36" fill="#000" />
        {/* dua garis miring di bagian atas */}
        <path d="M104 50h52l92 97h-52ZM218 50h52l92 97h-52Z" fill="#000" />
        {/* tombol putar */}
        <path d="M214 248v88l100-44Z" fill="#000" stroke="#000" strokeWidth="26" strokeLinejoin="round" />
      </mask>
      <rect x="55" y="55" width="402" height="402" rx="104" mask={`url(#${id})`} />
    </svg>
  );
}
