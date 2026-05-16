import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { AffiliatePayout } from '../models/AffiliatePayout.js';

const router = express.Router();

const querySchema = z.object({
  q: z.string().optional().default(''),
});

const normalizePhone = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/\s+/g, '').trim();
};

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().transform(normalizePhone).pipe(z.string().min(7)).or(z.literal('')).optional(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  bankAccountName: z.string().optional(),
  bankName: z.string().optional(),
  bankIban: z.string().optional(),
});

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MIN_WITHDRAW = 25000;
const MAX_WITHDRAW = 100000;

const calcEarnings = async (userId) => {
  const orders = await Order.find({ affiliateUserId: userId, status: 'comprado' }).sort({ createdAt: -1 });
  let totalEarned = 0;
  const earningsByOrder = orders.map((order) => {
    let orderEarning = 0;
    for (const item of order.items || []) {
      const percent = item?.affiliatePercent ?? 0;
      const itemTotal = (item?.unitPrice || 0) * (item?.quantity || 0);
      orderEarning += (itemTotal * percent) / 100;
    }
    orderEarning = Math.round(orderEarning);
    totalEarned += orderEarning;
    return {
      orderId: order._id.toString(),
      totalAmount: order.totalAmount || 0,
      commission: orderEarning,
      status: order.status,
      scheduledDate: order.scheduledDate,
      scheduledTime: order.scheduledTime,
      createdAt: order.createdAt,
    };
  });

  return {
    totalEarned: Math.round(totalEarned),
    earningsByOrder,
  };
};

const toDto = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  provider: user.provider,
  emailVerified: user.emailVerified,
  phoneVerified: user.phoneVerified,
  bankAccountName: user.bankAccountName || '',
  bankName: user.bankName || '',
  bankIban: user.bankIban || '',
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

router.get('/', requireAuth('admin'), async (req, res, next) => {
  try {
    const { q } = querySchema.parse(req.query || {});
    const search = q.trim();
    const filter = search
      ? {
        $or: [
          { name: { $regex: escapeRegex(search), $options: 'i' } },
          { email: { $regex: escapeRegex(search), $options: 'i' } },
          { phone: { $regex: escapeRegex(search), $options: 'i' } },
        ],
      }
      : {};

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }),
      User.countDocuments(),
    ]);

    res.json({
      users: users.map(toDto),
      total,
      filteredTotal: users.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    res.json({ user: toDto(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/wallet', requireAuth('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });

    const [{ totalEarned, earningsByOrder }, payouts] = await Promise.all([
      calcEarnings(user._id),
      AffiliatePayout.find({ userId: user._id }).sort({ createdAt: -1 }),
    ]);

    const totalWithdrawn = payouts
      .filter((payout) => payout.status === 'paid')
      .reduce((sum, payout) => sum + payout.amount, 0);

    const pendingWithdrawals = payouts
      .filter((payout) => payout.status === 'requested')
      .reduce((sum, payout) => sum + payout.amount, 0);

    const available = Math.max(totalEarned - totalWithdrawn, 0);

    res.json({
      wallet: {
        totalEarned,
        totalWithdrawn,
        pendingWithdrawals,
        available,
        minWithdraw: MIN_WITHDRAW,
        maxWithdraw: MAX_WITHDRAW,
        bank: {
          accountName: user.bankAccountName || '',
          bankName: user.bankName || '',
          iban: user.bankIban || '',
        },
        payouts: payouts.map((payout) => ({
          id: payout._id.toString(),
          amount: payout.amount,
          status: payout.status,
          createdAt: payout.createdAt,
        })),
        earningsByOrder,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body || {});
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });

    if (data.email && data.email !== user.email) {
      const exists = await User.findOne({ email: data.email });
      if (exists) return res.status(400).json({ error: 'Email ja registrado' });
      user.email = data.email;
    }

    if (data.name !== undefined) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.emailVerified !== undefined) user.emailVerified = data.emailVerified;
    if (data.phoneVerified !== undefined) user.phoneVerified = data.phoneVerified;
    if (data.bankAccountName !== undefined) user.bankAccountName = data.bankAccountName;
    if (data.bankName !== undefined) user.bankName = data.bankName;
    if (data.bankIban !== undefined) user.bankIban = data.bankIban;

    await user.save();
    res.json({ user: toDto(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
