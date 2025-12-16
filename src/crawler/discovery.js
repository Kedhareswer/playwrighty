const robotsParser = require('robots-parser');

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function getRobotsPolicy(startUrl) {
  const root = new URL(startUrl);
  const robotsUrl = new URL('/robots.txt', root.origin).toString();

  try {
    const txt = await fetchText(robotsUrl);
    const parsed = robotsParser(robotsUrl, txt);

    return {
      robotsUrl,
      hasRobotsTxt: true,
      canFetch: (u) => parsed.isAllowed(u, 'playwrighty') !== false,
      getSitemaps: () => parsed.getSitemaps() || [],
      raw: txt,
    };
  } catch {
    return {
      robotsUrl,
      hasRobotsTxt: false,
      canFetch: () => true,
      getSitemaps: () => [],
      raw: null,
    };
  }
}

async function discoverSitemapUrls(startUrl, robots) {
  const root = new URL(startUrl);
  const candidates = new Set();

  for (const sm of robots.getSitemaps()) candidates.add(sm);

  candidates.add(new URL('/sitemap.xml', root.origin).toString());

  return Array.from(candidates);
}

module.exports = {
  getRobotsPolicy,
  discoverSitemapUrls,
};
