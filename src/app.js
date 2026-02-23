import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler, notFound } from './middleware/errors.js';
import authClientRoutes from './routes/authClient.js';
import authAdminRoutes from './routes/authAdmin.js';
import categoryRoutes from './routes/categories.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import affiliateRoutes from './routes/affiliates.js';
import dashboardRoutes from './routes/dashboard.js';
import adminsRoutes from './routes/admins.js';

const app = express();

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/v1/auth/client', authClientRoutes);
app.use('/api/v1/auth/admin', authAdminRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/affiliates', affiliateRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/admins', adminsRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;

