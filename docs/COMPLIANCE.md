# Compliance & Safety

## robots.txt

Playwrighty fetches `robots.txt` from the site origin and uses it to decide whether a URL may be fetched.

- User agent: `playwrighty`
- Default behavior when `robots.txt` is missing: allow

## Scope

- Same-origin only
- No form submissions
- No authentication

## Bot challenges (CAPTCHA / Cloudflare)

If a website presents a bot challenge, Playwrighty supports a **headed** (visible browser) mode so you can complete the challenge manually and then continue crawling.

This is intended for legitimate access to content you are allowed to view. Playwrighty does not attempt to bypass access controls.

## Intended use

- Content discovery
- Publicly available information summarization
- Internal analysis

Not intended for:

- SEO manipulation
- Abusive crawling
- Bypassing access controls
