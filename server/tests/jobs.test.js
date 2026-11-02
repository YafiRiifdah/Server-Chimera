import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../src/db.js';
import { runMaintenance } from '../src/jobs.js';

describe('Tugas terjadwal', () => {
  test('runMaintenance memangkas aktivitas > 90 hari dan menyisakan yang baru', () => {
    const db = getDb();
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
    db.prepare(
      "INSERT INTO activity (user_id, action, path, created_at) VALUES (?, 'upload', 'lama.txt', datetime('now', '-91 days'))"
    ).run(admin.id);
    db.prepare("INSERT INTO activity (user_id, action, path) VALUES (?, 'upload', 'baru.txt')").run(admin.id);

    const result = runMaintenance();
    assert.equal(result.activityPruned, 1);
    const left = db
      .prepare('SELECT path FROM activity WHERE user_id = ?')
      .all(admin.id)
      .map((r) => r.path);
    assert.deepEqual(left, ['baru.txt']);
    assert.ok('trashPurged' in result && 'uploadsPurged' in result);
  });
});
