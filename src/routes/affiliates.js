import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { AffiliateLink } from '../models/AffiliateLink.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { AffiliatePayout } from '../models/AffiliatePayout.js';
import { safeEmit } from '../realtime/socket.js';

const router = express.Router();

const createSchema = z.object({
  productId: z.string().min(1),
});

const trackSchema = z.object({
  code: z.string().min(3),
});

const withdrawSchema = z.object({
  amount: z.number().positive(),
});

const bankSchema = z.object({
  accountName: z.string().min(2),
  bankName: z.string().min(2),
  iban: z.string().min(10),
});

const payoutStatusSchema = z.object({
  status: z.enum(['requested', 'paid', 'denied']),
});

const MIN_WITHDRAW = 25000;
const MAX_WITHDRAW = 100000;
const DAILY_WITHDRAW_LIMIT = 100000;

const toProductDto = (p) => ({
  id: p._id.toString(),
  name: p.name,
  description: p.description || '',
  price: p.price,
  currency: p.currency || 'AOA',
  categories: (p.categories || []).map(id => id.toString()),
  imageUrl: p.imageUrl || '',
  rating: p.rating || 0,
  stock: p.stock || 0,
});

const toDto = (link, product, user, orders) => ({
  id: link._id.toString(),
  userId: link.userId.toString(),
  productId: link.productId.toString(),
  code: link.code,
  url: link.url,
  clicks: link.clicks || 0,
  ordersCount: link.ordersCount || 0,
  createdAt: link.createdAt,
  product: product ? toProductDto(product) : undefined,
  affiliateName: user?.name || '',
  orders: orders || [],
});

const toPayoutDto = (p, user) => ({
  id: p._id.toString(),
  userId: p.userId.toString(),
  amount: p.amount,
  status: p.status,
  createdAt: p.createdAt,
  affiliateName: user?.name || '',
  phone: user?.phone || '',
  bankName: user?.bankName || '',
  iban: user?.bankIban || '',
  accountName: user?.bankAccountName || '',
});

