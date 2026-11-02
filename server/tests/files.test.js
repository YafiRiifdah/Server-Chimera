import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from '../src/index.js';
import { INITIAL_ADMIN, STORAGE_ROOT, DATA_DIR } from '../src/config.js';

describe('API Integration Test: Auth & File Operations', () => {
  let authCookie = null;
  const adminRoot = path.join(STORAGE_ROOT, 'users', INITIAL_ADMIN.username);

  before(() => {
    // PENJAGA: tes ini menghapus folder admin, jadi hanya boleh berjalan di folder sementara.
    // Tanpa ini, menjalankan `npm test` di server produksi akan menghapus Drive admin sungguhan.
    const tmp = fs.realpathSync(os.tmpdir());
    assert.ok(
      fs.realpathSync(path.dirname(STORAGE_ROOT)).startsWith(tmp),
      `STORAGE_ROOT tes harus berada di folder sementara, bukan ${STORAGE_ROOT}`
    );
    assert.ok(fs.realpathSync(path.dirname(DATA_DIR)).startsWith(tmp), `DATA_DIR tes harus berada di folder sementara, bukan ${DATA_DIR}`);

    // Pastikan user root admin bersih untuk pengujian
    if (fs.existsSync(adminRoot)) {
      fs.rmSync(adminRoot, { recursive: true, force: true });
    }
  });

  after(() => {
    if (fs.existsSync(adminRoot)) {
      fs.rmSync(adminRoot, { recursive: true, force: true });
    }
  });

  test('1. POST /api/auth/login dengan kredensial salah menghasilkan 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: INITIAL_ADMIN.username, password: 'wrongpassword' });

    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_CREDENTIALS');
  });

  test('2. POST /api/auth/login dengan kredensial benar menghasilkan cookie sesi', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: INITIAL_ADMIN.username, password: INITIAL_ADMIN.password });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, INITIAL_ADMIN.username);

    const cookies = res.headers['set-cookie'];
    assert.ok(cookies, 'Harus mengembalikan set-cookie');
    authCookie = cookies[0].split(';')[0];
    assert.ok(authCookie.startsWith('chimera_session='));
  });

  test('3. GET /api/auth/me mengembalikan profil pengguna yang terautentikasi', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', authCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, INITIAL_ADMIN.username);
  });

  test('4. POST /api/files/mkdir membuat folder baru', async () => {
    const res = await request(app).post('/api/files/mkdir').set('Cookie', authCookie).send({ path: '', name: 'Proyek Chimera' });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.folder.name, 'Proyek Chimera');

    // Verifikasi folder fisik benar-benar ada di disk
    const diskPath = path.join(adminRoot, 'Proyek Chimera');
    assert.ok(fs.existsSync(diskPath), 'Folder harus ada di filesystem fisik');
  });

  test('5. POST /api/files/upload mengunggah file ke dalam folder', async () => {
    const sampleContent = 'Ini adalah berkas teks pengujian Chimera';
    const sampleBuffer = Buffer.from(sampleContent, 'utf-8');

    const res = await request(app)
      .post('/api/files/upload?path=Proyek%20Chimera')
      .set('Cookie', authCookie)
      .attach('files', sampleBuffer, 'catatan.txt');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.files.length, 1);
    assert.equal(res.body.files[0].name, 'catatan.txt');

    // Verifikasi fisik di disk
    const diskFile = path.join(adminRoot, 'Proyek Chimera', 'catatan.txt');
    assert.ok(fs.existsSync(diskFile), 'File harus tersimpan secara fisik di disk');
    assert.equal(fs.readFileSync(diskFile, 'utf8'), sampleContent);
  });

  test('6. GET /api/files membaca isi folder', async () => {
    const res = await request(app).get('/api/files?path=Proyek%20Chimera').set('Cookie', authCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.entries.length, 1);
    assert.equal(res.body.entries[0].name, 'catatan.txt');
    assert.equal(res.body.entries[0].type, 'file');
  });

  test('7. GET /api/files/raw membaca konten file dan mendukung Range request', async () => {
    // Permintaan normal
    const fullRes = await request(app).get('/api/files/raw?path=Proyek%20Chimera/catatan.txt').set('Cookie', authCookie);

    assert.equal(fullRes.status, 200);
    assert.equal(fullRes.text, 'Ini adalah berkas teks pengujian Chimera');
    assert.equal(fullRes.headers['x-content-type-options'], 'nosniff');

    // Permintaan Range
    const rangeRes = await request(app)
      .get('/api/files/raw?path=Proyek%20Chimera/catatan.txt')
      .set('Cookie', authCookie)
      .set('Range', 'bytes=0-2');

    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.text, 'Ini');
  });

  test('8. POST /api/files/rename mengganti nama file', async () => {
    const res = await request(app)
      .post('/api/files/rename')
      .set('Cookie', authCookie)
      .send({ path: 'Proyek Chimera/catatan.txt', name: 'catatan_final.txt' });

    assert.equal(res.status, 200);
    assert.equal(res.body.item.name, 'catatan_final.txt');

    const oldDisk = path.join(adminRoot, 'Proyek Chimera', 'catatan.txt');
    const newDisk = path.join(adminRoot, 'Proyek Chimera', 'catatan_final.txt');
    assert.equal(fs.existsSync(oldDisk), false);
    assert.equal(fs.existsSync(newDisk), true);
  });

  test('9. DELETE /api/files memindahkan item ke Sampah (.trash)', async () => {
    const res = await request(app)
      .delete('/api/files')
      .set('Cookie', authCookie)
      .send({ paths: ['Proyek Chimera/catatan_final.txt'] });

    assert.equal(res.status, 200);
    assert.equal(res.body.deleted, 1);

    const activeDisk = path.join(adminRoot, 'Proyek Chimera', 'catatan_final.txt');
    assert.equal(fs.existsSync(activeDisk), false);

    const trashDir = path.join(adminRoot, '.trash');
    assert.ok(fs.existsSync(trashDir));
    const trashFiles = fs.readdirSync(trashDir);
    assert.equal(trashFiles.length, 1);
  });

  test('10. GET /api/files/usage mengembalikan kuota dan disk free', async () => {
    const res = await request(app).get('/api/files/usage').set('Cookie', authCookie);

    assert.equal(res.status, 200);
    assert.ok(typeof res.body.used === 'number');
    assert.ok(typeof res.body.quota === 'number');
    assert.ok(typeof res.body.diskFree === 'number');
  });

  test('11. POST /api/auth/logout menghapus sesi', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', authCookie);

    assert.equal(res.status, 200);

    // Permintaan selanjutnya harus ditolak 401
    const checkRes = await request(app).get('/api/auth/me').set('Cookie', authCookie);

    assert.equal(checkRes.status, 401);
  });
});
