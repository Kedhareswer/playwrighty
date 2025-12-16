const path = require('path');
const fs = require('fs');
const Sitemapper = require('sitemapper');

const { safeFilename } = require('../report/util');

function asString(v) {
  if (v == null) return '';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function extractToolText(result) {
  const parts = [];
  for (const item of result?.content || []) {
    if (item?.type === 'text') parts.push(item.text);
  }
  return parts.join('\n');
}

function extractToolJson(result) {
  for (const item of result?.content || []) {
    if (!item) continue;
    if (item.type === 'json' && item.json != null) return item.json;
    if (item.type === 'text' && typeof item.text === 'string') {
      const t = item.text.trim();
      if (!t) continue;
      try {
        const parsed = JSON.parse(t);
        if (typeof parsed === 'string') {
          const inner = parsed.trim();
          if ((inner.startsWith('{') && inner.endsWith('}')) || (inner.startsWith('[') && inner.endsWith(']'))) {
            try {
              return JSON.parse(inner);
            } catch {
              return parsed;
            }
          }
        }
        return parsed;
      } catch {
        // If evaluation returned a primitive string (like document.title), it may not be JSON.
        return { value: t };
      }
    }
  }
  return null;
}

async function connectClient(mcpUrl) {
  const sdk = await import('@modelcontextprotocol/sdk/client/index.js');
  const types = await import('@modelcontextprotocol/sdk/types.js');
  const httpTransportMod = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const sseTransportMod = await import('@modelcontextprotocol/sdk/client/sse.js');

  const { Client } = sdk;
  const { StreamableHTTPClientTransport } = httpTransportMod;
  const { SSEClientTransport } = sseTransportMod;

  const baseUrl = new URL(mcpUrl);

  const tryStreamable = async () => {
    const client = new Client({ name: 'playwrighty', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(baseUrl);
    await client.connect(transport);
    return { client, transport, types };
  };

  try {
    return await tryStreamable();
  } catch (err) {
    // Backwards-compat: if server only supports legacy SSE.
    const client = new Client({ name: 'playwrighty', version: '0.1.0' });
    const transport = new SSEClientTransport(baseUrl);
    await client.connect(transport);
    return { client, transport, types };
  }
}

async function createMcpBackend({ mcpUrl }) {
  if (!mcpUrl) {
    throw new Error('Missing MCP server URL. Provide MCP_URL env var or enter it in the CLI prompt.');
  }

  const { client, transport, types } = await connectClient(mcpUrl);

  const callTool = async (name, args) => {
    const req = {
      method: 'tools/call',
      params: {
        name,
        arguments: args || {},
      },
    };
    const res = await client.request(req, types.CallToolResultSchema);
    if (process.env.PLAYWRIGHTY_DEBUG_MCP === '1') {
      // Intentionally verbose only when explicitly enabled.
      console.log(`[MCP] tools/call ${name} ->`, JSON.stringify(res, null, 2));
    }

    if (res?.isError) {
      const msg = extractToolText(res) || `MCP tool call failed: ${name}`;
      throw new Error(msg);
    }
    return res;
  };

  const listTools = async () => {
    const req = { method: 'tools/list', params: {} };
    return await client.request(req, types.ListToolsResultSchema);
  };

  // Early sanity check: helpful error if you connected to the wrong MCP server.
  const tools = await listTools();
  const toolNames = new Set((tools?.tools || []).map((t) => t.name));
  const required = ['browser_navigate', 'browser_evaluate'];
  const missing = required.filter((t) => !toolNames.has(t));
  if (missing.length) {
    throw new Error(
      `Connected to MCP server (${mcpUrl}) but required tools are missing: ${missing.join(
        ', '
      )}. Available tools: ${(tools?.tools || []).map((t) => t.name).slice(0, 20).join(', ')}`
    );
  }

  return {
    async fetchSitemapUrls(sitemapUrl) {
      const sm = new Sitemapper({ url: sitemapUrl, timeout: 15000 });
      const res = await sm.fetch();
      return res?.sites || [];
    },

    async visitAndExtract({ url, takeScreenshot, screenshotsDir }) {
      await callTool('browser_navigate', { url });

      const evalResult = await callTool('browser_evaluate', {
        function: `() => {
          const getMeta = (name) => document.querySelector('meta[name="' + name + '"]')?.getAttribute('content') || '';
          const title = document.title || '';
          const metaDescription = getMeta('description');
          const h1 = Array.from(document.querySelectorAll('h1')).map(n => (n.textContent || '').trim()).filter(Boolean).slice(0, 5);
          const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')).filter(Boolean);
          const images = Array.from(document.querySelectorAll('img[src]')).map(img => img.getAttribute('src')).filter(Boolean).slice(0, 50);
          const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
          return JSON.stringify({ title, metaDescription, h1, links, images, fullText: bodyText, locationHref: location.href });
        }`,
      });

      const extracted = extractToolJson(evalResult);

      const finalUrl = extracted?.locationHref || url;

      const resolvedLinks = (extracted?.links || [])
        .map((href) => {
          try {
            return new URL(href, finalUrl).toString();
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter((u) => u.startsWith('http://') || u.startsWith('https://'));

      const resolvedImages = (extracted?.images || [])
        .map((src) => {
          try {
            return new URL(src, finalUrl).toString();
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      let screenshotPath = null;
      if (takeScreenshot && screenshotsDir) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
        const u = new URL(finalUrl);
        const key = `${u.hostname}${u.pathname || '/'}${u.search || ''}`;
        const file = `${safeFilename(key || 'root')}.png`;
        screenshotPath = path.join(screenshotsDir, file);

        // Playwright MCP usually saves the file server-side when given filename.
        // We still pass our desired filename to keep things deterministic.
        const shotResult = await callTool('browser_take_screenshot', {
          filename: file,
          fullPage: true,
          type: 'png',
        });

        // If the server returns inline image data, persist it locally.
        const imageItem = (shotResult?.content || []).find((c) => c?.type === 'image');
        if (imageItem?.data) {
          const buf = Buffer.from(imageItem.data, 'base64');
          fs.writeFileSync(screenshotPath, buf);
        }
      }

      return {
        status: null,
        finalUrl,
        title: asString(extracted?.title),
        metaDescription: asString(extracted?.metaDescription),
        h1: Array.isArray(extracted?.h1) ? extracted.h1 : [],
        fullText: asString(extracted?.fullText),
        links: resolvedLinks,
        images: resolvedImages,
        screenshotPath,
      };
    },

    async close() {
      await transport.close();
    },
  };
}

module.exports = { createMcpBackend };
