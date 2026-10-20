import { AuditLog } from '../models/index.js';
export async function audit(actorId, action, resourceType, resourceId = null, details = {}) {
  try { await AuditLog.create({ actorId: actorId || null, action, resourceType, resourceId: resourceId ? String(resourceId) : null, details }); }
  catch (err) { console.error('Audit log write failed:', err.message); }
}
