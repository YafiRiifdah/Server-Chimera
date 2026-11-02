import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { loginAdmin, loginAs, createUser, client } from './helpers.js';
import { STORAGE_ROOT, INITIAL_ADMIN } from '../src/config.js';

describe('Berbagi ke pengguna lain (Dibagikan kepada saya)', () => {
  let owner, budi, shareId;
  const adminRoot = path.join(STORAGE_ROOT, 'users', INITIAL_ADMIN.username);

  before(async () => {
    createUser('budi', 'rahasia123');
    createUser('citra', 'rahasia123');
    owner = client(await loginAdmin());
    budi = client(await loginAs('budi', 'rahasia123'));
    await owner.mkdir('', 'Tim');
    await owner.mkdir('Tim', 'Desain');
    await owner.upload('Tim', 'brief.txt', 'brief tim');
    await owner.upload('Tim/Desain', 'logo.txt', 'logo');
    await owner.upload('', 'pribadi.txt', 'milik admin');
  });

  test('GET /users/list menampilkan pengguna lain untuk pemilih berbagi (tanpa data sensitif)', async () => {
    const res = await owner.get('/api/users/list');
    assert.equal(res.status, 200);
    const names = res.body.users.map((u) => u.username).sort();
    assert.deepEqual(names, ['budi', 'citra']);
    assert.equal(res.body.users[0].password_hash, undefined);
  });

  test('POST /shares type=user membuat berbagi "view"; penerima melihatnya di /shared-with-me', async () => {
    const res = await owner.post('/api/shares', { path: 'Tim', type: 'user', targetUsername: 'budi', permission: 'view' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    shareId = res.body.share.id;
    assert.equal(res.body.share.targetUsername, 'budi');

    const mine = await budi.get('/api/shared-with-me');
    assert.equal(mine.status, 200);
    assert.equal(mine.body.entries.length, 1);
    const e = mine.body.entries[0];
    assert.equal(e.name, 'Tim');
    assert.equal(e.type, 'folder');
    assert.equal(e.ownerUsername, INITIAL_ADMIN.username);
    assert.equal(e.permission, 'view');
    assert.equal(e.shareId, shareId);

    // Pengguna lain tidak melihatnya
    const citra = client(await loginAs('citra', 'rahasia123'));
    assert.deepEqual((await citra.get('/api/shared-with-me')).body.entries, []);
  });

  test('berbagi ke diri sendiri atau user yang tidak ada ditolak', async () => {
    assert.equal((await owner.post('/api/shares', { path: 'Tim', type: 'user', targetUsername: INITIAL_ADMIN.username })).status, 400);
    assert.equal((await owner.post('/api/shares', { path: 'Tim', type: 'user', targetUsername: 'tidakada' })).status, 404);
  });

  test('penerima bisa menjelajah dan membaca di dalam folder yang dibagikan', async () => {
    const root = await budi.get(`/api/shared/${shareId}/files?path=`);
    assert.equal(root.status, 200, JSON.stringify(root.body));
    assert.deepEqual(
      root.body.entries.map((e) => e.name),
      ['Desain', 'brief.txt']
    );
    const sub = await budi.get(`/api/shared/${shareId}/files?path=Desain`);
    assert.deepEqual(
      sub.body.entries.map((e) => e.name),
      ['logo.txt']
    );
    const raw = await budi.get(`/api/shared/${shareId}/raw?path=Desain/logo.txt`);
    assert.equal(raw.status, 200);
    assert.equal(raw.text, 'logo');
    const zip = await budi.get(`/api/shared/${shareId}/zip?paths=${encodeURIComponent('["Desain"]')}`);
    assert.equal(zip.status, 200);
  });

  test('penerima tidak bisa keluar dari folder yang dibagikan', async () => {
    assert.equal((await budi.get(`/api/shared/${shareId}/raw?path=../pribadi.txt`)).status, 403);
    assert.equal((await budi.get(`/api/shared/${shareId}/files?path=..`)).status, 403);
    // Pengguna yang bukan penerima tidak bisa memakai shareId
    const citra = client(await loginAs('citra', 'rahasia123'));
    assert.equal((await citra.get(`/api/shared/${shareId}/files?path=`)).status, 404);
  });

  test('izin "view": upload/mkdir/rename/hapus ditolak 403', async () => {
    const up = await budi.post(`/api/shared/${shareId}/upload?path=`, undefined).attach('files', Buffer.from('x'), 'baru.txt');
    assert.equal(up.status, 403);
    assert.equal((await budi.post(`/api/shared/${shareId}/mkdir`, { path: '', name: 'Baru' })).status, 403);
    assert.equal((await budi.post(`/api/shared/${shareId}/rename`, { path: 'brief.txt', name: 'x.txt' })).status, 403);
    assert.equal((await budi.del(`/api/shared/${shareId}/files`, { paths: ['brief.txt'] })).status, 403);
  });

  test('izin "edit": upload, mkdir, rename, hapus (ke Sampah pemilik) berhasil', async () => {
    assert.equal((await owner.patch(`/api/shares/${shareId}`, { permission: 'edit' })).status, 200);

    const up = await budi.post(`/api/shared/${shareId}/upload?path=Desain`, undefined).attach('files', Buffer.from('ikon'), 'ikon.txt');
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(fs.readFileSync(path.join(adminRoot, 'Tim', 'Desain', 'ikon.txt'), 'utf8'), 'ikon');

    assert.equal((await budi.post(`/api/shared/${shareId}/mkdir`, { path: '', name: 'Draf' })).status, 200);
    assert.ok(fs.existsSync(path.join(adminRoot, 'Tim', 'Draf')));

    assert.equal((await budi.post(`/api/shared/${shareId}/rename`, { path: 'brief.txt', name: 'brief-v2.txt' })).status, 200);
    assert.ok(fs.existsSync(path.join(adminRoot, 'Tim', 'brief-v2.txt')));

    assert.equal((await budi.del(`/api/shared/${shareId}/files`, { paths: ['Draf'] })).status, 200);
    assert.equal(fs.existsSync(path.join(adminRoot, 'Tim', 'Draf')), false);
    const ownerTrash = (await owner.get('/api/trash')).body.entries.map((e) => e.name);
    assert.ok(ownerTrash.includes('Draf'));

    // Mengganti nama folder root yang dibagikan sendiri tidak boleh (bukan di dalam share)
    assert.equal((await budi.post(`/api/shared/${shareId}/rename`, { path: '', name: 'Lain' })).status, 403);
  });

  test('pemilik melihat shared=true dan daftar penerima; pencabutan menghilangkan akses', async () => {
    const entries = await owner.list();
    assert.equal(entries.find((e) => e.name === 'Tim').shared, true);
    const shares = (await owner.get('/api/shares')).body.shares.filter((s) => s.type === 'user');
    assert.equal(shares[0].targetUsername, 'budi');

    assert.equal((await owner.del(`/api/shares/${shareId}`)).status, 200);
    assert.deepEqual((await budi.get('/api/shared-with-me')).body.entries, []);
    assert.equal((await budi.get(`/api/shared/${shareId}/files?path=`)).status, 404);
  });

  test('jika folder asal dipindahkan ke Sampah, berbagi tidak muncul di penerima', async () => {
    const res = await owner.post('/api/shares', { path: 'Tim', type: 'user', targetUsername: 'budi', permission: 'view' });
    await owner.del('/api/files', { paths: ['Tim'] });
    assert.deepEqual((await budi.get('/api/shared-with-me')).body.entries, []);
    assert.equal((await budi.get(`/api/shared/${res.body.share.id}/files?path=`)).status, 404);
  });
});
