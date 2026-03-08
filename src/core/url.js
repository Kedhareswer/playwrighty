const net = require('net');

function ensureUrl(input) {
  if (!input || typeof input !== 'string') throw new Error('URL is required');

  let v = input.trim();
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;

  let u;
  try {
    u = new URL(v);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!u.hostname) throw new Error('Invalid URL');
  return u.toString();
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function normalizeUrl(u) {
  const url = new URL(u);
  url.hash = '';
  return url.toString();
}

function isPrivateIPv4(addr) {
  const parts = addr.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^\d+$/.test(p))) return false;
  const [a, b] = parts.map(Number);
  if (a === 0) return true;                          // 0.0.0.0/8
  if (a === 10) return true;                         // 10.0.0.0/8
  if (a === 127) return true;                        // 127.0.0.0/8
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16
  return false;
}

/**
 * Check if a URL targets a private/internal network address.
 * Used to prevent SSRF attacks from user-supplied URLs.
 *
 * Note: This checks the hostname string, not DNS resolution.
 * A determined attacker could use DNS rebinding to bypass this.
 * For full protection, add a Playwright network interceptor.
 */
function isPrivateUrl(urlString) {
  let hostname;
  try {
    hostname = new URL(urlString).hostname;
  } catch {
    return true; // invalid URL => treat as private (reject)
  }

  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // Localhost variants
  if (h === 'localhost' || h === '0.0.0.0') return true;

  const ipVersion = net.isIP(h);

  // IPv6 checks — only applied to confirmed IPv6 addresses, not hostnames
  if (ipVersion === 6) {
    if (h === '::1') return true;                        // loopback
    if (/^f[cd]/i.test(h)) return true;                  // fc00::/7 (unique local)
    if (/^fe[89ab]/i.test(h)) return true;               // fe80::/10 (link-local)
    // ::ffff:W.X.Y.Z or ::ffff:XXYY:ZZWW (IPv4-mapped)
    const v4dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4dotted) return isPrivateIPv4(v4dotted[1]);
    // URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1 (hex form)
    const v4hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (v4hex) {
      const hi = parseInt(v4hex[1], 16);
      const lo = parseInt(v4hex[2], 16);
      const addr = `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
      return isPrivateIPv4(addr);
    }
    return false;
  }

  // IPv4 private ranges — only applied to confirmed IPv4 addresses
  if (ipVersion === 4) return isPrivateIPv4(h);

  return false;
}

module.exports = {
  ensureUrl,
  sameOrigin,
  normalizeUrl,
  isPrivateUrl,
};
