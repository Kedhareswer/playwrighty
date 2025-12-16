"""
SiteAudit - Multi-page site audit class.
"""

import os
import re
import base64
import time
from typing import Optional, Dict, Any, List, Callable
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from .driver import PlaywrightDriver
from .robots import fetch_robots, is_allowed, RobotsResult
from .sitemap import discover_all_urls, SitemapUrl
from .extract import extract_all
from .report import generate_json_report


class SiteAudit:
    """
    Multi-page site audit class.
    
    Crawls a site using sitemap.xml, respects robots.txt, extracts data from
    each page, and generates comprehensive reports.
    """

    DEFAULT_CONFIG = {
        "max_pages": 20,
        "respect_robots": True,
        "user_agent": "WebAuditBot/1.0 (+https://github.com/web-audit)",
        "output_dir": "./reports",
        "format": "both",
        "crawl_delay": 1.0,  # seconds
        "crawl_mode": "single",  # single or sitemap
        "save_screenshot": False,
    }

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize SiteAudit with configuration.
        
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
        for listener in self._event_listeners.get("*", []):
            try:
                listener({"type": event_type, "data": data, "timestamp": datetime.now()})
            except Exception:
                pass

    def audit(self, url: str) -> Dict[str, Any]:
        """
        Audit a site (single page or sitemap-based).
        
        Args:
            url: The URL to audit
            
        Returns:
            Site audit report dictionary
        """
        start_time = time.time()
        errors: List[str] = []
        warnings: List[str] = []
        screenshots: List[Dict[str, Any]] = []

        # Parse URL
        try:
            parsed = urlparse(url)
            if not parsed.scheme:
                url = f"https://{url}"
                parsed = urlparse(url)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            hostname = parsed.netloc
        except Exception as e:
            raise ValueError(f"Invalid URL: {url}")

        self._emit("pipeline:start", {"url": url, "config": self.config})

        durations = {
            "total_ms": 0,
            "robots_ms": 0,
            "sitemap_ms": 0,
            "crawl_ms": 0,
        }

        # Step 1: Fetch robots.txt
        self._emit("robots:fetch", {"url": f"{origin}/robots.txt"})
        robots_start = time.time()
        robots_result = fetch_robots(url, self.config["user_agent"])
        durations["robots_ms"] = int((time.time() - robots_start) * 1000)

        self._emit("robots:result", {
            "allowed": robots_result.allowed,
            "crawl_delay": robots_result.crawl_delay,
            "sitemaps": len(robots_result.sitemaps),
        })

        # Step 2: Discover URLs
        sitemap_start = time.time()
        discovered_urls: List[Dict[str, str]] = []
        sitemap_urls: List[str] = []

        if self.config["crawl_mode"] == "single":
            discovered_urls = [{"loc": url}]
            self._emit("extract:partial", {
                "extractor_name": "single",
                "data": {"urls_found": 1}
            })
        else:
            self._emit("extract:start", {"extractors": ["sitemap"]})
            sitemap_urls = robots_result.sitemaps if robots_result.sitemaps else [f"{origin}/sitemap.xml"]
            
            sitemap_results = discover_all_urls(origin, sitemap_urls, self.config["max_pages"])
            discovered_urls = [{"loc": u.loc} for u in sitemap_results]

            self._emit("extract:partial", {
                "extractor_name": "sitemap",
                "data": {"urls_found": len(discovered_urls)}
            })

            if not discovered_urls:
                discovered_urls = [{"loc": url}]
                warnings.append("No sitemap found or sitemap empty - extracting provided URL only")

        durations["sitemap_ms"] = int((time.time() - sitemap_start) * 1000)

        # Step 3: Crawl pages
        crawl_start = time.time()
        page_results: List[Dict[str, Any]] = []

        driver = PlaywrightDriver(self.config["user_agent"])

        try:
            driver.open()
            self._emit("navigate:start", {"url": origin, "driver": "playwright"})

            max_pages = min(len(discovered_urls), self.config["max_pages"])

            for i, url_entry in enumerate(discovered_urls[:max_pages]):
                page_url = url_entry["loc"]

                self._emit("extract:partial", {
                    "extractor_name": "page",
                    "data": {"current": i + 1, "total": max_pages, "url": page_url}
                })

                page_result = self._audit_page(
                    page_url, robots_result, driver, i + 1, screenshots
                )
                page_results.append(page_result)

                if page_result.get("error"):
                    errors.append(f"{page_url}: {page_result['error']}")

                # Respect crawl delay
                if i < max_pages - 1:
                    delay = robots_result.crawl_delay or self.config["crawl_delay"]
                    time.sleep(delay)

        finally:
            driver.close()

        durations["crawl_ms"] = int((time.time() - crawl_start) * 1000)
        durations["total_ms"] = int((time.time() - start_time) * 1000)

        self._emit("navigate:complete", {
            "final_url": origin,
            "status": 200,
            "load_time_ms": durations["crawl_ms"]
        })

        # Step 4: Generate summary
        summary = self._generate_summary(page_results)
        self._emit("extract:complete", {"extracted": summary})

        # Build report
        report = {
            "version": "1.0.0",
            "timestamp": datetime.now().isoformat(),
            "site": {
                "input_url": url,
                "origin": origin,
                "hostname": hostname,
            },
            "robots": {
                "url": robots_result.url,
                "allowed": robots_result.allowed,
                "crawl_delay": robots_result.crawl_delay,
                "sitemaps": robots_result.sitemaps,
            },
            "sitemap": {
                "discovered": len(discovered_urls) > 1 or "No sitemap" not in str(warnings),
                "total_urls": len(discovered_urls),
                "sitemap_urls": sitemap_urls,
            },
            "pages": page_results,
            "summary": summary,
            "duration": durations,
            "errors": errors,
            "warnings": warnings,
        }

        # Save report
        if self.config["output_dir"]:
            self._save_report(report, screenshots)

        self._emit("pipeline:end", {"summary": report})

        return report

    def _audit_page(
        self,
        url: str,
        robots_result: RobotsResult,
        driver: PlaywrightDriver,
        index: int,
        screenshots: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Audit a single page."""
        start_time = time.time()

        # Check robots
        if self.config["respect_robots"] and not is_allowed(robots_result, url, self.config["user_agent"]):
            return {
                "url": url,
                "status": "blocked",
                "load_time_ms": int((time.time() - start_time) * 1000),
                "extracted": None,
                "error": "Blocked by robots.txt",
            }

        try:
            nav_result = driver.goto(url)

            if nav_result.status >= 400:
                return {
                    "url": url,
                    "status": "error",
                    "load_time_ms": nav_result.load_time_ms,
                    "extracted": None,
                    "error": f"HTTP {nav_result.status}",
                }

            html = driver.get_content()

            if self.config["save_screenshot"]:
                screenshot_base64 = driver.screenshot()
                if screenshot_base64:
                    screenshots.append({
                        "index": index,
                        "url": nav_result.final_url,
                        "base64": screenshot_base64
                    })

            extracted = extract_all(html, nav_result.final_url)

            return {
                "url": nav_result.final_url,
                "status": "success",
                "load_time_ms": nav_result.load_time_ms,
                "extracted": extracted,
                "error": None,
            }

        except Exception as e:
            return {
                "url": url,
                "status": "error",
                "load_time_ms": int((time.time() - start_time) * 1000),
                "extracted": None,
                "error": str(e),
            }

    def _generate_summary(self, pages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate summary statistics from page results."""
        successful = [p for p in pages if p["status"] == "success" and p.get("extracted")]
        blocked = [p for p in pages if p["status"] == "blocked"]
        errored = [p for p in pages if p["status"] == "error"]

        # SEO metrics
        pages_with_title = len([p for p in successful if p["extracted"].get("meta", {}).get("title")])
        pages_with_description = len([p for p in successful if p["extracted"].get("meta", {}).get("description")])
        pages_with_canonical = len([p for p in successful if p["extracted"].get("meta", {}).get("canonical")])
        pages_with_h1 = len([p for p in successful if p["extracted"].get("headings", {}).get("h1")])
        pages_with_og = len([p for p in successful if p["extracted"].get("open_graph", {}).get("title")])
        pages_with_twitter = len([p for p in successful if p["extracted"].get("twitter_card", {}).get("card")])
        pages_with_jsonld = len([p for p in successful if p["extracted"].get("json_ld")])

        # Content stats
        total_internal = sum(p["extracted"].get("links", {}).get("internal_count", 0) for p in successful)
        total_external = sum(p["extracted"].get("links", {}).get("external_count", 0) for p in successful)
        total_h1 = sum(len(p["extracted"].get("headings", {}).get("h1", [])) for p in successful)
        total_h2 = sum(len(p["extracted"].get("headings", {}).get("h2", [])) for p in successful)

        # Performance
        load_times = [p["load_time_ms"] for p in successful]
        avg_load = int(sum(load_times) / len(load_times)) if load_times else 0
        fastest = min(load_times) if load_times else 0
        slowest = max(load_times) if load_times else 0

        return {
            "total_pages": len(pages),
            "successful_pages": len(successful),
            "blocked_pages": len(blocked),
            "error_pages": len(errored),
            "seo": {
                "pages_with_title": pages_with_title,
                "pages_with_description": pages_with_description,
                "pages_with_canonical": pages_with_canonical,
                "pages_with_h1": pages_with_h1,
                "pages_with_opengraph": pages_with_og,
                "pages_with_twitter_card": pages_with_twitter,
                "pages_with_jsonld": pages_with_jsonld,
            },
            "content": {
                "total_internal_links": total_internal,
                "total_external_links": total_external,
                "avg_internal_links_per_page": int(total_internal / len(successful)) if successful else 0,
                "avg_external_links_per_page": int(total_external / len(successful)) if successful else 0,
                "total_h1_tags": total_h1,
                "total_h2_tags": total_h2,
            },
            "performance": {
                "avg_load_time_ms": avg_load,
                "fastest_page_ms": fastest,
                "slowest_page_ms": slowest,
            },
        }

    def _save_report(self, report: Dict[str, Any], screenshots: List[Dict[str, Any]]) -> None:
        """Save report and screenshots to disk."""
        timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
        dir_name = f"{report['site']['hostname']}_{timestamp}"
        output_path = Path(self.config["output_dir"]) / dir_name

        output_path.mkdir(parents=True, exist_ok=True)

        # Save JSON
        if self.config["format"] in ("json", "both"):
            json_path = output_path / "report.json"
            json_path.write_text(generate_json_report(report), encoding="utf-8")
            self._emit("report:generated", {"path": str(json_path), "format": "json"})

        # Save Markdown
        if self.config["format"] in ("md", "both"):
            md_path = output_path / "report.md"
            md_path.write_text(self._generate_markdown_report(report), encoding="utf-8")
            self._emit("report:generated", {"path": str(md_path), "format": "md"})

        # Save individual page reports
        pages_dir = output_path / "pages"
        pages_dir.mkdir(exist_ok=True)
        for i, page in enumerate(report["pages"]):
            if page["status"] == "success" and page.get("extracted"):
                page_name = self._sanitize_filename(
                    page["extracted"].get("meta", {}).get("title") or f"page_{i+1}"
                )
                page_path = pages_dir / f"{i+1}-{page_name}.md"
                page_path.write_text(self._generate_page_markdown(page, i + 1), encoding="utf-8")

        # Save screenshots
        if self.config["save_screenshot"] and screenshots:
            screenshots_dir = output_path / "screenshots"
            screenshots_dir.mkdir(exist_ok=True)
            for s in screenshots:
                name = self._sanitize_filename(s["url"].split("/")[-1] or f"page_{s['index']}")
                screenshot_path = screenshots_dir / f"{s['index']}-{name}.png"
                screenshot_path.write_bytes(base64.b64decode(s["base64"]))
            self._emit("report:generated", {"path": str(screenshots_dir), "format": "screenshots"})

    def _sanitize_filename(self, name: str) -> str:
        """Sanitize a string for use as a filename."""
        name = re.sub(r'[<>:"/\\|?*]', '', name)
        name = name.strip()[:50]
        return name or "untitled"

    def _generate_markdown_report(self, report: Dict[str, Any]) -> str:
        """Generate combined Markdown report."""
        lines = []
        s = report["summary"]

        lines.append(f"# 📊 Website Content Report")
        lines.append("")
        lines.append(f"> **{report['site']['hostname']}**")
        lines.append(f">")
        lines.append(f"> Generated: {report['timestamp']}")
        lines.append(f"> Pages Extracted: {s['successful_pages']}")
        lines.append("")
        lines.append("---")
        lines.append("")

        # Summary
        lines.append("## 📈 Summary")
        lines.append("")
        lines.append(f"| Metric | Value |")
        lines.append(f"|--------|-------|")
        lines.append(f"| Total Pages | {s['total_pages']} |")
        lines.append(f"| Successful | {s['successful_pages']} |")
        lines.append(f"| Blocked | {s['blocked_pages']} |")
        lines.append(f"| Errors | {s['error_pages']} |")
        lines.append("")

        # SEO Health
        lines.append("## 🎯 SEO Health")
        lines.append("")
        seo = s["seo"]
        total = s["successful_pages"] or 1
        lines.append(f"| Metric | Count | Percentage |")
        lines.append(f"|--------|-------|------------|")
        lines.append(f"| Title Tags | {seo['pages_with_title']} | {int(seo['pages_with_title']/total*100)}% |")
        lines.append(f"| Descriptions | {seo['pages_with_description']} | {int(seo['pages_with_description']/total*100)}% |")
        lines.append(f"| H1 Headings | {seo['pages_with_h1']} | {int(seo['pages_with_h1']/total*100)}% |")
        lines.append(f"| OpenGraph | {seo['pages_with_opengraph']} | {int(seo['pages_with_opengraph']/total*100)}% |")
        lines.append(f"| JSON-LD | {seo['pages_with_jsonld']} | {int(seo['pages_with_jsonld']/total*100)}% |")
        lines.append("")

        # Performance
        lines.append("## ⏱ Performance")
        lines.append("")
        perf = s["performance"]
        lines.append(f"- **Average Load Time:** {perf['avg_load_time_ms']}ms")
        lines.append(f"- **Fastest Page:** {perf['fastest_page_ms']}ms")
        lines.append(f"- **Slowest Page:** {perf['slowest_page_ms']}ms")
        lines.append("")

        return "\n".join(lines)

    def _generate_page_markdown(self, page: Dict[str, Any], index: int) -> str:
        """Generate Markdown for a single page."""
        lines = []
        e = page["extracted"]
        meta = e.get("meta", {})

        lines.append(f"# {meta.get('title') or 'Untitled Page'}")
        lines.append("")
        lines.append(f"**URL:** {page['url']}")
        lines.append(f"**Load Time:** {page['load_time_ms']}ms")
        lines.append("")

        # Meta
        lines.append("## Metadata")
        lines.append("")
        lines.append(f"- **Description:** {meta.get('description') or 'Not set'}")
        lines.append(f"- **Canonical:** {meta.get('canonical') or 'Not set'}")
        lines.append("")

        # Headings
        headings = e.get("headings", {})
        lines.append("## Headings")
        lines.append("")
        for level in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            h_list = headings.get(level, [])
            if h_list:
                lines.append(f"### {level.upper()} ({len(h_list)})")
                for h in h_list[:10]:
                    lines.append(f"- {h}")
                lines.append("")

        # Links
        links = e.get("links", {})
        lines.append("## Links")
        lines.append("")
        lines.append(f"- **Internal:** {links.get('internal_count', 0)}")
        lines.append(f"- **External:** {links.get('external_count', 0)}")
        lines.append("")

        return "\n".join(lines)
