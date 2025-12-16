"""
Robots.txt fetching and parsing.
"""

import requests
from typing import Optional, List
from dataclasses import dataclass, field
from datetime import datetime
from urllib.parse import urljoin, urlparse
import re


def _agent_applies(agent: str, user_agent: str) -> bool:
    agent = agent.strip().lower()
    ua = user_agent.lower()
    return agent == '*' or ua.startswith(agent) or agent in ua


def _path_matches_rule(url_path: str, rule_path: str) -> bool:
    if not rule_path:
        return False
    if rule_path in ('/', '/*'):
        return True
    rule = rule_path.rstrip('*')
    return url_path.startswith(rule)


def _evaluate_robots_allowed(raw_content: Optional[str], url: str, user_agent: str) -> bool:
    if not raw_content:
        return True

    url_path = urlparse(url).path or '/'
    current_agent_applies = False

    allow_rules: List[str] = []
    disallow_rules: List[str] = []

    for line in raw_content.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue

        if line.lower().startswith('user-agent:'):
            agent = line.split(':', 1)[1].strip()
            current_agent_applies = _agent_applies(agent, user_agent)
            continue

        if not current_agent_applies:
            continue

        if line.lower().startswith('allow:'):
            path = line.split(':', 1)[1].strip()
            if path:
                allow_rules.append(path)
            continue

        if line.lower().startswith('disallow:'):
            path = line.split(':', 1)[1].strip()
            if path:
                disallow_rules.append(path)
            continue

    best_allow_len = -1
    for rule in allow_rules:
        if _path_matches_rule(url_path, rule):
            best_allow_len = max(best_allow_len, len(rule.rstrip('*')))

    best_disallow_len = -1
    for rule in disallow_rules:
        if _path_matches_rule(url_path, rule):
            best_disallow_len = max(best_disallow_len, len(rule.rstrip('*')))

    if best_allow_len == -1 and best_disallow_len == -1:
        return True

    if best_allow_len >= best_disallow_len:
        return True
    return False


@dataclass
class RobotsResult:
    """Result of robots.txt fetch and parse."""
    url: str
    fetched_at: datetime
    allowed: bool
    crawl_delay: Optional[float] = None
    sitemaps: List[str] = field(default_factory=list)
    raw: Optional[str] = None
    error: Optional[str] = None


def fetch_robots(url: str, user_agent: str = "WebAuditBot/1.0", timeout: int = 10) -> RobotsResult:
    """
    Fetch and parse robots.txt for a given URL.
    
    Args:
        url: The URL to check (robots.txt will be fetched from the origin)
        user_agent: The user agent to check rules for
        timeout: Request timeout in seconds
        
    Returns:
        RobotsResult with parsed data
    """
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    except Exception as e:
        return RobotsResult(
            url=url,
            fetched_at=datetime.now(),
            allowed=True,
            error=f"Invalid URL: {e}"
        )

    try:
        response = requests.get(
            robots_url,
            headers={"User-Agent": user_agent},
            timeout=timeout
        )

        if response.status_code == 404:
            # No robots.txt means everything is allowed
            return RobotsResult(
                url=robots_url,
                fetched_at=datetime.now(),
                allowed=True,
                error="robots.txt not found (404)"
            )

        if response.status_code != 200:
            return RobotsResult(
                url=robots_url,
                fetched_at=datetime.now(),
                allowed=True,
                error=f"HTTP {response.status_code}"
            )

        raw_content = response.text
        
        # Parse robots.txt
        allowed = True
        crawl_delay = None
        sitemaps: List[str] = []

        # Extract sitemaps
        sitemap_matches = re.findall(r'^Sitemap:\s*(.+)$', raw_content, re.MULTILINE | re.IGNORECASE)
        sitemaps = [s.strip() for s in sitemap_matches]

        allowed = _evaluate_robots_allowed(raw_content, url, user_agent)

        current_agent_applies = False
        for line in raw_content.split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            if line.lower().startswith('user-agent:'):
                agent = line.split(':', 1)[1].strip()
                current_agent_applies = _agent_applies(agent, user_agent)
                continue

            if current_agent_applies and line.lower().startswith('crawl-delay:'):
                try:
                    crawl_delay = float(line.split(':', 1)[1].strip())
                except ValueError:
                    pass

        return RobotsResult(
            url=robots_url,
            fetched_at=datetime.now(),
            allowed=allowed,
            crawl_delay=crawl_delay,
            sitemaps=sitemaps,
            raw=raw_content
        )

    except requests.Timeout:
        return RobotsResult(
            url=robots_url,
            fetched_at=datetime.now(),
            allowed=True,
            error="Request timeout"
        )
    except requests.RequestException as e:
        return RobotsResult(
            url=robots_url,
            fetched_at=datetime.now(),
            allowed=True,
            error=str(e)
        )


def is_allowed(robots_result: RobotsResult, url: str, user_agent: str) -> bool:
    """
    Check if a specific URL is allowed based on robots.txt result.
    
    This evaluates the rules against the provided URL path using the fetched
    robots.txt content.
    """
    return _evaluate_robots_allowed(robots_result.raw, url, user_agent)
