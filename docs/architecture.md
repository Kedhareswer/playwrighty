# Architecture

## System Overview

Playwrighty is an agentic web scraper built with:
- **LangGraph** — State machine for adaptive crawl decisions
- **Gemini** — LLM for content analysis and RAG chat
- **Playwright** — Browser automation with bot detection handling
- **Vector Store** — In-memory embeddings for semantic search

## High-level Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CLI       │ ──▶ │  LangGraph  │ ──▶ │  Playwright │
│  (prompts)  │     │   Agent     │     │   Backend   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Gemini    │     │  Extraction │
                    │   (LLM)     │     │  + Reports  │
                    └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │  RAG Chat   │
                                        │  (Vector)   │
                                        └─────────────┘
```

## Key Modules

### Core
- `bin/cli.js` — Entry point
- `src/cli/run.js` — Interactive CLI with crawl + chat modes
- `src/index.js` — Public API exports

### Crawler
- `src/crawler/crawlSite.js` — Standard crawl orchestration
- `src/crawler/discovery.js` — robots.txt + sitemap discovery
- `src/core/url.js` — URL utilities

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
