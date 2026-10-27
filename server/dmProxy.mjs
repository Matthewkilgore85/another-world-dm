// Tiny local proxy between the browser DM and an OpenAI-compatible LLM (xAI or Groq Cloud). The API key lives ONLY here (process.env / .env),
// never in the Vite bundle. Zero dependencies: node:http + global fetch (Node 20+).
//
//   GET  /api/dm/status -> { configured, provider, model }      (never reveals the key)
//   POST /api/dm/chat   -> { content } | { error }    body: { messages, json?, temperature?, max_tokens? }
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader (KEY=value, # comments, optional quotes). Real env vars win. */
export function loadDotEnv(file = resolve(ROOT, '.env')) {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

const PORT = Number(process.env.DM_PROXY_PORT || 5174);
const MAX_BODY = 256 * 1024;

const env = (k) => (process.env[k] || '').trim();
const PROVIDERS = {
  xai: {
    name: 'xAI',
    keyVar: 'XAI_API_KEY',
    url: () => env('XAI_BASE_URL') || 'https://api.x.ai/v1/chat/completions',
    model: () => env('XAI_MODEL') || 'grok-4.3',
    // grok-4.3 supports reasoning_effort none|low|medium|high. Set XAI_REASONING_EFFORT= (empty) to omit.
    effort: () => process.env.XAI_REASONING_EFFORT ?? 'none',
    timeout: () => Number(process.env.XAI_TIMEOUT_MS || 45000),
  },
  groq: {
    name: 'Groq',
    keyVar: 'GROQ_API_KEY',
    url: () => (env('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1').replace(/\/+$/, '') + '/chat/completions',
    model: () => env('GROQ_MODEL') || 'llama-3.1-8b-instant',
    effort: () => '',
    timeout: () => Number(process.env.GROQ_TIMEOUT_MS || 45000),
  },
};

/**
 * DM_PROVIDER=xai|groq wins. Otherwise prefer the free-tier Groq backend whenever GROQ_API_KEY is set
 * (even if XAI_API_KEY is also set) so paid xAI is never chosen silently; xai only if it is the sole key.
 * There is no automatic fallback between providers: if the chosen one fails, the request fails.
 */
let warnedAmbiguous = false;
export function pickProvider() {
  const explicit = env('DM_PROVIDER').toLowerCase();
  if (PROVIDERS[explicit]) return explicit;
  if (env('GROQ_API_KEY')) {
    if (env('XAI_API_KEY') && !warnedAmbiguous) {
      warnedAmbiguous = true;
      console.warn('[dm-proxy] Both GROQ_API_KEY and XAI_API_KEY set without DM_PROVIDER; using groq (free tier). Set DM_PROVIDER=xai to use paid xAI.');
    }
    return 'groq';
  }
  if (env('XAI_API_KEY')) return 'xai';
  return null;
}
const prov = () => PROVIDERS[pickProvider()] || null;
const key = () => { const p = prov(); return p ? env(p.keyVar) : ''; };

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { fail(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

function cleanMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 40) return null;
  const out = [];
  for (const m of messages) {
    if (!m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return null;
    out.push({ role: m.role, content: m.content.slice(0, 40000) });
  }
  return out;
}

async function callUpstream(p, payload) {
  const r = await fetch(p.url(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key()}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(p.timeout()),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON error page */ }
  return { ok: r.ok, status: r.status, data, text };
}

async function chat(body) {
  const p = prov();
  const MODEL = p.model();
  const EFFORT = p.effort();
  const messages = cleanMessages(body.messages);
  if (!messages) return [400, { error: 'messages must be [{role, content}] (1–40 items)' }];
  const payload = {
    model: MODEL,
    messages,
    temperature: typeof body.temperature === 'number' ? Math.min(1.5, Math.max(0, body.temperature)) : 0.8,
    max_tokens: Math.min(2000, Math.max(16, Number(body.max_tokens) || 700)),
  };
  if (EFFORT) payload.reasoning_effort = EFFORT;
  // body.json: true -> json_object; an object -> json_schema { name, schema }.
  if (body.json && typeof body.json === 'object') {
    payload.response_format = { type: 'json_schema', json_schema: { name: body.json.name || 'out', schema: body.json.schema, strict: false } };
  } else if (body.json) {
    payload.response_format = { type: 'json_object' };
  }

  let r = await callUpstream(p, payload);
  // Some model/param combos reject response_format or reasoning_effort: retry once without them.
  if (!r.ok && r.status === 400 && (payload.response_format || payload.reasoning_effort)) {
    delete payload.response_format;
    delete payload.reasoning_effort;
    r = await callUpstream(p, payload);
  }
  if (!r.ok) {
    const msg = r.data?.error?.message || r.data?.error || r.data?.message || r.text.slice(0, 200) || `HTTP ${r.status}`;
    return [502, { error: `${p.name} ${r.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`.slice(0, 300) }];
  }
  const content = r.data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) return [502, { error: `${p.name} returned no content` }];
  return [200, { content, model: r.data?.model || MODEL }];
}

export const server = createServer(async (req, res) => {
  cors(req, res);
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method === 'GET' && url.pathname === '/api/dm/status') {
      const id = pickProvider();
      const ok = !!id && key().length > 0;
      return send(res, 200, { configured: ok, provider: ok ? id : null, model: ok ? PROVIDERS[id].model() : null });
    }
    if (req.method === 'POST' && url.pathname === '/api/dm/chat') {
      if (!key()) return send(res, 503, { error: `${prov()?.keyVar || 'XAI_API_KEY or GROQ_API_KEY'} not set on the proxy` });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'Invalid JSON body' }); }
      const [status, out] = await chat(body);
      return send(res, status, out);
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    const msg = e?.name === 'TimeoutError' ? `${prov()?.name || 'LLM'} request timed out` : String(e?.message || e);
    send(res, 502, { error: msg.slice(0, 300) });
  }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[dm-proxy] http://127.0.0.1:${PORT}  provider=${pickProvider() ?? 'none'}  model=${prov()?.model() ?? '-'}  key=${key() ? 'configured' : 'MISSING (stub DM will be used)'}`);
  });
}
