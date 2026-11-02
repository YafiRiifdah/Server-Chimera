import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../src/index.js';
import { INITIAL_ADMIN, STORAGE_ROOT, MAX_UPLOAD_BYTES, DEFAULT_QUOTA_BYTES } from '../src/config.js';

describe('API: kasus tepi operasi berkas', () => {
  let cookie;
  const adminRoot = path.join(STORAGE_ROOT, 'users', INITIAL_ADMIN.username);

  async function login() {
    const res = await request(app).post('/api/auth/login').send({ username: INITIAL_ADMIN.username, password: INITIAL_ADMIN.password });
    assert.equal(res.status, 200);
    return res.headers['set-cookie'][0].split(';')[0];
  }

  before(async () => {
    cookie = await login();
    await request(app).post('/api/files/mkdir').set('Cookie', cookie).send({ path: '', name: 'foo' });
    await request(app).post('/api/files/mkdir').set('Cookie', cookie).send({ path: '', name: 'foobar' });
    await request(app).post('/api/files/mkdir').set('Cookie', cookie).send({ path: 'foo', name: 'anak' });
  });

  test('memindahkan folder "foo" ke "foobar" diizinkan (bukan folder di dalam dirinya sendiri)', async () => {
    const res = await request(app)
      .post('/api/files/move')
      .set('Cookie', cookie)
      .send({ paths: ['foo'], to: 'foobar' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(fs.existsSync(path.join(adminRoot, 'foobar', 'foo')));
    // Kembalikan
    await request(app)
      .post('/api/files/move')
      .set('Cookie', cookie)
      .send({ paths: ['foobar/foo'], to: '' });
  });

  test('memindahkan folder ke dalam sub-foldernya sendiri ditolak', async () => {
    const res = await request(app)
      .post('/api/files/move')
      .set('Cookie', cookie)
      .send({ paths: ['foo'], to: 'foo/anak' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_MOVE');
  });

  test('range suffix "bytes=-3" mengembalikan 3 byte terakhir', async () => {
    await request(app).post('/api/files/upload?path=').set('Cookie', cookie).attach('files', Buffer.from('0123456789'), 'angka.txt');

    const res = await request(app).get('/api/files/raw?path=angka.txt').set('Cookie', cookie).set('Range', 'bytes=-3');
    assert.equal(res.status, 206);
    assert.equal(res.text, '789');
    assert.equal(res.headers['content-range'], 'bytes 7-9/10');
  });

  test('range dengan akhir melebihi ukuran file dipotong ke akhir file, bukan 416', async () => {
    const res = await request(app).get('/api/files/raw?path=angka.txt').set('Cookie', cookie).set('Range', 'bytes=5-999999');
    assert.equal(res.status, 206);
    assert.equal(res.text, '56789');
    assert.equal(res.headers['content-range'], 'bytes 5-9/10');
  });

  test('range dengan awal melebihi ukuran file mengembalikan 416', async () => {
    const res = await request(app).get('/api/files/raw?path=angka.txt').set('Cookie', cookie).set('Range', 'bytes=10-');
    assert.equal(res.status, 416);
  });

  test('nama file non-ASCII dipertahankan apa adanya', async () => {
    const name = 'Foto Liburan Café ñ 日本.txt';
    const res = await request(app).post('/api/files/upload?path=').set('Cookie', cookie).attach('files', Buffer.from('x'), name);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.files[0].name, name);
    assert.ok(fs.existsSync(path.join(adminRoot, name)));
  });

  test('file melebihi MAX_UPLOAD_BYTES ditolak dengan 413 FILE_TOO_LARGE', async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 'a');
    const res = await request(app).post('/api/files/upload?path=').set('Cookie', cookie).attach('files', big, 'besar.bin');
    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'FILE_TOO_LARGE');
    assert.equal(fs.existsSync(path.join(adminRoot, 'besar.bin')), false);
    // Tidak ada sisa file sementara
    assert.deepEqual(fs.readdirSync(path.join(STORAGE_ROOT, '.chimera', 'tmp')), []);
  });

  test('header X-Upload-Total-Size melebihi sisa kuota ditolak 413 QUOTA_EXCEEDED sebelum menerima isi', async () => {
    const res = await request(app)
      .post('/api/files/upload?path=')
      .set('Cookie', cookie)
      .set('X-Upload-Total-Size', String(DEFAULT_QUOTA_BYTES + 1))
      .attach('files', Buffer.from('kecil'), 'kecil.txt');
    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'QUOTA_EXCEEDED');
    assert.equal(fs.existsSync(path.join(adminRoot, 'kecil.txt')), false);
  });
});
