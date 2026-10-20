import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const registerSchema = z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().email().max(254), password: z.string().min(10).max(128) });
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });

function tokenFor(user) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ sub: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'linkpulse' });
}

router.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();
    // Public registration can never grant administrator privileges. Use the seed script for initial admin setup.
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await User.create({ name: input.name, email, passwordHash, role: 'user' });
    const safeUser = { id: String(user._id), name: user.name, email: user.email, role: user.role, plan: user.plan || 'free', subscriptionStatus: user.subscriptionStatus || 'free', subscriptionExpiresAt: user.subscriptionExpiresAt || null };
    res.status(201).json({ user: safeUser, token: tokenFor(user) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
    if (!user || user.disabledAt || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ user: { id: String(user._id), name: user.name, email: user.email, role: user.role, plan: user.plan || 'free', subscriptionStatus: user.subscriptionStatus || 'free', subscriptionExpiresAt: user.subscriptionExpiresAt || null }, token: tokenFor(user) });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, (req, res) => res.json({ user: { id: String(req.user._id), name: req.user.name, email: req.user.email, role: req.user.role, plan: req.user.plan || 'free', subscriptionStatus: req.user.subscriptionStatus || 'free', subscriptionExpiresAt: req.user.subscriptionExpiresAt || null } }));
export default router;
