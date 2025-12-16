"""
Web Audit - A robots.txt-compliant web content extraction tool using Playwright.
"""

__version__ = "1.0.0"

from .audit import WebAudit
from .site_audit import SiteAudit
from .driver import PlaywrightDriver

__all__ = ["WebAudit", "SiteAudit", "PlaywrightDriver", "__version__"]
