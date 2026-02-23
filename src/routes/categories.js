import express from 'express';
import { z } from 'zod';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { requireAuth } from '../middleware/auth.js';
import { safeEmit } from '../realtime/socket.js';

const router = express.Router();

const categorySchema = z.object({
  name: z.string().min(2),
  description: z.string().max(500).optional().default(''),
});

const toDto = (cat) => ({
  id: cat._id.toString(),
  name: cat.name,
  description: cat.description || '',
  createdAt: cat.createdAt,
});

router.get('/', async (_req, res, next) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.json({ categories: categories.map(toDto) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    const exists = await Category.findOne({ name: data.name });
    if (exists) return res.status(400).json({ error: 'Categoria ja existe' });
    const category = await Category.create(data);
    safeEmit('categories.updated', { id: category._id.toString() });
    res.json({ category: toDto(category) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = categorySchema.partial().parse(req.body);
    const category = await Category.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!category) return res.status(404).json({ error: 'Categoria nao encontrada' });
    safeEmit('categories.updated', { id: category._id.toString() });
    res.json({ category: toDto(category) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const used = await Product.exists({ categories: req.params.id });
    if (used) return res.status(400).json({ error: 'Categoria em uso' });
    const deleted = await Category.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Categoria nao encontrada' });
    safeEmit('categories.updated', { id: req.params.id });
    res.json({ message: 'Ok' });
  } catch (err) {
    next(err);
  }
});

export default router;
