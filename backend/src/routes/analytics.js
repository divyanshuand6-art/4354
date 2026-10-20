import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ClickEvent, Link, Campaign } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { requirePlan } from '../middleware/entitlements.js';

const router = Router();
router.use(authenticate);
const rangeSchema = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional(), campaignId: z.string().optional() });
const RETENTION_DAYS = { free: 30, pro: 90, growth: 365 };
function withinPlanRetention(req, res, from, now = new Date()) {
  if (req.user.role === 'admin') return true;
  const days = RETENTION_DAYS[req.user.plan] || RETENTION_DAYS.free;
  const oldest = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  if (from < oldest) {
    const upgradeMessage = req.user.plan === 'free' ? 'Upgrade to Pro or Growth to view more history.' : req.user.plan === 'pro' ? 'Upgrade to Growth to view more history.' : 'The demo Growth plan includes up to 365 days of history.';
    res.status(403).json({ code: req.user.plan === 'growth' ? 'ANALYTICS_RETENTION_LIMIT' : 'PLAN_UPGRADE_REQUIRED', requiredPlan: req.user.plan === 'free' ? 'pro' : req.user.plan === 'pro' ? 'growth' : null, error: `Your ${req.user.plan || 'Free'} plan includes ${days} days of analytics history. ${upgradeMessage}` });
    return false;
  }
  return true;
}
router.get('/overview', async (req, res, next) => {
  try {
    const input = rangeSchema.parse(req.query);
    const now = new Date();
    const from = input.from ? new Date(input.from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = input.to ? new Date(input.to) : now;
    if (from > to) return res.status(400).json({ error: '`from` must be before `to`' });
    if (!withinPlanRetention(req, res, from, now)) return;
    const ownerFilter = req.user.role === 'admin' ? {} : { ownerId: req.user._id };
    const linkFilter = { ...ownerFilter, archivedAt: null };
    if (input.campaignId) {
      if (!mongoose.isValidObjectId(input.campaignId)) return res.status(400).json({ error: 'Invalid campaignId' });
      const campaign = await Campaign.findById(input.campaignId);
      if (!campaign || (req.user.role !== 'admin' && String(campaign.ownerId) !== String(req.user._id))) return res.status(404).json({ error: 'Campaign not found' });
      linkFilter.campaignId = input.campaignId;
    }
    const [totalLinks, activeLinks, disabledLinks, expiredLinks, clickStats, daily, topLinks, traffic, topReferrers, topDevices, topCountries] = await Promise.all([
      Link.countDocuments(linkFilter),
      Link.countDocuments({ ...linkFilter, status: 'active', $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }),
      Link.countDocuments({ ...linkFilter, status: 'disabled' }),
      Link.countDocuments({ ...linkFilter, status: 'active', expiresAt: { $ne: null, $lte: now } }),
      ClickEvent.aggregate([{ $match: { ...ownerFilter, clickedAt: { $gte: from, $lte: to }, ...(input.campaignId ? { campaignId: new mongoose.Types.ObjectId(input.campaignId) } : {}) } }, { $group: { _id: null, total: { $sum: 1 }, humanQualified: { $sum: { $cond: ['$isQualifiedClick', 1, 0] } }, bots: { $sum: { $cond: [{ $eq: ['$botClass', 'known_bot'] }, 1, 0] } }, suspected: { $sum: { $cond: [{ $eq: ['$botClass', 'suspected_automation'] }, 1, 0] } }, uniqueVisitors: { $addToSet: { $cond: ['$isQualifiedClick', '$visitorHash', null] } } } }, { $project: { _id: 0, total: 1, humanQualified: 1, bots: 1, suspected: 1, uniqueVisitors: { $size: { $filter: { input: '$uniqueVisitors', as: 'v', cond: { $ne: ['$$v', null] } } } } } }]),
      ClickEvent.aggregate([{ $match: { ...ownerFilter, clickedAt: { $gte: from, $lte: to }, isQualifiedClick: true, ...(input.campaignId ? { campaignId: new mongoose.Types.ObjectId(input.campaignId) } : {}) } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$clickedAt', timezone: 'UTC' } }, clicks: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      ClickEvent.aggregate([{ $match: { ...ownerFilter, clickedAt: { $gte: from, $lte: to }, isQualifiedClick: true, ...(input.campaignId ? { campaignId: new mongoose.Types.ObjectId(input.campaignId) } : {}) } }, { $group: { _id: '$linkId', clicks: { $sum: 1 } } }, { $sort: { clicks: -1 } }, { $limit: 10 }, { $lookup: { from: 'links', localField: '_id', foreignField: '_id', as: 'link' } }, { $unwind: '$link' }, { $project: { _id: 0, linkId: '$_id', code: '$link.code', title: '$link.title', clicks: 1 } }]),
      ClickEvent.aggregate([{ $match: { ...ownerFilter, clickedAt: { $gte: from, $lte: to }, ...(input.campaignId ? { campaignId: new mongoose.Types.ObjectId(input.campaignId) } : {}) } }, { $group: { _id: '$botClass', count: { $sum: 1 } } }]),
      ClickEvent.aggregate([{ $match: { ...ownerFilter, clickedAt: { $gte: from, $lte: to }, isQualifiedClick: true, ...(input.campaignId ? { campaignId: new mongoose.Types.ObjectId(input.campaignId) } : {}) } }, { $group: { _id: { $cond: [{ $or: [{ $eq: ['$referrerDomain', null] }, { $eq: ['$referrerDomain', ''] }] }, 'Direct / unknown', '$referrerDomain'] }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
      ClickEvent.aggregate([{ $match: { ...ownerFilter, clickedAt: { $gte: from, $lte: to }, isQualifiedClick: true, ...(input.campaignId ? { campaignId: new mongoose.Types.ObjectId(input.campaignId) } : {}) } }, { $group: { _id: '$deviceType', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
      ClickEvent.aggregate([{ $match: { ...ownerFilter, clickedAt: { $gte: from, $lte: to }, isQualifiedClick: true, country: { $nin: [null, ''] }, ...(input.campaignId ? { campaignId: new mongoose.Types.ObjectId(input.campaignId) } : {}) } }, { $group: { _id: '$country', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }])
    ]);
    const totals = clickStats[0] || { total: 0, humanQualified: 0, bots: 0, suspected: 0, uniqueVisitors: 0 };
    res.json({ period: { from, to }, links: { total: totalLinks, active: activeLinks, disabled: disabledLinks, expired: expiredLinks }, clicks: totals, daily, topLinks, trafficClassification: traffic, referrers: topReferrers, devices: topDevices, countries: topCountries });
  } catch (err) { next(err); }
});

router.get('/campaigns', async (req, res, next) => {
  try {
    const now = new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(String(req.query.to)) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return res.status(400).json({ error: 'Invalid date range' });
    if (!withinPlanRetention(req, res, from, now)) return;
    const match = { clickedAt: { $gte: from, $lte: to }, campaignId: { $ne: null } };
    if (req.user.role !== 'admin') match.ownerId = req.user._id;
    const campaigns = await ClickEvent.aggregate([
      { $match: match },
      { $group: { _id: '$campaignId', totalClicks: { $sum: 1 }, humanQualifiedClicks: { $sum: { $cond: ['$isQualifiedClick', 1, 0] } }, knownBots: { $sum: { $cond: [{ $eq: ['$botClass', 'known_bot'] }, 1, 0] } }, visitors: { $addToSet: { $cond: ['$isQualifiedClick', '$visitorHash', null] } } } },
      { $lookup: { from: 'campaigns', localField: '_id', foreignField: '_id', as: 'campaign' } },
      { $unwind: '$campaign' },
      ...(req.user.role === 'admin' ? [] : [{ $match: { 'campaign.ownerId': req.user._id } }]),
      { $lookup: { from: 'links', localField: '_id', foreignField: 'campaignId', as: 'links' } },
      { $project: { _id: 0, campaignId: '$_id', name: '$campaign.name', totalLinks: { $size: '$links' }, totalClicks: 1, humanQualifiedClicks: 1, knownBots: 1, uniqueVisitors: { $size: { $filter: { input: '$visitors', as: 'v', cond: { $ne: ['$$v', null] } } } } } },
      { $sort: { humanQualifiedClicks: -1 } }
    ]);
    res.json({ period: { from, to }, campaigns });
  } catch (err) { next(err); }
});

router.get('/links/:id', requirePlan('pro', 'Advanced per-link analytics'), async (req, res, next) => {
  try {
    const link = await Link.findById(req.params.id).select('ownerId code title campaignId');
    if (!link || (req.user.role !== 'admin' && String(link.ownerId) !== String(req.user._id))) return res.status(404).json({ error: 'Link not found' });
    const result = await ClickEvent.aggregate([
      { $match: { linkId: link._id } },
      { $facet: {
        classification: [{ $group: { _id: '$botClass', count: { $sum: 1 } } }],
        devices: [{ $match: { isQualifiedClick: true } }, { $group: { _id: '$deviceType', count: { $sum: 1 } } }],
        browsers: [{ $match: { isQualifiedClick: true } }, { $group: { _id: '$browser', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }],
        referrers: [{ $match: { isQualifiedClick: true } }, { $group: { _id: '$referrerDomain', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }],
        daily: [{ $match: { isQualifiedClick: true } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$clickedAt', timezone: 'UTC' } }, clicks: { $sum: 1 } } }, { $sort: { _id: 1 } }]
      } }
    ]);
    res.json({ link: { id: String(link._id), code: link.code, title: link.title }, analytics: result[0] });
  } catch (err) { next(err); }
});
export default router;
