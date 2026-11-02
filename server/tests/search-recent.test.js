import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loginAdmin, client } from './helpers.js';
import { STORAGE_ROOT, INITIAL_ADMIN } from '../src/config.js';

describe('Pencarian global dan Terbaru', () => {
  let c;
  const adminRoot = path.join(STORAGE_ROOT, 'users', INITIAL_ADMIN.username);

  before(async () => {
    c = client(await loginAdmin());
    await c.mkdir('', 'Foto Liburan');
    await c.mkdir('Foto Liburan', 'Bali');
    await c.upload('Foto Liburan/Bali', 'pantai.jpg', 'xx');
    await c.upload('Foto Liburan', 'video pantai.mp4', 'xx');
    await c.upload('', 'laporan pantai.pdf', 'xx');
    await c.upload('', 'catatan.txt', 'xx');
  });

  test('GET /files/search?q= mencari nama di seluruh Drive (semua sub-folder)', async () => {
    const res = await c.get('/api/files/search?q=pantai');
    assert.equal(res.status, 200);
    const paths = res.body.entries.map((e) => e.path).sort();
    assert.deepEqual(paths, ['Foto Liburan/Bali/pantai.jpg', 'Foto Liburan/video pantai.mp4', 'laporan pantai.pdf']);
  });

  test('filter type=image hanya gambar; type=folder hanya folder', async () => {
    const img = await c.get('/api/files/search?q=pantai&type=image');
    assert.deepEqual(
      img.body.entries.map((e) => e.path),
      ['Foto Liburan/Bali/pantai.jpg']
    );
    const dir = await c.get('/api/files/search?q=&type=folder');
    assert.deepEqual(dir.body.entries.map((e) => e.path).sort(), ['Foto Liburan', 'Foto Liburan/Bali']);
  });

  test('filter modified=today menyertakan file baru; file dengan mtime lama tidak', async () => {
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    fs.utimesSync(path.join(adminRoot, 'catatan.txt'), old, old);
    await c.post('/api/files/reindex');
    const res = await c.get('/api/files/search?q=&modified=7d');
    const names = res.body.entries.map((e) => e.name);
    assert.ok(names.includes('pantai.jpg'));
    assert.ok(!names.includes('catatan.txt'));
  });

  test('indeks mengikuti rename dan pindah folder', async () => {
    await c.post('/api/files/rename', { path: 'Foto Liburan', name: 'Liburan' });
    await c.post('/api/files/move', { paths: ['laporan pantai.pdf'], to: 'Liburan' });
    const res = await c.get('/api/files/search?q=pantai');
    const paths = res.body.entries.map((e) => e.path).sort();
    assert.deepEqual(paths, ['Liburan/Bali/pantai.jpg', 'Liburan/laporan pantai.pdf', 'Liburan/video pantai.mp4']);
  });

  test('item di Sampah tidak muncul di pencarian, dan muncul lagi setelah dipulihkan', async () => {
    await c.del('/api/files', { paths: ['Liburan/Bali'] });
    let res = await c.get('/api/files/search?q=pantai.jpg');
    assert.deepEqual(res.body.entries, []);
    const item = (await c.get('/api/trash')).body.entries.find((e) => e.name === 'Bali');
    await c.post('/api/trash/restore', { ids: [item.id] });
    res = await c.get('/api/files/search?q=pantai.jpg');
    assert.deepEqual(
      res.body.entries.map((e) => e.path),
      ['Liburan/Bali/pantai.jpg']
    );
  });

  test('pencarian tidak bocor ke user lain', async () => {
    // Buat user kedua langsung di DB dan folder di disk, lalu reindex untuknya
    const { getDb } = await import('../src/db.js');
    const bcrypt = (await import('bcrypt')).default;
    const db = getDb();
    db.prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES ('budi', ?, 'Budi', 'user')").run(
      bcrypt.hashSync('rahasia123', 4)
    );
    fs.mkdirSync(path.join(STORAGE_ROOT, 'users', 'budi'), { recursive: true });
    fs.writeFileSync(path.join(STORAGE_ROOT, 'users', 'budi', 'pantai budi.txt'), 'x');
    const { reindexAll } = await import('../src/indexer.js');
    reindexAll();
    const res = await c.get('/api/files/search?q=pantai');
    assert.ok(!res.body.entries.some((e) => e.name === 'pantai budi.txt'));
  });

  test('GET /files/recent mengembalikan file yang baru diubah/dibuka, terbaru dulu, tanpa folder', async () => {
    await c.upload('', 'paling-baru.txt', 'x');
    await c.get('/api/files/raw?path=catatan.txt'); // membuka = masuk Terbaru
    const res = await c.get('/api/files/recent');
    assert.equal(res.status, 200);
    const names = res.body.entries.map((e) => e.name);
    assert.equal(names[0], 'catatan.txt');
    assert.equal(names[1], 'paling-baru.txt');
    assert.ok(res.body.entries.every((e) => e.type === 'file'));
    // File yang sudah di Sampah tidak ikut
    await c.del('/api/files', { paths: ['paling-baru.txt'] });
    const after = await c.get('/api/files/recent');
    assert.ok(!after.body.entries.some((e) => e.name === 'paling-baru.txt'));
  });
});
