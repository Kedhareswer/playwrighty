# Playwrighty — Quickstart

## What this does

Playwrighty is an **agentic web scraper** powered by LangGraph and Gemini. It crawls websites, extracts LLM-friendly content, and provides a **RAG chat interface** to ask questions about the scraped data.

## Install

```bash
npm install
```

## Setup Gemini API Key

For agentic mode and RAG chat, you need a Google API key.

Recommended: create a `.env` file in the project root:

```bash
GOOGLE_API_KEY=your_api_key_here

# Optional
GEMINI_MODEL=gemini-1.5-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004
```

Alternatively, you can set env vars in your shell:

```bash
# Windows PowerShell
$env:GOOGLE_API_KEY="your_api_key_here"

# Linux/Mac
export GOOGLE_API_KEY=your_api_key_here
```

Get your key at: https://makersuite.google.com/app/apikey

## Run Modes

### 1. Crawl Mode (default)

```bash
npm start
```

Interactive prompts will guide you through:
- Website URL
- Crawl scope (single URL or full-site)
- Concurrency (parallel pages)
- Screenshots (yes/no)
- **Headed mode** — visible browser for CAPTCHA/Cloudflare
- **LangGraph agent** — AI-powered crawl decisions

### 2. RAG Chat Mode

```bash
npm run chat
```

Ask questions about previously scraped content. Select a crawl run and start chatting!

### 3. API Server Mode

```bash
npm run serve
```

Starts a REST API server (default port 3000, configurable via `PORT` env var) for programmatic integration with diligence tools.

```bash
# Search DuckDuckGo for URLs
curl -X POST http://localhost:3000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "renewable energy policies"}'

# Full research pipeline (search + scrape + RAG synthesis)
curl -X POST http://localhost:3000/api/research \
  -H 'Content-Type: application/json' \
  -d '{"query": "renewable energy policies", "question": "What are the key trends?"}'
```

## Output

```
./outputs/<timestamp>_<hostname>/
├── report.md        # Human-readable report
├── report.json      # Machine-readable (used by RAG chat)
└── screenshots/     # Optional page screenshots
```

## Key Options

| Option | Description |
|--------|-------------|
| **Crawl scope** | Provided URLs only or full-site discovery |
| **Concurrency** | 1-10 parallel pages |
| **Headed mode** | Opens visible browser for manual CAPTCHA solving |
| **LangGraph agent** | Uses Gemini for adaptive crawl decisions |

## Bot Detection / CAPTCHA

If a site shows CAPTCHA or Cloudflare challenge:

1. Select **"Run in headed mode"** when prompted
2. A browser window will open
3. Solve the challenge manually
4. Press Enter in the terminal to continue

## LLM-Friendly Extraction

Content is extracted in formats optimized for LLM consumption:
- Chunked text with overlap for embeddings
- Structured metadata (URL, title, headings)
- Markdown reconstruction of main content
- Tables converted to Markdown format

## RAG Chat (how it works)

Chat mode reads `report.json`, creates embeddings with Gemini, stores them in a **local in-memory vector index**, and uses similarity search to provide context for answering questions.

## Notes

- **Same-origin by default** — site-wide crawls stay on the same origin. Cross-origin is supported when URLs are explicitly provided (`scope: 'provided'`)
- **Respects robots.txt** — ethical crawling for site-wide mode. Skipped for explicitly provided URLs since the caller chose them intentionally
- **Atomic outputs** — failed runs don't leave empty folders
- **Audit trail** — research pipeline runs produce `audit-trail.json` and `audit-trail.md` in the output directory for full traceability
