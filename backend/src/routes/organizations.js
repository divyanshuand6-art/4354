import { Router } from 'express';
import { z } from 'zod';
import { Campaign, Tag, Link } from '../models/index.js';
import { authenticate, canAccessOwnedResource } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authenticate);

router.get('/campaigns', async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? { archivedAt: null } : { ownerId: req.user._id, archivedAt: null };
    const campaigns = await Campaign.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ campaigns });
  } catch (err) { next(err); }
});
router.post('/campaigns', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional().default('') }).parse(req.body);
    const campaign = await Campaign.create({ ...input, ownerId: req.user._id });
    await audit(req.user._id, 'campaign.created', 'campaign', campaign._id, { name: campaign.name });
    res.status(201).json({ campaign });
  } catch (err) { next(err); }
});
router.patch('/campaigns/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign || !canAccessOwnedResource(campaign, req.user)) return res.status(404).json({ error: 'Campaign not found' });
    const input = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(500).optional(), archived: z.boolean().optional() }).parse(req.body);
    if (input.name !== undefined) campaign.name = input.name;
    if (input.description !== undefined) campaign.description = input.description;
    if (input.archived !== undefined) campaign.archivedAt = input.archived ? new Date() : null;
    await campaign.save();
    await audit(req.user._id, 'campaign.updated', 'campaign', campaign._id, input);
    res.json({ campaign });
  } catch (err) { next(err); }
});

router.get('/tags', async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { ownerId: req.user._id };
    res.json({ tags: await Tag.find(filter).sort({ name: 1 }).lean() });
  } catch (err) { next(err); }
});
router.post('/tags', async (req, res, next) => {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).parse(req.body);
    const tag = await Tag.create({ ...input, ownerId: req.user._id });
    await audit(req.user._id, 'tag.created', 'tag', tag._id, { name: tag.name });
    res.status(201).json({ tag });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'You already have a tag with that name' });
    next(err);
  }
});
router.delete('/tags/:id', async (req, res, next) => {
  try {
    const tag = await Tag.findById(req.params.id);
    if (!tag || !canAccessOwnedResource(tag, req.user)) return res.status(404).json({ error: 'Tag not found' });
    await Link.updateMany({ tagIds: tag._id }, { $pull: { tagIds: tag._id } });
    await tag.deleteOne();
    await audit(req.user._id, 'tag.deleted', 'tag', tag._id, { name: tag.name });
    res.json({ success: true });
  } catch (err) { next(err); }
});
export default router;
