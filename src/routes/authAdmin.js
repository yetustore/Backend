import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Admin } from '../models/Admin.js';
import { requireAuth } from '../middleware/auth.js';
import { issueTokens, rotateRefreshToken, revokeRefreshToken } from '../utils/tokens.js';

const router = express.Router();

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

const bootstrapSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
});

const sanitizeAdmin = (admin) => ({
  id: admin._id.toString(),
  username: admin.username,
  name: admin.name || admin.username,
  email: admin.email || '',
  phone: admin.phone || '',
  role: admin.role,
  active: admin.active,
  createdAt: admin.createdAt,
});

router.post('/bootstrap', async (req, res, next) => {
  try {
    const secret = req.headers['x-bootstrap-secret'] || req.body?.secret;
    if (!secret || secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const existing = await Admin.findOne({});
    if (existing) return res.status(400).json({ error: 'Admin ja existe' });

    const data = bootstrapSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const admin = await Admin.create({
      username: data.username,
      passwordHash,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: 'Super Admin',
      active: true,
    });

    const tokens = await issueTokens({ userId: admin._id, userType: 'admin' });
    res.json({ admin: sanitizeAdmin(admin), ...tokens });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const admin = await Admin.findOne({ username: data.username });
    if (!admin) return res.status(400).json({ error: 'Credenciais invalidas' });
    if (!admin.active) return res.status(403).json({ error: 'Admin inativo' });
    const ok = await bcrypt.compare(data.password, admin.passwordHash);
    if (!ok) return res.status(400).json({ error: 'Credenciais invalidas' });

    const tokens = await issueTokens({ userId: admin._id, userType: 'admin' });
    res.json({ admin: sanitizeAdmin(admin), ...tokens });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth('admin'), async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.auth.sub);
    if (!admin) return res.status(404).json({ error: 'Admin nao encontrado' });
    res.json({ admin: sanitizeAdmin(admin) });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token ausente' });
    const tokens = await rotateRefreshToken(refreshToken, 'admin');
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token ausente' });
    await revokeRefreshToken(refreshToken, 'admin');
    res.json({ message: 'Ok' });
  } catch (err) {
    next(err);
  }
});

export default router;
