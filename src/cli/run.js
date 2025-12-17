const inquirer = require('inquirer');
const chalk = require('chalk');
const oraPkg = require('ora');
const ora = oraPkg?.default || oraPkg;
const path = require('path');
const fs = require('fs');

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
    chalk.cyan.bold(' Playwrighty — Agentic Web Scraper with RAG Chat'),
    chalk.dim(' LangGraph + Gemini powered extraction and Q&A'),
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
      type: 'number',
      name: 'maxPages',
      message: 'Maximum pages to analyze:',
      default: 25,
      validate: (n) => (Number.isFinite(n) && n >= 1 ? true : 'Enter a number >= 1'),
    },
    {
      type: 'number',
      name: 'concurrency',
      message: 'Parallel pages (concurrency):',
      default: 3,
      validate: (n) => (Number.isFinite(n) && n >= 1 && n <= 10 ? true : 'Enter a number between 1 and 10'),
    },
    {
      type: 'confirm',
      name: 'screenshots',
      message: 'Take screenshots of each page?',
      default: true,
    },
    {
      type: 'confirm',
      name: 'headed',
      message: 'Run in headed mode? (visible browser for CAPTCHA/Cloudflare)',
      default: false,
    },
    {
      type: 'confirm',
      name: 'useAgent',
      message: 'Use LangGraph agent with Gemini? (requires GOOGLE_API_KEY)',
      default: false,
    },
  ]);

  return {
    startUrl: ensureUrl(answers.url),
    scope: answers.scope,
    targetUrls: answers.scope === 'provided' ? parseUrlList(answers.targetUrls) : null,
    maxPages: answers.maxPages,
    concurrency: answers.concurrency,
    screenshots: answers.screenshots,
    headed: answers.headed,
    useAgent: answers.useAgent,
  };
}

async function runCrawl(opts) {
  const spinner = ora({ text: 'Preparing crawl…', spinner: 'dots' }).start();

  try {
    let result;

    if (opts.useAgent) {
      const { runAgenticCrawl } = require('../agent/graph');
      result = await runAgenticCrawl({
        startUrl: opts.startUrl,
        scope: opts.scope,
        targetUrls: opts.targetUrls,
        maxPages: opts.maxPages,
        concurrency: opts.concurrency,
        screenshots: opts.screenshots,
        headed: opts.headed,
        useAgent: true,
        onProgress: ({ phase, message }) => {
          spinner.text = `${phase}: ${message}`;
        },
      });
    } else {
      result = await crawlSite({
        startUrl: opts.startUrl,
        scope: opts.scope,
        targetUrls: opts.targetUrls,
        maxPages: opts.maxPages,
        concurrency: opts.concurrency,
        screenshots: opts.screenshots,
        headed: opts.headed,
        onProgress: ({ phase, message }) => {
          spinner.text = `${phase}: ${message}`;
        },
      });
    }

    spinner.succeed('Report generated');

    console.log('');
    console.log(chalk.green.bold('Output'));
    console.log(`- Report (Markdown): ${chalk.cyan(result.reportMarkdownPath)}`);
    console.log(`- Report (JSON):     ${chalk.cyan(result.reportJsonPath)}`);
    if (result.screenshotsDir) {
      console.log(`- Screenshots:       ${chalk.cyan(result.screenshotsDir)}`);
    }
    if (result.llmAnalysis) {
      console.log('');
      console.log(chalk.yellow.bold('LLM Analysis:'));
      console.log(chalk.dim(result.llmAnalysis.slice(0, 500) + (result.llmAnalysis.length > 500 ? '...' : '')));
    }
    console.log('');
    console.log(chalk.dim('Tip: Run "npm run chat" to ask questions about the extracted content.'));

    return result;
  } catch (err) {
    spinner.fail('Failed');
    throw err;
  }
}

async function runChat() {
  console.log(banner());
  console.log(chalk.yellow('\n📚 RAG Chat Mode - Ask questions about scraped content\n'));

  const outputsDir = path.resolve(process.cwd(), 'outputs');
  if (!fs.existsSync(outputsDir)) {
    console.log(chalk.red('No outputs directory found. Run a crawl first with "npm start".'));
    return;
  }

  const runs = fs.readdirSync(outputsDir)
    .filter(d => !d.startsWith('.') && fs.existsSync(path.join(outputsDir, d, 'report.json')))
    .sort()
    .reverse();

  if (!runs.length) {
    console.log(chalk.red('No crawl reports found. Run a crawl first with "npm start".'));
    return;
  }

  const { selectedRun } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedRun',
      message: 'Select a crawl run to chat about:',
      choices: runs.slice(0, 10).map(r => ({ name: r, value: r })),
    },
  ]);

  const reportPath = path.join(outputsDir, selectedRun, 'report.json');
  
  const spinner = ora({ text: 'Loading content and creating embeddings...', spinner: 'dots' }).start();

  try {
    const { createRAGChat } = require('../rag/chat');
    const chat = await createRAGChat({ reportJsonPath: reportPath });
    spinner.succeed('Ready to chat!');

    const stats = chat.getStats();
    console.log(chalk.dim(`\nIndexed ${stats.pagesIndexed} pages (${stats.chunksIndexed} chunks) from ${stats.origin}`));
    console.log(chalk.dim('Type "exit" or "quit" to end the chat.\n'));

    while (true) {
      const { question } = await inquirer.prompt([
        {
          type: 'input',
          name: 'question',
          message: chalk.cyan('You:'),
        },
      ]);

      if (!question.trim() || ['exit', 'quit', 'q'].includes(question.trim().toLowerCase())) {
        console.log(chalk.dim('\nGoodbye!'));
        break;
      }

      const thinkingSpinner = ora({ text: 'Thinking...', spinner: 'dots' }).start();
      
      try {
        const response = await chat.chat(question);
        thinkingSpinner.stop();

        console.log(chalk.green('\nAssistant:'), response.answer);
        
        if (response.sources?.length) {
          console.log(chalk.dim('\nSources:'));
          response.sources.slice(0, 3).forEach(s => {
            console.log(chalk.dim(`  - ${s.title || s.url}`));
          });
        }
        console.log('');
      } catch (err) {
        thinkingSpinner.fail('Error');
        console.log(chalk.red(`Error: ${err.message}`));
      }
    }
  } catch (err) {
    spinner.fail('Failed to initialize chat');
    console.log(chalk.red(`Error: ${err.message}`));
    if (err.message.includes('API_KEY')) {
      console.log(chalk.yellow('\nSet GOOGLE_API_KEY environment variable to use chat mode.'));
      console.log(chalk.dim('Get one at: https://makersuite.google.com/app/apikey'));
    }
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  
  if (args.includes('chat')) {
    return runChat();
  }

  console.log(banner());
  const opts = await promptOptions();
  return runCrawl(opts);
}

module.exports = { runCli, runCrawl, runChat };
