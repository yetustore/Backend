import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { AffiliateLink } from '../models/AffiliateLink.js';
import { AffiliatePayout } from '../models/AffiliatePayout.js';

const router = express.Router();

router.get('/', requireAuth('admin'), async (_req, res, next) => {
  try {
    const [
      categories,
      products,
      orders,
      affiliates,
      payouts,
    ] = await Promise.all([
      Category.find(),
      Product.find(),
      Order.find(),
      AffiliateLink.find(),
      AffiliatePayout.find(),
    ]);

    const statusCounts = {
      agendado: orders.filter(o => o.status === 'agendado').length,
      em_progresso: orders.filter(o => o.status === 'em_progresso').length,
      comprado: orders.filter(o => o.status === 'comprado').length,
      cancelado: orders.filter(o => o.status === 'cancelado').length,
    };

    const categoryData = categories.map(c => ({
      id: c._id.toString(),
      name: c.name,
      count: products.filter(p => p.categories.map(id => id.toString()).includes(c._id.toString())).length,
    }));

    const totalPaid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    const totalRequested = payouts.filter(p => p.status === 'requested').reduce((s, p) => s + p.amount, 0);

    const grossSales = orders.filter(o => o.status === 'comprado').reduce((s, o) => s + (o.totalAmount || 0), 0);
    const netSales = Math.max(grossSales - totalPaid, 0);

    res.json({
      counts: {
        categories: categories.length,
        products: products.length,
        orders: orders.length,
        affiliates: affiliates.length,
      },
      payouts: {
        totalPaid,
        totalRequested,
      },
      revenue: {
        grossSales,
        netSales,
      },
      statusCounts,
      categoryData,
    });
  } catch (err) {
    next(err);
  }
});

export default router;





