"""
WebAudit - Single page audit class.
"""

import os
import base64
import time
from typing import Optional, Dict, Any, List, Callable
from datetime import datetime
from pathlib import Path

from .driver import PlaywrightDriver, NavigationResult
from .robots import fetch_robots, RobotsResult
from .extract import extract_all
from .report import generate_json_report, generate_markdown_report


class WebAudit:
    """
    Single-page web audit class.
    
    Visits a URL, respects robots.txt, extracts data, and generates reports.
    """

    DEFAULT_CONFIG = {
        "user_agent": "WebAuditBot/1.0 (+https://github.com/web-audit)",
        "respect_robots": True,
        "timeout": 30000,
        "save_html": False,
        "save_screenshot": False,
        "save_robots": False,
        "output_dir": "./reports",
        "format": "both",  # json, md, or both
    }

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize WebAudit with configuration.
        
        Args:
            config: Configuration dictionary (merged with defaults)
        """
        self.config = {**self.DEFAULT_CONFIG, **(config or {})}
        self._event_listeners: Dict[str, List[Callable]] = {}

    def on(self, event_type: str, listener: Callable) -> None:
        """Subscribe to an event."""
        if event_type not in self._event_listeners:
            self._event_listeners[event_type] = []
        self._event_listeners[event_type].append(listener)

    def _emit(self, event_type: str, data: Dict[str, Any] = None) -> None:
        """Emit an event to all listeners."""
        data = data or {}
        for listener in self._event_listeners.get(event_type, []):
            try:
                listener({"type": event_type, "data": data, "timestamp": datetime.now()})
            except Exception:
                pass
        # Also emit to wildcard listeners
        for listener in self._event_listeners.get("*", []):
            try:
                listener({"type": event_type, "data": data, "timestamp": datetime.now()})
            except Exception:
                pass

    def visit(self, url: str) -> Dict[str, Any]:
        """
        Visit and audit a single URL.
        
        Args:
            url: The URL to audit
            
        Returns:
            Audit report dictionary
        """
        start_time = time.time()
        errors: List[str] = []
        warnings: List[str] = []
        screenshot_base64: Optional[str] = None

        # Normalize URL
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            if not parsed.scheme:
                url = f"https://{url}"
            normalized_url = url
        except Exception as e:
            normalized_url = url
            errors.append(f"Invalid URL format: {url}")

        self._emit("pipeline:start", {"url": normalized_url, "config": self.config})

        durations = {
            "total_ms": 0,
            "robots_ms": 0,
            "navigation_ms": 0,
            "extraction_ms": 0,
        }

        # Step 1: Fetch robots.txt
        self._emit("robots:fetch", {"url": normalized_url})
        robots_start = time.time()
        robots_result = fetch_robots(normalized_url, self.config["user_agent"])
        durations["robots_ms"] = int((time.time() - robots_start) * 1000)

        self._emit("robots:result", {
            "allowed": robots_result.allowed,
            "crawl_delay": robots_result.crawl_delay,
            "sitemaps": len(robots_result.sitemaps),
        })

        # Initialize results
        navigation_result: Optional[NavigationResult] = None
        extracted_data: Optional[Dict[str, Any]] = None
        html_content: Optional[str] = None
        final_url = normalized_url

        # Check if blocked by robots
        if self.config["respect_robots"] and not robots_result.allowed:
            warnings.append("Page blocked by robots.txt - skipping navigation")
        else:
            # Step 2: Navigate with Playwright
            driver = PlaywrightDriver(self.config["user_agent"])

            try:
                driver.open()
                self._emit("navigate:start", {"url": normalized_url, "driver": "playwright"})
                nav_start = time.time()

                navigation_result = driver.goto(normalized_url, self.config["timeout"])
                durations["navigation_ms"] = navigation_result.load_time_ms
                final_url = navigation_result.final_url

                self._emit("navigate:complete", {
                    "final_url": navigation_result.final_url,
                    "status": navigation_result.status,
                    "load_time_ms": navigation_result.load_time_ms,
                })

                # Step 3: Extract data
                self._emit("extract:start", {
                    "extractors": ["meta", "opengraph", "twitter", "links", "headings", "jsonld", "text"]
                })
                extract_start = time.time()

                html_content = driver.get_content()

                if self.config["save_screenshot"]:
                    screenshot_base64 = driver.screenshot()

                extracted_data = extract_all(html_content, navigation_result.final_url)
                durations["extraction_ms"] = int((time.time() - extract_start) * 1000)

                self._emit("extract:complete", {"extracted": extracted_data})

            except Exception as e:
                errors.append(f"Navigation/extraction error: {str(e)}")
                self._emit("error", {"message": str(e)})
            finally:
                driver.close()

        durations["total_ms"] = int((time.time() - start_time) * 1000)

        # Build report
        report = {
            "version": "1.0.0",
            "timestamp": datetime.now().isoformat(),
            "target": {
                "input_url": url,
                "normalized_url": normalized_url,
                "final_url": final_url,
                "status": navigation_result.status if navigation_result else 0,
            },
            "robots": {
                "url": robots_result.url,
                "allowed": robots_result.allowed,
                "crawl_delay": robots_result.crawl_delay,
                "sitemaps": robots_result.sitemaps,
            },
            "navigation": {
                "final_url": navigation_result.final_url if navigation_result else None,
                "status": navigation_result.status if navigation_result else None,
                "redirects": navigation_result.redirects if navigation_result else [],
                "load_time_ms": navigation_result.load_time_ms if navigation_result else 0,
            } if navigation_result else None,
            "extracted": extracted_data,
            "artifacts": {
                "html_path": None,
                "screenshot_path": None,
                "robots_path": None,
            },
            "errors": errors,
            "warnings": warnings,
            "duration": durations,
        }

        # Save artifacts
        if self.config["output_dir"]:
            self._save_artifacts(report, html_content, screenshot_base64, robots_result)

        self._emit("pipeline:end", {"summary": report})

        return report

    def _save_artifacts(
        self,
        report: Dict[str, Any],
        html_content: Optional[str],
        screenshot_base64: Optional[str],
        robots_result: RobotsResult
    ) -> None:
        """Save report and artifacts to disk."""
        from urllib.parse import urlparse

        hostname = urlparse(report["target"]["normalized_url"]).netloc
        timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        dir_name = f"{hostname}_{timestamp}"
        output_path = Path(self.config["output_dir"]) / dir_name

        output_path.mkdir(parents=True, exist_ok=True)

        # Save JSON report
        if self.config["format"] in ("json", "both"):
            json_path = output_path / "report.json"
            json_path.write_text(generate_json_report(report), encoding="utf-8")
            self._emit("report:generated", {"path": str(json_path), "format": "json"})

        # Save Markdown report
        if self.config["format"] in ("md", "both"):
            md_path = output_path / "report.md"
            md_path.write_text(generate_markdown_report(report), encoding="utf-8")
            self._emit("report:generated", {"path": str(md_path), "format": "md"})

        # Save HTML
        if self.config["save_html"] and html_content:
            html_path = output_path / "page.html"
            html_path.write_text(html_content, encoding="utf-8")
            report["artifacts"]["html_path"] = str(html_path)

        # Save screenshot
        if self.config["save_screenshot"] and screenshot_base64:
            screenshot_path = output_path / "screenshot.png"
            screenshot_path.write_bytes(base64.b64decode(screenshot_base64))
            report["artifacts"]["screenshot_path"] = str(screenshot_path)

        # Save robots.txt
        if self.config["save_robots"] and robots_result.raw:
            robots_path = output_path / "robots.txt"
            robots_path.write_text(robots_result.raw, encoding="utf-8")
            report["artifacts"]["robots_path"] = str(robots_path)
