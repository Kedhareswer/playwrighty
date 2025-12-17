const { HumanMessage, SystemMessage, AIMessage } = require('@langchain/core/messages');

class RAGChat {
  constructor({ llm, vectorStore, report }) {
    this.llm = llm;
    this.vectorStore = vectorStore;
    this.report = report;
    this.history = [];
  }

  getSystemPrompt() {
    const pageCount = this.report?.pages?.length || 0;
    const urls = this.vectorStore?.getPageUrls() || [];
    
    return `You are a helpful assistant that answers questions about web content that was scraped from websites.

You have access to content from ${pageCount} pages:
${urls.slice(0, 10).map(u => `- ${u}`).join('\n')}
${urls.length > 10 ? `... and ${urls.length - 10} more pages` : ''}

When answering:
1. Base your answers on the provided context from the scraped content
2. If the context doesn't contain relevant information, say so
3. Cite the source URL when referencing specific information
4. Be concise but thorough

Original site: ${this.report?.origin || 'Unknown'}
Crawl date: ${this.report?.finishedAt || 'Unknown'}`;
  }

  async chat(userMessage) {
    const relevantDocs = await this.vectorStore.similaritySearch(userMessage, 5);
    
    const context = relevantDocs
      .map((doc, i) => `[Source ${i + 1}: ${doc.metadata.url}]\n${doc.content}`)
      .join('\n\n---\n\n');

    const system = `${this.getSystemPrompt()}\n\nRelevant context from scraped content:\n\n${context}`;

    const messages = [
      new SystemMessage(system),
      ...this.history,
      new HumanMessage(userMessage),
    ];

    const response = await this.llm.invoke(messages);
    
    this.history.push(new HumanMessage(userMessage));
    this.history.push(new AIMessage(response.content));

    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }

    return {
      answer: response.content,
      sources: relevantDocs.map(d => ({
        url: d.metadata.url,
        title: d.metadata.title,
        score: d.score,
      })),
    };
  }

  clearHistory() {
    this.history = [];
  }

  getStats() {
    return {
      pagesIndexed: this.report?.pages?.length || 0,
      chunksIndexed: this.vectorStore?.getDocumentCount() || 0,
      conversationTurns: this.history.length / 2,
      origin: this.report?.origin,
      crawlDate: this.report?.finishedAt,
    };
  }
}

async function createRAGChat({ reportJsonPath }) {
  const { createGeminiChat, createGeminiEmbeddings } = require('../llm/gemini');
  const { loadFromReport } = require('./vectorStore');

  const embeddings = createGeminiEmbeddings();
  const llm = createGeminiChat({ temperature: 0.3 });

  const { store, report } = await loadFromReport(reportJsonPath, embeddings);

  return new RAGChat({ llm, vectorStore: store, report });
}

module.exports = {
  RAGChat,
  createRAGChat,
};
