import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { authenticate } from '../middleware/auth.js';
import { requirePlan } from '../middleware/entitlements.js';
import { Link, LinkVersion } from '../models/index.js';
import { normalizeAndValidateUrl, assertDomainAllowed } from '../utils/urls.js';
import { audit } from '../utils/audit.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });
const makeCode = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);
router.post('/links/bulk-import', authenticate, requirePlan('growth', 'Bulk CSV link import'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Upload a CSV file in the `file` field' });
    const rows = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: false });
    if (rows.length > 500) return res.status(400).json({ error: 'Maximum 500 rows per import' });
    if (req.user.role !== 'admin') {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const alreadyCreated = await Link.countDocuments({ ownerId: req.user._id, createdAt: { $gte: monthStart, $lte: now } });
      const remaining = Math.max(0, 2000 - alreadyCreated);
      if (rows.length > remaining) return res.status(403).json({ code: 'LINK_MONTHLY_LIMIT', requiredPlan: 'growth', error: `You can create at most ${remaining} more links this month on Growth. Your import has ${rows.length} rows.` });
    }
    const results = [];
    const seenCodes = new Set();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const original = normalizeAndValidateUrl(row.originalUrl || row.url || '');
        await assertDomainAllowed(original.hostname);
        let code = (row.code || row.alias || '').trim().toLowerCase();
        if (!code) code = makeCode();
        if (!/^[A-Za-z0-9_-]{3,40}$/.test(code)) throw new Error('Alias must be 3–40 letters, numbers, hyphens or underscores');
        if (seenCodes.has(code) || await Link.exists({ code })) throw new Error(`Duplicate alias: ${code}`);
        seenCodes.add(code);
        let expiresAt = null;
        if (row.expiresAt) {
          expiresAt = new Date(row.expiresAt);
          if (Number.isNaN(expiresAt.getTime())) throw new Error('Invalid expiresAt date');
        }
        let clickLimit = null;
        if (row.clickLimit) {
          clickLimit = Number(row.clickLimit);
          if (!Number.isInteger(clickLimit) || clickLimit < 1) throw new Error('clickLimit must be a positive integer');
        }
        const link = await Link.create({ code, title: (row.title || '').slice(0, 140), originalUrl: original.url, ownerId: req.user._id, expiresAt, clickLimit });
        const version = await LinkVersion.create({ linkId: link._id, ownerId: link.ownerId, proposedUrl: link.originalUrl, status: 'approved', requestedBy: req.user._id, reviewedBy: req.user._id, reviewedAt: new Date(), reason: 'Imported initial destination' });
        link.approvedVersionId = version._id;
        await link.save();
        results.push({ row: i + 2, status: 'imported', code });
      } catch (err) { results.push({ row: i + 2, status: 'error', message: err.message }); }
    }
    await audit(req.user._id, 'links.bulk_imported', 'bulkImport', null, { rows: rows.length, imported: results.filter(r => r.status === 'imported').length, errors: results.filter(r => r.status === 'error').length });
    res.status(200).json({ totalRows: rows.length, imported: results.filter(r => r.status === 'imported').length, errors: results.filter(r => r.status === 'error').length, results });
  } catch (err) { next(err); }
});
export default router;
