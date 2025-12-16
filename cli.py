#!/usr/bin/env python3
"""
Web Audit CLI - Command-line interface for web auditing.
"""

import click
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.panel import Panel
from rich.table import Table
from rich import print as rprint

from web_audit import WebAudit, SiteAudit, __version__

console = Console()


def print_banner():
    """Print the CLI banner."""
    banner = """
╔════════════════════════════════════════════════════════════╗
║  🔍 Web Audit - Robots.txt Compliant Web Data Extraction  ║
╚════════════════════════════════════════════════════════════╝
    """
    console.print(banner, style="bold cyan")


@click.group(invoke_without_command=True)
@click.version_option(version=__version__)
@click.pass_context
def cli(ctx):
    """Web Audit - A robots.txt-compliant web content extraction tool."""
    if ctx.invoked_subcommand is None:
        # Default to interactive mode
        ctx.invoke(start)


@cli.command()
@click.argument('url')
@click.option('-o', '--output', default='./reports', help='Output directory for reports')
@click.option('-f', '--format', 'fmt', type=click.Choice(['json', 'md', 'both']), default='both', help='Report format')
@click.option('--save-screenshot', is_flag=True, help='Save page screenshot')
@click.option('--save-html', is_flag=True, help='Save raw HTML content')
@click.option('--save-robots', is_flag=True, help='Save robots.txt content')
@click.option('--save-all', is_flag=True, help='Save all artifacts')
@click.option('--no-robots', is_flag=True, help='Ignore robots.txt restrictions')
@click.option('-v', '--verbose', is_flag=True, help='Verbose output')
def visit(url, output, fmt, save_screenshot, save_html, save_robots, save_all, no_robots, verbose):
    """Visit and audit a single URL."""
    print_banner()

    config = {
        "output_dir": output,
        "format": fmt,
        "save_screenshot": save_screenshot or save_all,
        "save_html": save_html or save_all,
        "save_robots": save_robots or save_all,
        "respect_robots": not no_robots,
    }

    audit = WebAudit(config)

    console.print(f"▶ Target: [cyan]{url}[/cyan]")
    console.print(f"▶ Driver: [green]playwright[/green]")
    console.print(f"▶ Robots: [{'green' if not no_robots else 'yellow'}]{'Respected' if not no_robots else 'Ignored'}[/]")
    console.print()
    console.print("─" * 60)
    console.print()

    json_path = None
    md_path = None

    def on_event(event):
        nonlocal json_path, md_path
        if event["type"] == "report:generated":
            if event["data"]["format"] == "json":
                json_path = event["data"]["path"]
            elif event["data"]["format"] == "md":
                md_path = event["data"]["path"]

    audit.on("*", on_event)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
        transient=True
    ) as progress:
        task = progress.add_task("🤖 Fetching robots.txt...", total=None)

        def update_progress(event):
            if event["type"] == "robots:result":
                allowed = event["data"]["allowed"]
                status = "[green]ALLOWED[/green]" if allowed else "[red]BLOCKED[/red]"
                progress.update(task, description=f"🤖 Robots.txt: {status}")
            elif event["type"] == "navigate:start":
                progress.update(task, description=f"🌐 Navigating to {url}...")
            elif event["type"] == "navigate:complete":
                status = event["data"]["status"]
                load_time = event["data"]["load_time_ms"]
                progress.update(task, description=f"🌐 Page loaded ({status}, {load_time}ms)")
            elif event["type"] == "extract:start":
                progress.update(task, description="🔍 Extracting page data...")
            elif event["type"] == "extract:complete":
                progress.update(task, description="🔍 Extraction complete")

        audit.on("*", update_progress)

        try:
            report = audit.visit(url)
        except Exception as e:
            console.print(f"[red]❌ Error: {e}[/red]")
            raise SystemExit(1)

    console.print()
    console.print("✅ [green]Audit complete![/green]")
    console.print()

    # Display summary
    if report.get("extracted"):
        _display_summary(report)

    # Display report paths
    if json_path or md_path:
        console.print()
        console.print(Panel.fit(
            "\n".join(filter(None, [
                f"✓ JSON: [cyan]{json_path}[/cyan]" if json_path else None,
                f"✓ Markdown: [cyan]{md_path}[/cyan]" if md_path else None,
            ])),
            title="📁 Reports Saved"
        ))

    console.print()
    console.print(f"🏁 Total time: {report['duration']['total_ms']}ms")


@cli.command()
@click.argument('url')
def check_robots(url):
    """Check robots.txt for a URL without visiting."""
    print_banner()

    from web_audit.robots import fetch_robots

    with console.status("🤖 Fetching robots.txt..."):
        result = fetch_robots(url)

    if result.allowed:
        console.print("🤖 [green]ALLOWED[/green] - You can crawl this URL")
    else:
        console.print("🤖 [red]BLOCKED[/red] - Crawling is not allowed")

    console.print()
    console.print(f"[dim]Robots URL:[/dim]    {result.url}")
    console.print(f"[dim]Crawl Delay:[/dim]   {result.crawl_delay or 'Not specified'}")
    console.print(f"[dim]Sitemaps:[/dim]      {len(result.sitemaps)}")

    if result.sitemaps:
        console.print()
        console.print("[dim]Sitemap URLs:[/dim]")
        for sitemap in result.sitemaps:
            console.print(f"  • {sitemap}")

    if result.error:
        console.print()
        console.print(f"[yellow]Note:[/yellow] {result.error}")


