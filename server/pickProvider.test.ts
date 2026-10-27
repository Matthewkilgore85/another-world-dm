import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error untyped .mjs
import { pickProvider } from './dmProxy.mjs';

const set = (e: Record<string, string>) => {
  for (const k of ['DM_PROVIDER', 'XAI_API_KEY', 'GROQ_API_KEY']) vi.stubEnv(k, e[k] ?? '');
};
afterEach(() => vi.unstubAllEnvs());

describe('pickProvider (P0: no silent paid xAI)', () => {
  it('none', () => { set({}); expect(pickProvider()).toBeNull(); });
  it('xai only', () => { set({ XAI_API_KEY: 'x' }); expect(pickProvider()).toBe('xai'); });
  it('groq only', () => { set({ GROQ_API_KEY: 'g' }); expect(pickProvider()).toBe('groq'); });
  it('both keys, no DM_PROVIDER -> groq', () => { set({ XAI_API_KEY: 'x', GROQ_API_KEY: 'g' }); expect(pickProvider()).toBe('groq'); });
  it('explicit DM_PROVIDER wins', () => { set({ XAI_API_KEY: 'x', GROQ_API_KEY: 'g', DM_PROVIDER: 'xai' }); expect(pickProvider()).toBe('xai'); });
});
