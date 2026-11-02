import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/index.js';
import { loginAdmin, loginAs, createUser, client } from './helpers.js';
import fs from 'fs';
import path from 'path';
import { INITIAL_ADMIN, STORAGE_ROOT } from '../src/config.js';

describe('Admin dan sesi aktif', () => {
  let admin, dewi;

  before(async () => {
    createUser('dewi', 'rahasia123');
    admin = client(await loginAdmin());
    dewi = client(await loginAs('dewi', 'rahasia123'));
    await dewi.upload('', 'file.txt', 'isi dewi');
  });

  test('endpoint admin menolak user biasa (403) dan tanpa login (401)', async () => {
    assert.equal((await dewi.get('/api/admin/users')).status, 403);
    assert.equal((await request(app).get('/api/admin/users')).status, 401);
  });

  test('GET /admin/users memuat pemakaian, kuota, status, terakhir login', async () => {
    const res = await admin.get('/api/admin/users');
    assert.equal(res.status, 200);
    const d = res.body.users.find((u) => u.username === 'dewi');
    assert.equal(d.usedBytes, 8);
    assert.equal(d.quotaBytes, 2 * 1024 * 1024);
    assert.equal(d.disabled, false);
    assert.ok(d.lastLoginAt);
    assert.equal(d.passwordHash, undefined);
  });

  test('POST /admin/users membuat user baru; validasi username dan password', async () => {
    const ok = await admin.post('/api/admin/users', {
      username: 'eko',
      password: 'sandi-eko-1',
      displayName: 'Eko',
      quotaBytes: 1024 * 1024
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.user.username, 'eko');
    const eko = await loginAs('eko', 'sandi-eko-1');
    assert.ok(eko);
    assert.equal((await admin.post('/api/admin/users', { username: 'eko', password: 'sandi-eko-1' })).status, 409);
    assert.equal((await admin.post('/api/admin/users', { username: 'nama salah!', password: 'sandi-eko-1' })).status, 400);
    assert.equal((await admin.post('/api/admin/users', { username: 'fajar', password: 'pendek' })).status, 400);
  });

  test('PATCH /admin/users/:id menonaktifkan user (login ditolak) dan mengubah kuota', async () => {
    const users = (await admin.get('/api/admin/users')).body.users;
    const d = users.find((u) => u.username === 'dewi');
    assert.equal((await admin.patch(`/api/admin/users/${d.id}`, { disabled: true })).status, 200);
    const login = await request(app).post('/api/auth/login').send({ username: 'dewi', password: 'rahasia123' });
    assert.equal(login.status, 403);
    // Sesi lama dewi diakhiri saat dinonaktifkan → 401
    assert.equal((await dewi.get('/api/auth/me')).status, 401);
    assert.equal((await admin.patch(`/api/admin/users/${d.id}`, { disabled: false, quotaBytes: 5 * 1024 * 1024 })).status, 200);
    const again = (await admin.get('/api/admin/users')).body.users.find((u) => u.username === 'dewi');
    assert.equal(again.quotaBytes, 5 * 1024 * 1024);
    assert.equal(again.disabled, false);
  });

  test('admin tidak bisa menonaktifkan dirinya sendiri', async () => {
    const me = (await admin.get('/api/admin/users')).body.users.find((u) => u.username === INITIAL_ADMIN.username);
    assert.equal((await admin.patch(`/api/admin/users/${me.id}`, { disabled: true })).status, 400);
  });

  test('POST /admin/users/:id/reset-password mengganti sandi dan mengakhiri sesi user itu', async () => {
    const d = (await admin.get('/api/admin/users')).body.users.find((u) => u.username === 'dewi');
    const dewi2 = client(await loginAs('dewi', 'rahasia123'));
    assert.equal((await admin.post(`/api/admin/users/${d.id}/reset-password`, { password: 'sandi-baru-1' })).status, 200);
    assert.equal((await dewi2.get('/api/auth/me')).status, 401);
    assert.ok(await loginAs('dewi', 'sandi-baru-1'));
  });

  test('GET /admin/stats, /admin/shares, /admin/activity, POST /admin/reindex', async () => {
    const stats = await admin.get('/api/admin/stats');
    assert.equal(stats.status, 200);
    assert.ok(typeof stats.body.diskFree === 'number');
    assert.ok(typeof stats.body.diskTotal === 'number');
    assert.ok(stats.body.usersCount >= 3);
    assert.ok(typeof stats.body.usedBytes === 'number');

    await dewi.upload('', 'bagi.txt', 'x').catch(() => {});
    const dewi3 = client(await loginAs('dewi', 'sandi-baru-1'));
    await dewi3.upload('', 'bagi.txt', 'x');
    await dewi3.post('/api/shares', { path: 'bagi.txt', type: 'link' });
    const shares = await admin.get('/api/admin/shares');
    assert.equal(shares.status, 200);
    assert.ok(shares.body.shares.some((s) => s.ownerUsername === 'dewi' && s.path === 'bagi.txt'));

    const activity = await admin.get('/api/admin/activity?limit=50');
    assert.equal(activity.status, 200);
    assert.ok(activity.body.entries.some((a) => a.username === 'dewi' && a.action === 'upload'));
    assert.ok(activity.body.entries.some((a) => a.action === 'login'));

    const re = await admin.post('/api/admin/reindex');
    assert.equal(re.status, 200);
    assert.ok(re.body.indexed.dewi >= 1);
  });

  test('DELETE /admin/users/:id menghapus pengguna, mengarsipkan foldernya, menolak hapus diri sendiri', async () => {
    const eko = client(await loginAs('eko', 'sandi-eko-1'));
    await eko.upload('', 'punya-eko.txt', 'isi');
    const e = (await admin.get('/api/admin/users')).body.users.find((u) => u.username === 'eko');
    const res = await admin.del(`/api/admin/users/${e.id}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.archived, true);
    // Sesi eko berakhir, login ditolak, tidak ada lagi di daftar
    assert.equal((await eko.get('/api/auth/me')).status, 401);
    const login = await request(app).post('/api/auth/login').send({ username: 'eko', password: 'sandi-eko-1' });
    assert.equal(login.status, 401);
    assert.ok(!(await admin.get('/api/admin/users')).body.users.some((u) => u.username === 'eko'));
    // Folder dipindahkan ke arsip, bukan dihapus
    assert.ok(!fs.existsSync(path.join(STORAGE_ROOT, 'users', 'eko')));
    const archive = path.join(STORAGE_ROOT, '.chimera', 'deleted-users');
    const entry = fs.readdirSync(archive).find((n) => n.startsWith('eko-'));
    assert.ok(entry);
    assert.ok(fs.existsSync(path.join(archive, entry, 'punya-eko.txt')));
    // Tidak bisa menghapus diri sendiri; id tak dikenal → 404
    const me = (await admin.get('/api/admin/users')).body.users.find((u) => u.username === INITIAL_ADMIN.username);
    assert.equal((await admin.del(`/api/admin/users/${me.id}`)).status, 400);
    assert.equal((await admin.del('/api/admin/users/999999')).status, 404);
  });

  test('GET /auth/sessions menampilkan sesi aktif dengan penanda current; DELETE mengakhiri sesi lain', async () => {
    const a1 = client(await loginAs('dewi', 'sandi-baru-1'));
    const a2 = client(await loginAs('dewi', 'sandi-baru-1'));
    const list = await a1.get('/api/auth/sessions');
    assert.equal(list.status, 200);
    assert.ok(list.body.sessions.length >= 2);
    const current = list.body.sessions.find((s) => s.current);
    assert.ok(current);
    const other = list.body.sessions.find((s) => !s.current);
    assert.equal((await a1.del(`/api/auth/sessions/${other.id}`)).status, 200);
    // Sesi yang dihapus tidak berlaku lagi (a2 mungkin yang terhapus)
    const after = await a1.get('/api/auth/sessions');
    assert.ok(!after.body.sessions.some((s) => s.id === other.id));
    void a2;
  });
});
