import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AuditLog } from '../models/index.js';
const router = Router();
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { actorId: req.user._id };
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ activity: logs });
  } catch (err) { next(err); }
});
export default router;
