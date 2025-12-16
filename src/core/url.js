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

module.exports = {
  ensureUrl,
  sameOrigin,
  normalizeUrl,
};
