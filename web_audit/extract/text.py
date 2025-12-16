"""
Text content extraction.
"""

import re
import html

MAX_TEXT_LENGTH = 10000


def extract_text_preview(html_content: str) -> str:
    """
    Extract text content preview from HTML.
    
    Args:
        html_content: The HTML content to extract from
        
    Returns:
        Cleaned text content (up to MAX_TEXT_LENGTH characters)
    """
    # Remove script and style tags with their content
    text = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'<noscript[^>]*>.*?</noscript>', '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # Remove HTML comments
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    
    # Remove all HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    
    # Decode HTML entities
    text = html.unescape(text)
    
    # Normalize whitespace
    text = ' '.join(text.split())
    
    # Truncate to max length
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH]
    
    return text
