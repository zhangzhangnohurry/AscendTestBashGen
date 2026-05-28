import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigurableAdapter, DEFAULT_ADAPTER_TIMEOUT_MS, loadAdapterConfig } from '../llm/adapter.js';
import { decomposeTestCase, generateItemDraft, parseTestCase, splitTestCaseStructure } from '../planner/extract.js';
import { listSkills, persistSkill } from '../skills/store.js';
import { executeToHere } from '../executor/session.js';
import { generateStandaloneScript } from '../script/generator.js';
import { exportReadiness } from '../domain/state.js';
import { remoteHealth, remoteLiveHealth } from '../executor/remote.js';
import { appendJsonLine, ensureWorkbenchDir, getWorkbenchDir } from '../persistence/files.js';
import { listKnowledgeSummaries, persistKnowledgeItem } from '../knowledge/store.js';
import { redactSecrets } from '../security/redact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(__dirname, '../ui');
const adapter = new ConfigurableAdapter(loadAdapterConfig());
const recentInteractions = [];

/**
 * Creates the HTTP server used by the local workbench UI. API routes stay in
 * this file so product capabilities remain easy to audit from one entry point.
 */
export async function createServer() {
  await ensureWorkbenchDir();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) return await routeApi(req, res, url);
      return await serveStatic(req, res, url);
    } catch (error) {
      sendJson(res, 500, { error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined });
    }
  });
}

