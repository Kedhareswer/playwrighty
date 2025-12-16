# Playwrighty — Quickstart

## What this does

Playwrighty crawls a website starting from a URL, **respects robots.txt**, optionally reads `sitemap.xml`, visits discovered pages, takes screenshots, extracts publicly visible information, and produces a **professional report** (Markdown + JSON).

## Install

```bash
npm install
```

## Run (interactive)

```bash
npm start
```

Or:

```bash
npx playwrighty
```

## Output

A new folder is created in:

```
./outputs/<timestamp>_<hostname>/
```

Containing:

- `report.md`
- `report.json`
- `screenshots/` (if enabled)

## Notes

- The crawler is **same-origin only** (it won’t follow external domains).
- `robots.txt` is used to decide what URLs may be fetched.
- This is intended for **discovery and internal analysis**, not SEO.
