# Compliance & Safety

## robots.txt

Playwrighty fetches `robots.txt` from the site origin and uses it to decide whether a URL may be fetched.

- User agent: `playwrighty`
- Default behavior when `robots.txt` is missing: allow

## Scope

- Same-origin only
- No form submissions
- No authentication

## Intended use

- Content discovery
- Publicly available information summarization
- Internal analysis

Not intended for:

- SEO manipulation
- Abusive crawling
- Bypassing access controls
