import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigurableAdapter, loadAdapterConfig } from '../llm/adapter.js';
import { decomposeTestCase, generateItemDraft, parseTestCase } from '../planner/extract.js';
import { listSkills, persistSkill } from '../skills/store.js';
import { executeToHere } from '../executor/session.js';
import { generateStandaloneScript } from '../script/generator.js';
import { exportReadiness } from '../domain/state.js';
import { remoteHealth, remoteLiveHealth } from '../executor/remote.js';
import { ensureWorkbenchDir } from '../persistence/files.js';
import { listKnowledgeSummaries, persistKnowledgeItem } from '../knowledge/store.js';
import { redactSecrets } from '../security/redact.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(__dirname, '../ui');
const adapter = new ConfigurableAdapter(loadAdapterConfig());

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
    const interactionLog = [];
    const requestAdapter = new ConfigurableAdapter({ ...loadAdapterConfig(), ...(body.adapterConfig || {}) }, { trace: interactionLog });
    return sendJson(res, 200, { ...(await requestAdapter.health()), interactionLog });
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
  const body = await readJson(req);
  if (req.method === 'POST' && url.pathname === '/api/parse') {
    const skills = await listSkills();
    const interactionLog = [];
    const requestAdapter = body.adapterConfig
      ? new ConfigurableAdapter({ ...loadAdapterConfig(), ...body.adapterConfig }, { trace: interactionLog })
      : new ConfigurableAdapter(loadAdapterConfig(), { trace: interactionLog });
    const parsed = await parseTestCase(body.text || '', { skills, adapter: requestAdapter });
    return sendJson(res, 200, { ...parsed, interactionLog, health: await adapter.health() });
  }
  if (req.method === 'POST' && url.pathname === '/api/decompose') {
    const interactionLog = [];
    const requestAdapter = body.adapterConfig
      ? new ConfigurableAdapter({ ...loadAdapterConfig(), ...body.adapterConfig }, { trace: interactionLog })
      : new ConfigurableAdapter(loadAdapterConfig(), { trace: interactionLog });
    const decomposed = await decomposeTestCase(body.text || '', { adapter: requestAdapter });
    return sendJson(res, 200, { ...decomposed, interactionLog });
  }
  if (req.method === 'POST' && url.pathname === '/api/generate-item') {
    const skills = await listSkills();
    const interactionLog = [];
    const requestAdapter = body.adapterConfig
      ? new ConfigurableAdapter({ ...loadAdapterConfig(), ...body.adapterConfig }, { trace: interactionLog })
      : new ConfigurableAdapter(loadAdapterConfig(), { trace: interactionLog });
    const item = await generateItemDraft(body.item || {}, { skills, adapter: requestAdapter });
    return sendJson(res, 200, { item, interactionLog });
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

async function serveStatic(req, res, url) {
  let requested = url.pathname === '/' ? '/index.html' : url.pathname;
  requested = requested.replace(/\.\.+/g, '');
  const filePath = path.join(uiDir, requested);
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, { 'content-type': contentType(filePath) });
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
