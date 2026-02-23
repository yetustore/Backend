import express from 'express';
import { z } from 'zod';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { requireAuth } from '../middleware/auth.js';
import { safeEmit } from '../realtime/socket.js';

const router = express.Router();

const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(1000).optional().default(''),
  price: z.number().positive(),
  currency: z.string().min(1).default('AOA'),
  categories: z.array(z.string().min(1)).min(1),
  imageUrl: z.string().url().optional().default(''),
  rating: z.number().min(0).max(5).optional().default(0),
  stock: z.number().min(0).optional().default(0),
});

const toDto = (p) => ({
  id: p._id.toString(),
  name: p.name,
  description: p.description || '',
  price: p.price,
  currency: p.currency || 'AOA',
  categories: (p.categories || []).map(id => id.toString()),
  imageUrl: p.imageUrl || '',
  rating: p.rating || 0,
  stock: p.stock || 0,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    const categoryId = req.query.categoryId;
    if (categoryId) filter.categories = categoryId;
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ products: products.map(toDto) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto nao encontrado' });
    res.json({ product: toDto(product) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body);
    const categoriesExist = await Category.countDocuments({ _id: { $in: data.categories } });
    if (categoriesExist !== data.categories.length) {
      return res.status(400).json({ error: 'Categoria invalida' });
    }
    const product = await Product.create({
      ...data,
      categories: data.categories,
    });
    safeEmit('products.updated', { id: product._id.toString() });
    res.json({ product: toDto(product) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = productSchema.partial().parse(req.body);
    if (data.categories) {
      const categoriesExist = await Category.countDocuments({ _id: { $in: data.categories } });
      if (categoriesExist !== data.categories.length) {
        return res.status(400).json({ error: 'Categoria invalida' });
      }
    }
    const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!product) return res.status(404).json({ error: 'Produto nao encontrado' });
    safeEmit('products.updated', { id: product._id.toString() });
    res.json({ product: toDto(product) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Produto nao encontrado' });
    safeEmit('products.updated', { id: req.params.id });
    res.json({ message: 'Ok' });
  } catch (err) {
    next(err);
  }
});

export default router;
