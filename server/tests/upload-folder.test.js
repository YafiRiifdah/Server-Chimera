import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../src/index.js';
import { INITIAL_ADMIN, STORAGE_ROOT } from '../src/config.js';

describe('Upload folder: struktur sub-folder dipertahankan', () => {
  let cookie;
  const adminRoot = path.join(STORAGE_ROOT, 'users', INITIAL_ADMIN.username);

  before(async () => {
    const res = await request(app).post('/api/auth/login').send({ username: INITIAL_ADMIN.username, password: INITIAL_ADMIN.password });
    cookie = res.headers['set-cookie'][0].split(';')[0];
    await request(app).post('/api/files/mkdir').set('Cookie', cookie).send({ path: '', name: 'Proyek' });
  });

  test('file dengan path relatif ditempatkan di sub-folder yang dibuat otomatis', async () => {
    const res = await request(app)
      .post('/api/files/upload?path=Proyek')
      .set('Cookie', cookie)
      .field('relativePaths', JSON.stringify(['Foto/2024/a.txt', 'Foto/b.txt']))
      .attach('files', Buffer.from('isi a'), 'a.txt')
      .attach('files', Buffer.from('isi b'), 'b.txt');

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      res.body.files.map((f) => f.path),
      ['Proyek/Foto/2024/a.txt', 'Proyek/Foto/b.txt']
    );
    assert.equal(fs.readFileSync(path.join(adminRoot, 'Proyek', 'Foto', '2024', 'a.txt'), 'utf8'), 'isi a');
    assert.equal(fs.readFileSync(path.join(adminRoot, 'Proyek', 'Foto', 'b.txt'), 'utf8'), 'isi b');
  });

  test('path relatif dengan traversal ditolak dan tidak ada file yang ditulis', async () => {
    const res = await request(app)
      .post('/api/files/upload?path=Proyek')
      .set('Cookie', cookie)
      .field('relativePaths', JSON.stringify(['../../jahat.txt']))
      .attach('files', Buffer.from('x'), 'jahat.txt');

    assert.ok(res.status === 400 || res.status === 403, `status ${res.status}`);
    assert.equal(fs.existsSync(path.join(STORAGE_ROOT, 'users', 'jahat.txt')), false);
    assert.equal(fs.existsSync(path.join(adminRoot, 'jahat.txt')), false);
    assert.deepEqual(fs.readdirSync(path.join(STORAGE_ROOT, '.chimera', 'tmp')), []);
  });

  test('tanpa relativePaths, file tetap jatuh ke folder tujuan (perilaku lama)', async () => {
    const res = await request(app).post('/api/files/upload?path=Proyek').set('Cookie', cookie).attach('files', Buffer.from('c'), 'c.txt');
    assert.equal(res.status, 200);
    assert.equal(res.body.files[0].path, 'Proyek/c.txt');
  });
});
