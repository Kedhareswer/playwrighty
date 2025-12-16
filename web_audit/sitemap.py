"""
Sitemap parsing and URL discovery.
"""

import requests
import re
from typing import List, Optional
from dataclasses import dataclass
from urllib.parse import urljoin


@dataclass
class SitemapUrl:
    """A URL entry from a sitemap."""
    loc: str
    lastmod: Optional[str] = None
    changefreq: Optional[str] = None
    priority: Optional[float] = None


def fetch_sitemap(url: str, timeout: int = 10) -> Optional[str]:
    """
    Fetch sitemap content from a URL.
    
    Args:
        url: The sitemap URL
        timeout: Request timeout in seconds
        
    Returns:
        Sitemap XML content or None on failure
    """
    try:
        response = requests.get(
            url,
            headers={"User-Agent": "WebAuditBot/1.0"},
            timeout=timeout
        )
        if response.status_code == 200:
            return response.text
    except Exception:
        pass
    return None


def parse_sitemap(content: str) -> tuple[List[SitemapUrl], List[str]]:
    """
    Parse sitemap XML content.
    
    Args:
        content: The sitemap XML content
        
    Returns:
        Tuple of (list of URLs, list of nested sitemap URLs)
    """
    urls: List[SitemapUrl] = []
    nested_sitemaps: List[str] = []

    # Check if this is a sitemap index
    if '<sitemapindex' in content.lower():
        # Extract nested sitemap URLs
        loc_matches = re.findall(
            r'<sitemap[^>]*>.*?<loc[^>]*>([^<]+)</loc>.*?</sitemap>',
            content,
            re.IGNORECASE | re.DOTALL
        )
        nested_sitemaps = [loc.strip() for loc in loc_matches]
    else:
        # Parse regular sitemap
        url_blocks = re.findall(
            r'<url[^>]*>(.*?)</url>',
            content,
            re.IGNORECASE | re.DOTALL
        )

        for block in url_blocks:
            # Extract loc (required)
            loc_match = re.search(r'<loc[^>]*>([^<]+)</loc>', block, re.IGNORECASE)
            if not loc_match:
                continue

            loc = loc_match.group(1).strip()

            # Extract optional fields
            lastmod_match = re.search(r'<lastmod[^>]*>([^<]+)</lastmod>', block, re.IGNORECASE)
            changefreq_match = re.search(r'<changefreq[^>]*>([^<]+)</changefreq>', block, re.IGNORECASE)
            priority_match = re.search(r'<priority[^>]*>([^<]+)</priority>', block, re.IGNORECASE)

            priority = None
            if priority_match:
                try:
                    priority = float(priority_match.group(1).strip())
                except ValueError:
                    pass

            urls.append(SitemapUrl(
                loc=loc,
                lastmod=lastmod_match.group(1).strip() if lastmod_match else None,
                changefreq=changefreq_match.group(1).strip() if changefreq_match else None,
                priority=priority
            ))

    return urls, nested_sitemaps


def discover_all_urls(
    origin: str,
    sitemap_urls: List[str],
    max_urls: int = 100
) -> List[SitemapUrl]:
    """
    Discover all URLs from sitemaps (including nested sitemaps).
    
    Args:
        origin: The site origin URL
        sitemap_urls: List of sitemap URLs to process
        max_urls: Maximum number of URLs to return
        
    Returns:
        List of discovered URLs
    """
    all_urls: List[SitemapUrl] = []
    processed_sitemaps: set = set()
    pending_sitemaps = list(sitemap_urls)

    while pending_sitemaps and len(all_urls) < max_urls:
        sitemap_url = pending_sitemaps.pop(0)

        if sitemap_url in processed_sitemaps:
            continue
        processed_sitemaps.add(sitemap_url)

        content = fetch_sitemap(sitemap_url)
        if not content:
            continue

        urls, nested = parse_sitemap(content)

        # Add URLs (up to max)
        remaining = max_urls - len(all_urls)
        all_urls.extend(urls[:remaining])

        # Add nested sitemaps to process
        for nested_url in nested:
            if nested_url not in processed_sitemaps:
                pending_sitemaps.append(nested_url)

    return all_urls
