import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 5299;
let proc;
beforeAll(async () => {
  // Empty key + a missing .env path: proxy must report configured:false and refuse chat.
  proc = spawn(process.execPath, ['server/dmProxy.mjs'], { env: { ...process.env, XAI_API_KEY: '', DM_PROXY_PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise((ok) => proc.stdout.once('data', ok));
});
afterAll(() => proc?.kill());

describe('dm proxy without a key', () => {
  it('status reports not configured and never leaks a key', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/dm/status`, { headers: { Origin: 'http://localhost:5173' } });
    const j = await r.json();
    expect(j.configured).toBe(false);
    expect(Object.keys(j).sort()).toEqual(['configured', 'model']);
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
  it('chat returns 503', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/dm/chat`, { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }) });
    expect(r.status).toBe(503);
  });
  it('does not CORS-allow foreign origins', async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/dm/status`, { headers: { Origin: 'https://evil.example' } });
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});
