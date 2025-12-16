"""
Content extraction modules.
"""

from .meta import extract_meta
from .opengraph import extract_opengraph, extract_twitter_card
from .headings import extract_headings
from .links import extract_links
from .jsonld import extract_jsonld
from .text import extract_text_preview

__all__ = [
    "extract_meta",
    "extract_opengraph",
    "extract_twitter_card",
    "extract_headings",
    "extract_links",
    "extract_jsonld",
    "extract_text_preview",
]


def extract_all(html: str, base_url: str) -> dict:
    """
    Extract all available data from HTML content.
    
    Args:
        html: The HTML content to extract from
        base_url: The base URL for resolving relative links
        
    Returns:
        Dictionary containing all extracted data
    """
    return {
        "meta": extract_meta(html),
        "open_graph": extract_opengraph(html),
        "twitter_card": extract_twitter_card(html),
        "links": extract_links(html, base_url),
        "headings": extract_headings(html),
        "json_ld": extract_jsonld(html),
        "text_preview": extract_text_preview(html),
    }
