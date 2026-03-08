const DDG = require('duck-duck-scrape');

/**
 * Search the web using DuckDuckGo (free, no API key required).
 *
 * Every result is tagged with source, query, and timestamp for full traceability.
 */
async function searchWeb(query, options = {}) {
  const {
    maxResults = 10,
    type = 'web', // 'web' | 'news'
    safeSearch = DDG.SafeSearchType.MODERATE,
  } = options;

  const timestamp = new Date().toISOString();

  let rawResults;
  if (type === 'news') {
    const response = await DDG.searchNews(query, { safeSearch });
    rawResults = (response.results || []).slice(0, maxResults);
  } else {
    const response = await DDG.search(query, { safeSearch });
    rawResults = (response.results || []).slice(0, maxResults);
  }

  const results = rawResults.map((r, index) => ({
    url: r.url || r.link,
    title: r.title || '',
    snippet: r.description || r.snippet || '',
    source: 'duckduckgo',
    searchType: type,
    searchQuery: query,
    rank: index + 1,
    timestamp,
  }));

  return {
    query,
    type,
    timestamp,
    totalResults: results.length,
    results,
  };
}

module.exports = { searchWeb };
