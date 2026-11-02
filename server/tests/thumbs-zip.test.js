import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import request from 'supertest';
import { app } from '../src/index.js';
import { loginAdmin, client } from './helpers.js';
import { STORAGE_ROOT } from '../src/config.js';

describe('Thumbnail dan Zip', () => {
  let c, cookie;
  const thumbsDir = path.join(STORAGE_ROOT, '.chimera', 'thumbs');

  before(async () => {
    cookie = await loginAdmin();
    c = client(cookie);
    await c.mkdir('', 'Album');
    await c.mkdir('Album', 'sub');
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#ff0000' } })
      .png()
      .toBuffer();
    await request(app).post('/api/files/upload?path=Album').set('Cookie', cookie).attach('files', png, 'merah.png');
    await c.upload('Album', 'a.txt', 'A');
    await c.upload('Album/sub', 'b.txt', 'B');
    await c.upload('', 'c.txt', 'C');
  });

  test('GET /files/thumb menghasilkan JPEG berukuran sesuai dan menyimpannya di cache', async () => {
    const res = await request(app)
      .get('/api/files/thumb?path=Album/merah.png&w=32')
      .set('Cookie', cookie)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (d) => chunks.push(d));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    const meta = await sharp(res.body).metadata();
    assert.equal(meta.width, 32);
    assert.equal(meta.height, 24);
    assert.ok(
      fs.readdirSync(thumbsDir).some((n) => n.endsWith('.jpg')),
      'thumbnail harus di-cache'
    );
  });

  test('thumb untuk tipe yang tidak didukung → 404', async () => {
    const res = await c.get('/api/files/thumb?path=Album/a.txt&w=128');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'THUMB_UNSUPPORTED');
  });

  test('thumb menolak path traversal', async () => {
    const res = await c.get('/api/files/thumb?path=../x.png');
    assert.equal(res.status, 403);
  });

  test('GET /files/zip mengalirkan zip berisi folder (rekursif) dan file', async () => {
    const paths = encodeURIComponent(JSON.stringify(['Album', 'c.txt']));
    const res = await request(app)
      .get(`/api/files/zip?paths=${paths}`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (d) => chunks.push(d));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/zip');
    assert.match(res.headers['content-disposition'], /attachment; filename="Chimera-\d{4}-\d{2}-\d{2}\.zip"/);
    assert.equal(res.body.subarray(0, 4).toString('latin1'), 'PK\u0003\u0004');
    const text = res.body.toString('latin1');
    for (const name of ['Album/merah.png', 'Album/a.txt', 'Album/sub/b.txt', 'c.txt']) {
      assert.ok(text.includes(name), `zip harus memuat ${name}`);
    }
  });

  test('zip satu folder dinamai sesuai folder', async () => {
    const res = await request(app)
      .get(`/api/files/zip?paths=${encodeURIComponent('["Album"]')}`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (d) => chunks.push(d));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-disposition'], /filename="Album\.zip"/);
  });

  test('zip menolak path traversal dan daftar kosong', async () => {
    assert.equal((await c.get(`/api/files/zip?paths=${encodeURIComponent('["../x"]')}`)).status, 403);
    assert.equal((await c.get('/api/files/zip?paths=[]')).status, 400);
  });
});
