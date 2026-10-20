import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/db.js';
import { User } from '../models/index.js';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME || 'LinkPulse Admin';
if (!email || !password || password.length < 12) {
  console.error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters) in backend/.env first.');
  process.exit(1);
}
await connectDatabase();
const existing = await User.findOne({ email });
if (existing) {
  existing.role = 'admin';
  existing.disabledAt = null;
  await existing.save();
  console.log(`Existing account promoted to admin: ${email}`);
} else {
  await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
  console.log(`Admin account created: ${email}`);
}
await (await import('mongoose')).default.disconnect();
