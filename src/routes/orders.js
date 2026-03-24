import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Order } from '../models/Order.js';
import { Admin } from '../models/Admin.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { AffiliateLink } from '../models/AffiliateLink.js';
import { safeEmit } from '../realtime/socket.js';

const router = express.Router();

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const createSchema = z.object({
  items: z.array(itemSchema).min(1),
  scheduledDate: z.string().min(1),
  scheduledTime: z.string().min(1),
  address: z.string().min(5),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  affiliateCode: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(['agendado', 'em_progresso', 'comprado', 'cancelado']),
});

const normalizeMedia = (media, imageUrl) => {
  const list = Array.isArray(media) ? media.filter(m => m?.url) : [];
  if (list.length === 0 && imageUrl) list.push({ type: 'image', url: imageUrl });
  return list;
};

const getFirstImageUrl = (media, fallback = '') => {
  const first = (media || []).find(m => m.type === 'image' && m.url);
  return first?.url || fallback || '';
};

const collectProductIds = (orders) => {
  const ids = new Set();
  for (const order of orders) {
    for (const item of order.items || []) {
      if (item?.productId) ids.add(item.productId.toString());
    }
  }
  return [...ids];
};

const toProductDto = (p) => {
  const media = normalizeMedia(p.media || [], p.imageUrl || '');
  return {
    id: p._id.toString(),
    name: p.name,
    description: p.description || '',
    price: p.price,
    currency: p.currency || 'AOA',
    categories: (p.categories || []).map(id => id.toString()),
    imageUrl: getFirstImageUrl(media, p.imageUrl || ''),
    media,
    rating: p.rating || 0,
    stock: p.stock || 0,
  };
};

const toOrderItemDto = (item, product) => ({
  productId: item.productId?.toString(),
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  totalPrice: item.totalPrice,
  product: product ? toProductDto(product) : undefined,
});

const toOrderDto = (o, productMap = new Map(), user, affiliateUser) => {
  const items = (o.items || []).map(item => toOrderItemDto(item, productMap.get(item.productId?.toString())));
  const primaryProduct = items[0]?.product;
  return {
    id: o._id.toString(),
    userId: o.userId.toString(),
    items,
    totalAmount: o.totalAmount,
    product: primaryProduct,
    status: o.status,
    scheduledDate: o.scheduledDate,
    scheduledTime: o.scheduledTime,
    address: o.address,
    latitude: o.latitude,
    longitude: o.longitude,
    affiliateId: o.affiliateId,
    affiliateCode: o.affiliateCode,
    affiliateName: affiliateUser?.name || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    statusHistory: o.statusHistory || [],
    customerName: user?.name || '',
    customerPhone: user?.phone || '',
  };
};

router.post('/', requireAuth('client'), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const productIds = [...new Set(data.items.map(item => item.productId))];
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== productIds.length) {
      return res.status(404).json({ error: 'Um ou mais produtos nao encontrados' });
    }
    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    const orderItems = data.items.map(item => {
      const product = productMap.get(item.productId);
      return {
        productId: product._id,
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice: product.price * item.quantity,
      };
    });
    const totalAmount = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

    let affiliateLink = null;
    let affiliateUser = null;
    if (data.affiliateCode) {
      affiliateLink = await AffiliateLink.findOne({ code: data.affiliateCode });
      if (affiliateLink && affiliateLink.userId.toString() !== req.auth.sub) {
        affiliateUser = await User.findById(affiliateLink.userId);
      } else {
        affiliateLink = null;
      }
    }

    const order = await Order.create({
      userId: req.auth.sub,
      items: orderItems,
      totalAmount,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      address: data.address,
      latitude: data.latitude,
      longitude: data.longitude,
      affiliateId: affiliateUser ? affiliateUser._id.toString() : undefined,
      affiliateLinkId: affiliateLink?._id,
      affiliateUserId: affiliateUser?._id,
      affiliateCode: affiliateLink?.code,
      status: 'agendado',
      statusHistory: [{ status: 'agendado', timestamp: new Date() }],
    });

    if (affiliateLink) {
      affiliateLink.ordersCount = (affiliateLink.ordersCount || 0) + 1;
      await affiliateLink.save();
      safeEmit('affiliates.updated', { id: affiliateLink._id.toString() });
    }

    const user = await User.findById(req.auth.sub);
    safeEmit('orders.updated', { id: order._id.toString() });
    res.json({ order: toOrderDto(order, productMap, user, affiliateUser) });
  } catch (err) {
    next(err);
  }
});

router.get('/my', requireAuth('client'), async (req, res, next) => {
  try {
    const orders = await Order.find({ userId: req.auth.sub }).sort({ createdAt: -1 });
    const productIds = collectProductIds(orders);
    const products = productIds.length > 0 ? await Product.find({ _id: { $in: productIds } }) : [];
    const affiliateUsers = await User.find({ _id: { $in: orders.map(o => o.affiliateUserId).filter(Boolean) } });
    const prodMap = new Map(products.map(p => [p._id.toString(), p]));
    const affMap = new Map(affiliateUsers.map(u => [u._id.toString(), u]));
    res.json({ orders: orders.map(o => toOrderDto(o, prodMap, null, affMap.get(o.affiliateUserId?.toString()))) });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth('admin'), async (_req, res, next) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    const productIds = collectProductIds(orders);
    const products = productIds.length > 0 ? await Product.find({ _id: { $in: productIds } }) : [];
    const users = await User.find({ _id: { $in: orders.map(o => o.userId) } });
    const affiliateUsers = await User.find({ _id: { $in: orders.map(o => o.affiliateUserId).filter(Boolean) } });
    const prodMap = new Map(products.map(p => [p._id.toString(), p]));
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    const affMap = new Map(affiliateUsers.map(u => [u._id.toString(), u]));
    res.json({ orders: orders.map(o => toOrderDto(o, prodMap, userMap.get(o.userId.toString()), affMap.get(o.affiliateUserId?.toString()))) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', requireAuth('admin'), async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
    order.status = status;
    let adminInfo = {};
    if (status === 'em_progresso') {
      const admin = await Admin.findById(req.auth.sub);
      if (admin) {
        adminInfo = {
          adminId: admin._id,
          adminName: admin.name || admin.username,
          adminPhone: admin.phone || '',
        };
      }
    }
    order.statusHistory = [...(order.statusHistory || []), { status, timestamp: new Date(), ...adminInfo }];
    await order.save();
    const productIds = collectProductIds([order]);
    const products = productIds.length > 0 ? await Product.find({ _id: { $in: productIds } }) : [];
    const prodMap = new Map(products.map(p => [p._id.toString(), p]));
    const user = await User.findById(order.userId);
    const affiliateUser = order.affiliateUserId ? await User.findById(order.affiliateUserId) : null;
    safeEmit('orders.updated', { id: order._id.toString(), status });
    res.json({ order: toOrderDto(order, prodMap, user, affiliateUser) });
  } catch (err) {
    next(err);
  }
});

export default router;
