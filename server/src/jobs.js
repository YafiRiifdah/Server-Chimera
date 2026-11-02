import { getDb } from './db.js';
import { purgeExpiredTrash } from './trash.js';
import { purgeStaleUploads } from './chunked.js';

/**
 * Tugas pemeliharaan terjadwal (Master Prompt §5.7, §5.8):
 *  - Sampah dibersihkan otomatis setelah 30 hari
 *  - Sesi upload chunked yang ditinggalkan > 24 jam dibuang
 *  - Log aktivitas dipangkas setelah 90 hari
 */
export const TRASH_RETENTION_DAYS = 30;
export const STALE_UPLOAD_HOURS = 24;
export const ACTIVITY_RETENTION_DAYS = 90;

export function runMaintenance() {
  const trashPurged = purgeExpiredTrash(TRASH_RETENTION_DAYS);
  const uploadsPurged = purgeStaleUploads(STALE_UPLOAD_HOURS);
  const activityPruned = getDb()
    .prepare("DELETE FROM activity WHERE created_at < datetime('now', ?)")
    .run(`-${ACTIVITY_RETENTION_DAYS} days`).changes;
  return { trashPurged, uploadsPurged, activityPruned };
}

/** Jalankan sekali saat start, lalu tiap 6 jam. Mengembalikan fungsi untuk berhenti. */
export function startMaintenanceSchedule(intervalMs = 6 * 60 * 60 * 1000) {
  const tick = () => {
    try {
      const r = runMaintenance();
      if (r.trashPurged || r.uploadsPurged || r.activityPruned) {
        console.log(`[Pemeliharaan] sampah: ${r.trashPurged}, upload basi: ${r.uploadsPurged}, aktivitas: ${r.activityPruned}`);
      }
    } catch (err) {
      console.error('[Pemeliharaan] gagal:', err.message);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
