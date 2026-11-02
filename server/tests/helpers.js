import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/index.js';
import { INITIAL_ADMIN } from '../src/config.js';
import { getDb } from '../src/db.js';

/** Login; mengembalikan cookie sesi. */
export async function loginAs(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login ${username} gagal: ${res.status} ${JSON.stringify(res.body)}`);
  return res.headers['set-cookie'][0].split(';')[0];
}

export async function loginAdmin() {
  return loginAs(INITIAL_ADMIN.username, INITIAL_ADMIN.password);
}

/** Buat user langsung di DB (bcrypt cost rendah untuk kecepatan tes). */
export function createUser(username, password, { role = 'user', quota } = {}) {
  const db = getDb();
  const info = db
    .prepare('INSERT INTO users (username, password_hash, display_name, role, quota_bytes) VALUES (?, ?, ?, ?, ?)')
    .run(username, bcrypt.hashSync(password, 4), username, role, quota ?? 2 * 1024 * 1024);
  return info.lastInsertRowid;
}

/** Klien kecil dengan cookie tersimpan. */
export function client(cookie) {
  return {
    cookie,
    get: (url) => request(app).get(url).set('Cookie', cookie),
    post: (url, body) => request(app).post(url).set('Cookie', cookie).send(body),
    patch: (url, body) => request(app).patch(url).set('Cookie', cookie).send(body),
    put: (url) => request(app).put(url).set('Cookie', cookie),
    del: (url, body) => request(app).delete(url).set('Cookie', cookie).send(body),
    mkdir: (path, name) => request(app).post('/api/files/mkdir').set('Cookie', cookie).send({ path, name }),
    upload: (path, name, content) =>
      request(app)
        .post(`/api/files/upload?path=${encodeURIComponent(path)}`)
        .set('Cookie', cookie)
        .attach('files', Buffer.from(content), name),
    list: async (path = '') =>
      (
        await request(app)
          .get(`/api/files?path=${encodeURIComponent(path)}`)
          .set('Cookie', cookie)
      ).body.entries
  };
}

/** Klien tanpa cookie (publik). */
export const anon = {
  get: (url) => request(app).get(url),
  post: (url, body) => request(app).post(url).send(body)
};