const genCode = () => `AFF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const calcEarnings = async (userId) => {
  const orders = await Order.find({ affiliateUserId: userId, status: 'comprado' });
  if (orders.length === 0) return 0;
  const products = await Product.find({ _id: { $in: orders.map(o => o.productId) } });
  const prodMap = new Map(products.map(p => [p._id.toString(), p]));
  let total = 0;
  for (const o of orders) {
    const product = prodMap.get(o.productId.toString());
    if (product) total += product.price * 0.05;
  }
  return Math.round(total);
};

const hasBankDetails = (user) => Boolean(user?.bankAccountName && user?.bankName && user?.bankIban);

router.post('/', requireAuth('client'), async (req, res, next) => {
  try {
    const { productId } = createSchema.parse(req.body);
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Produto nao encontrado' });

    let code;
    let exists = true;
    while (exists) {
      code = genCode();
      exists = await AffiliateLink.exists({ code });
    }

    const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const url = `${baseUrl}/r/${code}`;

    const link = await AffiliateLink.create({
      userId: req.auth.sub,
      productId,
      code,
      url,
      clicks: 0,
      ordersCount: 0,
    });

    const user = await User.findById(req.auth.sub);
    safeEmit('affiliates.updated', { id: link._id.toString() });
    res.json({ link: toDto(link, product, user, []) });
  } catch (err) {
    next(err);
  }
});

router.get('/my', requireAuth('client'), async (req, res, next) => {
  try {
    const links = await AffiliateLink.find({ userId: req.auth.sub }).sort({ createdAt: -1 });
    const products = await Product.find({ _id: { $in: links.map(l => l.productId) } });
    const prodMap = new Map(products.map(p => [p._id.toString(), p]));
    const orders = await Order.find({ affiliateUserId: req.auth.sub }).sort({ createdAt: -1 });
    const ordersByLink = new Map();
    for (const o of orders) {
      const key = o.affiliateLinkId?.toString();
      if (!key) continue;
      const list = ordersByLink.get(key) || [];
      list.push({
        id: o._id.toString(),
        status: o.status,
        scheduledDate: o.scheduledDate,
        scheduledTime: o.scheduledTime,
        createdAt: o.createdAt,
      });
      ordersByLink.set(key, list);
    }
    res.json({ links: links.map(l => toDto(l, prodMap.get(l.productId.toString()), null, ordersByLink.get(l._id.toString()) || [])) });
  } catch (err) {
    next(err);
  }
});

router.get('/my/summary', requireAuth('client'), async (req, res, next) => {
  try {
    const totalEarned = await calcEarnings(req.auth.sub);
    const payouts = await AffiliatePayout.find({ userId: req.auth.sub, status: 'paid' });
    const totalWithdrawn = payouts.reduce((s, p) => s + p.amount, 0);
    const available = Math.max(totalEarned - totalWithdrawn, 0);
    const user = await User.findById(req.auth.sub);
    res.json({
      totalEarned,
      totalWithdrawn,
      available,
      minWithdraw: MIN_WITHDRAW,
      maxWithdraw: MAX_WITHDRAW,
      hasBankDetails: hasBankDetails(user),
      bank: user ? { accountName: user.bankAccountName || '', bankName: user.bankName || '', iban: user.bankIban || '' } : null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/my/payouts', requireAuth('client'), async (req, res, next) => {
  try {
    const payouts = await AffiliatePayout.find({ userId: req.auth.sub }).sort({ createdAt: -1 });
    res.json({ payouts: payouts.map(p => toPayoutDto(p)) });
  } catch (err) {
    next(err);
  }
});

router.post('/my/bank', requireAuth('client'), async (req, res, next) => {
  try {
    const data = bankSchema.parse(req.body);
    const user = await User.findById(req.auth.sub);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    user.bankAccountName = data.accountName;
    user.bankName = data.bankName;
    user.bankIban = data.iban;
    await user.save();
    res.json({ bank: { accountName: user.bankAccountName, bankName: user.bankName, iban: user.bankIban } });
  } catch (err) {
    next(err);
  }
});

router.post('/my/withdraw', requireAuth('client'), async (req, res, next) => {
  try {
    const { amount } = withdrawSchema.parse(req.body);
    if (amount < MIN_WITHDRAW) return res.status(400).json({ error: `Saque minimo: ${MIN_WITHDRAW} AOA` });
    if (amount > MAX_WITHDRAW) return res.status(400).json({ error: `Saque maximo: ${MAX_WITHDRAW} AOA` });

    const user = await User.findById(req.auth.sub);
    if (!hasBankDetails(user)) return res.status(400).json({ error: 'Cadastre os dados bancarios' });

    const totalEarned = await calcEarnings(req.auth.sub);
    const payouts = await AffiliatePayout.find({ userId: req.auth.sub, status: 'paid' });
    const totalWithdrawn = payouts.reduce((s, p) => s + p.amount, 0);
    const available = Math.max(totalEarned - totalWithdrawn, 0);
    if (amount > available) return res.status(400).json({ error: 'Saldo insuficiente' });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPayouts = await AffiliatePayout.find({ userId: req.auth.sub, createdAt: { $gte: since } });
    const recentTotal = recentPayouts.reduce((s, p) => s + p.amount, 0);
    if (recentTotal + amount > DAILY_WITHDRAW_LIMIT) {
      return res.status(400).json({ error: `Limite de saque em 24h: ${DAILY_WITHDRAW_LIMIT} AOA` });
    }
    const payout = await AffiliatePayout.create({ userId: req.auth.sub, amount, status: 'requested' });
    safeEmit('affiliates.updated', { id: payout._id.toString() });
    res.json({ payout: toPayoutDto(payout) });
  } catch (err) {
    next(err);
  }
});

router.get('/code/:code', async (req, res, next) => {
  try {
    const link = await AffiliateLink.findOne({ code: req.params.code });
    if (!link) return res.status(404).json({ error: 'Link nao encontrado' });
    const product = await Product.findById(link.productId);
    const user = await User.findById(link.userId);
    res.json({ link: toDto(link, product, user, []) });
  } catch (err) {
    next(err);
  }
});

router.post('/track', async (req, res, next) => {
  try {
    const { code } = trackSchema.parse(req.body);
    const link = await AffiliateLink.findOne({ code });
    if (!link) return res.json({ ok: true });
    link.clicks = (link.clicks || 0) + 1;
    await link.save();
    safeEmit('affiliates.updated', { id: link._id.toString() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth('admin'), async (_req, res, next) => {
  try {
    const links = await AffiliateLink.find().sort({ createdAt: -1 });
    const products = await Product.find({ _id: { $in: links.map(l => l.productId) } });
    const users = await User.find({ _id: { $in: links.map(l => l.userId) } });
    const orders = await Order.find({ affiliateLinkId: { $in: links.map(l => l._id) } }).sort({ createdAt: -1 });
    const ordersByLink = new Map();
    for (const o of orders) {
      const key = o.affiliateLinkId?.toString();
      if (!key) continue;
      const list = ordersByLink.get(key) || [];
      list.push({
        id: o._id.toString(),
        status: o.status,
        scheduledDate: o.scheduledDate,
        scheduledTime: o.scheduledTime,
        createdAt: o.createdAt,
      });
      ordersByLink.set(key, list);
    }

    const prodMap = new Map(products.map(p => [p._id.toString(), p]));
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    res.json({ links: links.map(l => toDto(l, prodMap.get(l.productId.toString()), userMap.get(l.userId.toString()), ordersByLink.get(l._id.toString()) || [])) });
  } catch (err) {
    next(err);
  }
});

router.get('/payouts', requireAuth('admin'), async (_req, res, next) => {
  try {
    const payouts = await AffiliatePayout.find().sort({ createdAt: -1 });
    const users = await User.find({ _id: { $in: payouts.map(p => p.userId) } });
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    res.json({ payouts: payouts.map(p => toPayoutDto(p, userMap.get(p.userId.toString()))) });
  } catch (err) {
    next(err);
  }
});

router.patch('/payouts/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const { status } = payoutStatusSchema.parse(req.body);
    const payout = await AffiliatePayout.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!payout) return res.status(404).json({ error: 'Saque nao encontrado' });
    safeEmit('affiliates.updated', { id: payout._id.toString() });
    res.json({ payout: toPayoutDto(payout) });
  } catch (err) {
    next(err);
  }
});

export default router;



