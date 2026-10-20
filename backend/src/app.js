import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import linkRoutes from './routes/links.js';
import orgRoutes from './routes/organizations.js';
import qrRoutes from './routes/qr.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';
import bulkRoutes from './routes/bulk.js';
import activityRoutes from './routes/activity.js';
import billingRoutes from './routes/billing.js';
import redirectRoutes from './routes/redirect.js';

export function createApp() {
  const app = express();
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(cookieParser());
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'linkpulse-api', timestamp: new Date().toISOString() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/links', linkRoutes);
  app.use('/api', orgRoutes);
  app.use('/api', qrRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api', bulkRoutes);
  app.use('/r', redirectRoutes);
  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use((err, req, res, _next) => {
    if (err.name === 'ZodError') return res.status(400).json({ error: 'Validation failed', details: err.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    if (err.code === 11000) return res.status(409).json({ error: 'A record with this value already exists' });
    const status = Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });
  return app;
}
