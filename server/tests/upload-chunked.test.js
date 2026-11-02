import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loginAdmin, client } from './helpers.js';
import { STORAGE_ROOT, INITIAL_ADMIN, DEFAULT_QUOTA_BYTES } from '../src/config.js';

const CHUNK = 16 * 1024;

describe('Upload chunked / resumable', () => {
  let c;
  const adminRoot = path.join(STORAGE_ROOT, 'users', INITIAL_ADMIN.username);
  const tmpRoot = path.join(STORAGE_ROOT, '.chimera', 'tmp');

  // File uji 40 KB = 3 chunk (16K, 16K, 8K) dengan isi yang bisa diverifikasi
  const content = Buffer.alloc(40 * 1024);
  for (let i = 0; i < content.length; i++) content[i] = i % 251;
  const chunkOf = (n) => content.subarray(n * CHUNK, Math.min((n + 1) * CHUNK, content.length));

  async function init(name, extra = {}) {
    return c.post('/api/upload/init', { path: 'Unggahan', name, size: content.length, mtime: '2024-01-02T03:04:05.000Z', ...extra });
  }
  async function putChunk(id, n, buf = chunkOf(n)) {
    return c.put(`/api/upload/${id}/chunk/${n}`).set('Content-Type', 'application/octet-stream').send(buf);
  }

  before(async () => {
    c = client(await loginAdmin());
    await c.mkdir('', 'Unggahan');
  });

  test('init mengembalikan uploadId, chunkSize, dan received kosong', async () => {
    const res = await init('besar.bin');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.uploadId);
    assert.equal(res.body.chunkSize, CHUNK);
    assert.deepEqual(res.body.received, []);
  });

  test('chunk bisa dikirim tak berurutan, GET melaporkan yang sudah ada, complete menyusun file utuh', async () => {
    const { uploadId } = (await init('besar.bin')).body;
    assert.equal((await putChunk(uploadId, 2)).status, 200);
    assert.equal((await putChunk(uploadId, 0)).status, 200);

    const status = await c.get(`/api/upload/${uploadId}`);
    assert.equal(status.status, 200);
    assert.deepEqual(status.body.received, [0, 2]);

    // Belum lengkap → complete ditolak
    const early = await c.post(`/api/upload/${uploadId}/complete`, {});
    assert.equal(early.status, 409);
    assert.equal(early.body.code, 'UPLOAD_INCOMPLETE');

    assert.equal((await putChunk(uploadId, 1)).status, 200);
    const done = await c.post(`/api/upload/${uploadId}/complete`, {});
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.file.path, 'Unggahan/besar.bin');

    const disk = path.join(adminRoot, 'Unggahan', 'besar.bin');
    assert.ok(fs.readFileSync(disk).equals(content));
    // mtime dari klien dipertahankan
    assert.equal(fs.statSync(disk).mtime.toISOString(), '2024-01-02T03:04:05.000Z');
    // Folder sementara dibersihkan dan tidak ada sesi tersisa
    assert.equal(fs.existsSync(path.join(tmpRoot, uploadId)), false);
    assert.equal((await c.get(`/api/upload/${uploadId}`)).status, 404);
    // Terindeks untuk pencarian
    const found = await c.get('/api/files/search?q=besar.bin');
    assert.deepEqual(
      found.body.entries.map((e) => e.path),
      ['Unggahan/besar.bin']
    );
  });

  test('konflik nama: keep-both → "(1)", replace → menimpa, skip → tidak menulis', async () => {
    // keep-both (default)
    let { uploadId } = (await init('besar.bin')).body;
    for (const n of [0, 1, 2]) await putChunk(uploadId, n);
    let done = await c.post(`/api/upload/${uploadId}/complete`, { conflict: 'keep-both' });
    assert.equal(done.body.file.name, 'besar (1).bin');

    // replace
    ({ uploadId } = (await init('besar.bin')).body);
    const altered = Buffer.from(content);
    altered[0] = 7;
    for (const n of [0, 1, 2]) await putChunk(uploadId, n, altered.subarray(n * CHUNK, Math.min((n + 1) * CHUNK, altered.length)));
    done = await c.post(`/api/upload/${uploadId}/complete`, { conflict: 'replace' });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.file.name, 'besar.bin');
    assert.equal(fs.readFileSync(path.join(adminRoot, 'Unggahan', 'besar.bin'))[0], 7);

    // skip
    ({ uploadId } = (await init('besar.bin')).body);
    for (const n of [0, 1, 2]) await putChunk(uploadId, n);
    done = await c.post(`/api/upload/${uploadId}/complete`, { conflict: 'skip' });
    assert.equal(done.status, 200);
    assert.equal(done.body.skipped, true);
    assert.equal(fs.readdirSync(path.join(adminRoot, 'Unggahan')).filter((n) => n.startsWith('besar')).length, 2);
  });

  test('chunk yang lebih besar dari chunkSize ditolak dan tidak disimpan', async () => {
    const { uploadId } = (await init('x.bin')).body;
    const res = await putChunk(uploadId, 0, Buffer.alloc(CHUNK + 10, 1));
    assert.equal(res.status, 413);
    assert.deepEqual((await c.get(`/api/upload/${uploadId}`)).body.received, []);
  });

  test('indeks chunk di luar jangkauan ditolak 400; id yang tidak ada → 404', async () => {
    const { uploadId } = (await init('y.bin')).body;
    assert.equal((await putChunk(uploadId, 3, Buffer.alloc(10))).status, 400);
    assert.equal((await putChunk('bukan-id', 0, Buffer.alloc(10))).status, 404);
  });

  test('init ditolak 413 jika ukuran melebihi sisa kuota, dan 413 jika melebihi batas per file', async () => {
    // Isi penyimpanan hingga sisa < 300 KB (kuota tes 2 MB), lalu minta 300 KB
    const big = Buffer.alloc(900 * 1024, 'z').toString();
    await c.upload('', 'isi1.bin', big);
    await c.upload('', 'isi2.bin', big);
    const res = await init('raksasa.bin', { size: 300 * 1024 });
    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'QUOTA_EXCEEDED');
    assert.ok(DEFAULT_QUOTA_BYTES > 0);
    const res2 = await init('raksasa2.bin', { size: 1024 * 1024 + 1 }); // MAX_UPLOAD_BYTES tes = 1 MB
    assert.equal(res2.status, 413);
    assert.equal(res2.body.code, 'FILE_TOO_LARGE');
  });

  test('DELETE /upload/:id membatalkan dan membersihkan folder sementara', async () => {
    const { uploadId } = (await init('batal.bin')).body;
    await putChunk(uploadId, 0);
    assert.ok(fs.existsSync(path.join(tmpRoot, uploadId)));
    assert.equal((await c.del(`/api/upload/${uploadId}`)).status, 200);
    assert.equal(fs.existsSync(path.join(tmpRoot, uploadId)), false);
    assert.equal((await c.get(`/api/upload/${uploadId}`)).status, 404);
  });

  test('upload multipart biasa menghormati ?conflict=replace dan skip', async () => {
    await c.upload('', 'kecil.txt', 'lama');
    const r1 = await c.upload('?conflict=replace'.slice(0, 0), 'kecil.txt', 'baru'); // tanpa conflict → keep-both
    assert.equal(r1.body.files[0].name, 'kecil (1).txt');
    const rep = await c.post('/api/files/upload?path=&conflict=replace', undefined).attach('files', Buffer.from('ganti'), 'kecil.txt');
    assert.equal(rep.status, 200);
    assert.equal(fs.readFileSync(path.join(adminRoot, 'kecil.txt'), 'utf8'), 'ganti');
    const skip = await c.post('/api/files/upload?path=&conflict=skip', undefined).attach('files', Buffer.from('abaikan'), 'kecil.txt');
    assert.equal(skip.status, 200);
    assert.equal(skip.body.skipped.length, 1);
    assert.equal(fs.readFileSync(path.join(adminRoot, 'kecil.txt'), 'utf8'), 'ganti');
  });
});
