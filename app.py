#!/usr/bin/env python3
"""
Web Audit Flask Application - REST API for web auditing.
"""

import os
import json
from flask import Flask, request, jsonify, send_from_directory, render_template
from datetime import datetime

from web_audit import WebAudit, SiteAudit, __version__

app = Flask(__name__)

# Configuration
app.config["REPORTS_DIR"] = os.environ.get("REPORTS_DIR", "./reports")


@app.route("/")
def index():
    """Serve the web UI."""
    return render_template("index.html")


@app.route("/api")
def api_info():
    """API information endpoint."""
    return jsonify({
        "name": "Web Audit API",
        "version": __version__,
        "endpoints": {
            "GET /": "Web UI",
            "GET /api": "API information",
            "GET /health": "Health check",
            "POST /audit": "Audit a single URL",
            "POST /site-audit": "Audit a site (single page or sitemap)",
            "GET /reports": "List available reports",
            "GET /reports/<path>": "Download a report file",
        }
    })


@app.route("/health")
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": __version__,
    })


@app.route("/audit", methods=["POST"])
def audit():
    """
    Audit a single URL.
    
    Request body:
    {
        "url": "https://example.com",
        "save_screenshot": false,
        "save_html": false,
        "respect_robots": true
    }
    """
    data = request.get_json() or {}
    url = data.get("url")

    if not url:
        return jsonify({"error": "URL is required"}), 400

    config = {
        "output_dir": app.config["REPORTS_DIR"],
        "format": "both",
        "save_screenshot": data.get("save_screenshot", False),
        "save_html": data.get("save_html", False),
        "save_robots": data.get("save_robots", False),
        "respect_robots": data.get("respect_robots", True),
    }

    try:
        audit_instance = WebAudit(config)
        report = audit_instance.visit(url)
        return jsonify(report)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/site-audit", methods=["POST"])
def site_audit():
    """
    Audit a site (single page or sitemap-based).
    
    Request body:
    {
        "url": "https://example.com",
        "crawl_mode": "single",  // or "sitemap"
        "max_pages": 20,
        "save_screenshot": false,
        "respect_robots": true
    }
    """
    data = request.get_json() or {}
    url = data.get("url")

    if not url:
        return jsonify({"error": "URL is required"}), 400

    config = {
        "output_dir": app.config["REPORTS_DIR"],
        "format": "both",
        "crawl_mode": data.get("crawl_mode", "single"),
        "max_pages": data.get("max_pages", 20),
        "save_screenshot": data.get("save_screenshot", False),
        "respect_robots": data.get("respect_robots", True),
    }

    try:
        audit_instance = SiteAudit(config)
        report = audit_instance.audit(url)
        return jsonify(report)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/reports")
def list_reports():
    """List available reports."""
    reports_dir = app.config["REPORTS_DIR"]

    if not os.path.exists(reports_dir):
        return jsonify({"reports": []})

    reports = []
    for item in os.listdir(reports_dir):
        item_path = os.path.join(reports_dir, item)
        if os.path.isdir(item_path):
            # Get files in the report directory
            files = os.listdir(item_path)
            reports.append({
                "name": item,
                "files": files,
                "created": datetime.fromtimestamp(os.path.getctime(item_path)).isoformat(),
            })

    # Sort by creation time (newest first)
    reports.sort(key=lambda x: x["created"], reverse=True)

    return jsonify({"reports": reports})


@app.route("/reports/<path:filepath>")
def get_report(filepath):
    """Download a report file."""
    reports_dir = app.config["REPORTS_DIR"]
    return send_from_directory(reports_dir, filepath)


if __name__ == "__main__":
    # Ensure reports directory exists
    os.makedirs(app.config["REPORTS_DIR"], exist_ok=True)

    # Run the Flask development server
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"

    print(f"🔍 Web Audit API starting on http://localhost:{port}")
    print(f"📁 Reports directory: {app.config['REPORTS_DIR']}")

    app.run(host="0.0.0.0", port=port, debug=debug)
