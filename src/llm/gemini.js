const { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');

function getApiKey() {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      'GOOGLE_API_KEY or GEMINI_API_KEY environment variable is required.\n' +
      'Get one at: https://makersuite.google.com/app/apikey'
    );
  }
  return key;
}

function createGeminiChat(options = {}) {
  const apiKey = getApiKey();

  const primaryModel = options.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';
  const fallbackModels = Array.isArray(options.fallbackModels)
    ? options.fallbackModels
    : (process.env.GEMINI_FALLBACK_MODELS
        ? String(process.env.GEMINI_FALLBACK_MODELS)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : ['gemini-2.0-flash-lite', 'gemini-2.0-flash']);

  const modelsToTry = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];

  const invokeWithFallback = async (messages) => {
    let lastErr;
    for (const model of modelsToTry) {
      try {
        const llm = new ChatGoogleGenerativeAI({
          apiKey,
          model,
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxOutputTokens || 4096,
        });

        return await llm.invoke(messages);
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || err);
        const isModelNotFound = msg.includes('[404') || msg.includes('is not found for API version');
        if (!isModelNotFound) throw err;
        // else try next model
      }
    }
    throw lastErr;
  };

  return {
    invoke: invokeWithFallback,
    _models: modelsToTry,
  };
}

function createGeminiEmbeddings(options = {}) {
  const apiKey = getApiKey();
  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    model: options.model || process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
  });
}

async function analyzeContent(llm, content, task) {
  const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
  
  const messages = [
    new SystemMessage(
      'You are an expert content analyzer. Analyze the provided web content and respond concisely.'
    ),
    new HumanMessage(`Task: ${task}\n\nContent:\n${content.slice(0, 30000)}`),
  ];

  const response = await llm.invoke(messages);
  return response.content;
}

async function decideCrawlAction(llm, state) {
  const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
  
  const messages = [
    new SystemMessage(
      'You are a web crawling agent. Based on the current state, decide the next action.\n' +
      'Respond with JSON: { "action": "crawl"|"skip"|"retry"|"done", "reason": "...", "priority_urls": [...] }'
    ),
    new HumanMessage(
      `Current state:\n` +
      `- Pages crawled: ${state.pagesCrawled || 0}\n` +
      `- Pages remaining in queue: ${state.queueLength || 0}\n` +
      `- Errors encountered: ${state.errors?.length || 0}\n` +
      `- Last error: ${state.lastError || 'none'}\n` +
      `- Goal: ${state.goal || 'Extract all content'}\n\n` +
      `Recent pages:\n${(state.recentPages || []).slice(0, 5).map(p => `- ${p.url}: ${p.title || 'no title'}`).join('\n')}`
    ),
  ];

  const response = await llm.invoke(messages);
  try {
    return JSON.parse(response.content);
  } catch {
    return { action: 'crawl', reason: 'Default action' };
  }
}

module.exports = {
  getApiKey,
  createGeminiChat,
  createGeminiEmbeddings,
  analyzeContent,
  decideCrawlAction,
};
