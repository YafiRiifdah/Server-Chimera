import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loginAdmin, client } from './helpers.js';
import { STORAGE_ROOT, INITIAL_ADMIN } from '../src/config.js';

describe('Salin item dan Detail lengkap', () => {
  let c;
  const adminRoot = path.join(STORAGE_ROOT, 'users', INITIAL_ADMIN.username);

  before(async () => {
    c = client(await loginAdmin());
    await c.mkdir('', 'Sumber');
    await c.mkdir('Sumber', 'Dalam');
    await c.upload('Sumber', 'a.txt', 'isi a');
    await c.upload('Sumber/Dalam', 'b.txt', 'isi b');
    await c.mkdir('', 'Tujuan');
    await c.post('/api/files/color', { path: 'Sumber', color: '#4986e7' });
  });

  test('POST /files/copy menyalin file dan folder (rekursif) ke tujuan; nama bentrok → "(1)"', async () => {
    const res = await c.post('/api/files/copy', { paths: ['Sumber', 'Sumber/a.txt'], to: 'Tujuan' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.copied.length, 2);
    assert.equal(fs.readFileSync(path.join(adminRoot, 'Tujuan', 'Sumber', 'Dalam', 'b.txt'), 'utf8'), 'isi b');
    assert.equal(fs.readFileSync(path.join(adminRoot, 'Tujuan', 'a.txt'), 'utf8'), 'isi a');
    // Sumber asli tetap ada
    assert.ok(fs.existsSync(path.join(adminRoot, 'Sumber', 'a.txt')));

    // Salin lagi ke tempat yang sama → "(1)"
    const again = await c.post('/api/files/copy', { paths: ['Sumber/a.txt'], to: 'Tujuan' });
    assert.equal(again.body.copied[0].name, 'a (1).txt');

    // Salinan terindeks untuk pencarian
    const found = await c.get('/api/files/search?q=b.txt');
    assert.ok(found.body.entries.some((e) => e.path === 'Tujuan/Sumber/Dalam/b.txt'));
  });

  test('"Buat salinan" di folder yang sama (to = induk) menghasilkan "nama (1)"', async () => {
    const res = await c.post('/api/files/copy', { paths: ['Sumber/a.txt'], to: 'Sumber' });
    assert.equal(res.status, 200);
    assert.equal(res.body.copied[0].path, 'Sumber/a (1).txt');
  });

  test('menyalin folder ke dalam dirinya sendiri ditolak', async () => {
    const res = await c.post('/api/files/copy', { paths: ['Sumber'], to: 'Sumber/Dalam' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_COPY');
  });

  test('salin ditolak 413 jika melebihi kuota', async () => {
    const big = Buffer.alloc(900 * 1024, 'z').toString();
    await c.upload('', 'besar1.bin', big);
    await c.upload('', 'besar2.bin', Buffer.alloc(700 * 1024, 'z').toString());
    const res = await c.post('/api/files/copy', { paths: ['besar1.bin'], to: 'Tujuan' });
    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'QUOTA_EXCEEDED');
    assert.equal(fs.existsSync(path.join(adminRoot, 'Tujuan', 'besar1.bin')), false);
  });

  test('GET /files/stat menyertakan akses (berbagi) dan aktivitas terakhir', async () => {
    await c.post('/api/shares', { path: 'Sumber/a.txt', type: 'link' });
    await c.get('/api/files/raw?path=Sumber/a.txt');
    const res = await c.get('/api/files/stat?path=Sumber/a.txt');
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'a.txt');
    assert.ok(Array.isArray(res.body.shares));
    assert.equal(res.body.shares[0].type, 'link');
    assert.ok(Array.isArray(res.body.activity));
    assert.ok(res.body.activity.some((a) => a.action === 'open'));
    assert.ok(res.body.activity.some((a) => a.action === 'upload'));
    assert.equal(res.body.activity[0].action, 'open', 'terbaru dulu');
  });

  test('GET /files/stat untuk folder menyertakan jumlah isi', async () => {
    const res = await c.get('/api/files/stat?path=Sumber');
    assert.equal(res.body.type, 'folder');
    assert.equal(res.body.color, '#4986e7');
    assert.ok(res.body.itemCount >= 2);
  });

  test('pratinjau HEIC lewat /files/thumb mengembalikan 404 THUMB_FAILED/UNSUPPORTED, bukan 500', async () => {
    await c.upload('', 'foto.heic', 'bukan heic sungguhan');
    const res = await c.get('/api/files/thumb?path=foto.heic&w=1024');
    assert.equal(res.status, 404);
    assert.ok(['THUMB_FAILED', 'THUMB_UNSUPPORTED'].includes(res.body.code));
  });
});
