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

async function createPlaywrightBackend(options = {}) {
  const headed = options.headed || false;
  
  const browser = await chromium.launch({ 
    headless: !headed,
    slowMo: headed ? 100 : 0,
  });
  
  const context = await browser.newContext({
    userAgent: 'playwrighty/0.2 (respectful discovery bot)',
    viewport: { width: 1280, height: 800 },
  });

  return {
    async fetchSitemapUrls(sitemapUrl) {
      const sm = new Sitemapper({ url: sitemapUrl, timeout: 15000 });
      const res = await sm.fetch();
      return res?.sites || [];
    },

    async visitAndExtract({ url, takeScreenshot, screenshotsDir, headed }) {
      const page = await context.newPage();
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const status = response ? response.status() : null;
        const finalUrl = page.url();

        // Check for common bot detection patterns (specific challenge page indicators)
        const pageContent = await page.content();
        const pageTitle = await page.title();
        const titleLower = (pageTitle || '').toLowerCase();
        
        // Only trigger on actual challenge pages that block content
        const isChallenged = 
          (titleLower.includes('just a moment') && pageContent.includes('cf-browser-verification')) ||
          (titleLower.includes('attention required') && pageContent.includes('cloudflare')) ||
          titleLower.includes('access denied') ||
          titleLower === 'blocked' ||
          (pageContent.includes('id="challenge-running"') || pageContent.includes('id="challenge-form"')) ||
          (pageContent.includes('id="cf-wrapper"') && pageContent.includes('challenge-platform'));

        if (isChallenged && headed) {
          console.log('\n⚠️  Bot challenge detected! Please solve it in the browser window...');
          console.log('Press Enter when done to continue crawling.\n');
          await new Promise(resolve => {
            const handler = () => {
              process.stdin.removeListener('data', handler);
              resolve();
            };
            process.stdin.once('data', handler);
          });
          // Wait a bit for page to update after challenge
          await page.waitForTimeout(2000);
        } else if (isChallenged) {
          throw new Error('Bot challenge detected. Run with --headed for manual intervention.');
        }

        // Wait for main content to load
        await page.waitForTimeout(1000);

        const data = await page.evaluate(() => {
        const getMeta = (name) =>
          document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';

        const title = document.title || '';
        const metaDescription = getMeta('description');
        const h1 = Array.from(document.querySelectorAll('h1'))
          .map((n) => (n.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 5);

        const linkObjects = Array.from(document.querySelectorAll('a[href]'))
          .map((a) => ({
            href: a.getAttribute('href'),
            text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
          }))
          .filter((l) => Boolean(l.href));

        const links = linkObjects.map((l) => l.href).filter(Boolean);

        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
          .map((h) => ({
            level: String(h.tagName || '').toLowerCase(),
            text: (h.textContent || '').replace(/\s+/g, ' ').trim(),
          }))
          .filter((h) => Boolean(h.text));

        const paragraphs = Array.from(document.querySelectorAll('p'))
          .map((p) => (p.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean);

        const imageObjects = Array.from(document.querySelectorAll('img[src]'))
          .map((img) => ({
            src: img.getAttribute('src'),
            alt: (img.getAttribute('alt') || '').trim(),
          }))
          .filter((i) => Boolean(i.src))
          .slice(0, 200);

        const images = imageObjects.map((i) => i.src).filter(Boolean);

        const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
        const fullText = bodyText;

        const escapePipes = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
        const tableToMarkdown = (table) => {
          const rows = Array.from(table.querySelectorAll('tr'));
          const grid = rows
            .map((tr) => Array.from(tr.querySelectorAll('th,td')).map((c) => escapePipes(c.textContent || '')))
            .filter((r) => r.length);
          if (!grid.length) return '';
          const header = grid[0];
          const align = header.map(() => '---');
          const lines = [];
          lines.push(`| ${header.join(' | ')} |`);
          lines.push(`| ${align.join(' | ')} |`);
          for (const r of grid.slice(1)) {
            const row = r.length === header.length ? r : header.map((_, i) => r[i] || '');
            lines.push(`| ${row.join(' | ')} |`);
          }
          return lines.join('\n');
        };

        const nodeText = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
        const pickMain = () => {
          return (
            document.querySelector('article') ||
            document.querySelector('main') ||
            document.querySelector('[role="main"]') ||
            document.body
          );
        };

        const toMarkdown = (rootEl) => {
          const out = [];
          const walk = (el) => {
            if (!el || el.nodeType !== 1) return;
            const tag = String(el.tagName || '').toLowerCase();

            if (['nav', 'footer', 'aside', 'script', 'style', 'noscript'].includes(tag)) return;

            if (/^(h1|h2|h3|h4|h5|h6)$/.test(tag)) {
              const lvl = Number(tag.slice(1));
              const t = nodeText(el);
              if (t) out.push(`${'#'.repeat(lvl)} ${t}`, '');
              return;
            }

            if (tag === 'p') {
              const t = nodeText(el);
              if (t) out.push(t, '');
              return;
            }

            if (tag === 'ul' || tag === 'ol') {
              const items = Array.from(el.querySelectorAll(':scope > li'));
              for (let i = 0; i < items.length; i++) {
                const t = nodeText(items[i]);
                if (!t) continue;
                if (tag === 'ol') out.push(`${i + 1}. ${t}`);
                else out.push(`- ${t}`);
              }
              out.push('');
              return;
            }

            if (tag === 'pre') {
              const code = el.querySelector('code');
              const t = (code ? code.textContent : el.textContent || '').replace(/\r\n/g, '\n');
              if (t.trim()) out.push('```', t.trim(), '```', '');
              return;
            }

            if (tag === 'table') {
              const md = tableToMarkdown(el);
              if (md) out.push(md, '');
              return;
            }

            // Default: traverse children
            for (const child of Array.from(el.children || [])) walk(child);
          };

          walk(rootEl);
          return out.join('\n').trim();
        };

        const mainEl = pickMain();
        const contentMarkdown = toMarkdown(mainEl);

          return {
            title,
            metaDescription,
            h1,
            links,
            images,
            fullText,
            contentMarkdown,
            structured: {
              headings,
              paragraphs,
              links: linkObjects,
              images: imageObjects,
            },
          };
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
          contentMarkdown: data.contentMarkdown,
          links: resolvedLinks,
          images: resolvedImages,
          structured: data.structured || null,
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
