# 🏗️ Architecture

## High-Level Overview

Web Audit is a modular Python application with Flask API, CLI, and Playwright browser automation.

## System Diagram

```mermaid
graph TB
    subgraph Interfaces
        UI[Web UI]
        CLI[CLI]
    end

    subgraph API
        Flask[Flask API]
    end

    subgraph Core
        WebAudit[WebAudit]
        SiteAudit[SiteAudit]
        Driver[Playwright Driver]
    end

    subgraph Extractors
        Meta[meta]
        OG[opengraph]
        Links[links]
        Headings[headings]
        JSONLD[jsonld]
        Text[text]
    end

    subgraph Utilities
        Robots[robots]
        Sitemap[sitemap]
        Report[report]
    end

    UI --> Flask
    CLI --> WebAudit
    CLI --> SiteAudit
    Flask --> WebAudit
    Flask --> SiteAudit
    WebAudit --> Driver
    SiteAudit --> Driver
    WebAudit --> Meta
    WebAudit --> OG
    WebAudit --> Links
    WebAudit --> Headings
    WebAudit --> JSONLD
    WebAudit --> Text
    WebAudit --> Robots
    SiteAudit --> Robots
    SiteAudit --> Sitemap
    WebAudit --> Report
    SiteAudit --> Report
```

## Component Table

| Layer | Component | File | Responsibility |
|-------|-----------|------|----------------|
| UI | HTML/CSS/JS | `templates/index.html` | Browser interface |
| CLI | Click + Rich | `cli.py` | Command-line wizard |
| API | Flask | `app.py` | HTTP endpoints |
| Core | WebAudit | `web_audit/audit.py` | Single-page orchestration |
| Core | SiteAudit | `web_audit/site_audit.py` | Multi-page crawl |
| Core | Driver | `web_audit/driver.py` | Playwright wrapper |
| Extract | Meta | `web_audit/extract/meta.py` | Meta tags |
| Extract | OpenGraph | `web_audit/extract/opengraph.py` | OG + Twitter |
| Extract | Links | `web_audit/extract/links.py` | Link parsing |
| Extract | Headings | `web_audit/extract/headings.py` | H1-H6 |
| Extract | JSON-LD | `web_audit/extract/jsonld.py` | Structured data |
| Extract | Text | `web_audit/extract/text.py` | Text preview |
| Util | Robots | `web_audit/robots.py` | robots.txt parser |
| Util | Sitemap | `web_audit/sitemap.py` | Sitemap parser |
| Util | Report | `web_audit/report.py` | JSON + MD generation |

## Data Flow (Single Page)

```mermaid
flowchart LR
    A[URL] --> B[WebAudit]
    B --> C[Robots]
    C --> D{Allowed?}
    D -->|Yes| E[Playwright]
    D -->|No| F[Skip]
    E --> G[Extractors]
    G --> H[Report]
```

## Data Flow (Site Audit)

```mermaid
flowchart TD
    A[URL] --> B[SiteAudit]
    B --> C[Robots]
    C --> D[Sitemap]
    D --> E[URL List]
    E --> F[Loop: WebAudit per URL]
    F --> G[Summary]
    G --> H[Report]
```

## Event System

WebAudit and SiteAudit emit events for observability:

| Event | When Fired | Payload |
|-------|------------|---------|
| `pipeline:start` | Audit starts | `{ url, config }` |
| `robots:fetch` | Before robots.txt | `{ url }` |
| `robots:result` | After robots.txt | `{ allowed, crawl_delay, sitemaps }` |
| `navigate:start` | Before page load | `{ url, driver }` |
| `navigate:complete` | After page load | `{ final_url, status, load_time_ms }` |
| `extract:start` | Before extraction | `{ extractors }` |
| `extract:complete` | After extraction | `{ extracted }` |
| `report:generated` | Report saved | `{ path, format }` |
| `pipeline:end` | Audit complete | `{ summary }` |
| `error` | Any error | `{ message }` |
| `*` | Wildcard for all events | Full event object |
