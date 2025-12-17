const { createRAGDocuments, formatForEmbedding } = require('../extraction/llmFriendly');

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

class LocalMemoryVectorStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.items = [];
  }

  async addDocuments(docs) {
    const texts = docs.map((d) => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    for (let i = 0; i < docs.length; i++) {
      this.items.push({
        vector: vectors[i],
        doc: docs[i],
      });
    }
  }

  async similaritySearchWithScore(query, k = 5) {
    const qv = await this.embeddings.embedQuery(query);
    const scored = this.items
      .map((it) => [it.doc, cosineSimilarity(qv, it.vector)])
      .sort((a, b) => b[1] - a[1])
      .slice(0, k);
    return scored;
  }
}

class PlaywrightyVectorStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.store = null;
    this.documents = [];
  }

  async initialize() {
    this.store = new LocalMemoryVectorStore(this.embeddings);
  }

  async addPages(pages, options = {}) {
    const chunks = createRAGDocuments(pages, options);
    this.documents.push(...chunks);

    const texts = chunks.map(c => formatForEmbedding(c));
    const metadatas = chunks.map(c => c.metadata);

    await this.store.addDocuments(
      texts.map((text, i) => ({
        pageContent: text,
        metadata: metadatas[i],
      }))
    );

    return chunks.length;
  }

  async similaritySearch(query, k = 5) {
    if (!this.store) {
      throw new Error('Vector store not initialized');
    }

    const results = await this.store.similaritySearchWithScore(query, k);
    
    return results.map(([doc, score]) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
      score,
    }));
  }

  getDocumentCount() {
    return this.documents.length;
  }

  getPageUrls() {
    const urls = new Set(this.documents.map(d => d.pageUrl));
    return Array.from(urls);
  }
}

async function createVectorStore(embeddings) {
  const store = new PlaywrightyVectorStore(embeddings);
  await store.initialize();
  return store;
}

async function loadFromReport(reportJsonPath, embeddings) {
  const fs = require('fs');
  const report = JSON.parse(fs.readFileSync(reportJsonPath, 'utf8'));
  
  const store = await createVectorStore(embeddings);
  
  if (report.pages?.length) {
    await store.addPages(report.pages);
  }

  return {
    store,
    report,
  };
}

module.exports = {
  PlaywrightyVectorStore,
  createVectorStore,
  loadFromReport,
};
