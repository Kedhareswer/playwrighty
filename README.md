# 🔍 Web Audit

A **robots.txt-compliant** web audit tool built with **Python/Flask** and **Playwright** for accurate JS-rendered content extraction.

## ✨ Features

- **🤖 Robots.txt Compliance** - Automatically fetches and respects robots.txt rules, crawl-delay, and sitemap discovery
- **🎭 Playwright Extraction** - Uses a real headless browser for accurate JS-rendered content
- **📊 Rich Data Extraction** - Extracts metadata, OpenGraph, Twitter Cards, JSON-LD, links, headings (H1-H6), and text content
- **📄 Multiple Report Formats** - Generates both JSON (machine-readable) and Markdown (human-readable) reports
- **🎨 Beautiful CLI** - Interactive wizard with Rich console output
- **🌐 REST API** - Flask-based API for programmatic access
- **💾 Artifact Saving** - Optionally save raw HTML, screenshots, and robots.txt content

## 📦 Installation

```bash
# Clone or navigate to the project
cd parser

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium
```

## 🚀 Usage

### CLI Commands

#### Visit and Audit a URL

```bash
# Basic usage
python cli.py visit https://example.com

# With options
python cli.py visit https://example.com \
  --output ./my-reports \
  --format both \
  --save-all
```

#### Interactive Site Audit (Single page or Sitemap)

```bash
# Interactive wizard
python cli.py

# Same as above
python cli.py start
```

#### Check Robots.txt Only

```bash
python cli.py check-robots https://example.com
```

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <dir>` | Output directory for reports | `./reports` |
| `-f, --format <format>` | Report format (`json`, `md`, or `both`) | `both` |
| `--save-html` | Save raw HTML content | `false` |
| `--save-screenshot` | Save page screenshot | `false` |
| `--save-robots` | Save robots.txt content | `false` |
| `--save-all` | Save all artifacts | `false` |
| `--no-robots` | Ignore robots.txt restrictions | `false` |
| `-v, --verbose` | Verbose output | `false` |

### Flask API

Start the API server:

```bash
python app.py
```

#### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Web UI |
| `/api` | GET | API information |
| `/health` | GET | Health check |
| `/audit` | POST | Audit a single URL |
| `/site-audit` | POST | Audit a site (single/sitemap) |
| `/reports` | GET | List available reports |
| `/reports/<path>` | GET | Download a report file |

#### Example API Request

```bash
curl -X POST http://localhost:5000/audit \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "save_screenshot": true}'
```

### Programmatic Usage

```python
from web_audit import WebAudit, SiteAudit

# Single page audit
audit = WebAudit({
    "output_dir": "./reports",
    "format": "both",
    "save_screenshot": True,
})

report = audit.visit("https://example.com")
print(f"Title: {report['extracted']['meta']['title']}")
print(f"Links: {report['extracted']['links']['internal_count']}")

# Site audit (sitemap-based)
site_audit = SiteAudit({
    "crawl_mode": "sitemap",
    "max_pages": 10,
    "save_screenshot": True,
})

report = site_audit.audit("https://example.com")
print(f"Pages: {report['summary']['successful_pages']}")
```

## 📋 Report Structure

### JSON Report

```json
{
  "version": "1.0.0",
  "timestamp": "2024-12-16T04:30:00.000Z",
  "target": {
    "input_url": "https://example.com",
    "final_url": "https://example.com/",
    "status": 200
  },
  "robots": {
    "url": "https://example.com/robots.txt",
    "allowed": true,
    "crawl_delay": null,
    "sitemaps": ["https://example.com/sitemap.xml"]
  },
  "extracted": {
    "meta": {
      "title": "Example Domain",
      "description": "...",
      "canonical": "https://example.com/"
    },
    "open_graph": { ... },
    "twitter_card": { ... },
    "links": {
      "internal_count": 5,
      "external_count": 2
    },
    "headings": {
      "h1": ["Example Domain"],
      "h2": [],
      "h3": [],
      "h4": [],
      "h5": [],
      "h6": []
    },
    "json_ld": [ ... ],
    "text_preview": "..."
  },
  "duration": {
    "total_ms": 2500,
    "robots_ms": 200,
    "navigation_ms": 1800,
    "extraction_ms": 500
  }
}
```

## 🏗️ Architecture

```
web_audit/
├── __init__.py         # Package exports
├── audit.py            # WebAudit class (single page)
├── site_audit.py       # SiteAudit class (multi-page)
├── driver.py           # Playwright browser driver
├── robots.py           # Robots.txt handling
├── sitemap.py          # Sitemap parsing
├── report.py           # Report generators
└── extract/
    ├── __init__.py     # Extract all function
    ├── meta.py         # Meta tags extraction
    ├── opengraph.py    # OpenGraph & Twitter Cards
    ├── links.py        # Link analysis
    ├── headings.py     # Heading structure (H1-H6)
    ├── jsonld.py       # JSON-LD extraction
    └── text.py         # Text content preview

app.py                  # Flask REST API
cli.py                  # CLI entry point
requirements.txt        # Python dependencies
```

## 🛡️ Robots.txt Compliance

The tool **respects robots.txt by default**:

1. Fetches `/robots.txt` before visiting any page
2. Checks if the URL is allowed for the user-agent
3. Respects `Crawl-delay` directives
4. Discovers sitemaps from `Sitemap:` directives
5. If blocked: skips navigation and records in report

To bypass (for testing/local sites):
```bash
python cli.py visit https://localhost:3000 --no-robots
```

## 📸 Screenshots

- **`visit`** (`--save-screenshot` or `--save-all`) writes:
  - `./reports/<host>_<timestamp>/screenshot.png`
- **`start`** with screenshots enabled writes:
  - `./reports/<host>_<timestamp>/screenshots/<index>-<page>.png`

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome!
