import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Root proyek = dua tingkat di atas server/src. Semua path relatif di .env
// diselesaikan dari sini, bukan dari cwd, supaya hasilnya sama dari mana pun
// aplikasi/tes dijalankan (root, server/, PM2).
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Variabel yang sudah ada di environment (mis. dari tests/setup.js atau PM2) tidak ditimpa .env
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });

export const PORT = parseInt(process.env.PORT || '5100', 10);
export const STORAGE_ROOT = path.resolve(PROJECT_ROOT, process.env.STORAGE_ROOT || './storage');
export const DATA_DIR = path.resolve(PROJECT_ROOT, process.env.DATA_DIR || './data');
export const SESSION_SECRET = process.env.SESSION_SECRET || 'chimera_default_secret_key_change_me_in_production!';
export const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || `${20 * 1024 * 1024 * 1024}`, 10);
export const UPLOAD_CHUNK_BYTES = parseInt(process.env.UPLOAD_CHUNK_BYTES || `${8 * 1024 * 1024}`, 10);
export const DEFAULT_QUOTA_BYTES = parseInt(process.env.DEFAULT_QUOTA_BYTES || `${100 * 1024 * 1024 * 1024}`, 10);
export const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

export const INITIAL_ADMIN = {
  username: process.env.INITIAL_ADMIN_USERNAME || 'admin',
  password: process.env.INITIAL_ADMIN_PASSWORD || 'adminpassword123',
  displayName: process.env.INITIAL_ADMIN_NAME || 'Administrator'
};

// Pastikan folder-folder esensial dibuat
export function ensureBaseDirectories() {
  const dirs = [
    DATA_DIR,
    STORAGE_ROOT,
    path.join(STORAGE_ROOT, '.chimera', 'tmp'),
    path.join(STORAGE_ROOT, '.chimera', 'thumbs'),
    path.join(STORAGE_ROOT, 'users')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
