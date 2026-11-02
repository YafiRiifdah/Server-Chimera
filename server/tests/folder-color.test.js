import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/index.js';
import { INITIAL_ADMIN } from '../src/config.js';

describe('Warna folder (pola Google Drive)', () => {
  let cookie;
  const post = (url, body) => request(app).post(url).set('Cookie', cookie).send(body);
  const list = async (path = '') =>
    (
      await request(app)
        .get(`/api/files?path=${encodeURIComponent(path)}`)
        .set('Cookie', cookie)
    ).body.entries;

  before(async () => {
    const res = await request(app).post('/api/auth/login').send({ username: INITIAL_ADMIN.username, password: INITIAL_ADMIN.password });
    cookie = res.headers['set-cookie'][0].split(';')[0];
    await post('/api/files/mkdir', { path: '', name: 'Proyek' });
    await post('/api/files/mkdir', { path: 'Proyek', name: 'Anak' });
    await post('/api/files/mkdir', { path: '', name: 'Lain' });
    await request(app).post('/api/files/upload?path=').set('Cookie', cookie).attach('files', Buffer.from('x'), 'file.txt');
  });

  test('folder tanpa warna mengembalikan color null', async () => {
    const entries = await list();
    const proyek = entries.find((e) => e.name === 'Proyek');
    assert.equal(proyek.color, null);
  });

  test('POST /files/color mengatur warna folder dan muncul di daftar', async () => {
    const res = await post('/api/files/color', { path: 'Proyek', color: '#4986e7' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const entries = await list();
    assert.equal(entries.find((e) => e.name === 'Proyek').color, '#4986e7');
  });

  test('warna di luar palet ditolak 400', async () => {
    const res = await post('/api/files/color', { path: 'Proyek', color: '#123456' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_COLOR');
  });

  test('warna hanya untuk folder, bukan file', async () => {
    const res = await post('/api/files/color', { path: 'file.txt', color: '#4986e7' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'NOT_A_FOLDER');
  });

  test('warna ikut saat folder diganti nama, termasuk sub-folder di dalamnya', async () => {
    await post('/api/files/color', { path: 'Proyek/Anak', color: '#f83a22' });
    const res = await post('/api/files/rename', { path: 'Proyek', name: 'Proyek Baru' });
    assert.equal(res.status, 200);
    const root = await list();
    assert.equal(root.find((e) => e.name === 'Proyek Baru').color, '#4986e7');
    const inside = await list('Proyek Baru');
    assert.equal(inside.find((e) => e.name === 'Anak').color, '#f83a22');
  });

  test('warna ikut saat folder dipindahkan', async () => {
    const res = await post('/api/files/move', { paths: ['Proyek Baru'], to: 'Lain' });
    assert.equal(res.status, 200);
    const inside = await list('Lain');
    assert.equal(inside.find((e) => e.name === 'Proyek Baru').color, '#4986e7');
    const deeper = await list('Lain/Proyek Baru');
    assert.equal(deeper.find((e) => e.name === 'Anak').color, '#f83a22');
  });

  test('color null mengembalikan ke warna default', async () => {
    const res = await post('/api/files/color', { path: 'Lain/Proyek Baru', color: null });
    assert.equal(res.status, 200);
    const inside = await list('Lain');
    assert.equal(inside.find((e) => e.name === 'Proyek Baru').color, null);
  });
});
