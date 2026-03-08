# Compliance & Safety

## robots.txt

Playwrighty fetches `robots.txt` from the site origin and uses it to decide whether a URL may be fetched.

- User agent: `playwrighty`
- Default behavior when `robots.txt` is missing: allow

## Scope

- **Same-origin by default** — site-wide crawls (`scope: 'site'`) stay on the same origin
- **Cross-origin for provided URLs** — when URLs are explicitly provided (`scope: 'provided'`), cross-origin is allowed since the caller chose the URLs intentionally
- **robots.txt** — enforced for site-wide crawling; skipped for explicitly provided URLs
- No form submissions
- No authentication

## Bot challenges (CAPTCHA / Cloudflare)

If a website presents a bot challenge, Playwrighty supports a **headed** (visible browser) mode so you can complete the challenge manually and then continue crawling.

This is intended for legitimate access to content you are allowed to view. Playwrighty does not attempt to bypass access controls.

## SSRF Protection

User-supplied URLs are validated against private/internal network ranges to prevent Server-Side Request Forgery (SSRF) attacks via `isPrivateUrl()` in `src/core/url.js`.

**Blocked ranges:**
- `localhost`, `0.0.0.0`
- `127.0.0.0/8` (loopback)
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC 1918 private)
- `169.254.0.0/16` (link-local / cloud metadata)
- `0.0.0.0/8`
- IPv6: `::1` (loopback), `fc00::/7` (unique local), `fe80::/10` (link-local)
- IPv4-mapped IPv6: `::ffff:W.X.Y.Z` (both dotted and hex forms)

**Redirect validation:** After Playwright visits a page, the final URL (after redirects) is checked against these ranges. Redirects to private addresses are rejected.

**Note:** This checks the hostname string, not DNS resolution. For full protection against DNS rebinding, add a Playwright network interceptor.

## Audit Trail

The research pipeline (`/api/research`) records every step in a session-scoped audit trail:

- **Search** — query, result URLs, source
- **Scrape** — URL, title, status, content length
- **Analysis** — question, context chunks, source URLs, answer length

Each session gets a UUID. Audit trails are persisted as `audit-trail.json` and `audit-trail.md` in the output directory. A global `.audit-index.json` maps session IDs to output directories for retrieval via `GET /api/audit/:sessionId`.

## Intended use

- Content discovery
- Publicly available information summarization
- Internal analysis

Not intended for:

- SEO manipulation
- Abusive crawling
- Bypassing access controls
