import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSlot, resolveIntent, unlockBranch } from './engine';
import { defaultSetup } from './setup';
import type { Intent } from './types';

const intent = (over: Partial<Intent>): Intent => ({
  meaningful: true, kills: [], skillUses: [], practice: false, storyWeight: 'none', rest: false, loot: [],
  evolve: false, mutate: null, flags: [], friendlyTarget: null, ...over,
} as Intent);

describe('damage clamp (P0)', () => {
  afterEach(() => vi.restoreAllMocks());
  it('reports actual HP lost when clamped at the floor', () => {
    const slot = createSlot({ ...defaultSetup(), difficulty: 'Easy' }, null);
    slot.character.hp = 2;
    const { events, res } = resolveIntent(slot, intent({ kills: [{ mob: 'dragon', count: 5 }] }));
    expect(slot.character.hp).toBe(1);
    expect(res.damageTaken).toBe(1);
    const hp = events.filter((e) => e.type === 'hp');
    expect(hp.reduce((a, e) => a + (e as { delta: number }).delta, 0)).toBe(-1);
  });
  it('emits no hp event at the floor', () => {
    const slot = createSlot({ ...defaultSetup(), difficulty: 'Easy' }, null);
    slot.character.hp = 1;
    const { events, res } = resolveIntent(slot, intent({ kills: [{ mob: 'dragon', count: 5 }] }));
    expect(res.damageTaken).toBe(0);
    expect(events.some((e) => e.type === 'hp')).toBe(false);
  });
});

describe('free-write mechanics (P0)', () => {
  it('does not inherit Hero/bus defaults in free-write-only mode', () => {
    const slot = createSlot({ ...defaultSetup(), pathMode: 'Free write', freeWrite: 'I am reincarnated as a spider' }, null);
    const c = slot.character;
    expect(c.inventory.map((i) => i.name)).not.toContain('Iron sword');
    expect(c.inventory.map((i) => i.name)).not.toContain('Bus pass');
    expect(c.job?.name).not.toBe('Squire');
    expect(c.form.name).not.toBe('Otherworlder');
    expect(slot.setup.freeWrite).toContain('spider');
  });
  it('keeps toggle-mode Hero behavior', () => {
    const slot = createSlot(defaultSetup(), null);
    expect(slot.character.inventory.map((i) => i.name)).toContain('Iron sword');
  });
});

describe('unlockBranch (current behavior, P1 documented)', () => {
  it('rejects unknown ids and insufficient points', () => {
    const slot = createSlot(defaultSetup(), null);
    expect(unlockBranch(slot, 'nope')).toEqual([]);
    slot.character.skillPoints = 0;
    expect(unlockBranch(slot, 'slash')).toEqual([]);
  });
});
