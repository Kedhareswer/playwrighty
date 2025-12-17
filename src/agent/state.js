const { Annotation } = require('@langchain/langgraph');

const AgentState = Annotation.Root({
  startUrl: Annotation({ reducer: (_, b) => b, default: () => '' }),
  scope: Annotation({ reducer: (_, b) => b, default: () => 'provided' }),
  maxPages: Annotation({ reducer: (_, b) => b, default: () => 25 }),
  concurrency: Annotation({ reducer: (_, b) => b, default: () => 3 }),
  
  queue: Annotation({ 
    reducer: (a, b) => b ?? a, 
    default: () => [] 
  }),
  visited: Annotation({ 
    reducer: (a, b) => b ?? a, 
    default: () => new Set() 
  }),
  pages: Annotation({ 
    reducer: (a, b) => [...(a || []), ...(b || [])], 
    default: () => [] 
  }),
  
  errors: Annotation({ 
    reducer: (a, b) => [...(a || []), ...(b || [])], 
    default: () => [] 
  }),
  retryCount: Annotation({ 
    reducer: (a, b) => (b !== undefined ? b : a), 
    default: () => 0 
  }),
  
  currentUrl: Annotation({ reducer: (_, b) => b, default: () => null }),
  currentPage: Annotation({ reducer: (_, b) => b, default: () => null }),
  
  phase: Annotation({ reducer: (_, b) => b, default: () => 'init' }),
  action: Annotation({ reducer: (_, b) => b, default: () => null }),
  actionReason: Annotation({ reducer: (_, b) => b, default: () => null }),
  
  llmAnalysis: Annotation({ reducer: (_, b) => b, default: () => null }),
  
  robotsPolicy: Annotation({ reducer: (_, b) => b, default: () => null }),
  sitemapUrls: Annotation({ 
    reducer: (a, b) => b ?? a, 
    default: () => [] 
  }),
  
  headed: Annotation({ reducer: (_, b) => b, default: () => false }),
  humanIntervention: Annotation({ reducer: (_, b) => b, default: () => false }),
  
  outputDir: Annotation({ reducer: (_, b) => b, default: () => null }),
  screenshots: Annotation({ reducer: (_, b) => b, default: () => true }),
});

function createInitialState(options = {}) {
  return {
    startUrl: options.startUrl || '',
    scope: options.scope || 'provided',
    maxPages: options.maxPages || 25,
    concurrency: options.concurrency || 3,
    queue: options.targetUrls?.length ? options.targetUrls.map(u => ({ url: u, source: 'provided' })) : [],
    visited: new Set(),
    pages: [],
    errors: [],
    retryCount: 0,
    currentUrl: null,
    currentPage: null,
    phase: 'init',
    action: null,
    actionReason: null,
    llmAnalysis: null,
    robotsPolicy: null,
    sitemapUrls: [],
    headed: options.headed || false,
    humanIntervention: false,
    outputDir: options.outputDir || null,
    screenshots: options.screenshots !== false,
  };
}

module.exports = {
  AgentState,
  createInitialState,
};
