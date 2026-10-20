import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AuditLog, ClickEvent, Link, PaymentTransaction, User } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const PLAN_LIMITS = {
  free: { linksPerMonth: 25, trackedClicksPerMonth: 1000 },
  pro: { linksPerMonth: 500, trackedClicksPerMonth: 25000 },
  growth: { linksPerMonth: 2000, trackedClicksPerMonth: null }
};
const PAID_PLANS = {
  pro: { name: 'Pro', amountPaise: 19900 },
  growth: { name: 'Growth', amountPaise: 59900 }
};

// The mock gateway is intentionally unavailable in production unless explicitly enabled.
function mockBillingEnabled() {
  if (process.env.MOCK_BILLING_ENABLED === 'true') return true;
  if (process.env.MOCK_BILLING_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many demo checkout attempts. Please wait and try again.' }
});

router.get('/config', (req, res) => {
  res.json({
    demoOnly: true,
    mockBillingEnabled: mockBillingEnabled(),
    warning: 'This is a simulated payment flow. It never charges real money or collects card details.',
    plans: {
      pro: { name: 'Pro', amount: 199, currency: 'INR', interval: 'month' },
      growth: { name: 'Growth', amount: 599, currency: 'INR', interval: 'month' }
    },
    currentPlan: req.user.role === 'admin' ? 'admin' : (req.user.plan || 'free'),
    subscriptionStatus: req.user.subscriptionStatus || (req.user.plan === 'free' ? 'free' : 'active'),
    subscriptionExpiresAt: req.user.subscriptionExpiresAt || null
  });
});

// Current-month usage for the signed-in user. The Growth click allowance is unlimited (null).
router.get('/usage', async (req, res, next) => {
  try {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const ownerFilter = req.user.role === 'admin' ? {} : { ownerId: req.user._id };
    const [linksCreated, trackedClicks] = await Promise.all([
      Link.countDocuments({ ...ownerFilter, createdAt: { $gte: from, $lte: now } }),
      ClickEvent.countDocuments({ ...ownerFilter, clickedAt: { $gte: from, $lte: now } })
    ]);
    const plan = req.user.role === 'admin' ? 'admin' : (Object.hasOwn(PLAN_LIMITS, req.user.plan) ? req.user.plan : 'free');
    const limits = plan === 'admin' ? { linksPerMonth: null, trackedClicksPerMonth: null } : PLAN_LIMITS[plan];
    res.json({
      plan,
      period: { from: from.toISOString(), to: now.toISOString(), timezone: 'UTC' },
      usage: { linksCreated, trackedClicks },
      limits,
      subscription: {
        status: req.user.role === 'admin' ? 'admin' : (req.user.subscriptionStatus || (plan === 'free' ? 'free' : 'active')),
        startedAt: req.user.subscriptionStartedAt || null,
        expiresAt: req.user.subscriptionExpiresAt || null
      }
    });
  } catch (err) { next(err); }
});

router.get('/history', async (req, res, next) => {
  try {
    const transactions = await PaymentTransaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 }).limit(10).select('-__v').lean();
    res.json({ transactions });
  } catch (err) { next(err); }
});

const mockCheckoutSchema = z.object({
  plan: z.enum(['pro', 'growth'])
});

// Demo-only checkout: every valid request succeeds. The authenticated user's account is
// determined from the bearer token; callers cannot choose a different account or price.
// No card, UPI, bank, or other payment credentials are accepted by this endpoint.
router.post('/mock-checkout', checkoutLimiter, async (req, res, next) => {
  try {
    if (!mockBillingEnabled()) {
      return res.status(503).json({ error: 'Demo checkout is disabled. Real billing must be integrated before production subscriptions can be sold.' });
    }
    if (req.user.role === 'admin') return res.status(400).json({ error: 'Administrator accounts do not need a paid plan.' });

    const input = mockCheckoutSchema.parse(req.body);
    const planDetails = PAID_PLANS[input.plan]; // Never accept amount or currency from the client.
    const outcome = 'succeeded'; // This mock checkout intentionally always succeeds.
    const message = `Demo payment successful. ${planDetails.name} is now active for this account for 30 days; no money was charged.`;

    const session = await mongoose.startSession();
    let transaction = null;
    let subscription = null;
    try {
      await session.withTransaction(async () => {
        const [createdTransaction] = await PaymentTransaction.create([{
          transactionId: `MOCK-${randomUUID()}`,
          userId: req.user._id,
          plan: input.plan,
          amountPaise: planDetails.amountPaise,
          currency: 'INR',
          provider: 'mock',
          environment: 'demo',
          outcome,
          message
        }], { session });
        transaction = createdTransaction;

        const account = await User.findById(req.user._id).session(session);
        if (!account || account.disabledAt || account.role === 'admin') {
          throw Object.assign(new Error('Account is not eligible for a demo subscription'), { status: 403 });
        }
        const now = new Date();
        const samePlanUnexpired = account.plan === input.plan && account.subscriptionExpiresAt && account.subscriptionExpiresAt > now;
        const expiryBase = samePlanUnexpired ? new Date(account.subscriptionExpiresAt) : now;
        const expiresAt = new Date(expiryBase);
        expiresAt.setDate(expiresAt.getDate() + 30);
        const startedAt = samePlanUnexpired ? (account.subscriptionStartedAt || now) : now;
        account.plan = input.plan;
        account.subscriptionStatus = 'active';
        account.subscriptionStartedAt = startedAt;
        account.subscriptionExpiresAt = expiresAt;
        await account.save({ session });

        subscription = { plan: input.plan, status: 'active', startedAt, expiresAt };
        await AuditLog.create([{
          actorId: req.user._id,
          action: 'demo_subscription_activated',
          resourceType: 'subscription',
          resourceId: String(req.user._id),
          details: { plan: input.plan, amount: planDetails.amountPaise / 100, currency: 'INR', transactionId: createdTransaction.transactionId, demoOnly: true }
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    res.json({
      demoOnly: true,
      success: true,
      outcome,
      message,
      transaction: {
        id: transaction.transactionId,
        plan: transaction.plan,
        amount: transaction.amountPaise / 100,
        currency: transaction.currency,
        outcome: transaction.outcome,
        createdAt: transaction.createdAt
      },
      account: { id: String(req.user._id), email: req.user.email },
      subscription
    });
  } catch (err) { next(err); }
});

export default router;
