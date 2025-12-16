function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeFilename(input) {
  return String(input || 'file')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

module.exports = { nowStamp, safeFilename };
