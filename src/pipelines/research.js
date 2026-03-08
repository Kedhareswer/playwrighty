const fs = require('fs');
const path = require('path');
const { searchWeb } = require('../search/webSearch');
const { crawlSite } = require('../crawler/crawlSite');
const { createVectorStore } = require('../rag/vectorStore');
const { RAGChat } = require('../rag/chat');
const { AuditTrail } = require('../audit/trail');
const { nowStamp } = require('../report/util');

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
  } = options;

  const audit = new AuditTrail();
  const progress = (phase, message) => {
    if (typeof onProgress === 'function') onProgress({ phase, message });
  };

  // Step 1: Search DuckDuckGo for relevant URLs
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
      onProgress: (event) => {
        progress(event.phase, event.message);
      },
    });
  } catch (err) {
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
  const reportJson = JSON.parse(fs.readFileSync(crawlResult.reportJsonPath, 'utf8'));
  for (const page of reportJson.pages || []) {
    audit.recordScrape(page.url, page);
  }

  progress('Scrape', `Scraped ${(reportJson.pages || []).length} pages`);

  // Step 3: Index content in vector store + RAG synthesis
  let answer = null;
  let sources = [];

  const userQuestion = question || query;

  try {
    const { createGeminiChat, createGeminiEmbeddings } = require('../llm/gemini');
    const embeddings = createGeminiEmbeddings();
    const llm = createGeminiChat({ temperature: 0.3 });

    progress('Index', 'Indexing scraped content...');
    const vectorStore = await createVectorStore(embeddings);
    if (reportJson.pages?.length) {
      await vectorStore.addPages(reportJson.pages);
    }

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
    audit.recordStep('analysis_error', { question: userQuestion }, { error: err.message });
    progress('Analyze', `LLM synthesis skipped: ${err.message}`);
  }

  // Step 4: Write audit trail to the output directory
  audit.finalize();
  const auditJson = audit.toJSON();
  const auditMd = audit.toMarkdown();

  if (crawlResult?.outDir) {
    try {
      const writes = [
        fs.promises.writeFile(path.join(crawlResult.outDir, 'audit-trail.json'), JSON.stringify(auditJson, null, 2), 'utf8'),
        fs.promises.writeFile(path.join(crawlResult.outDir, 'audit-trail.md'), auditMd, 'utf8'),
      ];

      // Update the audit index for O(1) lookup by sessionId
      const outputsDir = path.dirname(crawlResult.outDir);
      const indexPath = path.join(outputsDir, '.audit-index.json');
      let index = {};
      try {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      } catch { /* no existing index */ }
      index[audit.sessionId] = path.basename(crawlResult.outDir);
      writes.push(fs.promises.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8'));

      await Promise.all(writes);
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
