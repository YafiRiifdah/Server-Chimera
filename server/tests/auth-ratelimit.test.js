import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/index.js';

// Berjalan di proses sendiri supaya penguncian IP tidak mengganggu tes lain.
describe('Pembatas percobaan login', () => {
  test('10 kegagalan dari satu IP dengan username berbeda-beda tetap mengunci IP tersebut', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: `tidakada${i}`, password: 'salah' });
      assert.equal(res.status, 401);
    }
    const locked = await request(app).post('/api/auth/login').send({ username: 'tidakada99', password: 'salah' });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.code, 'RATE_LIMIT_EXCEEDED');
  });
});
