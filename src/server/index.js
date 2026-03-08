const express = require('express');
const fs = require('fs');
const path = require('path');
const { searchWeb } = require('../search/webSearch');
const { crawlSite } = require('../crawler/crawlSite');
const { researchTopic } = require('../pipelines/research');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'playwrighty', version: '0.2.0' });
});

/**
 * POST /api/search
 * Search DuckDuckGo for URLs. No scraping, just discovery.
 *
 * Body: { query, maxResults?, type? }
 * Returns: { results, audit }
 */
app.post('/api/search', async (req, res) => {
  try {
    const { query, maxResults, type } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const result = await searchWeb(query, { maxResults, type });

    res.json({
      results: result.results,
      audit: {
        searchId: `search_${Date.now()}`,
        query: result.query,
        type: result.type,
        timestamp: result.timestamp,
        totalResults: result.totalResults,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/scrape
 * Deep-scrape given URLs using Playwrighty's Playwright pipeline.
 *
 * Body: { urls, screenshots?, maxConcurrency? }
 * Returns: { pages, reportPath, audit }
 */
app.post('/api/scrape', async (req, res) => {
  try {
    const { urls, screenshots = false, maxConcurrency = 3 } = req.body;
    if (!urls || !Array.isArray(urls) || !urls.length) {
      return res.status(400).json({ error: 'urls array is required' });
    }

    const result = await crawlSite({
      startUrl: urls[0],
      scope: 'provided',
      targetUrls: urls,
      maxPages: urls.length,
      concurrency: maxConcurrency,
      screenshots,
      headed: false,
    });

    const reportJson = JSON.parse(fs.readFileSync(result.reportJsonPath, 'utf8'));

    res.json({
      pages: (reportJson.pages || []).map((p) => ({
        url: p.url,
        title: p.title,
        status: p.status,
        metaDescription: p.metaDescription,
        contentMarkdown: p.contentMarkdown,
        fullText: p.fullText,
        structured: p.structured,
      })),
      reportPath: result.reportJsonPath,
      outDir: result.outDir,
      audit: {
        scrapeId: `scrape_${Date.now()}`,
        timestamp: new Date().toISOString(),
        urlsRequested: urls.length,
        pagesScraped: (reportJson.pages || []).length,
        urls: (reportJson.pages || []).map((p) => p.url),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/research
 * End-to-end: search → scrape → RAG synthesis with full audit trail.
 *
 * Body: { query, maxResults?, maxPages?, question? }
 * Returns: { answer, sources, searchResults, auditTrailPath, reportPath }
 */
app.post('/api/research', async (req, res) => {
  try {
    const { query, maxResults, maxPages, question } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const result = await researchTopic(query, {
      maxResults,
      maxPages,
      question,
    });

    res.json({
      query: result.query,
      question: result.question,
      answer: result.answer,
      sources: result.sources,
      searchResults: result.searchResults,
      reportPath: result.reportPath,
      auditTrailPath: result.auditTrailPath,
      outDir: result.outDir,
      auditTrail: result.auditTrail,
      error: result.error || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/audit/:sessionId
 * Retrieve a previously saved audit trail by looking in outputs directories.
 */
app.get('/api/audit/:sessionId', (req, res) => {
  try {
    const outputsDir = path.resolve(process.cwd(), 'outputs');
    if (!fs.existsSync(outputsDir)) {
      return res.status(404).json({ error: 'No outputs directory found' });
    }

    // Search through output directories for matching audit trail
    const dirs = fs.readdirSync(outputsDir).filter((d) => {
      const auditPath = path.join(outputsDir, d, 'audit-trail.json');
      return fs.existsSync(auditPath);
    });

    for (const dir of dirs) {
      const auditPath = path.join(outputsDir, dir, 'audit-trail.json');
      const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
      if (audit.sessionId === req.params.sessionId) {
        return res.json(audit);
      }
    }

    res.status(404).json({ error: 'Audit trail not found for this session ID' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server when run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Playwrighty service running on http://localhost:${PORT}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  GET  /api/health           - Health check`);
    console.log(`  POST /api/search           - Search DuckDuckGo`);
    console.log(`  POST /api/scrape           - Deep-scrape URLs`);
    console.log(`  POST /api/research         - End-to-end research pipeline`);
    console.log(`  GET  /api/audit/:sessionId - Retrieve audit trail`);
  });
}

module.exports = { app };
