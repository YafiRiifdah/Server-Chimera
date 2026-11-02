import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { resolveSafe, validateFilename } from '../src/safe.js';
import { STORAGE_ROOT } from '../src/config.js';

describe('Safe Path Resolution & Filename Validation', () => {
  const testUser = 'test_user_safe';
  const testUserRoot = path.join(STORAGE_ROOT, 'users', testUser);

  before(() => {
    if (!fs.existsSync(testUserRoot)) {
      fs.mkdirSync(testUserRoot, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(testUserRoot)) {
      fs.rmSync(testUserRoot, { recursive: true, force: true });
    }
  });

  describe('resolveSafe()', () => {
    test('mengizinkan path valid dan root user', () => {
      const rootRes = resolveSafe(testUser, '');
      assert.equal(rootRes.cleanRel, '');
      assert.equal(rootRes.targetPath, testUserRoot);

      const subRes = resolveSafe(testUser, 'dokumen/laporan.pdf');
      assert.equal(subRes.cleanRel, 'dokumen/laporan.pdf');
      assert.equal(subRes.targetPath, path.join(testUserRoot, 'dokumen', 'laporan.pdf'));
    });

    test('menolak traversal ../', () => {
      assert.throws(() => resolveSafe(testUser, '../rahasia.txt'), {
        code: 'FORBIDDEN_TRAVERSAL'
      });
      assert.throws(() => resolveSafe(testUser, 'folder/../../rahasia.txt'), {
        code: 'FORBIDDEN_TRAVERSAL'
      });
    });

    test('menolak traversal ..\\ (Windows style)', () => {
      assert.throws(() => resolveSafe(testUser, '..\\rahasia.txt'), {
        code: 'FORBIDDEN_TRAVERSAL'
      });
      assert.throws(() => resolveSafe(testUser, 'folder\\..\\..\\rahasia.txt'), {
        code: 'FORBIDDEN_TRAVERSAL'
      });
    });

    test('menolak encoded traversal %2e%2e dan multi-encoded', () => {
      assert.throws(() => resolveSafe(testUser, '%2e%2e/rahasia.txt'), {
        code: 'FORBIDDEN_TRAVERSAL'
      });
      assert.throws(() => resolveSafe(testUser, '%252e%252e/rahasia.txt'), {
        code: 'FORBIDDEN_TRAVERSAL'
      });
      assert.throws(() => resolveSafe(testUser, 'folder/%2e%2e/%2e%2e/rahasia.txt'), {
        code: 'FORBIDDEN_TRAVERSAL'
      });
    });

    test('menolak path absolut Windows (C:)', () => {
      assert.throws(() => resolveSafe(testUser, 'C:/Windows/System32'), {
        code: 'FORBIDDEN_PATH'
      });
      assert.throws(() => resolveSafe(testUser, 'D:\\Data'), {
        code: 'FORBIDDEN_PATH'
      });
    });

    test('menolak karakter kendali dan null byte', () => {
      assert.throws(() => resolveSafe(testUser, 'file\0.txt'), {
        code: 'INVALID_PATH'
      });
      assert.throws(() => resolveSafe(testUser, 'file\x07.txt'), {
        code: 'INVALID_PATH'
      });
    });

    test('menolak akses langsung ke folder sistem (.chimera dan .trash)', () => {
      assert.throws(() => resolveSafe(testUser, '.chimera/config.json'), {
        code: 'FORBIDDEN_SYSTEM_PATH'
      });
      assert.throws(() => resolveSafe(testUser, '.trash/deleted_file.txt'), {
        code: 'FORBIDDEN_SYSTEM_PATH'
      });
      assert.throws(() => resolveSafe(testUser, 'subfolder/.chimera/hack'), {
        code: 'FORBIDDEN_SYSTEM_PATH'
      });
    });

    test('menolak symlink keluar dari root user jika didukung sistem', () => {
      // Buat folder luar dan symlink ke dalam jika izin OS mendukung
      const outsideDir = path.join(STORAGE_ROOT, 'outside_target');
      if (!fs.existsSync(outsideDir)) {
        fs.mkdirSync(outsideDir, { recursive: true });
      }
      const symlinkPath = path.join(testUserRoot, 'symlink_escape');

      try {
        fs.symlinkSync(outsideDir, symlinkPath, 'junction');
        assert.throws(() => resolveSafe(testUser, 'symlink_escape'), {
          code: 'FORBIDDEN_SYMLINK'
        });
      } catch (err) {
        // Pada Windows tanpa developer mode/privilege, pembuatan symlink bisa gagal
        if (err.code !== 'EPERM') {
          throw err;
        }
      } finally {
        if (fs.existsSync(symlinkPath)) {
          fs.unlinkSync(symlinkPath);
        }
        if (fs.existsSync(outsideDir)) {
          fs.rmSync(outsideDir, { recursive: true, force: true });
        }
      }
    });
  });

  describe('validateFilename()', () => {
    test('menerima nama file normal', () => {
      assert.equal(validateFilename('dokumen.pdf'), 'dokumen.pdf');
      assert.equal(validateFilename('Foto Liburan 2026.jpg'), 'Foto Liburan 2026.jpg');
      assert.equal(validateFilename('arsip_v1.tar.gz'), 'arsip_v1.tar.gz');
    });

    test('menolak nama kosong atau spasi saja', () => {
      assert.throws(() => validateFilename(''), { code: 'INVALID_FILENAME' });
      assert.throws(() => validateFilename('   '), { code: 'INVALID_FILENAME' });
    });

    test('menolak karakter / dan \\', () => {
      assert.throws(() => validateFilename('folder/file.txt'), { code: 'INVALID_FILENAME' });
      assert.throws(() => validateFilename('folder\\file.txt'), { code: 'INVALID_FILENAME' });
    });

    test('menolak . dan ..', () => {
      assert.throws(() => validateFilename('.'), { code: 'INVALID_FILENAME' });
      assert.throws(() => validateFilename('..'), { code: 'INVALID_FILENAME' });
    });

    test('menolak awalan .chimera dan .trash', () => {
      assert.throws(() => validateFilename('.chimera'), { code: 'RESERVED_FILENAME' });
      assert.throws(() => validateFilename('.trash_archive'), { code: 'RESERVED_FILENAME' });
    });

    test('menolak nama melebihi 255 byte', () => {
      const longName = 'a'.repeat(256);
      assert.throws(() => validateFilename(longName), { code: 'FILENAME_TOO_LONG' });
    });
  });
});
