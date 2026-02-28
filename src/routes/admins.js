import express from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Admin } from '../models/Admin.js';

const router = express.Router();

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5),
  role: z.enum(['Super Admin', 'Admin', 'Entregador']).optional(),
  active: z.boolean().optional(),
});

const updateSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  role: z.enum(['Super Admin', 'Admin', 'Entregador']).optional(),
  active: z.boolean().optional(),
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

router.get('/', requireAuth('admin'), async (_req, res, next) => {
  try {
    const admins = await Admin.find().sort({ createdAt: -1 });
    res.json({ admins: admins.map(sanitizeAdmin) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const exists = await Admin.findOne({ username: data.username });
    if (exists) return res.status(400).json({ error: 'Usuario ja existe' });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const admin = await Admin.create({
      username: data.username,
      passwordHash,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role || 'Admin',
      active: data.active ?? true,
    });

    res.json({ admin: sanitizeAdmin(admin) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body || {});
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'Admin nao encontrado' });

    if (data.username && data.username !== admin.username) {
      const exists = await Admin.findOne({ username: data.username });
      if (exists) return res.status(400).json({ error: 'Usuario ja existe' });
      admin.username = data.username;
    }

    if (data.password) {
      admin.passwordHash = await bcrypt.hash(data.password, 10);
    }

    if (data.name !== undefined) admin.name = data.name;
    if (data.email !== undefined) admin.email = data.email;
    if (data.phone !== undefined) admin.phone = data.phone;
    if (data.role !== undefined) admin.role = data.role;
    if (data.active !== undefined) admin.active = data.active;

    await admin.save();
    res.json({ admin: sanitizeAdmin(admin) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: 'Admin nao encontrado' });
    if (admin.role === 'Super Admin') return res.status(400).json({ error: 'Nao e possivel remover Super Admin' });
    await Admin.deleteOne({ _id: admin._id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