@cli.command()
def start():
    """Interactive site audit wizard."""
    print_banner()

    console.print("  Welcome to the Interactive Site Audit Wizard")
    console.print("  [dim]This tool will crawl your site and generate a professional report.[/dim]")
    console.print()
    console.print("─" * 60)
    console.print()

    # Get URL
    url = click.prompt(
        click.style("🌐 Enter the website URL to audit", fg="cyan"),
        type=str
    )
    if not url.startswith("http"):
        url = f"https://{url}"

    console.print()

    # Get crawl mode
    crawl_mode = click.prompt(
        click.style("🔍 Crawl mode", fg="cyan"),
        type=click.Choice(["single", "sitemap"]),
        default="single",
        show_choices=True
    )

    max_pages = 1
    if crawl_mode == "sitemap":
        max_pages = click.prompt(
            click.style("📄 Maximum pages to extract", fg="cyan"),
            type=int,
            default=20
        )

    console.print()

    # Get options
    respect_robots = click.confirm(
        click.style("🤖 Respect robots.txt rules?", fg="cyan"),
        default=True
    )

    output_dir = click.prompt(
        click.style("📁 Output directory for reports", fg="cyan"),
        default="./reports"
    )

    save_screenshot = click.confirm(
        click.style("📸 Save screenshots for extracted pages?", fg="cyan"),
        default=False
    )

    console.print()
    console.print("─" * 60)
    console.print()

    # Show config summary
    mode_label = "Single Page" if crawl_mode == "single" else "All Pages (Sitemap)"
    config_table = Table(show_header=False, box=None)
    config_table.add_column("Key", style="dim")
    config_table.add_column("Value", style="cyan")
    config_table.add_row("URL", url)
    config_table.add_row("Mode", mode_label)
    if crawl_mode == "sitemap":
        config_table.add_row("Max Pages", str(max_pages))
    config_table.add_row("Robots", "Respected" if respect_robots else "Ignored")
    config_table.add_row("Output", output_dir)
    config_table.add_row("Screenshots", "Yes" if save_screenshot else "No")

    console.print(Panel(config_table, title="📋 Configuration"))
    console.print()

    # Confirm
    if not click.confirm(click.style("🚀 Start the audit?", fg="cyan"), default=True):
        console.print("[yellow]Audit cancelled.[/yellow]")
        raise SystemExit(0)

    console.print()
    console.print("─" * 60)
    console.print()

    # Run audit
    config = {
        "max_pages": max_pages,
        "respect_robots": respect_robots,
        "output_dir": output_dir,
        "format": "both",
        "crawl_mode": crawl_mode,
        "save_screenshot": save_screenshot,
    }

    audit = SiteAudit(config)

    json_path = None
    md_path = None

    def on_report(event):
        nonlocal json_path, md_path
        if event["type"] == "report:generated":
            if event["data"]["format"] == "json":
                json_path = event["data"]["path"]
            elif event["data"]["format"] == "md":
                md_path = event["data"]["path"]

    audit.on("*", on_report)

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
        transient=True
    ) as progress:
        task = progress.add_task("🤖 Fetching robots.txt...", total=None)

        def update_progress(event):
            if event["type"] == "robots:result":
                allowed = event["data"]["allowed"]
                sitemaps = event["data"]["sitemaps"]
                status = "[green]ALLOWED[/green]" if allowed else "[red]BLOCKED[/red]"
                progress.update(task, description=f"🤖 Robots.txt: {status} ({sitemaps} sitemaps)")
            elif event["type"] == "extract:partial":
                name = event["data"].get("extractor_name", "")
                data = event["data"].get("data", {})
                if name == "sitemap":
                    progress.update(task, description=f"🔍 Found {data.get('urls_found', 0)} pages in sitemap")
                elif name == "single":
                    progress.update(task, description="🔍 Single page mode")
                elif name == "page":
                    current = data.get("current", 0)
                    total = data.get("total", 0)
                    progress.update(task, description=f"🌐 Extracting page {current}/{total}...")
            elif event["type"] == "extract:complete":
                progress.update(task, description="📊 Analysis complete")

        audit.on("*", update_progress)

        try:
            report = audit.audit(url)
        except Exception as e:
            console.print(f"[red]❌ Error: {e}[/red]")
            raise SystemExit(1)

    console.print()
    console.print("═" * 60)
    console.print()

    # Display summary
    _display_site_summary(report)

    # Display report paths
    if json_path or md_path:
        console.print()
        console.print(Panel.fit(
            "\n".join(filter(None, [
                f"✓ JSON: [cyan]{json_path}[/cyan]" if json_path else None,
                f"✓ Markdown: [cyan]{md_path}[/cyan]" if md_path else None,
            ])),
            title="📁 Reports Saved"
        ))

    console.print()
    console.print("═" * 60)
    console.print()
    console.print(f"🏁 [bold green]Site audit complete![/bold green] ({report['duration']['total_ms']}ms)")
    console.print()


