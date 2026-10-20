import net from 'node:net';
import { BlockedDomain } from '../models/index.js';

const RESERVED_HOSTS = new Set(['localhost', 'localhost.localdomain']);
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
export function normalizeAndValidateUrl(input) {
  if (typeof input !== 'string' || input.trim().length === 0) throw new Error('Destination URL is required');
  let url;
  try { url = new URL(input.trim()); } catch { throw new Error('Enter a valid URL including https:// or http://'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS destinations are allowed');
  if (url.username || url.password) throw new Error('URLs containing embedded credentials are not allowed');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || RESERVED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Local or internal destinations are not allowed');
  if (net.isIP(host) === 4 && isPrivateIPv4(host)) throw new Error('Private or reserved IP destinations are not allowed');
  if (net.isIP(host) === 6) {
    const mappedIpv4 = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') || host.startsWith('ff') || host.startsWith('2001:db8:') || (mappedIpv4 && isPrivateIPv4(mappedIpv4))) throw new Error('Private or reserved IP destinations are not allowed');
  }
  return { url: url.toString(), hostname: host };
}
export async function assertDomainAllowed(hostname) {
  const rows = await BlockedDomain.find({}).select('domain').lean();
  const blocked = rows.some(({ domain }) => hostname === domain || hostname.endsWith(`.${domain}`));
  if (blocked) throw new Error('This destination domain is blocked by LinkPulse safety policy');
}
