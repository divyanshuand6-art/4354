import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('_id name email role plan subscriptionStatus subscriptionStartedAt subscriptionExpiresAt disabledAt');
    if (!user || user.disabledAt) return res.status(401).json({ error: 'Account is unavailable' });
    // Expire demo subscriptions server-side before protected routes make entitlement decisions.
    if (user.plan !== 'free' && user.subscriptionExpiresAt && user.subscriptionExpiresAt <= new Date()) {
      user.plan = 'free';
      user.subscriptionStatus = 'free';
      user.subscriptionStartedAt = null;
      user.subscriptionExpiresAt = null;
      await user.save();
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Invalid or expired token' });
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator permission required' });
  next();
}

export function canAccessOwnedResource(resource, user) {
  return user?.role === 'admin' || String(resource.ownerId) === String(user?._id);
}
