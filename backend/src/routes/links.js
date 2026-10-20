import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { Link, LinkVersion, Campaign, Tag, AuditLog } from '../models/index.js';
import { authenticate, canAccessOwnedResource } from '../middleware/auth.js';
import { normalizeAndValidateUrl, assertDomainAllowed } from '../utils/urls.js';
import { audit } from '../utils/audit.js';

const router = Router();
const makeCode = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);
const codeSchema = z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Alias may contain only letters, numbers, hyphens and underscores');
const createSchema = z.object({
  title: z.string().trim().max(140).optional().default(''),
  originalUrl: z.string().url().max(4096),
  code: codeSchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  clickLimit: z.number().int().positive().nullable().optional(),
  password: z.string().min(4).max(128).nullable().optional(),
  campaignId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional().default([]),
  folder: z.string().trim().max(100).optional().default(''),
  allowedDomains: z.array(z.string().trim().min(1).max(253)).optional().default([]),
  deviceTargets: z.array(z.object({ deviceType: z.enum(['mobile', 'desktop', 'tablet']), destinationUrl: z.string().url().max(4096) })).optional().default([])
});

async function assertOwnedAssociations(input, user) {
  if (input.campaignId) {
    const campaign = await Campaign.findById(input.campaignId);
    if (!campaign || !canAccessOwnedResource(campaign, user) || campaign.archivedAt) throw Object.assign(new Error('Campaign not found or not accessible'), { status: 400 });
  }
  if (input.tagIds?.length) {
    if (input.tagIds.some(id => !mongoose.isValidObjectId(id))) throw Object.assign(new Error('One or more tag IDs are invalid'), { status: 400 });
    const count = await Tag.countDocuments({ _id: { $in: input.tagIds }, ...(user.role === 'admin' ? {} : { ownerId: user._id }) });
    if (count !== new Set(input.tagIds).size) throw Object.assign(new Error('One or more tags are not accessible'), { status: 400 });
  }
}

async function safeDestination(input) {
  const normalized = normalizeAndValidateUrl(input);
  await assertDomainAllowed(normalized.hostname);
  return normalized;
}

router.use(authenticate);

