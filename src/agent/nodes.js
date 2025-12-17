const { getRobotsPolicy, discoverSitemapUrls } = require('../crawler/discovery');
const { sameOrigin, normalizeUrl } = require('../core/url');

async function initNode(state, { backend, onProgress }) {
  onProgress?.({ phase: 'Init', message: 'Starting agentic crawl...' });
  
  const startUrl = state.startUrl;
  const queue = [...state.queue];
  
  if (!queue.length && startUrl) {
    queue.push({ url: startUrl, source: 'start_url' });
  }

  return {
    phase: 'discovery',
    queue,
  };
}

async function discoveryNode(state, { backend, onProgress }) {
  onProgress?.({ phase: 'Discovery', message: 'Fetching robots.txt and sitemap...' });
  
  const robotsPolicy = await getRobotsPolicy(state.startUrl);
  let sitemapUrls = [];
  
  if (state.scope === 'site') {
    sitemapUrls = await discoverSitemapUrls(state.startUrl, robotsPolicy);
    
    for (const sm of sitemapUrls) {
      try {
        const urls = await backend.fetchSitemapUrls(sm);
        const newItems = urls
          .filter(u => sameOrigin(u, state.startUrl))
          .filter(u => robotsPolicy.canFetch(u))
          .filter(u => !state.visited.has(normalizeUrl(u)))
          .slice(0, state.maxPages - state.queue.length)
          .map(u => ({ url: normalizeUrl(u), source: `sitemap:${sm}` }));
        
        state.queue.push(...newItems);
      } catch (e) {
        // Ignore sitemap errors
      }
    }
  }

  return {
    robotsPolicy,
    sitemapUrls,
    phase: 'crawl',
  };
}

async function crawlNode(state, { backend, onProgress }) {
  if (!state.queue.length || state.pages.length >= state.maxPages) {
    return { phase: 'analyze', action: 'done' };
  }

  const item = state.queue.shift();
  const url = item.url;
  
  if (state.visited.has(url)) {
    return { action: 'skip', actionReason: 'Already visited' };
  }

  onProgress?.({ phase: 'Crawl', message: `Visiting ${url}` });

  try {
    const pageResult = await backend.visitAndExtract({
      url,
      takeScreenshot: state.screenshots,
      screenshotsDir: state.outputDir ? `${state.outputDir}/screenshots` : null,
      headed: state.headed,
    });

    const visited = new Set(state.visited);
    visited.add(url);
    visited.add(normalizeUrl(pageResult.finalUrl || url));

    if (state.scope === 'site' && pageResult.links) {
      const newLinks = pageResult.links
        .filter(l => sameOrigin(l, state.startUrl))
        .filter(l => state.robotsPolicy?.canFetch(l) !== false)
        .filter(l => !visited.has(normalizeUrl(l)))
        .slice(0, 10)
        .map(l => ({ url: normalizeUrl(l), source: url }));
      
      state.queue.push(...newLinks);
    }

    return {
      currentUrl: url,
      currentPage: pageResult,
      pages: [pageResult],
      visited,
      action: 'crawled',
      actionReason: `Successfully crawled: ${pageResult.title || url}`,
      retryCount: 0,
    };
  } catch (error) {
    const errorInfo = {
      url,
      error: error.message,
      timestamp: new Date().toISOString(),
    };

    if (error.message.includes('blocked') || 
        error.message.includes('captcha') || 
        error.message.includes('challenge')) {
      return {
        errors: [errorInfo],
        action: 'blocked',
        actionReason: 'Bot detection triggered - may need human intervention',
        humanIntervention: true,
      };
    }

    if (state.retryCount < 3) {
      state.queue.unshift(item);
      return {
        errors: [errorInfo],
        action: 'retry',
        actionReason: `Retry ${state.retryCount + 1}/3: ${error.message}`,
        retryCount: state.retryCount + 1,
      };
    }

    const visited = new Set(state.visited);
    visited.add(url);

    return {
      errors: [errorInfo],
      visited,
      action: 'failed',
      actionReason: `Failed after retries: ${error.message}`,
      retryCount: 0,
    };
  }
}

async function analyzeNode(state, { llm, onProgress }) {
  if (!llm || state.pages.length === 0) {
    return { phase: 'report', llmAnalysis: null };
  }

  onProgress?.({ phase: 'Analyze', message: 'LLM analyzing extracted content...' });

  try {
    const { analyzeContent } = require('../llm/gemini');
    
    const contentSummary = state.pages
      .slice(-5)
      .map(p => `## ${p.title || p.url}\n${(p.contentMarkdown || p.fullText || '').slice(0, 2000)}`)
      .join('\n\n---\n\n');

    const analysis = await analyzeContent(
      llm,
      contentSummary,
      'Summarize the key topics and information found across these pages. Identify the main themes and any notable insights.'
    );

    return {
      phase: 'report',
      llmAnalysis: analysis,
    };
  } catch (error) {
    return {
      phase: 'report',
      llmAnalysis: null,
      errors: [{ error: `LLM analysis failed: ${error.message}`, timestamp: new Date().toISOString() }],
    };
  }
}

async function humanInterventionNode(state, { backend, onProgress }) {
  if (!state.headed) {
    onProgress?.({ phase: 'Blocked', message: 'Bot detected. Run with --headed for manual intervention.' });
    return { phase: 'report', humanIntervention: false };
  }

  onProgress?.({ 
    phase: 'Human', 
    message: 'CAPTCHA/Cloudflare detected. Please solve in browser window, then press Enter to continue...' 
  });

  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  return {
    phase: 'crawl',
    humanIntervention: false,
    retryCount: 0,
  };
}

function shouldContinueCrawling(state) {
  if (state.humanIntervention) return 'human';
  if (state.phase === 'analyze') return 'analyze';
  if (state.phase === 'report') return 'report';
  if (state.pages.length >= state.maxPages) return 'analyze';
  if (state.queue.length === 0) return 'analyze';
  return 'crawl';
}

module.exports = {
  initNode,
  discoveryNode,
  crawlNode,
  analyzeNode,
  humanInterventionNode,
  shouldContinueCrawling,
};
