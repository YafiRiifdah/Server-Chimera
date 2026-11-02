import React from 'react';
import { DEFAULT_FOLDER_COLOR } from '../utils/folderColors.js';

/**
 * Ikon folder datar bergaya Google Drive: tab di kiri atas, badan folder,
 * dan garis bayangan tipis di bawah tab. Warna isi mengikuti warna folder.
 */
export default function FolderIcon({ color, className = 'w-5 h-5', title }) {
  const fill = color || DEFAULT_FOLDER_COLOR;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {/* Tab */}
      <path d="M2 6a2 2 0 0 1 2-2h5.2a2 2 0 0 1 1.4.6L12.4 6.4H20a2 2 0 0 1 2 2V9H2V6z" fill={fill} />
      {/* Bayangan tipis di bawah tab agar ada kedalaman seperti ikon Drive */}
      <path d="M2 9h20v1.2H2z" fill="#000" opacity="0.12" />
      {/* Badan */}
      <path d="M2 9h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z" fill={fill} />
    </svg>
  );
}
