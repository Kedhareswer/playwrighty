
from datetime import datetime

from web_audit.robots import RobotsResult, is_allowed


def test_robots_is_allowed_is_per_url_path() -> None:
    raw = """
User-agent: *
Disallow: /private
""".strip()

    robots_result = RobotsResult(
        url="https://example.com/robots.txt",
        fetched_at=datetime.now(),
        allowed=True,
        raw=raw,
    )

    assert is_allowed(robots_result, "https://example.com/", "TestBot/1.0") is True
    assert is_allowed(robots_result, "https://example.com/public", "TestBot/1.0") is True
    assert is_allowed(robots_result, "https://example.com/private", "TestBot/1.0") is False
    assert is_allowed(robots_result, "https://example.com/private/page", "TestBot/1.0") is False