/** Routes product API calls; each branch returns a fully redacted JSON payload. */
async function routeApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, { llm: await adapter.health(), remote: remoteHealth({}) });
  }
  if (req.method === 'POST' && url.pathname === '/api/adapter/health') {
    const body = await readJson(req);
    return withInteractionLog(res, body, url.pathname, async ({ requestAdapter, interactionLog }) => ({ ...(await requestAdapter.health()), interactionLog }));
  }
  if (req.method === 'POST' && url.pathname === '/api/remote/health') {
    const body = await readJson(req);
    const result = body.live ? await remoteLiveHealth(body.config || {}) : remoteHealth(body.config || {});
    return sendJson(res, 200, result);
  }
  if (req.method === 'GET' && url.pathname === '/api/skills') {
    return sendJson(res, 200, { skills: await listSkills() });
  }
  if (req.method === 'GET' && url.pathname === '/api/knowledge') {
    return sendJson(res, 200, { items: await listKnowledgeSummaries() });
  }
  if (req.method === 'GET' && url.pathname === '/api/interactions/recent') {
    const traceId = url.searchParams.get('traceId');
    const interactions = traceId ? recentInteractions.filter((entry) => entry.traceId === traceId) : recentInteractions;
    return sendJson(res, 200, { interactions: interactions.slice(-30) });
  }
  const body = await readJson(req);
  if (req.method === 'POST' && url.pathname === '/api/parse') {
    return withInteractionLog(res, body, url.pathname, async ({ requestAdapter, interactionLog }) => {
      const skills = await listSkills();
      const parsed = await parseTestCase(body.text || '', { skills, adapter: requestAdapter, config: body.config || {} });
      return { ...parsed, interactionLog, health: await adapter.health() };
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/structure/split') {
    return sendJson(res, 200, splitTestCaseStructure(body.text || ''));
  }
  if (req.method === 'POST' && url.pathname === '/api/decompose') {
    return withInteractionLog(res, body, url.pathname, async ({ requestAdapter, interactionLog }) => {
      const decomposed = await decomposeTestCase(body.text || '', { adapter: requestAdapter, items: body.items || undefined });
      return { ...decomposed, interactionLog };
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/generate-item') {
    return withInteractionLog(res, body, url.pathname, async ({ requestAdapter, interactionLog }) => {
      const skills = await listSkills();
      const item = await generateItemDraft(body.item || {}, { skills, adapter: requestAdapter, config: body.config || {} });
      return { item, interactionLog };
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/execute') {
    const result = await executeToHere(body.items || [], Number(body.selectedIndex), body.config || {});
    return sendJson(res, result.status === 'blocked' ? 422 : 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/export/check') {
    return sendJson(res, 200, exportReadiness(body.items || [], body.config || {}));
  }
  if (req.method === 'POST' && url.pathname === '/api/export') {
    const result = generateStandaloneScript(body.items || [], body.config || {});
    if (!result.ok) return sendJson(res, 422, result);
    res.writeHead(200, {
      'content-type': 'text/x-shellscript; charset=utf-8',
      'content-disposition': `attachment; filename="${result.filename}"`
    });
    return res.end(result.script);
  }
  if (req.method === 'POST' && url.pathname === '/api/skills') {
    return sendJson(res, 200, await persistSkill(body));
  }
  if (req.method === 'POST' && url.pathname === '/api/knowledge') {
    return sendJson(res, 200, await persistKnowledgeItem(body));
  }
  return sendJson(res, 404, { error: 'Not found' });
}

/**
 * Runs an adapter-backed route and returns the redacted interaction trace even
 * when the model/CLI call fails. Without this wrapper the UI only saw a generic
 * fetch error and the right-side LLM log stayed empty on the most important
 * debugging path: failed model calls.
 */
async function withInteractionLog(res, body, routeName, handler) {
  const interactionLog = [];
  const startedAt = Date.now();
  const traceId = body.traceId || `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const adapterConfig = normalizeRequestAdapterConfig(body.adapterConfig);
  const requestAdapter = body.adapterConfig
    ? new ConfigurableAdapter(adapterConfig, {
      trace: interactionLog,
      onTraceUpdate: (entry) => rememberInteractions(routeName, [entry], traceId)
    })
    : new ConfigurableAdapter(adapterConfig, {
      trace: interactionLog,
      onTraceUpdate: (entry) => rememberInteractions(routeName, [entry], traceId)
    });
  try {
    console.log('[workbench] adapter route started', redactSecrets({ route: routeName, provider: requestAdapter.config.provider || 'disabled' }));
    const payload = await handler({ requestAdapter, interactionLog });
    console.log('[workbench] adapter route completed', redactSecrets({
      route: routeName,
      durationMs: Date.now() - startedAt,
      interactionCount: interactionLog.length,
      tasks: interactionLog.map((entry) => entry.task)
    }));
    rememberInteractions(routeName, interactionLog, traceId);
    return sendJson(res, 200, payload);
  } catch (error) {
    console.error('[workbench] adapter route failed', redactSecrets({
      route: routeName,
      durationMs: Date.now() - startedAt,
      error: error.message,
      interactionCount: interactionLog.length,
      tasks: interactionLog.map((entry) => entry.task)
    }));
    rememberInteractions(routeName, interactionLog, traceId);
    return sendJson(res, 502, { error: error.message, interactionLog });
  }
}

function normalizeRequestAdapterConfig(config = undefined) {
  return {
    ...loadAdapterConfig(),
    ...(config || {}),
    timeoutMs: DEFAULT_ADAPTER_TIMEOUT_MS
  };
}

/**
 * Keeps a short server-side copy of LLM interactions so the UI can recover the
 * trace even when the primary request fails before the browser renders the
 * response. Entries are redacted before memory/disk persistence.
 */
function rememberInteractions(routeName, interactionLog = [], traceId = undefined) {
  if (!Array.isArray(interactionLog) || !interactionLog.length) return;
  const entries = redactSecrets(interactionLog.map((entry) => ({ ...entry, route: routeName, traceId })));
  for (const entry of entries) upsertRecentInteraction(entry);
  while (recentInteractions.length > 100) recentInteractions.shift();
  for (const entry of entries.filter((item) => item.status !== 'pending')) {
    appendJsonLine(path.join(getWorkbenchDir(), 'llm-interactions.jsonl'), entry)
      .catch((error) => console.error('[workbench] failed to persist interaction log', redactSecrets({ error: error.message })));
  }
}

function upsertRecentInteraction(entry) {
  const index = recentInteractions.findIndex((item) => item.id && item.id === entry.id);
  if (index >= 0) recentInteractions[index] = { ...recentInteractions[index], ...entry };
  else recentInteractions.push(entry);
}

async function serveStatic(req, res, url) {
  let requested = url.pathname === '/' ? '/index.html' : url.pathname;
  requested = requested.replace(/\.\.+/g, '');
  const filePath = path.join(uiDir, requested);
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'content-type': contentType(filePath), 'cache-control': 'no-store' });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    } else {
      throw error;
    }
  }
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(redactSecrets(value), null, 2));
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  return 'application/octet-stream';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 3001);
  const server = await createServer();
  server.listen(port, () => {
    console.log(`Command Workbench listening on http://localhost:${port}`);
  });
}
