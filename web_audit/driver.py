"""
Playwright driver for browser automation.
"""

import base64
import time
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page


@dataclass
class NavigationResult:
    """Result of a page navigation."""
    final_url: str
    status: int
    redirects: List[str]
    load_time_ms: int


class PlaywrightDriver:
    """
    Playwright-based browser driver for web content extraction.
    Uses a real headless browser for accurate JS-rendered content.
    """

    def __init__(self, user_agent: str = "WebAuditBot/1.0"):
        self.user_agent = user_agent
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self._is_open = False

    @property
    def name(self) -> str:
        return "playwright"

    def open(self) -> None:
        """Launch browser and create a new page."""
        if self._is_open:
            return

        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=True)
        self.context = self.browser.new_context(
            user_agent=self.user_agent,
            viewport={"width": 1280, "height": 720},
            ignore_https_errors=True,
        )
        self.page = self.context.new_page()
        self._is_open = True

    def close(self) -> None:
        """Close browser and cleanup resources."""
        if not self._is_open:
            return

        try:
            if self.page:
                self.page.close()
            if self.context:
                self.context.close()
            if self.browser:
                self.browser.close()
            if self.playwright:
                self.playwright.stop()
        except Exception:
            pass
        finally:
            self.page = None
            self.context = None
            self.browser = None
            self.playwright = None
            self._is_open = False

    def _ensure_open(self) -> None:
        """Ensure browser is open."""
        if not self._is_open:
            raise RuntimeError("Driver not open. Call open() first.")

    def goto(self, url: str, timeout: int = 30000) -> NavigationResult:
        """
        Navigate to a URL and wait for the page to load.
        
        Args:
            url: The URL to navigate to
            timeout: Navigation timeout in milliseconds
            
        Returns:
            NavigationResult with final URL, status, redirects, and load time
        """
        self._ensure_open()
        if not self.page:
            raise RuntimeError("Page not initialized")

        redirects: List[str] = []
        status = 200
        start_time = time.time()

        # Track redirects
        def handle_response(response):
            nonlocal status
            if response.url == url or response.url == self.page.url:
                status = response.status

        self.page.on("response", handle_response)

        try:
            response = self.page.goto(
                url,
                wait_until="networkidle",
                timeout=timeout
            )

            if response:
                status = response.status
                # Collect redirect chain
                if response.request.redirected_from:
                    req = response.request.redirected_from
                    while req:
                        redirects.insert(0, req.url)
                        req = req.redirected_from

            load_time_ms = int((time.time() - start_time) * 1000)

            return NavigationResult(
                final_url=self.page.url,
                status=status,
                redirects=redirects,
                load_time_ms=load_time_ms
            )

        except Exception as e:
            load_time_ms = int((time.time() - start_time) * 1000)
            # Return error status
            return NavigationResult(
                final_url=url,
                status=0,
                redirects=[],
                load_time_ms=load_time_ms
            )

    def get_content(self) -> str:
        """Get the full HTML content of the current page."""
        self._ensure_open()
        if not self.page:
            raise RuntimeError("Page not initialized")
        return self.page.content()

    def evaluate(self, script: str) -> Any:
        """Execute JavaScript in the page context."""
        self._ensure_open()
        if not self.page:
            raise RuntimeError("Page not initialized")
        return self.page.evaluate(script)

    def screenshot(self, full_page: bool = True) -> Optional[str]:
        """
        Take a screenshot of the current page.
        
        Args:
            full_page: Whether to capture the full scrollable page
            
        Returns:
            Base64-encoded PNG image string, or None on failure
        """
        self._ensure_open()
        if not self.page:
            raise RuntimeError("Page not initialized")

        try:
            buffer = self.page.screenshot(type="png", full_page=full_page)
            return base64.b64encode(buffer).decode("utf-8")
        except Exception:
            return None

    def __enter__(self):
        """Context manager entry."""
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
        return False
