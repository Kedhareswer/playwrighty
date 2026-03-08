const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const { searchWeb } = require('../search/webSearch');
const { crawlSite } = require('../crawler/crawlSite');
const { createVectorStore } = require('../rag/vectorStore');
const { RAGChat } = require('../rag/chat');
const { AuditTrail } = require('../audit/trail');

function checkAborted(signal) {
  if (signal?.aborted) throw new Error('Research aborted');
}

/**
 * End-to-end research pipeline: search → scrape → index → synthesize.
 *
 * Every step is recorded in the audit trail for full transparency.
 */
async function researchTopic(query, options = {}) {
  const {
    maxResults = 10,
    maxPages = 10,
    concurrency = 3,
    screenshots = false,
    headed = false,
    question = null,
    onProgress = null,
    signal = null,
  } = options;

  const audit = new AuditTrail();
  const progress = (phase, message) => {
    if (typeof onProgress === 'function') onProgress({ phase, message });
  };

  // Step 1: Search DuckDuckGo for relevant URLs
  checkAborted(signal);
  progress('Search', `Searching DuckDuckGo for: ${query}`);
  const searchResult = await searchWeb(query, { maxResults });
  audit.recordSearch(query, searchResult.results);

  if (!searchResult.results.length) {
    return {
      query,
      answer: null,
      sources: [],
      searchResults: [],
      auditTrail: audit.toJSON(),
      error: 'No search results found',
    };
  }

  progress('Search', `Found ${searchResult.results.length} results`);

  // Step 2: Scrape the discovered URLs using Playwrighty
  checkAborted(signal);
  const urlsToScrape = searchResult.results.map((r) => r.url);
  progress('Scrape', `Scraping ${urlsToScrape.length} URLs...`);

  let crawlResult;
  try {
    crawlResult = await crawlSite({
      startUrl: urlsToScrape[0],
      scope: 'provided',
      targetUrls: urlsToScrape,
      maxPages: Math.min(maxPages, urlsToScrape.length),
      concurrency,
      screenshots,
      headed,
      signal,
      onProgress: (event) => {
        progress(event.phase, event.message);
      },
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    return {
      query,
      answer: null,
      sources: [],
      searchResults: searchResult.results,
      auditTrail: audit.toJSON(),
      error: `Scraping failed: ${err.message}`,
    };
  }

  // Record each scraped page in the audit trail
  const reportJson = JSON.parse(await fs.promises.readFile(crawlResult.reportJsonPath, 'utf8'));
  for (const page of reportJson.pages || []) {
    audit.recordScrape(page.url, page);
  }

  progress('Scrape', `Scraped ${(reportJson.pages || []).length} pages`);

  // Step 3: Index content in vector store + RAG synthesis
  let answer = null;
  let sources = [];

  const userQuestion = question || query;

  try {
    checkAborted(signal);

    // Lazy require: Gemini LLM is optional (requires GOOGLE_API_KEY).
    // If unavailable, the catch block below skips synthesis gracefully.
    const { createGeminiChat, createGeminiEmbeddings } = require('../llm/gemini');
    const embeddings = createGeminiEmbeddings();
    const llm = createGeminiChat({ temperature: 0.3 });

    progress('Index', 'Indexing scraped content...');
    const vectorStore = await createVectorStore(embeddings);
    if (reportJson.pages?.length) {
      await vectorStore.addPages(reportJson.pages);
    }

    checkAborted(signal);
    progress('Analyze', `Synthesizing answer for: ${userQuestion}`);
    const ragChat = new RAGChat({ llm, vectorStore, report: reportJson });
    const chatResult = await ragChat.chat(userQuestion);

    answer = chatResult.answer;
    sources = chatResult.sources;

    // Record the LLM analysis in audit trail
    audit.recordAnalysis(
      { question: userQuestion, contextChunks: vectorStore.getDocumentCount(), sourceUrls: vectorStore.getPageUrls() },
      { answer, sources }
    );
  } catch (err) {
    if (signal?.aborted) throw err;
    audit.recordStep('analysis_error', { question: userQuestion }, { error: err.message });
    progress('Analyze', `LLM synthesis skipped: ${err.message}`);
  }

  // Step 4: Write audit trail to the output directory
  audit.finalize();
  const auditJson = audit.toJSON();
  const auditMd = audit.toMarkdown();

  if (crawlResult?.outDir) {
    try {
      // Write audit trail files in parallel
      await Promise.all([
        fs.promises.writeFile(path.join(crawlResult.outDir, 'audit-trail.json'), JSON.stringify(auditJson, null, 2), 'utf8'),
        fs.promises.writeFile(path.join(crawlResult.outDir, 'audit-trail.md'), auditMd, 'utf8'),
      ]);

      // Atomic read-modify-write of the audit index with file lock
      const outputsDir = path.dirname(crawlResult.outDir);
      const indexPath = path.join(outputsDir, '.audit-index.json');
      // Ensure index file exists before locking
      try { await fs.promises.access(indexPath); } catch { await fs.promises.writeFile(indexPath, '{}', 'utf8'); }
      let release;
      try {
        release = await lockfile.lock(indexPath, { retries: 3 });
        let index = {};
        try { index = JSON.parse(await fs.promises.readFile(indexPath, 'utf8')); } catch { /* fresh index */ }
        index[audit.sessionId] = path.basename(crawlResult.outDir);
        await fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');
      } finally {
        if (release) await release();
      }
    } catch (err) {
      progress('Audit', `Warning: failed to write audit trail: ${err.message}`);
    }
  }

  progress('Done', 'Research complete');

  return {
    query,
    question: userQuestion,
    answer,
    sources,
    searchResults: searchResult.results,
    reportPath: crawlResult?.reportJsonPath || null,
    auditTrailPath: crawlResult?.outDir ? path.join(crawlResult.outDir, 'audit-trail.json') : null,
    auditTrail: auditJson,
    outDir: crawlResult?.outDir || null,
  };
}

module.exports = { researchTopic };
