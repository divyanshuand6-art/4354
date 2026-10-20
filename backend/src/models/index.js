import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const opts = { timestamps: true, minimize: false };

const userSchema = new Schema({
  name: { type: String, trim: true, maxlength: 80, required: true },
  email: { type: String, trim: true, lowercase: true, unique: true, required: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
  plan: { type: String, enum: ['free', 'pro', 'growth'], default: 'free', index: true },
  subscriptionStatus: { type: String, enum: ['free', 'active', 'cancelled', 'past_due'], default: 'free', index: true },
  subscriptionStartedAt: { type: Date, default: null },
  subscriptionExpiresAt: { type: Date, default: null, index: true },
  clickUsageMonth: { type: String, default: null },
  trackedClicksThisMonth: { type: Number, default: 0, min: 0 },
  disabledAt: { type: Date, default: null }
}, opts);

const campaignSchema = new Schema({
  name: { type: String, trim: true, required: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  archivedAt: { type: Date, default: null }
}, opts);
campaignSchema.index({ ownerId: 1, name: 1 });

const tagSchema = new Schema({
  name: { type: String, trim: true, lowercase: true, required: true, maxlength: 40 },
  color: { type: String, default: '#64748b' },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, opts);
tagSchema.index({ ownerId: 1, name: 1 }, { unique: true });

const linkSchema = new Schema({
  code: { type: String, trim: true, required: true, unique: true, index: true },
  title: { type: String, trim: true, maxlength: 140, default: '' },
  originalUrl: { type: String, required: true, maxlength: 4096 },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['active', 'disabled'], default: 'active', index: true },
  archivedAt: { type: Date, default: null, index: true },
  expiresAt: { type: Date, default: null, index: true },
  clickLimit: { type: Number, min: 1, default: null },
  clickCount: { type: Number, default: 0, min: 0 },
  passwordHash: { type: String, default: null, select: false },
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null, index: true },
  tagIds: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
  folder: { type: String, trim: true, maxlength: 100, default: '' },
  rules: {
    deviceTargets: [{ deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet'] }, destinationUrl: String }]
  },
  approvedVersionId: { type: Schema.Types.ObjectId, ref: 'LinkVersion', default: null },
  allowedDomains: [{ type: String, lowercase: true, trim: true }],
  lastClickedAt: { type: Date, default: null }
}, opts);
linkSchema.index({ ownerId: 1, createdAt: -1 });
linkSchema.index({ ownerId: 1, campaignId: 1, createdAt: -1 });

const linkVersionSchema = new Schema({
  linkId: { type: Schema.Types.ObjectId, ref: 'Link', required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  proposedUrl: { type: String, required: true, maxlength: 4096 },
  previousUrl: { type: String, default: null },
  baseVersionId: { type: Schema.Types.ObjectId, ref: 'LinkVersion', default: null },
  status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'pending', index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reason: { type: String, maxlength: 500, default: '' }
}, opts);

const clickEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true },
  linkId: { type: Schema.Types.ObjectId, ref: 'Link', required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null, index: true },
  qrCodeId: { type: Schema.Types.ObjectId, ref: 'QrCode', default: null },
  clickedAt: { type: Date, required: true, index: true },
  visitorHash: { type: String, default: null, index: true },
  referrerDomain: { type: String, default: null },
  userAgent: { type: String, default: '', maxlength: 1000, select: false },
  deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet', 'other', 'unknown'], default: 'unknown' },
  browser: { type: String, default: 'Unknown' },
  country: { type: String, default: null },
  botClass: { type: String, enum: ['likely_human', 'known_bot', 'suspected_automation', 'unknown'], default: 'unknown', index: true },
  isQualifiedClick: { type: Boolean, default: false, index: true },
  detectionReasons: [{ type: String }]
}, { ...opts, timestamps: false });
clickEventSchema.index({ linkId: 1, clickedAt: -1 });
clickEventSchema.index({ campaignId: 1, clickedAt: -1 });

const outboxEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'published', 'processed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  publishedAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  lastError: { type: String, default: '' }
}, opts);

const qrCodeSchema = new Schema({
  linkId: { type: Schema.Types.ObjectId, ref: 'Link', required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, trim: true, maxlength: 120, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

const blockedDomainSchema = new Schema({
  domain: { type: String, lowercase: true, trim: true, unique: true, required: true },
  reason: { type: String, maxlength: 500, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  action: { type: String, required: true, index: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String, default: null },
  details: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: false });

const paymentTransactionSchema = new Schema({
  transactionId: { type: String, required: true, unique: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: String, enum: ['pro', 'growth'], required: true },
  amountPaise: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  provider: { type: String, enum: ['mock'], default: 'mock' },
  environment: { type: String, enum: ['demo'], default: 'demo' },
  outcome: { type: String, enum: ['succeeded', 'failed', 'cancelled'], required: true },
  message: { type: String, maxlength: 240, default: '' }
}, opts);
paymentTransactionSchema.index({ userId: 1, createdAt: -1 });

export const User = model('User', userSchema);
export const Campaign = model('Campaign', campaignSchema);
export const Tag = model('Tag', tagSchema);
export const Link = model('Link', linkSchema);
export const LinkVersion = model('LinkVersion', linkVersionSchema);
export const ClickEvent = model('ClickEvent', clickEventSchema);
export const OutboxEvent = model('OutboxEvent', outboxEventSchema);
export const QrCode = model('QrCode', qrCodeSchema);
export const BlockedDomain = model('BlockedDomain', blockedDomainSchema);
export const AuditLog = model('AuditLog', auditLogSchema);
export const PaymentTransaction = model('PaymentTransaction', paymentTransactionSchema);
