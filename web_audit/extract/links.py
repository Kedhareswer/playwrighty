"""
Links extraction and analysis.
"""

import re
import html
from typing import List, Optional
from urllib.parse import urljoin, urlparse

MAX_LINKS = 500


def extract_links(html_content: str, base_url: str) -> dict:
    """
    Extract and categorize links from HTML content.
    
    Args:
        html_content: The HTML content to extract from
        base_url: The base URL for resolving relative links
        
    Returns:
        Dictionary with internal/external links and counts
    """
    try:
        base_parsed = urlparse(base_url)
        base_host = base_parsed.netloc.lower()
    except Exception:
        base_host = ""

    internal: List[dict] = []
    external: List[dict] = []

    # Find all anchor tags
    pattern = r'<a\s+[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>'
    matches = re.findall(pattern, html_content, re.IGNORECASE | re.DOTALL)

    seen_urls = set()

    for href, link_text in matches:
        if len(internal) >= MAX_LINKS and len(external) >= MAX_LINKS:
            break

        # Skip empty, javascript, mailto, tel links
        href = href.strip()
        if not href or href.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
            continue

        # Resolve relative URLs
        try:
            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)
            
            # Skip non-http(s) URLs
            if parsed.scheme not in ('http', 'https'):
                continue

            # Normalize URL for deduplication
            normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            if normalized in seen_urls:
                continue
            seen_urls.add(normalized)

            # Extract link text
            text = re.sub(r'<[^>]+>', '', link_text)
            text = html.unescape(text)
            text = ' '.join(text.split())[:200]

            link_data = {
                "href": full_url,
                "text": text,
            }

            # Categorize as internal or external
            link_host = parsed.netloc.lower()
            is_internal = (
                link_host == base_host or
                link_host.endswith(f".{base_host}") or
                base_host.endswith(f".{link_host}")
            )

            if is_internal and len(internal) < MAX_LINKS:
                internal.append(link_data)
            elif not is_internal and len(external) < MAX_LINKS:
                external.append(link_data)

        except Exception:
            continue

    return {
        "internal": internal,
        "external": external,
        "internal_count": len(internal),
        "external_count": len(external),
    }
