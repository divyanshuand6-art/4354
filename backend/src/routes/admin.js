import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { User, Link, LinkVersion, BlockedDomain } from '../models/index.js';
import { normalizeAndValidateUrl, assertDomainAllowed } from '../utils/urls.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authenticate, requireAdmin);
router.get('/users', async (_req, res, next) => {
  try { res.json({ users: await User.find({}).select('_id name email role disabledAt createdAt').sort({ createdAt: -1 }).limit(500).lean() }); }
  catch (err) { next(err); }
});
router.patch('/users/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'User not found' });
    const input = z.object({ role: z.enum(['user', 'admin']).optional(), disabled: z.boolean().optional() }).strict().parse(req.body);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (String(user._id) === String(req.user._id) && (input.role === 'user' || input.disabled === true)) return res.status(400).json({ error: 'You cannot remove your own admin access or disable your own account' });
    if (input.role) user.role = input.role;
    if (input.disabled !== undefined) user.disabledAt = input.disabled ? new Date() : null;
    await user.save();
    await audit(req.user._id, 'admin.user_updated', 'user', user._id, input);
    res.json({ user: { id: String(user._id), name: user.name, email: user.email, role: user.role, disabledAt: user.disabledAt } });
  } catch (err) { next(err); }
});
router.get('/link-versions', async (req, res, next) => {
  try {
    const filter = req.query.status === 'pending' ? { status: 'pending' } : {};
    const versions = await LinkVersion.find(filter).sort({ createdAt: -1 }).limit(300).populate('linkId', 'code title').populate('requestedBy', 'name email').lean();
    res.json({ versions });
  } catch (err) { next(err); }
});
router.get('/blocked-domains', async (_req, res, next) => {
  try { res.json({ blockedDomains: await BlockedDomain.find({}).sort({ domain: 1 }).lean() }); }
  catch (err) { next(err); }
});
router.post('/blocked-domains', async (req, res, next) => {
  try {
    const input = z.object({ domain: z.string().trim().min(1).max(253), reason: z.string().trim().max(500).optional().default('') }).parse(req.body);
    const domain = input.domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '');
    if (!domain || domain.includes(':') || domain.includes(' ')) return res.status(400).json({ error: 'Enter a domain name without a scheme or path' });
    const item = await BlockedDomain.create({ domain, reason: input.reason, createdBy: req.user._id });
    await audit(req.user._id, 'admin.domain_blocked', 'blockedDomain', item._id, { domain });
    res.status(201).json({ blockedDomain: item });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Domain is already blocked' });
    next(err);
  }
});
router.delete('/blocked-domains/:id', async (req, res, next) => {
  try {
    const item = await BlockedDomain.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Blocked domain not found' });
    await item.deleteOne();
    await audit(req.user._id, 'admin.domain_unblocked', 'blockedDomain', item._id, { domain: item.domain });
    res.json({ success: true });
  } catch (err) { next(err); }
});
router.post('/link-versions/:id/review', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const input = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional().default('') }).parse(req.body);
    let version;
    await session.withTransaction(async () => {
      version = await LinkVersion.findById(req.params.id).session(session);
      if (!version || version.status !== 'pending') throw Object.assign(new Error('Pending destination change not found'), { status: 404 });
      const link = await Link.findById(version.linkId).session(session);
      if (!link || link.archivedAt) throw Object.assign(new Error('Link not found or archived'), { status: 404 });
      if (input.decision === 'approve' && (String(link.approvedVersionId || '') !== String(version.baseVersionId || '') || link.originalUrl !== version.previousUrl)) throw Object.assign(new Error('This proposal is stale because the active destination changed after it was submitted'), { status: 409 });
      const normalized = normalizeAndValidateUrl(version.proposedUrl);
      if (input.decision === 'approve') await assertDomainAllowed(normalized.hostname);
      version.reviewedBy = req.user._id;
      version.reviewedAt = new Date();
      version.reason = input.reason;
      version.status = input.decision === 'approve' ? 'approved' : 'rejected';
      await version.save({ session });
      if (input.decision === 'approve') {
        link.originalUrl = normalized.url;
        link.approvedVersionId = version._id;
        await link.save({ session });
      }
    });
    await audit(req.user._id, `admin.link_version_${input.decision === 'approve' ? 'approved' : 'rejected'}`, 'linkVersion', version._id, { linkId: String(version.linkId), reason: input.reason });
    res.json({ version });
  } catch (err) { next(err); }
  finally { await session.endSession(); }
});
router.post('/links/:id/disable', async (req, res, next) => {
  try {
    const link = await Link.findById(req.params.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    link.status = 'disabled';
    await link.save();
    await audit(req.user._id, 'admin.link_disabled', 'link', link._id, { code: link.code, reason: String(req.body?.reason || '').slice(0, 500) });
    res.json({ success: true, link: { id: String(link._id), status: link.status } });
  } catch (err) { next(err); }
});
export default router;
