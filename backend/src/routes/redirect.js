import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { UAParser } from 'ua-parser-js';
import { rateLimit } from 'express-rate-limit';
import { Link, ClickEvent, OutboxEvent, QrCode, User } from '../models/index.js';
import { assertDomainAllowed, normalizeAndValidateUrl } from '../utils/urls.js';
import { classifyPreliminary } from '../services/botRules.js';

const router = Router();
const unlockLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many password attempts. Please try again later.' } });
const redirectError = (res, status, title, message) => res.status(status).type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} · LinkPulse</title><style>body{font:16px system-ui;background:#f7f8fb;color:#172033;display:grid;place-items:center;min-height:90vh}.card{max-width:520px;padding:32px;background:white;border:1px solid #e5e7eb;border-radius:18px}h1{font-size:25px}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p><p>Powered by LinkPulse</p></main></body></html>`);

function classifyDevice(userAgent) {
  const parsed = new UAParser(userAgent).getResult();
  const type = parsed.device?.type;
  const deviceType = type === 'mobile' || type === 'tablet' ? type : userAgent ? 'desktop' : 'unknown';
  return { parsed, deviceType };
}
function visitorHash(req, res) {
  let visitorId = req.cookies?.lp_vid;
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    res.cookie('lp_vid', visitorId, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000, path: '/' });
  }
  const secret = process.env.VISITOR_HASH_SECRET || process.env.JWT_SECRET || 'development-only-secret-change-me';
  return crypto.createHmac('sha256', secret).update(visitorId).digest('hex');
}
function publicMessageForError(err) {
  if (err.status === 410) return ['410', 'Link unavailable', err.message];
  if (err.status === 403) return ['403', 'Access denied', err.message];
  return ['503', 'Temporary problem', 'LinkPulse could not safely complete this redirect. Please retry shortly.'];
}

async function shouldTrackClick(session, ownerId, now) {
  const account = await User.findById(ownerId).select('role plan subscriptionStatus subscriptionExpiresAt clickUsageMonth trackedClicksThisMonth').session(session);
  if (!account) return true; // Prefer retaining analytics if an owner record cannot be found.

  // Expire a demo subscription here too, because public short-link redirects do not use auth middleware.
  if (account.plan !== 'free' && account.subscriptionExpiresAt && account.subscriptionExpiresAt <= now) {
    await User.updateOne({ _id: account._id, plan: account.plan, subscriptionExpiresAt: { $lte: now } }, { $set: { plan: 'free', subscriptionStatus: 'free', subscriptionStartedAt: null, subscriptionExpiresAt: null } }, { session });
    account.plan = 'free';
    account.subscriptionStatus = 'free';
  }

  if (account.role === 'admin') return true;
  const plan = account.plan === 'growth' ? 'growth' : account.plan === 'pro' ? 'pro' : 'free';
  const limit = plan === 'growth' ? null : plan === 'pro' ? 25000 : 1000;
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const used = account.clickUsageMonth === periodKey
    ? Number(account.trackedClicksThisMonth || 0)
    : await ClickEvent.countDocuments({ ownerId, clickedAt: { $gte: monthStart, $lte: now } }).session(session);

  if (account.clickUsageMonth !== periodKey) {
    await User.updateOne({ _id: ownerId }, { $set: { clickUsageMonth: periodKey, trackedClicksThisMonth: used } }, { session });
  }
  if (limit !== null && used >= limit) return false;

  // Always maintain the monthly counter, even on Growth, so an expired demo plan cannot reset its usage to zero.
  // For unlimited Growth, no upper bound is applied. For Free/Pro, the conditional update enforces the cap atomically.
  const query = { _id: ownerId, plan, clickUsageMonth: periodKey };
  if (limit !== null) query.trackedClicksThisMonth = { $lt: limit };
  const reservation = await User.updateOne(query, { $inc: { trackedClicksThisMonth: 1 } }, { session });
  return reservation.modifiedCount === 1;
}

