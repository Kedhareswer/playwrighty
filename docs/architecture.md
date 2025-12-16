# Architecture

## High-level flow

1. User provides a start URL via the interactive CLI.
2. Discovery phase:
   - Fetch `robots.txt`
   - Collect sitemap candidates (robots hints + `/sitemap.xml`)
3. Crawl phase:
   - Queue URLs (same-origin only)
   - Filter by robots policy
   - Visit pages via a runner backend
   - Extract data + optional screenshots
4. Reporting phase:
   - Write `report.json`
   - Write a professional `report.md`

## Key modules

- `bin/cli.js`: CLI entry
- `src/cli/run.js`: interactive prompts + progress UI
- `src/crawler/*`: robots/sitemap discovery + crawl orchestration
- `src/runners/*`: runner backends
  - `playwrightBackend`: normal Playwright (default)
  - `mcpBackend`: placeholder for MCP transport wiring (next step)
- `src/report/*`: report generation

## MCP mode (planned)

MCP mode is designed to call Playwright/Puppeteer tools through an MCP server.

To complete it, we need a concrete decision on transport:

- stdio MCP server command (recommended for local)
- HTTP MCP server URL (recommended for remote)

Once decided, the `mcpBackend` will be updated to:

- connect using `@modelcontextprotocol/sdk`
- call the relevant tool methods to navigate, extract, and screenshot
