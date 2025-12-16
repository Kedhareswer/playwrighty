"""
OpenGraph and Twitter Card extraction.
"""

import re
from typing import Optional


def extract_opengraph(html: str) -> dict:
    """
    Extract OpenGraph meta tags from HTML content.
    
    Args:
        html: The HTML content to extract from
        
    Returns:
        Dictionary containing OpenGraph data
    """
    def get_og_content(prop: str) -> Optional[str]:
        """Get content of an OpenGraph meta tag."""
        patterns = [
            rf'<meta\s+property=["\']og:{prop}["\']?\s+content=["\']([^"\']*)["\']',
            rf'<meta\s+content=["\']([^"\']*)["\']?\s+property=["\']og:{prop}["\']',
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None

    return {
        "title": get_og_content("title"),
        "description": get_og_content("description"),
        "image": get_og_content("image"),
        "url": get_og_content("url"),
        "type": get_og_content("type"),
        "site_name": get_og_content("site_name"),
    }


def extract_twitter_card(html: str) -> dict:
    """
    Extract Twitter Card meta tags from HTML content.
    
    Args:
        html: The HTML content to extract from
        
    Returns:
        Dictionary containing Twitter Card data
    """
    def get_twitter_content(name: str) -> Optional[str]:
        """Get content of a Twitter Card meta tag."""
        patterns = [
            rf'<meta\s+name=["\']twitter:{name}["\']?\s+content=["\']([^"\']*)["\']',
            rf'<meta\s+content=["\']([^"\']*)["\']?\s+name=["\']twitter:{name}["\']',
            rf'<meta\s+property=["\']twitter:{name}["\']?\s+content=["\']([^"\']*)["\']',
            rf'<meta\s+content=["\']([^"\']*)["\']?\s+property=["\']twitter:{name}["\']',
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None

    return {
        "card": get_twitter_content("card"),
        "title": get_twitter_content("title"),
        "description": get_twitter_content("description"),
        "image": get_twitter_content("image"),
        "site": get_twitter_content("site"),
    }