async function performRedirect(req, res, link, url, qrId = null) {
  const now = new Date();
  const ua = req.get('user-agent') || '';
  const { parsed, deviceType } = classifyDevice(ua);
  const visitor = visitorHash(req, res);
  const referrer = req.get('referer');
  let referrerDomain = null;
  if (referrer) { try { referrerDomain = new URL(referrer).hostname.toLowerCase(); } catch {} }
  const preliminary = classifyPreliminary(ua);
  const eventId = crypto.randomUUID();
  const session = await mongoose.startSession();
  try {
    let reserved = false;
    await session.withTransaction(async () => {
      const filter = {
        _id: link._id,
        code: link.code,
        status: 'active',
        archivedAt: null,
        originalUrl: link.originalUrl,
        approvedVersionId: link.approvedVersionId,
        $and: [
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
          { $or: [{ clickLimit: null }, { $expr: { $lt: ['$clickCount', '$clickLimit'] } }] }
        ]
      };
      const updated = await Link.findOneAndUpdate(filter, { $inc: { clickCount: 1 }, $set: { lastClickedAt: now } }, { new: true, session });
      if (!updated) throw Object.assign(new Error('The link is disabled, expired, or its click limit has been reached.'), { status: 410 });
      const shouldTrack = await shouldTrackClick(session, updated.ownerId, now);
      if (shouldTrack) {
        await ClickEvent.create([{
          eventId, linkId: updated._id, ownerId: updated.ownerId, campaignId: updated.campaignId || null,
          qrCodeId: qrId || null, clickedAt: now, visitorHash: visitor, referrerDomain,
          userAgent: ua.slice(0, 1000), deviceType, browser: parsed.browser?.name || 'Unknown',
          botClass: preliminary.botClass, isQualifiedClick: false, detectionReasons: preliminary.detectionReasons
        }], { session });
        await OutboxEvent.create([{ eventId, status: 'pending' }], { session });
      }
      // A click quota limits analytics collection, never the visitor's ability to reach the destination.
      reserved = true;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    if (!reserved) throw new Error('Click reservation was not committed');
    return res.redirect(302, url);
  } finally { await session.endSession(); }
}

async function resolveAndRun(req, res, suppliedPassword = null) {
  const link = await Link.findOne({ code: req.params.code }).select('+passwordHash');
  if (!link || link.archivedAt) return redirectError(res, 404, 'Link not found', 'This short link does not exist or is no longer available.');
  if (link.status !== 'active') return redirectError(res, 410, 'Link disabled', 'The owner or administrator has disabled this link.');
  if (link.expiresAt && link.expiresAt <= new Date()) return redirectError(res, 410, 'Link expired', 'This short link has expired.');
  if (link.clickLimit !== null && link.clickCount >= link.clickLimit) return redirectError(res, 410, 'Click limit reached', 'This short link has reached its permitted number of redirects.');
  let target = link.originalUrl;
  if (link.passwordHash) {
    if (!suppliedPassword) return res.status(200).type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Password required · LinkPulse</title><style>body{font:16px system-ui;background:#f7f8fb;color:#172033;display:grid;place-items:center;min-height:90vh}.card{width:min(420px,88vw);padding:30px;background:white;border:1px solid #e5e7eb;border-radius:18px}input,button{font:inherit;padding:11px;width:100%;box-sizing:border-box;margin-top:10px}button{background:#1d4ed8;color:white;border:0;border-radius:8px}</style></head><body><main class="card"><h1>Password protected link</h1><p>Enter the password supplied by the link owner.</p><form method="post" action="/r/${encodeURIComponent(link.code)}/unlock"><input type="password" name="password" autocomplete="current-password" required maxlength="128"/><button type="submit">Continue</button></form></main></body></html>`);
    if (!(await bcrypt.compare(suppliedPassword, link.passwordHash))) return redirectError(res, 401, 'Incorrect password', 'The password was not correct. No click allowance was used.');
  }
  const userAgent = req.get('user-agent') || '';
  const { deviceType } = classifyDevice(userAgent);
  const matched = (link.rules?.deviceTargets || []).find(r => r.deviceType === deviceType);
  if (matched?.destinationUrl) target = matched.destinationUrl;
  try {
    const destination = normalizeAndValidateUrl(target);
    await assertDomainAllowed(destination.hostname);
    target = destination.url;
  } catch (err) {
    return redirectError(res, 403, 'Destination blocked', err.message || 'This destination is blocked by LinkPulse safety policy.');
  }
  let qrId = null;
  const rawQr = req.query.qr;
  if (rawQr && mongoose.isValidObjectId(String(rawQr))) {
    const qr = await QrCode.findOne({ _id: rawQr, linkId: link._id }).select('_id').lean();
    if (qr) qrId = qr._id;
  }
  try { return await performRedirect(req, res, link, target, qrId); }
  catch (err) {
    const [status, title, message] = publicMessageForError(err);
    return redirectError(res, Number(status), title, message);
  }
}

router.get('/:code', async (req, res, next) => {
  try {
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(req.params.code)) return redirectError(res, 404, 'Link not found', 'This short link does not exist.');
    return await resolveAndRun(req, res);
  } catch (err) { next(err); }
});
router.post('/:code/unlock', unlockLimiter, async (req, res, next) => {
  try {
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(req.params.code)) return redirectError(res, 404, 'Link not found', 'This short link does not exist.');
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    return await resolveAndRun(req, res, password);
  } catch (err) { next(err); }
});
export default router;
