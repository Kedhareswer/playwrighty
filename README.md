# Playwrighty

**Agentic Web Scraper with RAG Chat** — LangGraph + Gemini powered extraction and Q&A.

## Features

- **🤖 LangGraph Agent** — Adaptive crawling with Gemini-powered decision making
- **💬 RAG Chat** — Ask questions about scraped content using vector search + Gemini
- **🛡️ Bot Detection Handling** — Headed mode for manual CAPTCHA/Cloudflare intervention
- **📋 Robots-aware** — Respects `robots.txt` and `sitemap.xml`
- **⚡ Parallel crawling** — Configurable concurrency
- **📊 LLM-friendly extraction** — Chunked content with metadata for embeddings
- **📝 Professional reports** — Markdown + JSON with structured content
- **🌐 REST API server** — HTTP endpoints for diligence tool integration
- **🔍 DuckDuckGo web search** — Free URL discovery, no API key needed
- **🔬 Research pipeline** — End-to-end search → scrape → RAG synthesis
- **📜 Audit trail** — Full traceability for every step (JSON + Markdown)

## Quick Start

```bash
npm install
npm start        # Interactive crawl mode
npm run chat     # RAG chat on scraped content
npm run serve    # REST API server
```

## Environment Variables

Create a `.env` file in the project root:

```bash
GOOGLE_API_KEY=your_gemini_api_key

# Optional: override models
GEMINI_MODEL=gemini-1.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004

# Optional: API server port (default 3000)
PORT=3000
```

Get your API key at: https://makersuite.google.com/app/apikey

## Docs

- `docs/QUICKSTART.md` — Getting started guide
- `docs/ARCHITECTURE.md` — System architecture
- `docs/COMPLIANCE.md` — Robots.txt and ethical crawling

## CLI Options

| Option | Description |
|--------|-------------|
| **Crawl scope** | Provided URLs only or full-site discovery |
| **Concurrency** | Parallel pages (1-10) |
| **Screenshots** | Capture full-page screenshots |
| **Headed mode** | Visible browser for CAPTCHA solving |
| **LangGraph agent** | AI-powered crawl decisions (requires API key) |

## RAG Chat

`npm run chat` loads a previous `outputs/<runId>/report.json`, chunks content into embedding-friendly segments, generates Gemini embeddings, and answers questions using semantic search over those chunks.

Note: RAG uses a **local in-memory vector index** (Gemini embeddings + cosine similarity). No external database is required.

## REST API

Start the server with `npm run serve` (default port 3000, configurable via `PORT`).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/search` | POST | Search DuckDuckGo for URLs (no scraping) |
| `/api/scrape` | POST | Deep-scrape given URLs with Playwright |
| `/api/research` | POST | End-to-end: search → scrape → RAG synthesis |
| `/api/audit/:sessionId` | GET | Retrieve a saved audit trail |

Example:

```bash
# Search for URLs
curl -X POST http://localhost:3000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "climate change mitigation strategies"}'

# Full research pipeline
curl -X POST http://localhost:3000/api/research \
  -H 'Content-Type: application/json' \
  -d '{"query": "climate change mitigation", "question": "What are the top 3 strategies?"}'
```

## Output

```
./outputs/<timestamp>_<hostname>/
├── report.md          # Human-readable report
├── report.json        # Machine-readable data (for RAG)
├── audit-trail.json   # Full audit trail (research pipeline)
├── audit-trail.md     # Human-readable audit trail
└── screenshots/       # Page screenshots (optional)
```
