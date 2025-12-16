const fs = require('fs');
const path = require('path');

function mdEscape(s) {
  return String(s || '').replace(/\|/g, '\\|');
}

function summarize(report) {
  const pages = report.pages || [];
  const ok = pages.filter((p) => (p.status || 0) >= 200 && (p.status || 0) < 400).length;
  const redirects = pages.filter((p) => p.finalUrl && p.finalUrl !== p.url).length;
  const titles = pages.filter((p) => p.title).length;

  return {
    pagesCount: pages.length,
    ok,
    redirects,
    titles,
  };
}

function buildMarkdown(report) {
  const s = summarize(report);

  const lines = [];
  lines.push(`# Website Discovery Report`);
  lines.push('');
  lines.push(`**Start URL:** ${report.startUrl}`);
  lines.push(`**Origin:** ${report.origin}`);
  lines.push(`**Engine:** ${report.engine}`);
  lines.push(`**Generated:** ${report.finishedAt}`);
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`- Pages analyzed: **${s.pagesCount}** (limit: ${report.maxPages})`);
  lines.push(`- Successful (2xx–3xx): **${s.ok}**`);
  lines.push(`- Redirected pages detected: **${s.redirects}**`);
  lines.push(`- Pages with titles extracted: **${s.titles}**`);
  lines.push('');

  lines.push('## Compliance & Discovery');
  lines.push('');
  lines.push(`- robots.txt: ${report.robots.hasRobotsTxt ? 'Found' : 'Not found'} (${report.robots.url})`);
  lines.push(`- Sitemaps discovered: ${report.robots.discoveredSitemaps?.length || 0}`);
  if (report.robots.discoveredSitemaps?.length) {
    for (const sm of report.robots.discoveredSitemaps) lines.push(`  - ${sm}`);
  }
  lines.push('');

  lines.push('## Page Inventory');
  lines.push('');
  lines.push('| # | URL | Status | Title | Notes |');
  lines.push('|---:|---|---:|---|---|');

  (report.pages || []).forEach((p, idx) => {
    const notes = [];
    if (p.finalUrl && p.finalUrl !== p.url) notes.push(`redirect → ${p.finalUrl}`);
    if (p.screenshotPath) notes.push('screenshot');

    lines.push(
      `| ${idx + 1} | ${mdEscape(p.url)} | ${p.status ?? ''} | ${mdEscape(p.title || '')} | ${mdEscape(notes.join(', '))} |`
    );
  });

  lines.push('');
  lines.push('## Observations');
  lines.push('');
  lines.push('This report is generated from publicly available pages and respects robots.txt rules when deciding what to fetch. It is intended for content discovery and internal analysis—not SEO.');
  lines.push('');

  lines.push('## Appendix: Per-Page Details');
  lines.push('');

  (report.pages || []).forEach((p) => {
    lines.push(`### ${p.url}`);
    lines.push('');
    if (p.title) lines.push(`- **Title:** ${p.title}`);
    if (p.metaDescription) lines.push(`- **Meta description:** ${p.metaDescription}`);
    if (p.h1?.length) lines.push(`- **H1:** ${p.h1.join(' | ')}`);
    if (p.discoveredFrom) lines.push(`- **Discovered from:** ${p.discoveredFrom}`);
    if (p.screenshotPath) lines.push(`- **Screenshot:** ${p.screenshotPath}`);
    lines.push('');

    if (p.fullText) {
      lines.push('**Extracted text (full):**');
      lines.push('');
      lines.push('```');
      lines.push(String(p.fullText));
      lines.push('```');
      lines.push('');
    }
  });

  return lines.join('\n');
}

async function writeReport({ outDir, report }) {
  const reportJsonPath = path.join(outDir, 'report.json');
  const reportMarkdownPath = path.join(outDir, 'report.md');

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(reportMarkdownPath, buildMarkdown(report), 'utf8');

  return { reportJsonPath, reportMarkdownPath };
}

module.exports = { writeReport };
