import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loginAdmin, client } from './helpers.js';
import { STORAGE_ROOT, INITIAL_ADMIN } from '../src/config.js';
import { getDb } from '../src/db.js';
import { purgeExpiredTrash } from '../src/trash.js';

describe('Sampah: daftar, pulihkan, hapus permanen, auto-bersih', () => {
  let c;
  const adminRoot = path.join(STORAGE_ROOT, 'users', INITIAL_ADMIN.username);

  before(async () => {
    c = client(await loginAdmin());
    await c.mkdir('', 'Dokumen');
    await c.mkdir('Dokumen', 'Sub');
    await c.upload('Dokumen/Sub', 'a.txt', 'A');
    await c.upload('Dokumen', 'b.txt', 'B');
    await c.upload('', 'c.txt', 'C');
    await c.post('/api/files/color', { path: 'Dokumen/Sub', color: '#4986e7' });
  });

  test('GET /trash mengembalikan item yang dihapus dengan lokasi asal', async () => {
    await c.del('/api/files', { paths: ['Dokumen/Sub', 'c.txt'] });
    const res = await c.get('/api/trash');
    assert.equal(res.status, 200);
    const byName = Object.fromEntries(res.body.entries.map((e) => [e.name, e]));
    assert.equal(byName['Sub'].originalPath, 'Dokumen/Sub');
    assert.equal(byName['Sub'].type, 'folder');
    assert.equal(byName['c.txt'].originalPath, 'c.txt');
    assert.ok(byName['c.txt'].deletedAt);
    assert.ok(byName['c.txt'].id);
  });

  test('POST /trash/restore mengembalikan ke lokasi asal, membuat ulang folder induk yang hilang, dan warna folder tetap', async () => {
    // Hapus folder induk "Dokumen" dari disk agar restore harus membuat ulang
    const trash = (await c.get('/api/trash')).body.entries;
    const sub = trash.find((e) => e.name === 'Sub');
    await c.del('/api/files', { paths: ['Dokumen'] });
    assert.equal(fs.existsSync(path.join(adminRoot, 'Dokumen')), false);

    const res = await c.post('/api/trash/restore', { ids: [sub.id] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.restored.length, 1);
    assert.equal(fs.readFileSync(path.join(adminRoot, 'Dokumen', 'Sub', 'a.txt'), 'utf8'), 'A');

    const entries = await c.list('Dokumen');
    assert.equal(entries.find((e) => e.name === 'Sub').color, '#4986e7');
    // Tidak lagi di Sampah
    assert.equal(
      (await c.get('/api/trash')).body.entries.some((e) => e.id === sub.id),
      false
    );
  });

  test('restore saat nama sudah dipakai menyimpan keduanya dengan akhiran (1)', async () => {
    await c.upload('', 'c.txt', 'C baru');
    const trash = (await c.get('/api/trash')).body.entries;
    const cOld = trash.find((e) => e.name === 'c.txt');
    const res = await c.post('/api/trash/restore', { ids: [cOld.id] });
    assert.equal(res.status, 200);
    assert.equal(res.body.restored[0].path, 'c (1).txt');
    assert.equal(fs.readFileSync(path.join(adminRoot, 'c (1).txt'), 'utf8'), 'C');
  });

  test('DELETE /trash menghapus permanen dari disk dan tabel', async () => {
    await c.del('/api/files', { paths: ['c (1).txt'] });
    const trash = (await c.get('/api/trash')).body.entries;
    const item = trash.find((e) => e.name === 'c (1).txt');
    const res = await c.del('/api/trash', { ids: [item.id] });
    assert.equal(res.status, 200);
    assert.equal(fs.existsSync(path.join(adminRoot, '.trash', item.id)), false);
    assert.equal(
      (await c.get('/api/trash')).body.entries.some((e) => e.id === item.id),
      false
    );
  });

  test('DELETE /trash/all mengosongkan Sampah', async () => {
    await c.del('/api/files', { paths: ['Dokumen'] });
    assert.ok((await c.get('/api/trash')).body.entries.length > 0);
    const res = await c.del('/api/trash/all');
    assert.equal(res.status, 200);
    assert.deepEqual((await c.get('/api/trash')).body.entries, []);
    assert.deepEqual(fs.readdirSync(path.join(adminRoot, '.trash')), []);
  });

  test('purgeExpiredTrash menghapus item yang lebih tua dari 30 hari saja', async () => {
    await c.upload('', 'tua.txt', 'x');
    await c.upload('', 'baru.txt', 'y');
    await c.del('/api/files', { paths: ['tua.txt', 'baru.txt'] });
    const db = getDb();
    const tua = db.prepare("SELECT id FROM trash WHERE name = 'tua.txt'").get();
    db.prepare("UPDATE trash SET deleted_at = datetime('now', '-31 days') WHERE id = ?").run(tua.id);

    const purged = purgeExpiredTrash(30);
    assert.equal(purged, 1);
    const left = (await c.get('/api/trash')).body.entries.map((e) => e.name);
    assert.deepEqual(left, ['baru.txt']);
    assert.equal(fs.existsSync(path.join(adminRoot, '.trash', tua.id)), false);
  });

  test('restore ditolak jika melebihi kuota', async () => {
    // Kuota tes 2 MB: isi hampir penuh, lalu coba pulihkan file 1 MB dari Sampah
    const big = Buffer.alloc(900 * 1024, 'z').toString();
    await c.upload('', 'besar.bin', big);
    await c.del('/api/files', { paths: ['besar.bin'] });
    await c.upload('', 'isi1.bin', big);
    await c.upload('', 'isi2.bin', Buffer.alloc(300 * 1024, 'z').toString());
    const item = (await c.get('/api/trash')).body.entries.find((e) => e.name === 'besar.bin');
    const res = await c.post('/api/trash/restore', { ids: [item.id] });
    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'QUOTA_EXCEEDED');
  });
});