def _display_summary(report):
    """Display single-page audit summary."""
    extracted = report.get("extracted", {})
    meta = extracted.get("meta", {})
    links = extracted.get("links", {})
    headings = extracted.get("headings", {})

    # Target info
    target_table = Table(show_header=False, box=None)
    target_table.add_column("Key", style="dim")
    target_table.add_column("Value")
    target_table.add_row("Target", report["target"]["input_url"])
    target_table.add_row("Final", report["target"]["final_url"])
    target_table.add_row("Status", str(report["target"]["status"]))
    console.print(Panel(target_table, title="🎯 Target"))

    # Metadata
    meta_table = Table(show_header=False, box=None)
    meta_table.add_column("Key", style="dim")
    meta_table.add_column("Value")
    meta_table.add_row("Title", meta.get("title") or "[dim]Not found[/dim]")
    meta_table.add_row("Description", (meta.get("description") or "[dim]Not found[/dim]")[:60])
    meta_table.add_row("OG Image", "Yes" if extracted.get("open_graph", {}).get("image") else "No")
    meta_table.add_row("JSON-LD", f"{len(extracted.get('json_ld', []))} object(s)")
    console.print(Panel(meta_table, title="📄 Metadata"))

    # Structure
    h_counts = " ".join([f"H{i}: {len(headings.get(f'h{i}', []))}" for i in range(1, 7)])
    struct_table = Table(show_header=False, box=None)
    struct_table.add_column("Key", style="dim")
    struct_table.add_column("Value")
    struct_table.add_row("Headings", h_counts)
    struct_table.add_row("Internal Links", str(links.get("internal_count", 0)))
    struct_table.add_row("External Links", str(links.get("external_count", 0)))
    console.print(Panel(struct_table, title="📑 Structure"))


def _display_site_summary(report):
    """Display site audit summary."""
    s = report["summary"]

    # Overview
    seo_score = 0
    if s["successful_pages"] > 0:
        seo_score = int((
            s["seo"]["pages_with_title"] +
            s["seo"]["pages_with_description"] +
            s["seo"]["pages_with_h1"]
        ) / (s["successful_pages"] * 3) * 100)

    health_emoji = "🟢" if seo_score >= 80 else "🟡" if seo_score >= 50 else "🔴"

    overview_table = Table(show_header=False, box=None)
    overview_table.add_column("Key", style="dim")
    overview_table.add_column("Value")
    overview_table.add_row("Site", report["site"]["hostname"])
    overview_table.add_row("Pages Analyzed", str(s["total_pages"]))
    overview_table.add_row("Successful", f"[green]{s['successful_pages']}[/green] ({int(s['successful_pages']/s['total_pages']*100)}%)")
    overview_table.add_row("Errors", f"[red]{s['error_pages']}[/red]" if s["error_pages"] else "[green]0[/green]")
    overview_table.add_row("SEO Score", f"{health_emoji} {seo_score}%")
    overview_table.add_row("Avg Load Time", f"{s['performance']['avg_load_time_ms']}ms")
    console.print(Panel(overview_table, title="🎯 Overview"))

    # SEO Health
    seo = s["seo"]
    total = s["successful_pages"] or 1
    seo_table = Table(show_header=False, box=None)
    seo_table.add_column("Metric", style="dim")
    seo_table.add_column("Value")
    seo_table.add_row("Title Tags", f"{seo['pages_with_title']}/{total}")
    seo_table.add_row("Descriptions", f"{seo['pages_with_description']}/{total}")
    seo_table.add_row("H1 Headings", f"{seo['pages_with_h1']}/{total}")
    seo_table.add_row("OpenGraph", f"{seo['pages_with_opengraph']}/{total}")
    seo_table.add_row("JSON-LD", f"{seo['pages_with_jsonld']}/{total}")
    console.print(Panel(seo_table, title="🎯 SEO Health"))

    # Content Stats
    content = s["content"]
    content_table = Table(show_header=False, box=None)
    content_table.add_column("Metric", style="dim")
    content_table.add_column("Value")
    content_table.add_row("Internal Links", f"{content['total_internal_links']} total ({content['avg_internal_links_per_page']}/page)")
    content_table.add_row("External Links", f"{content['total_external_links']} total ({content['avg_external_links_per_page']}/page)")
    content_table.add_row("H1 Tags", str(content["total_h1_tags"]))
    content_table.add_row("H2 Tags", str(content["total_h2_tags"]))
    console.print(Panel(content_table, title="📝 Content Stats"))


if __name__ == "__main__":
    cli()
