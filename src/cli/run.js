const inquirer = require('inquirer');
const chalk = require('chalk');
const oraPkg = require('ora');
const ora = oraPkg?.default || oraPkg;

const { crawlSite } = require('../crawler/crawlSite');
const { ensureUrl } = require('../core/url');

function parseUrlList(input) {
  const raw = String(input || '')
    .split(/[\s,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const urls = raw.map((u) => ensureUrl(u));
  const unique = Array.from(new Set(urls));
  return unique;
}

function banner() {
  const line = '────────────────────────────────────────────────────────────';
  return [
    chalk.cyan(line),
    chalk.cyan.bold(' Playwrighty — Website Discovery & Reporting (Robots-Aware)'),
    chalk.dim(' Generates a professional report from publicly available pages.'),
    chalk.cyan(line),
  ].join('\n');
}

async function promptOptions() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'Website URL (paste and press Enter):',
      validate: (v) => {
        try {
          ensureUrl(v);
          return true;
        } catch (e) {
          return e?.message || 'Invalid URL';
        }
      },
    },
    {
      type: 'list',
      name: 'scope',
      message: 'Crawl scope:',
      choices: [
        {
          name: 'Provided URL(s) only (no sitemap, no link discovery)',
          value: 'provided',
        },
        {
          name: 'Full-site discovery (robots + sitemap + internal links)',
          value: 'site',
        },
      ],
      default: 'site',
    },
    {
      type: 'input',
      name: 'targetUrls',
      message: 'URLs to analyze (space/comma/newline separated):',
      when: (a) => a.scope === 'provided',
      default: (a) => a.url,
      validate: (v) => {
        try {
          const urls = parseUrlList(v);
          if (!urls.length) return 'Enter at least 1 URL';

          const origin = new URL(urls[0]).origin;
          const allSameOrigin = urls.every((u) => new URL(u).origin === origin);
          if (!allSameOrigin) return 'All URLs must be on the same origin for a single run';
          return true;
        } catch (e) {
          return e?.message || 'Invalid URL list';
        }
      },
    },
    {
      type: 'list',
      name: 'engine',
      message: 'Runner engine:',
      choices: [
        { name: 'Normal Playwright (recommended)', value: 'playwright' },
        { name: 'MCP (Playwright/Puppeteer tools)', value: 'mcp' },
      ],
      default: 'playwright',
    },
    {
      type: 'input',
      name: 'mcpUrl',
      message: 'MCP server URL (HTTP):',
      default: process.env.MCP_URL || 'http://localhost:8931/mcp',
      when: (a) => a.engine === 'mcp',
      validate: (v) => {
        try {
          const u = new URL(String(v).trim());
          if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Must be an http(s) URL';
          return true;
        } catch {
          return 'Invalid URL';
        }
      },
    },
    {
      type: 'number',
      name: 'maxPages',
      message: 'Maximum pages to analyze:',
      default: 25,
      validate: (n) => (Number.isFinite(n) && n >= 1 ? true : 'Enter a number >= 1'),
    },
    {
      type: 'confirm',
      name: 'screenshots',
      message: 'Take screenshots of each page?',
      default: true,
    },
  ]);

  return {
    startUrl: ensureUrl(answers.url),
    scope: answers.scope,
    targetUrls: answers.scope === 'provided' ? parseUrlList(answers.targetUrls) : null,
    engine: answers.engine,
    mcpUrl: answers.mcpUrl ? String(answers.mcpUrl).trim() : null,
    maxPages: answers.maxPages,
    screenshots: answers.screenshots,
  };
}

async function runCli() {
  console.log(banner());

  const opts = await promptOptions();

  const spinner = ora({ text: 'Preparing crawl…', spinner: 'dots' }).start();

  try {
    const result = await crawlSite({
      startUrl: opts.startUrl,
      scope: opts.scope,
      targetUrls: opts.targetUrls,
      engine: opts.engine,
      mcpUrl: opts.mcpUrl,
      maxPages: opts.maxPages,
      screenshots: opts.screenshots,
      onProgress: ({ phase, message }) => {
        spinner.text = `${phase}: ${message}`;
      },
    });

    spinner.succeed('Report generated');

    console.log('');
    console.log(chalk.green.bold('Output'));
    console.log(`- Report (Markdown): ${chalk.cyan(result.reportMarkdownPath)}`);
    console.log(`- Report (JSON):     ${chalk.cyan(result.reportJsonPath)}`);
    if (result.screenshotsDir) {
      console.log(`- Screenshots:       ${chalk.cyan(result.screenshotsDir)}`);
    }
    console.log('');
    console.log(chalk.dim('Tip: share the Markdown report directly with stakeholders.'));
  } catch (err) {
    spinner.fail('Failed');
    throw err;
  }
}

module.exports = { runCli };
