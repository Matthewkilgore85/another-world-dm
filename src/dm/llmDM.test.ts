import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDM } from './index';
import { LLMDM } from './llmDM';
import { describeSetup, systemPrompt } from './prompts';
import { spiderSlot } from './testUtil';

afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('getDM', () => {
  it('boots on the stub when the proxy is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))));
    expect((await getDM()).id).toBe('stub');
  });
  it('boots on the stub when the proxy has no key', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { configured: false, model: 'grok-4.3' })));
    expect((await getDM()).id).toBe('stub');
  });
  it('uses the LLM DM when configured', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { configured: true, model: 'grok-4.3' })));
    const dm = await getDM();
    expect(dm.id).toBe('llm');
    expect(dm.label).toContain('grok-4.3');
  });
});

describe('LLMDM', () => {
  it('interprets via model JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { content: '{"meaningful":true,"kills":[{"mob":"rat","count":2}],"skillUses":[{"skillId":"bite","quality":"proper"}],"practice":false,"storyWeight":"none","rest":false,"loot":[],"evolve":false,"mutate":null,"flags":[],"friendlyTarget":null}' })));
    const i = await new LLMDM().interpret(spiderSlot(), 'I ambush two rats from my web');
    expect(i.kills).toEqual([{ mob: 'rat', count: 2 }]);
  });

  it('falls back to the stub on API errors and reports it once', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(502, { error: 'xAI 401: bad key' })));
    const dm = new LLMDM();
    const slot = spiderSlot();
    const i = await dm.interpret(slot, 'I bite the slime');
    expect(i.kills[0]?.mob).toBe('slime'); // stub classifier result
    expect(dm.takeNotice()).toMatch(/bad key/);
    await dm.narrate(slot, 'x', i, { hits: [], misses: [], stupid: [], reframes: [], killed: [], combatFailed: false, damageTaken: 0, healed: 0, leveledTo: null, learned: [], evolvedTo: null, mutatedTo: null, evolveBlockedReason: null, questCompleted: null });
    expect(dm.takeNotice()).toBeNull(); // only once per outage
  });

  it('falls back to stub classifier on invalid JSON without a notice', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { content: 'I cannot do JSON today' })));
    const dm = new LLMDM();
    const i = await dm.interpret(spiderSlot(), 'I sneak quietly through the shadows');
    expect(i.skillUses.some((u) => u.skillId === 'stealth')).toBe(true);
    expect(dm.takeNotice()).toBeNull();
  });
});

describe('prompts', () => {
  it('carries the player premise, NSFW flag and Demon Lord rule', () => {
    const slot = spiderSlot();
    const sys = systemPrompt(slot);
    expect(sys).toContain('reincarnated as a tiny spider');
    expect(sys).toContain('Mature content is OFF');
    expect(sys).toMatch(/NOT the ending/);
    expect(systemPrompt(spiderSlot({ nsfw: true, ageConfirmed: true }))).toContain('Mature content is ON');
    expect(describeSetup({ ...slot.setup, pathMode: 'Free write' })).not.toContain('Role:');
  });
});
