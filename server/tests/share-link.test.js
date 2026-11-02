import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { loginAdmin, client, anon } from './helpers.js';
import { getDb } from '../src/db.js';

describe('Berbagi lewat link publik (/s/:token)', () => {
  let c;

  before(async () => {
    c = client(await loginAdmin());
    await c.mkdir('', 'Publik');
    await c.mkdir('Publik', 'Sub');
    await c.upload('Publik', 'a.txt', 'isi a');
    await c.upload('Publik/Sub', 'b.txt', 'isi b');
    await c.upload('', 'rahasia.txt', 'jangan bocor');
    await c.upload('', 'laporan.txt', 'laporan');
  });

  test('POST /shares membuat link; token dikirim sekali dan disimpan sebagai hash', async () => {
    const res = await c.post('/api/shares', { path: 'laporan.txt', type: 'link' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.share.token.length >= 32);
    assert.match(res.body.share.url, /\/s\/[A-Za-z0-9_-]+$/);
    assert.equal(res.body.share.permission, 'download');
    const row = getDb().prepare('SELECT token FROM shares WHERE id = ?').get(res.body.share.id);
    assert.notEqual(row.token, res.body.share.token, 'token mentah tidak boleh tersimpan');
    assert.equal(row.token.length, 64); // sha256 hex
  });

  test('GET /shares mengembalikan link saya dengan url (dari token terenkripsi) tanpa hash; GET /files menandai shared=true', async () => {
    const created = (await c.post('/api/shares', { path: 'laporan.txt', type: 'link' })).body.share;
    const res = await c.get('/api/shares');
    assert.equal(res.status, 200);
    const s = res.body.shares.find((x) => x.id === created.id);
    assert.ok(s);
    assert.equal(s.token, undefined);
    assert.equal(s.url, created.url, 'pemilik harus bisa menyalin link lagi');
    const entries = await c.list();
    assert.equal(entries.find((e) => e.name === 'laporan.txt').shared, true);
    assert.equal(entries.find((e) => e.name === 'rahasia.txt').shared, false);
  });

  test('halaman publik: info, raw inline, download menambah hitungan', async () => {
    const { share } = (await c.post('/api/shares', { path: 'laporan.txt', type: 'link' })).body;
    const info = await anon.get(`/s/${share.token}/info`);
    assert.equal(info.status, 200, JSON.stringify(info.body));
    assert.equal(info.body.name, 'laporan.txt');
    assert.equal(info.body.type, 'file');
    assert.equal(info.body.size, 7);
    assert.equal(info.body.requiresPassword, false);

    const raw = await anon.get(`/s/${share.token}/raw`);
    assert.equal(raw.status, 200);
    assert.equal(raw.text, 'laporan');

    await anon.get(`/s/${share.token}/raw?dl=1`);
    const mine = (await c.get('/api/shares')).body.shares.find((x) => x.id === share.id);
    assert.equal(mine.downloadCount, 1);
  });

  test('token salah → 404; link yang dicabut → 404', async () => {
    assert.equal((await anon.get('/s/bukan-token/info')).status, 404);
    const { share } = (await c.post('/api/shares', { path: 'laporan.txt', type: 'link' })).body;
    assert.equal((await c.del(`/api/shares/${share.id}`)).status, 200);
    assert.equal((await anon.get(`/s/${share.token}/info`)).status, 404);
  });

  test('kedaluwarsa → 410 SHARE_EXPIRED', async () => {
    const { share } = (await c.post('/api/shares', { path: 'laporan.txt', type: 'link', expiresIn: '1d' })).body;
    assert.ok(share.expiresAt);
    getDb().prepare("UPDATE shares SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(share.id);
    const res = await anon.get(`/s/${share.token}/info`);
    assert.equal(res.status, 410);
    assert.equal(res.body.code, 'SHARE_EXPIRED');
  });

  test('batas download: setelah tercapai → 410 SHARE_LIMIT', async () => {
    const { share } = (await c.post('/api/shares', { path: 'laporan.txt', type: 'link', maxDownloads: 1 })).body;
    assert.equal((await anon.get(`/s/${share.token}/raw?dl=1`)).status, 200);
    const res = await anon.get(`/s/${share.token}/raw?dl=1`);
    assert.equal(res.status, 410);
    assert.equal(res.body.code, 'SHARE_LIMIT');
  });

  test('izin "view": pratinjau boleh, download dan zip ditolak 403', async () => {
    const { share } = (await c.post('/api/shares', { path: 'Publik', type: 'link', permission: 'view' })).body;
    assert.equal((await anon.get(`/s/${share.token}/raw?path=a.txt`)).status, 200);
    assert.equal((await anon.get(`/s/${share.token}/raw?path=a.txt&dl=1`)).status, 403);
    assert.equal((await anon.get(`/s/${share.token}/zip`)).status, 403);
  });

  test('password: info melapor requiresPassword, unlock salah 401, unlock benar memberi cookie akses', async () => {
    const { share } = (await c.post('/api/shares', { path: 'laporan.txt', type: 'link', password: 'kunci123' })).body;
    const info = await anon.get(`/s/${share.token}/info`);
    assert.equal(info.status, 200);
    assert.equal(info.body.requiresPassword, true);
    assert.equal(info.body.unlocked, false);
    assert.equal(info.body.size, undefined, 'detail tidak bocor sebelum unlock');

    assert.equal((await anon.get(`/s/${share.token}/raw`)).status, 401);
    assert.equal((await anon.post(`/s/${share.token}/unlock`, { password: 'salah' })).status, 401);

    const ok = await anon.post(`/s/${share.token}/unlock`, { password: 'kunci123' });
    assert.equal(ok.status, 200);
    const cookie = ok.headers['set-cookie'][0].split(';')[0];
    const raw = await anon.get(`/s/${share.token}/raw`).set('Cookie', cookie);
    assert.equal(raw.status, 200);
    assert.equal(raw.text, 'laporan');
    const info2 = await anon.get(`/s/${share.token}/info`).set('Cookie', cookie);
    assert.equal(info2.body.unlocked, true);
    assert.equal(info2.body.size, 7);
  });

  test('folder publik: jelajah sub-folder, zip seluruh folder, traversal ditolak', async () => {
    const { share } = (await c.post('/api/shares', { path: 'Publik', type: 'link' })).body;
    const root = await anon.get(`/s/${share.token}/info`);
    assert.equal(root.body.type, 'folder');
    assert.deepEqual(
      root.body.entries.map((e) => e.name),
      ['Sub', 'a.txt']
    );
    const sub = await anon.get(`/s/${share.token}/info?path=Sub`);
    assert.deepEqual(
      sub.body.entries.map((e) => e.name),
      ['b.txt']
    );
    assert.equal((await anon.get(`/s/${share.token}/raw?path=Sub/b.txt`)).text, 'isi b');

    const zip = await anon
      .get(`/s/${share.token}/zip`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (d) => chunks.push(d));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    assert.equal(zip.status, 200);
    assert.match(zip.headers['content-disposition'], /filename="Publik\.zip"/);
    assert.ok(zip.body.toString('latin1').includes('Publik/Sub/b.txt'));

    assert.equal((await anon.get(`/s/${share.token}/raw?path=../rahasia.txt`)).status, 403);
    assert.equal((await anon.get(`/s/${share.token}/info?path=../`)).status, 403);
  });

  test('PATCH /shares/:id mengubah izin dan kedaluwarsa; hanya pemilik yang bisa', async () => {
    const { share } = (await c.post('/api/shares', { path: 'laporan.txt', type: 'link' })).body;
    const res = await c.patch(`/api/shares/${share.id}`, { permission: 'view', expiresIn: 'never', password: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.share.permission, 'view');
    assert.equal(res.body.share.expiresAt, null);
    assert.equal((await c.patch('/api/shares/999999', { permission: 'view' })).status, 404);
  });

  test('membagikan path yang tidak ada → 404; path sistem → 403', async () => {
    assert.equal((await c.post('/api/shares', { path: 'tidak-ada.txt', type: 'link' })).status, 404);
    assert.equal((await c.post('/api/shares', { path: '.trash', type: 'link' })).status, 403);
  });
});