router.post('/validate', async (req, res, next) => {
  try {
    const body = z.object({ originalUrl: z.string(), code: codeSchema.optional() }).parse(req.body);
    const dest = await safeDestination(body.originalUrl);
    let aliasAvailable = true;
    if (body.code) aliasAvailable = !(await Link.exists({ code: body.code.toLowerCase() }));
    res.json({ valid: aliasAvailable, destinationHost: dest.hostname, aliasAvailable, warnings: aliasAvailable ? [] : ['This alias is already in use'] });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const { search, status, campaignId } = req.query;
    const filter = req.user.role === 'admin' ? { archivedAt: null } : { ownerId: req.user._id, archivedAt: null };
    if (status && ['active', 'disabled'].includes(status)) filter.status = status;
    if (campaignId && mongoose.isValidObjectId(campaignId)) filter.campaignId = campaignId;
    if (search) filter.$or = [{ title: { $regex: String(search).slice(0, 100), $options: 'i' } }, { code: { $regex: String(search).slice(0, 100), $options: 'i' } }, { originalUrl: { $regex: String(search).slice(0, 150), $options: 'i' } }];
    const links = await Link.find(filter).sort({ createdAt: -1 }).limit(200).select('-passwordHash').populate('campaignId', 'name').lean();
    res.json({ links });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const input = createSchema.parse(req.body);
    if (req.user.role !== 'admin' && input.password && !['pro', 'growth'].includes(req.user.plan)) {
      return res.status(403).json({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'pro', error: 'Password-protected links require Pro or Growth. Upgrade from Plans & billing to unlock this feature.' });
    }
    if (req.user.role !== 'admin' && input.deviceTargets.length && req.user.plan !== 'growth') {
      return res.status(403).json({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'growth', error: 'Smart device routing requires Growth. Upgrade from Plans & billing to unlock this feature.' });
    }
    if (req.user.role !== 'admin') {
      const plan = ['free', 'pro', 'growth'].includes(req.user.plan) ? req.user.plan : 'free';
      const linkLimit = plan === 'growth' ? 2000 : plan === 'pro' ? 500 : 25;
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const linksCreated = await Link.countDocuments({ ownerId: req.user._id, createdAt: { $gte: monthStart, $lte: now } });
      if (linksCreated >= linkLimit) {
        return res.status(403).json({ error: `You've reached the ${plan[0].toUpperCase() + plan.slice(1)} plan's ${linkLimit} new links per month limit. Upgrade your plan to create more links.` });
      }
    }
    const dest = await safeDestination(input.originalUrl);
    for (const target of input.deviceTargets) await safeDestination(target.destinationUrl);
    await assertOwnedAssociations(input, req.user);
    let code = input.code ? input.code.toLowerCase() : undefined;
    if (!code) {
      for (let i = 0; i < 5; i++) {
        const candidate = makeCode();
        if (!(await Link.exists({ code: candidate }))) { code = candidate; break; }
      }
      if (!code) throw Object.assign(new Error('Could not allocate a short code; retry'), { status: 503 });
    }
    const existing = await Link.exists({ code });
    if (existing) return res.status(409).json({ error: 'That short alias is already in use' });
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;
    let created;
    await session.withTransaction(async () => {
      const docs = await Link.create([{
        code, title: input.title, originalUrl: dest.url, ownerId: req.user._id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        clickLimit: input.clickLimit ?? null, clickCount: 0, passwordHash,
        campaignId: input.campaignId || null, tagIds: input.tagIds,
        folder: input.folder,
        allowedDomains: input.allowedDomains.map(s => s.toLowerCase()),
        rules: { deviceTargets: input.deviceTargets.map(t => ({ ...t, destinationUrl: normalizeAndValidateUrl(t.destinationUrl).url })) }
      }], { session });
      created = docs[0];
      const version = await LinkVersion.create([{
        linkId: created._id, ownerId: created.ownerId, proposedUrl: dest.url,
        previousUrl: null, status: 'approved', requestedBy: req.user._id,
        reviewedBy: req.user._id, reviewedAt: new Date(), reason: 'Initial destination'
      }], { session });
      created.approvedVersionId = version[0]._id;
      await created.save({ session });
    });
    await audit(req.user._id, 'link.created', 'link', created._id, { code });
    const safeCreated = created.toObject(); delete safeCreated.passwordHash;
    res.status(201).json({ link: safeCreated, shortUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/r/${created.code}` });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'That short alias is already in use' });
    next(err);
  } finally { await session.endSession(); }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Link not found' });
    const link = await Link.findById(req.params.id).select('+passwordHash').populate('campaignId', 'name').lean();
    if (!link || !canAccessOwnedResource(link, req.user)) return res.status(404).json({ error: 'Link not found' });
    delete link.passwordHash;
    res.json({ link, shortUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/r/${link.code}` });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Link not found' });
    const link = await Link.findById(req.params.id).select('+passwordHash');
    if (!link || !canAccessOwnedResource(link, req.user) || link.archivedAt) return res.status(404).json({ error: 'Link not found' });
    const bodySchema = z.object({
      title: z.string().trim().max(140).optional(),
      originalUrl: z.string().url().max(4096).optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      clickLimit: z.number().int().positive().nullable().optional(),
      password: z.string().min(4).max(128).nullable().optional(),
      campaignId: z.string().nullable().optional(),
      tagIds: z.array(z.string()).optional(),
      folder: z.string().trim().max(100).optional(),
      status: z.enum(['active', 'disabled']).optional(),
      allowedDomains: z.array(z.string().trim().min(1).max(253)).optional()
    }).strict();
    const input = bodySchema.parse(req.body);
    if (req.user.role !== 'admin' && input.password && !['pro', 'growth'].includes(req.user.plan)) {
      return res.status(403).json({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'pro', error: 'Password-protected links require Pro or Growth. Upgrade from Plans & billing to unlock this feature.' });
    }
    if (input.campaignId !== undefined || input.tagIds !== undefined) await assertOwnedAssociations({ campaignId: input.campaignId ?? (link.campaignId ? String(link.campaignId) : null), tagIds: input.tagIds ?? link.tagIds.map(String) }, req.user);
    let proposedVersion = null;
    if (input.originalUrl !== undefined) {
      const dest = await safeDestination(input.originalUrl);
      const current = new URL(link.originalUrl);
      const next = new URL(dest.url);
      const hostAllowed = link.allowedDomains.some(d => next.hostname === d || next.hostname.endsWith(`.${d}`));
      if (current.hostname !== next.hostname && !hostAllowed && req.user.role !== 'admin') {
        proposedVersion = await LinkVersion.create({ linkId: link._id, ownerId: link.ownerId, proposedUrl: dest.url, previousUrl: link.originalUrl, baseVersionId: link.approvedVersionId || null, status: 'pending', requestedBy: req.user._id, reason: 'Domain change requires review' });
        await audit(req.user._id, 'link.destination_change_pending', 'linkVersion', proposedVersion._id, { linkId: String(link._id), newHost: next.hostname });
      } else {
        const v = await LinkVersion.create({ linkId: link._id, ownerId: link.ownerId, proposedUrl: dest.url, previousUrl: link.originalUrl, status: 'approved', requestedBy: req.user._id, reviewedBy: req.user._id, reviewedAt: new Date(), reason: 'Destination updated under policy' });
        link.originalUrl = dest.url;
        link.approvedVersionId = v._id;
        await audit(req.user._id, 'link.destination_changed', 'link', link._id, { versionId: String(v._id) });
      }
    }
    if (input.title !== undefined) link.title = input.title;
    if (input.expiresAt !== undefined) link.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (input.clickLimit !== undefined) link.clickLimit = input.clickLimit;
    if (input.password !== undefined) link.passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;
    if (input.campaignId !== undefined) link.campaignId = input.campaignId || null;
    if (input.tagIds !== undefined) link.tagIds = input.tagIds;
    if (input.folder !== undefined) link.folder = input.folder;
    if (input.status !== undefined) link.status = input.status;
    if (input.allowedDomains !== undefined) link.allowedDomains = input.allowedDomains.map(s => s.toLowerCase());
    await link.save();
    await audit(req.user._id, 'link.updated', 'link', link._id, { fields: Object.keys(input) });
    const safeLink = link.toObject(); delete safeLink.passwordHash;
    res.json({ link: safeLink, pendingDestinationChange: proposedVersion ? { id: String(proposedVersion._id), status: proposedVersion.status } : null });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const link = await Link.findById(req.params.id);
    if (!link || !canAccessOwnedResource(link, req.user)) return res.status(404).json({ error: 'Link not found' });
    link.status = 'disabled';
    link.archivedAt = new Date();
    await link.save();
    await audit(req.user._id, 'link.archived', 'link', link._id, { code: link.code });
    res.json({ success: true, message: 'Link archived; historical analytics retained' });
  } catch (err) { next(err); }
});

router.get('/:id/versions', async (req, res, next) => {
  try {
    const link = await Link.findById(req.params.id).select('_id ownerId');
    if (!link || !canAccessOwnedResource(link, req.user)) return res.status(404).json({ error: 'Link not found' });
    const versions = await LinkVersion.find({ linkId: link._id }).sort({ createdAt: -1 }).lean();
    res.json({ versions });
  } catch (err) { next(err); }
});

export default router;
