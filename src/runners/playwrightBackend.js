const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const Sitemapper = require('sitemapper');

const { safeFilename } = require('../report/util');

function isHttpUrl(u) {
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

async function createPlaywrightBackend() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'playwrighty/0.1 (respectful discovery bot)',
  });

  return {
    async fetchSitemapUrls(sitemapUrl) {
      const sm = new Sitemapper({ url: sitemapUrl, timeout: 15000 });
      const res = await sm.fetch();
      return res?.sites || [];
    },

    async visitAndExtract({ url, takeScreenshot, screenshotsDir }) {
      const page = await context.newPage();
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const status = response ? response.status() : null;
        const finalUrl = page.url();

        const data = await page.evaluate(() => {
        const getMeta = (name) =>
          document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';

        const title = document.title || '';
        const metaDescription = getMeta('description');
        const h1 = Array.from(document.querySelectorAll('h1'))
          .map((n) => (n.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 5);

        const links = Array.from(document.querySelectorAll('a[href]'))
          .map((a) => a.getAttribute('href'))
          .filter(Boolean);

        const images = Array.from(document.querySelectorAll('img[src]'))
          .map((img) => img.getAttribute('src'))
          .filter(Boolean)
          .slice(0, 50);

        const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
        const fullText = bodyText;

          return { title, metaDescription, h1, links, images, fullText };
        });

      const resolvedLinks = (data.links || [])
        .map((href) => {
          try {
            return new URL(href, finalUrl).toString();
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter(isHttpUrl);

      const resolvedImages = (data.images || [])
        .map((src) => {
          try {
            return new URL(src, finalUrl).toString();
          } catch {
            return null;
          }
        })
        .filter(Boolean);

        let screenshotPath = null;
        if (takeScreenshot && screenshotsDir) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
          const u = new URL(finalUrl);
          const key = `${u.hostname}${u.pathname || '/'}${u.search || ''}`;
          const file = `${safeFilename(key || 'root')}.png`;
          screenshotPath = path.join(screenshotsDir, file);
          await page.screenshot({ path: screenshotPath, fullPage: true });
        }

        return {
          status,
          finalUrl,
          title: data.title,
          metaDescription: data.metaDescription,
          h1: data.h1,
          fullText: data.fullText,
          links: resolvedLinks,
          images: resolvedImages,
          screenshotPath,
        };
      } finally {
        await page.close();
      }
    },

    async close() {
      await context.close();
      await browser.close();
    },
  };
}

module.exports = { createPlaywrightBackend };
