import express from 'express';
import { z } from 'zod';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { requireAuth } from '../middleware/auth.js';
import { safeEmit } from '../realtime/socket.js';

const router = express.Router();

const DEFAULT_CLIENT_URL = 'http://localhost:5173';

const mediaItemSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().url(),
});

const baseSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(1000).optional(),
  price: z.number().positive(),
  currency: z.string().min(1),
  categories: z.array(z.string().min(1)).min(1),
  imageUrl: z.string().url().optional(),
  media: z.array(mediaItemSchema).optional(),
  rating: z.number().min(0).max(5).optional(),
  stock: z.number().min(0).optional(),
});

const createSchema = baseSchema.extend({
  description: baseSchema.shape.description.default(''),
  currency: baseSchema.shape.currency.default('AOA'),
  imageUrl: baseSchema.shape.imageUrl.default(''),
  media: baseSchema.shape.media.default([]),
  rating: baseSchema.shape.rating.default(0),
  stock: baseSchema.shape.stock.default(0),
}).superRefine((data, ctx) => {
  const media = data.media || [];
  const hasImage = media.some(m => m.type === 'image');
  if (!hasImage && !data.imageUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['media'], message: 'Informe ao menos uma foto' });
  }
});

const updateSchema = baseSchema.partial().superRefine((data, ctx) => {
  if (data.media) {
    const hasImage = data.media.some(m => m.type === 'image');
    if (!hasImage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['media'], message: 'Informe ao menos uma foto' });
    }
  }
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

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

const getClientUrl = () => trimTrailingSlash(process.env.CLIENT_URL || DEFAULT_CLIENT_URL);

const getPublicBaseUrl = (req) => {
  const configured = trimTrailingSlash(process.env.PUBLIC_API_URL || process.env.AFFILIATE_SHARE_URL || '');
  if (configured) return configured;

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = (typeof forwardedProto === 'string' ? forwardedProto.split(',')[0] : req.protocol) || 'http';
  return `${protocol}://${req.get('host')}`;
};

const toAbsoluteUrl = (url, baseUrl) => {
  if (!url) return '';
  try {
    return new URL(url, `${trimTrailingSlash(baseUrl)}/`).toString();
  } catch {
    return url;
  }
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeJsonForHtml = (value = '') => String(value).replace(/</g, '\\u003c');

const renderProductSharePage = ({ title, description, imageUrl, pageUrl, redirectUrl, product }) => {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImageUrl = escapeHtml(imageUrl);
  const safePageUrl = escapeHtml(pageUrl);
  const safeRedirectUrl = escapeHtml(redirectUrl);
  const productJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description,
    image: imageUrl ? [imageUrl] : [],
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.currency || 'AOA',
      availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: redirectUrl,
    },
  });

  return `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <link rel="canonical" href="${safeRedirectUrl}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:type" content="product" />
    <meta property="og:url" content="${safePageUrl}" />
    <meta property="og:image" content="${safeImageUrl}" />
    <meta property="og:site_name" content="YetuStore" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${safeImageUrl}" />
    <meta http-equiv="refresh" content="2;url=${safeRedirectUrl}" />
    <script type="application/ld+json">${escapeJsonForHtml(productJsonLd)}</script>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 24px; color: #111827;">
    <p>Redirecionando para o produto...</p>
    <p><a href="${safeRedirectUrl}">Abrir produto</a></p>
  </body>
</html>`;
};

const toDto = (p) => {
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
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

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

export const productShareHandler = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).send('Produto nao encontrado');

    const clientUrl = getClientUrl();
    const pageUrl = `${getPublicBaseUrl(req)}/p/${encodeURIComponent(product._id.toString())}`;
    const redirectUrl = `${clientUrl}/products/${product._id.toString()}`;
    const media = normalizeMedia(product.media || [], product.imageUrl || '');
    const title = product.name;
    const description = product.description || `Veja ${product.name} na YetuStore.`;
    const imageUrl = toAbsoluteUrl(getFirstImageUrl(media, product.imageUrl || ''), clientUrl);

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderProductSharePage({
      title,
      description,
      imageUrl,
      pageUrl,
      redirectUrl,
      product: {
        name: product.name,
        price: product.price,
        currency: product.currency || 'AOA',
        stock: product.stock || 0,
      },
    }));
  } catch (err) {
    next(err);
  }
};

router.post('/', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const categoriesExist = await Category.countDocuments({ _id: { $in: data.categories } });
    if (categoriesExist !== data.categories.length) {
      return res.status(400).json({ error: 'Categoria invalida' });
    }
    const media = normalizeMedia(data.media, data.imageUrl);
    const imageUrl = getFirstImageUrl(media, data.imageUrl || '');

    const product = await Product.create({
      ...data,
      categories: data.categories,
      media,
      imageUrl,
    });
    safeEmit('products.updated', { id: product._id.toString() });
    res.json({ product: toDto(product) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAuth('admin'), async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    if (data.categories) {
      const categoriesExist = await Category.countDocuments({ _id: { $in: data.categories } });
      if (categoriesExist !== data.categories.length) {
        return res.status(400).json({ error: 'Categoria invalida' });
      }
    }

    if (data.media) {
      const media = normalizeMedia(data.media, data.imageUrl);
      data.media = media;
      data.imageUrl = getFirstImageUrl(media, data.imageUrl || '');
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
