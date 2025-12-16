"""
JSON-LD structured data extraction.
"""

import re
import json
from typing import List


def extract_jsonld(html: str) -> List[dict]:
    """
    Extract JSON-LD structured data from HTML content.
    
    Args:
        html: The HTML content to extract from
        
    Returns:
        List of parsed JSON-LD objects
    """
    result: List[dict] = []

    # Find all JSON-LD script tags
    pattern = r'<script\s+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>'
    matches = re.findall(pattern, html, re.IGNORECASE | re.DOTALL)

    for match in matches:
        try:
            # Clean up the content
            content = match.strip()
            if not content:
                continue

            # Parse JSON
            data = json.loads(content)
            
            # Handle both single objects and arrays
            if isinstance(data, list):
                result.extend(data)
            else:
                result.append(data)

        except json.JSONDecodeError:
            # Skip invalid JSON
            continue
        except Exception:
            continue

    return result
