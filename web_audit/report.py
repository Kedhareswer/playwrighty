"""
Report generation (JSON and Markdown).
"""

import json
from typing import Any, Dict, List, Optional
from datetime import datetime


def generate_json_report(report: Dict[str, Any]) -> str:
    """
    Generate a JSON report string.
    
    Args:
        report: The report dictionary
        
    Returns:
        JSON string
    """
    return json.dumps(report, indent=2, default=str)


def generate_markdown_report(report: Dict[str, Any]) -> str:
    """
    Generate a Markdown report from audit data.
    
    Args:
        report: The report dictionary
        
    Returns:
        Markdown string
    """
    lines: List[str] = []
    hr = "---"

    # Header
    lines.append("# 🔍 Web Audit Report")
    lines.append("")
    lines.append(f"> Generated: {report.get('timestamp', datetime.now().isoformat())}")
    lines.append("")
    lines.append(hr)
    lines.append("")

    # Target
    target = report.get("target", {})
    lines.append("## 🎯 Target")
    lines.append("")
    lines.append(f"- **Input URL:** {target.get('input_url', 'N/A')}")
    lines.append(f"- **Final URL:** {target.get('final_url', 'N/A')}")
    lines.append(f"- **Status:** {target.get('status', 'N/A')}")
    lines.append("")

    # Robots
    robots = report.get("robots", {})
    lines.append(hr)
    lines.append("")
    lines.append("## 🤖 Robots.txt")
    lines.append("")
    lines.append(f"- **Allowed:** {'Yes' if robots.get('allowed', True) else 'No'}")
    lines.append(f"- **Crawl Delay:** {robots.get('crawl_delay') or 'Not set'}")
    lines.append(f"- **Sitemaps Found:** {len(robots.get('sitemaps', []))}")
    lines.append("")

    # Extracted data
    extracted = report.get("extracted")
    if extracted:
        # Meta
        meta = extracted.get("meta", {})
        lines.append(hr)
        lines.append("")
        lines.append("## 📄 Metadata")
        lines.append("")
        lines.append(f"- **Title:** {meta.get('title') or 'Not found'}")
        lines.append(f"- **Description:** {meta.get('description') or 'Not found'}")
        lines.append(f"- **Canonical:** {meta.get('canonical') or 'Not set'}")
        lines.append(f"- **Robots:** {meta.get('robots') or 'Not set'}")
        lines.append(f"- **Author:** {meta.get('author') or 'Not set'}")
        lines.append(f"- **Keywords:** {meta.get('keywords') or 'Not set'}")
        lines.append("")

        # OpenGraph
        og = extracted.get("open_graph", {})
        if any(og.values()):
            lines.append(hr)
            lines.append("")
            lines.append("## 📱 OpenGraph")
            lines.append("")
            for key, value in og.items():
                if value:
                    lines.append(f"- **{key.replace('_', ' ').title()}:** {value}")
            lines.append("")

        # Twitter Card
        twitter = extracted.get("twitter_card", {})
        if any(twitter.values()):
            lines.append(hr)
            lines.append("")
            lines.append("## 🐦 Twitter Card")
            lines.append("")
            for key, value in twitter.items():
                if value:
                    lines.append(f"- **{key.replace('_', ' ').title()}:** {value}")
            lines.append("")

        # Headings
        headings = extracted.get("headings", {})
        lines.append(hr)
        lines.append("")
        lines.append("## 📑 Headings")
        lines.append("")
        for level in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            h_list = headings.get(level, [])
            lines.append(f"- **{level.upper()}:** {len(h_list)} found")
            for h in h_list[:5]:
                lines.append(f"  - {h[:100]}{'...' if len(h) > 100 else ''}")
        lines.append("")

        # Links
        links = extracted.get("links", {})
        lines.append(hr)
        lines.append("")
        lines.append("## 🔗 Links")
        lines.append("")
        lines.append(f"- **Internal Links:** {links.get('internal_count', 0)}")
        lines.append(f"- **External Links:** {links.get('external_count', 0)}")
        lines.append("")

        # JSON-LD
        jsonld = extracted.get("json_ld", [])
        if jsonld:
            lines.append(hr)
            lines.append("")
            lines.append("## 📊 Structured Data (JSON-LD)")
            lines.append("")
            lines.append(f"Found {len(jsonld)} JSON-LD object(s)")
            lines.append("")
            for i, obj in enumerate(jsonld[:3]):
                lines.append(f"### Object {i + 1}")
                lines.append("```json")
                lines.append(json.dumps(obj, indent=2)[:1000])
                lines.append("```")
                lines.append("")

        # Text Preview
        text = extracted.get("text_preview", "")
        if text:
            lines.append(hr)
            lines.append("")
            lines.append("## 📝 Text Preview")
            lines.append("")
            lines.append(f"```")
            lines.append(text[:2000])
            lines.append("```")
            lines.append("")

    # Duration
    duration = report.get("duration", {})
    if duration:
        lines.append(hr)
        lines.append("")
        lines.append("## ⏱ Timing")
        lines.append("")
        lines.append(f"- **Total:** {duration.get('total_ms', 0)}ms")
        lines.append(f"- **Robots:** {duration.get('robots_ms', 0)}ms")
        lines.append(f"- **Navigation:** {duration.get('navigation_ms', 0)}ms")
        lines.append(f"- **Extraction:** {duration.get('extraction_ms', 0)}ms")
        lines.append("")

    # Errors/Warnings
    errors = report.get("errors", [])
    warnings = report.get("warnings", [])
    if errors or warnings:
        lines.append(hr)
        lines.append("")
        lines.append("## ⚠️ Issues")
        lines.append("")
        for error in errors:
            lines.append(f"- ❌ {error}")
        for warning in warnings:
            lines.append(f"- ⚠️ {warning}")
        lines.append("")

    return "\n".join(lines)
