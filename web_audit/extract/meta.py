"""
Meta tags extraction.
"""

import re
from typing import Optional
from dataclasses import dataclass


@dataclass
class ExtractedMeta:
    """Extracted meta tag data."""
    title: Optional[str] = None
    description: Optional[str] = None
    canonical: Optional[str] = None
    robots: Optional[str] = None
    author: Optional[str] = None
    keywords: Optional[str] = None


def extract_meta(html: str) -> dict:
    """
    Extract meta tags from HTML content.
    
    Args:
        html: The HTML content to extract from
        
    Returns:
        Dictionary containing extracted meta data
    """
    def get_meta_content(name: str) -> Optional[str]:
        """Get content of a meta tag by name or property."""
        patterns = [
            rf'<meta\s+name=["\']?{name}["\']?\s+content=["\']([^"\']*)["\']',
            rf'<meta\s+content=["\']([^"\']*)["\']?\s+name=["\']?{name}["\']',
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None

    # Extract title
    title_match = re.search(r'<title[^>]*>([^<]*)</title>', html, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else None

    # Extract canonical
    canonical_match = re.search(
        r'<link\s+[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"\']*)["\']',
        html, re.IGNORECASE
    )
    if not canonical_match:
        canonical_match = re.search(
            r'<link\s+[^>]*href=["\']([^"\']*)["\'][^>]*rel=["\']canonical["\']',
            html, re.IGNORECASE
        )
    canonical = canonical_match.group(1).strip() if canonical_match else None

    return {
        "title": title,
        "description": get_meta_content("description"),
        "canonical": canonical,
        "robots": get_meta_content("robots"),
        "author": get_meta_content("author"),
        "keywords": get_meta_content("keywords"),
    }
