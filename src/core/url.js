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

  // IPv6 loopback and private (fc00::/7 covers fc.. and fd..)
  if (h === '::1' || /^f[cd]/i.test(h)) return true;

  // IPv4 private ranges
  const parts = h.split('.');
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 0) return true;                          // 0.0.0.0/8
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 127) return true;                        // 127.0.0.0/8
    if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (link-local / cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
  }

  return false;
}

module.exports = {
  ensureUrl,
  sameOrigin,
  normalizeUrl,
  isPrivateUrl,
};
