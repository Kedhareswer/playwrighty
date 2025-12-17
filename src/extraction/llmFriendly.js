const { v4: uuidv4 } = require('uuid');

function chunkText(text, maxChunkSize = 1500, overlap = 200) {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;
    
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > start + maxChunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
    
    if (start < 0) start = 0;
  }

  return chunks.filter(Boolean);
}

function extractLLMFriendlyContent(pageData) {
  const { url, title, metaDescription, h1, contentMarkdown, fullText, structured } = pageData;

  const sections = [];
  
  if (title) {
    sections.push(`# ${title}`);
  }
  
  if (metaDescription) {
    sections.push(`**Description:** ${metaDescription}`);
  }

  if (h1?.length) {
    sections.push(`**Main Headings:** ${h1.join(', ')}`);
  }

  if (contentMarkdown) {
    sections.push('', '---', '', contentMarkdown);
  } else if (fullText) {
    sections.push('', '---', '', fullText);
  }

  const llmContent = sections.join('\n').trim();

  const headingsSummary = (structured?.headings || [])
    .slice(0, 20)
    .map(h => `${h.level}: ${h.text}`)
    .join('\n');

  const linksSummary = (structured?.links || [])
    .slice(0, 30)
    .filter(l => l.text && l.text.length > 2)
    .map(l => `- ${l.text}: ${l.href}`)
    .join('\n');

  return {
    url,
    title: title || '',
    description: metaDescription || '',
    mainContent: llmContent,
    headingsSummary,
    linksSummary,
    wordCount: (llmContent.match(/\S+/g) || []).length,
    charCount: llmContent.length,
  };
}

function createDocumentChunks(pageData, options = {}) {
  const { chunkSize = 1500, chunkOverlap = 200 } = options;
  
  const llmContent = extractLLMFriendlyContent(pageData);
  const textChunks = chunkText(llmContent.mainContent, chunkSize, chunkOverlap);

  return textChunks.map((chunk, index) => ({
    id: uuidv4(),
    pageUrl: llmContent.url,
    pageTitle: llmContent.title,
    chunkIndex: index,
    totalChunks: textChunks.length,
    content: chunk,
    metadata: {
      url: llmContent.url,
      title: llmContent.title,
      description: llmContent.description,
      chunkIndex: index,
      totalChunks: textChunks.length,
      wordCount: (chunk.match(/\S+/g) || []).length,
    },
  }));
}

function createRAGDocuments(pages, options = {}) {
  const allChunks = [];
  
  for (const page of pages) {
    const chunks = createDocumentChunks(page, options);
    allChunks.push(...chunks);
  }

  return allChunks;
}

function formatForEmbedding(chunk) {
  return `Title: ${chunk.pageTitle}\nURL: ${chunk.pageUrl}\n\n${chunk.content}`;
}

module.exports = {
  chunkText,
  extractLLMFriendlyContent,
  createDocumentChunks,
  createRAGDocuments,
  formatForEmbedding,
};
