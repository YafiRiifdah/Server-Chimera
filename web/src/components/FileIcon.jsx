import React from 'react';
import FolderIcon from './FolderIcon.jsx';
import { FileText, FilePdf, Image as ImageIcon, Video as VideoIcon, Music, FileCode, Archive, File } from '../icons.jsx';

export function getFileCategory(name, mime = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();

  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('video/') || ['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) {
    return 'video';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) {
    return 'audio';
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
    return 'archive';
  }
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'c', 'cpp', 'rs', 'go', 'php', 'sh', 'sql', 'md'].includes(ext)) {
    return 'code';
  }
  if (['txt', 'doc', 'docx', 'rtf', 'odt', 'csv', 'xls', 'xlsx'].includes(ext)) {
    return 'document';
  }
  return 'file';
}

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  } catch {
    return isoString;
  }
}

export default function FileIcon({ item, className = 'w-5 h-5' }) {
  if (item.type === 'folder') {
    return <FolderIcon color={item.color} className={className} />;
  }

  const category = getFileCategory(item.name, item.mime);

  switch (category) {
    case 'image':
      return <ImageIcon className={`${className} text-red-500`} />;
    case 'video':
      return <VideoIcon className={`${className} text-rose-600`} />;
    case 'audio':
      return <Music className={`${className} text-purple-600`} />;
    case 'pdf':
      return <FilePdf className={`${className} text-red-600`} />;
    case 'archive':
      return <Archive className={`${className} text-orange-500`} />;
    case 'code':
      return <FileCode className={`${className} text-emerald-600`} />;
    case 'document':
      return <FileText className={`${className} text-blue-600`} />;
    default:
      return <File className={`${className} text-slate-400`} />;
  }
}
