const path = require('path');
const fs = require('fs');
const pLimitPkg = require('p-limit');
const pLimit = pLimitPkg?.default || pLimitPkg;

const { discoverSitemapUrls, getRobotsPolicy } = require('./discovery');
const { sameOrigin, normalizeUrl } = require('../core/url');
const { createPlaywrightBackend } = require('../runners/playwrightBackend');
const { createMcpBackend } = require('../runners/mcpBackend');
const { writeReport } = require('../report/writeReport');
const { safeFilename, nowStamp } = require('../report/util');

function isHttpUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

async function crawlSite({ startUrl, scope, targetUrls, engine, mcpUrl, maxPages, screenshots, onProgress }) {
  const startedAt = new Date();
  const root = new URL(startUrl);

  const runId = `${nowStamp()}_${safeFilename(root.hostname)}`;
  const outputsRoot = path.resolve(process.cwd(), 'outputs');
  const finalOutDir = path.join(outputsRoot, runId);
  const tempOutDir = path.join(outputsRoot, `.tmp_${runId}`);
  const screenshotsDir = screenshots ? path.join(tempOutDir, 'screenshots') : null;

  fs.mkdirSync(outputsRoot, { recursive: true });
  fs.mkdirSync(tempOutDir, { recursive: true });
  if (screenshotsDir) fs.mkdirSync(screenshotsDir, { recursive: true });

  const progress = (phase, message) => {
    if (typeof onProgress === 'function') onProgress({ phase, message });
  };

  progress('Discovery', 'Fetching robots.txt and sitemap hints');
  const robots = await getRobotsPolicy(startUrl);
  const sitemapUrls = scope === 'site' ? await discoverSitemapUrls(startUrl, robots) : [];

  const backend =
    engine === 'mcp'
      ? await createMcpBackend({ mcpUrl })
      : await createPlaywrightBackend();

  const pages = new Map();
  const canonicalByRequested = new Map();
  const queue = [];
  const queued = new Set();

  const enqueue = (u, source) => {
    if (!isHttpUrl(u)) return;
    const nu = normalizeUrl(u);
    if (!sameOrigin(nu, startUrl)) return;
    if (queued.has(nu)) return;
    if (canonicalByRequested.has(nu)) return;
    if (pages.size + queue.length >= maxPages) return;

    if (!robots.canFetch(nu)) return;

    queued.add(nu);
    queue.push({ url: nu, source });
  };

  if (scope === 'provided') {
    const list = Array.isArray(targetUrls) && targetUrls.length ? targetUrls : [startUrl];
    for (const u of list) enqueue(u, 'provided');
  } else {
    enqueue(startUrl, 'start_url');
  }

  if (scope === 'site') {
    progress('Sitemap', sitemapUrls.length ? 'Parsing sitemap.xml…' : 'No sitemap found');
    for (const sm of sitemapUrls) {
      try {
        const urls = await backend.fetchSitemapUrls(sm);
        for (const u of urls) enqueue(u, `sitemap:${sm}`);
      } catch {
        // ignore individual sitemap errors
      }
    }
  } else {
    progress('Sitemap', 'Skipped (provided URLs only)');
  }

  const limit = pLimit(3);

  progress('Crawl', `Analyzing up to ${maxPages} pages…`);

  const worker = async () => {
    while (queue.length && pages.size < maxPages) {
      const item = queue.shift();
      if (!item) break;
      const url = item.url;
      if (pages.has(url)) continue;
      if (canonicalByRequested.has(url)) continue;

      progress('Crawl', `Visiting ${url}`);

      const pageResult = await backend.visitAndExtract({
        url,
        takeScreenshot: Boolean(screenshotsDir),
        screenshotsDir,
      });

      const canonicalUrl = normalizeUrl(pageResult.finalUrl || url);
      canonicalByRequested.set(url, canonicalUrl);
      if (canonicalUrl !== url) {
        canonicalByRequested.set(canonicalUrl, canonicalUrl);
      }

      if (pages.has(canonicalUrl)) {
        continue;
      }

      pages.set(canonicalUrl, {
        url: canonicalUrl,
        finalUrl: pageResult.finalUrl || url,
        status: pageResult.status,
        title: pageResult.title,
        metaDescription: pageResult.metaDescription,
        h1: pageResult.h1,
        fullText: pageResult.fullText,
        links: pageResult.links,
        images: pageResult.images,
        screenshotPath: pageResult.screenshotPath,
        discoveredFrom: item.source,
      });

      if (scope === 'site') {
        for (const link of pageResult.links || []) {
          enqueue(link, url);
        }
      }
    }
  };

  let success = false;
  try {
    await Promise.all([limit(worker), limit(worker), limit(worker)]);

    progress('Report', 'Writing report…');

    const report = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      startUrl,
      origin: root.origin,
      maxPages,
      engine,
      robots: {
        url: robots.robotsUrl,
        hasRobotsTxt: robots.hasRobotsTxt,
        discoveredSitemaps: sitemapUrls,
      },
      pages: Array.from(pages.values()),
    };

    const { reportMarkdownPath, reportJsonPath } = await writeReport({ outDir: tempOutDir, report });

    // Atomically publish results so failed runs don't leave empty folders.
    if (fs.existsSync(finalOutDir)) {
      fs.rmSync(finalOutDir, { recursive: true, force: true });
    }
    fs.renameSync(tempOutDir, finalOutDir);
    success = true;

    const publishedScreenshotsDir = screenshots ? path.join(finalOutDir, 'screenshots') : null;

    return {
      outDir: finalOutDir,
      reportMarkdownPath: path.join(finalOutDir, path.basename(reportMarkdownPath)),
      reportJsonPath: path.join(finalOutDir, path.basename(reportJsonPath)),
      screenshotsDir: publishedScreenshotsDir,
    };
  } finally {
    try {
      await backend.close();
    } catch {
      // ignore
    }

    if (!success) {
      try {
        if (fs.existsSync(tempOutDir)) fs.rmSync(tempOutDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

module.exports = { crawlSite };
