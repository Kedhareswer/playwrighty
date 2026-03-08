const { v4: uuidv4 } = require('uuid');

class AuditTrail {
  constructor(sessionId) {
    this.sessionId = sessionId || uuidv4();
    this.startedAt = new Date().toISOString();
    this.records = [];
  }

  _record(action, data) {
    const entry = {
      id: uuidv4(),
      action,
      timestamp: new Date().toISOString(),
      ...data,
    };
    this.records.push(entry);
    return entry;
  }

  recordSearch(query, results) {
    return this._record('search', {
      input: { query },
      output: {
        resultCount: results.length,
        urls: results.map((r) => r.url),
      },
      source: 'duckduckgo',
    });
  }

  recordScrape(url, content) {
    return this._record('scrape', {
      input: { url },
      output: {
        title: content.title || null,
        status: content.status || null,
        contentLength: (content.fullText || '').length,
        hasMarkdown: Boolean(content.contentMarkdown),
      },
      source: url,
    });
  }

  recordAnalysis(input, output) {
    return this._record('analysis', {
      input: {
        question: input.question,
        contextChunks: input.contextChunks || 0,
        sourceUrls: input.sourceUrls || [],
      },
      output: {
        answerLength: (output.answer || '').length,
        sourcesUsed: (output.sources || []).map((s) => s.url),
      },
      source: 'llm',
    });
  }

  recordStep(action, input, output) {
    return this._record(action, { input, output });
  }

  finalize() {
    this.completedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      completedAt: this.completedAt || new Date().toISOString(),
      totalSteps: this.records.length,
      records: this.records,
    };
  }

  toMarkdown() {
    const lines = [];
    lines.push('# Audit Trail');
    lines.push('');
    lines.push(`**Session ID:** ${this.sessionId}`);
    lines.push(`**Started:** ${this.startedAt}`);
    lines.push(`**Completed:** ${this.completedAt || new Date().toISOString()}`);
    lines.push(`**Total Steps:** ${this.records.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const rec of this.records) {
      lines.push(`## Step: ${rec.action.toUpperCase()}`);
      lines.push('');
      lines.push(`- **ID:** ${rec.id}`);
      lines.push(`- **Timestamp:** ${rec.timestamp}`);
      if (rec.source) lines.push(`- **Source:** ${rec.source}`);
      lines.push('');

      if (rec.input) {
        lines.push('**Input:**');
        lines.push('```json');
        lines.push(JSON.stringify(rec.input, null, 2));
        lines.push('```');
        lines.push('');
      }

      if (rec.output) {
        lines.push('**Output:**');
        lines.push('```json');
        lines.push(JSON.stringify(rec.output, null, 2));
        lines.push('```');
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }
}

module.exports = { AuditTrail };
