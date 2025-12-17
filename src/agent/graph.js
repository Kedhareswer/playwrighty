const { StateGraph, END } = require('@langchain/langgraph');
const { AgentState, createInitialState } = require('./state');
const { 
  initNode, 
  discoveryNode, 
  crawlNode, 
  analyzeNode, 
  humanInterventionNode,
  shouldContinueCrawling 
} = require('./nodes');

function createCrawlAgent({ backend, llm, onProgress }) {
  const graph = new StateGraph(AgentState)
    .addNode('init', async (state) => initNode(state, { backend, onProgress }))
    .addNode('discovery', async (state) => discoveryNode(state, { backend, onProgress }))
    .addNode('crawl', async (state) => crawlNode(state, { backend, onProgress }))
    .addNode('analyze', async (state) => analyzeNode(state, { llm, onProgress }))
    .addNode('human', async (state) => humanInterventionNode(state, { backend, onProgress }))
    .addEdge('__start__', 'init')
    .addEdge('init', 'discovery')
    .addEdge('discovery', 'crawl')
    .addConditionalEdges('crawl', shouldContinueCrawling, {
      crawl: 'crawl',
      analyze: 'analyze',
      human: 'human',
      report: END,
    })
    .addEdge('human', 'crawl')
    .addEdge('analyze', END);

  return graph.compile();
}

async function runAgenticCrawl(options) {
  const { createPlaywrightBackend } = require('../runners/playwrightBackend');
  const { writeReport } = require('../report/writeReport');
  const { safeFilename, nowStamp } = require('../report/util');
  const path = require('path');
  const fs = require('fs');

  const startedAt = new Date();
  const root = new URL(options.startUrl);
  
  const runId = `${nowStamp()}_${safeFilename(root.hostname)}`;
  const outputsRoot = path.resolve(process.cwd(), 'outputs');
  const finalOutDir = path.join(outputsRoot, runId);
  const tempOutDir = path.join(outputsRoot, `.tmp_${runId}`);
  const screenshotsDir = options.screenshots ? path.join(tempOutDir, 'screenshots') : null;

  fs.mkdirSync(outputsRoot, { recursive: true });
  fs.mkdirSync(tempOutDir, { recursive: true });
  if (screenshotsDir) fs.mkdirSync(screenshotsDir, { recursive: true });

  const backend = await createPlaywrightBackend({ headed: options.headed });
  
  let llm = null;
  if (options.useAgent) {
    try {
      const { createGeminiChat } = require('../llm/gemini');
      llm = createGeminiChat();
    } catch (e) {
      options.onProgress?.({ phase: 'Warning', message: `LLM not available: ${e.message}` });
    }
  }

  const agent = createCrawlAgent({
    backend,
    llm,
    onProgress: options.onProgress,
  });

  const initialState = createInitialState({
    ...options,
    outputDir: tempOutDir,
  });

  let success = false;
  try {
    const finalState = await agent.invoke(initialState);

    options.onProgress?.({ phase: 'Report', message: 'Writing report...' });

    const report = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      startUrl: options.startUrl,
      origin: root.origin,
      maxPages: options.maxPages,
      agentic: true,
      llmAnalysis: finalState.llmAnalysis,
      robots: {
        url: finalState.robotsPolicy?.robotsUrl,
        hasRobotsTxt: finalState.robotsPolicy?.hasRobotsTxt,
        discoveredSitemaps: finalState.sitemapUrls,
      },
      pages: finalState.pages || [],
      errors: finalState.errors || [],
    };

    const { reportMarkdownPath, reportJsonPath } = await writeReport({ 
      outDir: tempOutDir, 
      report 
    });

    if (fs.existsSync(finalOutDir)) {
      fs.rmSync(finalOutDir, { recursive: true, force: true });
    }
    fs.renameSync(tempOutDir, finalOutDir);
    success = true;

    return {
      outDir: finalOutDir,
      reportMarkdownPath: path.join(finalOutDir, path.basename(reportMarkdownPath)),
      reportJsonPath: path.join(finalOutDir, path.basename(reportJsonPath)),
      screenshotsDir: options.screenshots ? path.join(finalOutDir, 'screenshots') : null,
      pagesCount: (finalState.pages || []).length,
      errorsCount: (finalState.errors || []).length,
      llmAnalysis: finalState.llmAnalysis,
    };
  } finally {
    try {
      await backend.close();
    } catch {}

    if (!success) {
      try {
        if (fs.existsSync(tempOutDir)) fs.rmSync(tempOutDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

module.exports = {
  createCrawlAgent,
  runAgenticCrawl,
};
