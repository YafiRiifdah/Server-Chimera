import express from 'express';
import { resolveSafe } from './safe.js';
import { sendThumbnail } from './serve.js';

/**
 * GET /api/files/thumb?path=&w=  — thumbnail untuk pemilik. Logika ada di serve.js
 * agar bisa dipakai juga oleh konteks berbagi dan publik.
 */
export const thumbsRouter = express.Router();

thumbsRouter.get('/thumb', async (req, res) => {
  const rel = req.query.path;
  if (!rel) return res.status(400).json({ error: 'Parameter path wajib disertakan', code: 'MISSING_PATH' });
  let resolved;
  try {
    resolved = resolveSafe(req.user.username, rel);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message, code: err.code });
  }
  await sendThumbnail(req, res, resolved.targetPath, req.user.username, req.query.w);
});
