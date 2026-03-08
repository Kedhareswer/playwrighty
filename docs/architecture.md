# Architecture

## System Overview

Playwrighty is an agentic web scraper built with:
- **LangGraph** — State machine for adaptive crawl decisions
- **Gemini** — LLM for content analysis and RAG chat
- **Playwright** — Browser automation with bot detection handling
- **Vector Store** — Local in-memory embeddings + cosine similarity for semantic search

## High-level Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CLI       │ ──▶ │  LangGraph  │ ──▶ │  Playwright │
│  (prompts)  │     │   Agent     │     │   Backend   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
┌─────────────┐            ▼                    ▼
│  REST API   │     ┌─────────────┐     ┌─────────────┐
│  Server     │ ──▶ │   Gemini    │     │  Extraction │
└─────────────┘     │   (LLM)     │     │  + Reports  │
       │            └─────────────┘     └─────────────┘
       ▼                                       │
┌─────────────┐                                ▼
│  DuckDuckGo │                         ┌─────────────┐
│  Search     │                         │  RAG Chat   │
└─────────────┘                         │  (Vector)   │
                                        └─────────────┘
```

### Research Pipeline Flow

```
Search (DDG) → Scrape (Playwright) → Index (Vectors) → Synthesize (Gemini) → Audit Trail
```

## Key Modules

### Core
- `bin/cli.js` — Entry point
- `src/cli/run.js` — Interactive CLI with crawl + chat modes
- `src/index.js` — Public API exports (`crawlSite`, `searchWeb`, `researchTopic`, `AuditTrail`)
- `src/core/url.js` — URL utilities + `isPrivateUrl()` SSRF protection

### Crawler
- `src/crawler/crawlSite.js` — Standard crawl orchestration (supports AbortController signals)
- `src/crawler/discovery.js` — robots.txt + sitemap discovery

### Agent (LangGraph)
- `src/agent/state.js` — Agent state schema (Annotation)
- `src/agent/nodes.js` — Graph nodes (init, discovery, crawl, analyze, human)
- `src/agent/graph.js` — LangGraph compilation + runner

### LLM
- `src/llm/gemini.js` — Gemini chat + embeddings wrapper

### Extraction
- `src/runners/playwrightBackend.js` — Playwright browser + extraction
- `src/extraction/llmFriendly.js` — Chunking for RAG embeddings

### RAG
- `src/rag/vectorStore.js` — In-memory vector store
- `src/rag/chat.js` — RAG chat interface

### Search
- `src/search/webSearch.js` — DuckDuckGo web search (free, no API key)

### Pipeline
- `src/pipelines/research.js` — End-to-end research: search → scrape → index → synthesize

### Audit
- `src/audit/trail.js` — Session-scoped audit trail (JSON + Markdown)

### Server
- `src/server/index.js` — Express REST API (search, scrape, research, audit endpoints)

## Configuration

Environment variables are loaded from `.env` at process start (`bin/cli.js`).

- `GOOGLE_API_KEY`: required for Gemini chat + embeddings
- `GEMINI_MODEL`: optional override for chat model
- `GEMINI_EMBEDDING_MODEL`: optional override for embedding model
- `PORT`: REST API server port (default 3000)

### Reports
- `src/report/writeReport.js` — Markdown + JSON generation
- `src/report/util.js` — Timestamps, safe filenames

## Agent State Machine

```
START ──▶ init ──▶ discovery ──▶ crawl ──┬──▶ analyze ──▶ END
                                   │     │
                                   │     └──▶ human ──┐
                                   │                  │
                                   └──────────────────┘
```

### Nodes
| Node | Purpose |
|------|---------|
| `init` | Initialize queue from provided URLs |
| `discovery` | Fetch robots.txt, parse sitemaps |
| `crawl` | Visit URL, extract content, handle errors |
| `analyze` | LLM analysis of extracted content |
| `human` | Pause for manual CAPTCHA intervention |

## Bot Detection Handling

When Cloudflare/CAPTCHA is detected:
1. Check page content for challenge patterns
2. If headed mode: pause and prompt user
3. User solves challenge in browser
4. Continue crawling with established session

## LLM-Friendly Extraction

Content is processed for optimal RAG performance:
- **Chunking**: 1500 chars with 200 char overlap
- **Metadata**: URL, title, chunk index, word count
- **Format**: Title + URL header + content body
