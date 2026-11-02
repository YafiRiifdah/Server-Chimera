import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { loginAdmin, client } from './helpers.js';

describe('Berbintang', () => {
  let c;

  before(async () => {
    c = client(await loginAdmin());
    await c.mkdir('', 'Proyek');
    await c.upload('Proyek', 'laporan.txt', 'isi');
    await c.upload('', 'lain.txt', 'isi');
  });

  test('POST /starred menandai item dan GET /starred mengembalikannya dengan metadata disk', async () => {
    assert.equal((await c.post('/api/starred', { path: 'Proyek/laporan.txt' })).status, 200);
    assert.equal((await c.post('/api/starred', { path: 'Proyek' })).status, 200);
    const res = await c.get('/api/starred');
    assert.equal(res.status, 200);
    const paths = res.body.entries.map((e) => e.path).sort();
    assert.deepEqual(paths, ['Proyek', 'Proyek/laporan.txt']);
    const file = res.body.entries.find((e) => e.path === 'Proyek/laporan.txt');
    assert.equal(file.type, 'file');
    assert.equal(file.size, 3);
    assert.equal(file.starred, true);
  });

  test('GET /files menampilkan starred=true pada item yang ditandai', async () => {
    const entries = await c.list('Proyek');
    assert.equal(entries.find((e) => e.name === 'laporan.txt').starred, true);
  });

  test('menandai path yang tidak ada ditolak 404', async () => {
    const res = await c.post('/api/starred', { path: 'tidak-ada.txt' });
    assert.equal(res.status, 404);
  });

  test('bintang ikut saat folder diganti nama', async () => {
    await c.post('/api/files/rename', { path: 'Proyek', name: 'Proyek2' });
    const res = await c.get('/api/starred');
    const paths = res.body.entries.map((e) => e.path).sort();
    assert.deepEqual(paths, ['Proyek2', 'Proyek2/laporan.txt']);
  });

  test('DELETE /starred menghapus tanda', async () => {
    assert.equal((await c.del('/api/starred', { path: 'Proyek2' })).status, 200);
    const res = await c.get('/api/starred');
    assert.deepEqual(
      res.body.entries.map((e) => e.path),
      ['Proyek2/laporan.txt']
    );
  });

  test('item berbintang yang dipindahkan ke Sampah tidak muncul di daftar Berbintang', async () => {
    await c.del('/api/files', { paths: ['Proyek2/laporan.txt'] });
    const res = await c.get('/api/starred');
    assert.deepEqual(res.body.entries, []);
  });
});
