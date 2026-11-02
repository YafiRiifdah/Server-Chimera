import React, { useState } from 'react';
import FileIcon, { getFileCategory } from './FileIcon.jsx';
import { thumbUrl } from '../utils/urls.js';

/**
 * Gambar kecil untuk file gambar/video (lazy), jatuh ke ikon jika server tidak punya thumbnail.
 * Memakai ukuran+mtime di URL? Tidak perlu: server sudah memasukkan mtime ke kunci cache,
 * tetapi browser bisa menyimpan URL lama; `item.mtime` dipakai sebagai cache-buster.
 */
export default function Thumbnail({ item, width = 256, className = '', iconClassName = 'w-12 h-12' }) {
  const [failed, setFailed] = useState(false);
  const category = item.type === 'file' ? getFileCategory(item.name, item.mime) : null;
  const canThumb = (category === 'image' || category === 'video') && !failed && !item.trashId;

  if (!canThumb) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <FileIcon item={item} className={iconClassName} />
      </div>
    );
  }

  const src = thumbUrl(item, width);
  return (
    <div className={`overflow-hidden flex items-center justify-center bg-slate-100 ${className}`}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
