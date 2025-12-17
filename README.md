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

## Quick Start

```bash
npm install
npm start        # Interactive crawl mode
npm run chat     # RAG chat on scraped content
```

## Environment Variables

Create a `.env` file in the project root:

```bash
GOOGLE_API_KEY=your_gemini_api_key

# Optional: override models
GEMINI_MODEL=gemini-1.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004
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

## Output

```
./outputs/<timestamp>_<hostname>/
├── report.md        # Human-readable report
├── report.json      # Machine-readable data (for RAG)
└── screenshots/     # Page screenshots (optional)
```
