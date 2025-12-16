"""
Headings extraction (H1-H6).
"""

import re
import html
from typing import List

MAX_HEADINGS_PER_LEVEL = 100
MAX_HEADING_LENGTH = 500


def extract_headings(html_content: str) -> dict:
    """
    Extract all headings (H1-H6) from HTML content.
    
    Args:
        html_content: The HTML content to extract from
        
    Returns:
        Dictionary with h1-h6 lists containing heading text
    """
    result = {
        "h1": [],
        "h2": [],
        "h3": [],
        "h4": [],
        "h5": [],
        "h6": [],
    }

    for level in range(1, 7):
        tag = f"h{level}"
        pattern = rf'<{tag}[^>]*>(.*?)</{tag}>'
        matches = re.findall(pattern, html_content, re.IGNORECASE | re.DOTALL)

        headings: List[str] = []
        for match in matches[:MAX_HEADINGS_PER_LEVEL]:
            # Strip inner HTML tags
            text = re.sub(r'<[^>]+>', '', match)
            # Decode HTML entities
            text = html.unescape(text)
            # Normalize whitespace
            text = ' '.join(text.split())
            # Truncate if needed
            if len(text) > MAX_HEADING_LENGTH:
                text = text[:MAX_HEADING_LENGTH] + "..."
            if text:
                headings.append(text)

        result[tag] = headings

    return result
