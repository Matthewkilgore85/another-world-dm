import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSlot, resolveIntent, unlockBranch } from './engine';
import { defaultSetup } from './setup';
import type { Intent } from '../dm/provider';

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

describe('unlockBranch (engine-authoritative prerequisites)', () => {
  it('rejects unknown skills and root skills even with plenty of points', () => {
    const slot = createSlot(defaultSetup(), null);
    slot.character.skillPoints = 10;
    expect(unlockBranch(slot, 'nope')).toEqual([]);
    expect(unlockBranch(slot, 'slash')).toEqual([]);
    expect(unlockBranch(slot, 'fireball')).toEqual([]);
    expect(slot.character.skillPoints).toBe(10);
  });

  it('requires an owned parent at its minimum rank', () => {
    const slot = createSlot(defaultSetup(), null);
    slot.character.skillPoints = 10;
    expect(unlockBranch(slot, 'venom_bite')).toEqual([]); // Hero has no Bite.
    expect(unlockBranch(slot, 'slash_plus')).toEqual([]); // Slash starts at rank 1.
    expect(unlockBranch(slot, 'double_slash')).toEqual([]); // Slash+ is missing.
    expect(slot.character.skillPoints).toBe(10);
    slot.character.skills.find((s) => s.id === 'slash')!.rank = 2;
    const events = unlockBranch(slot, 'slash_plus');
    expect(events.some((e) => e.type === 'skillLearn' && e.skillId === 'slash_plus')).toBe(true);
    expect(slot.character.skillPoints).toBe(9);
    expect(slot.character.skills.filter((s) => s.id === 'slash_plus')).toHaveLength(1);
  });

  it('enforces child prerequisite ranks and the correct cost', () => {
    const slot = createSlot(defaultSetup(), null);
    slot.character.skillPoints = 10;
    slot.character.skills.find((s) => s.id === 'slash')!.rank = 2;
    unlockBranch(slot, 'slash_plus');
    expect(unlockBranch(slot, 'double_slash')).toEqual([]); // Slash+ needs rank 2.
    expect(unlockBranch(slot, 'blazing_slash')).toEqual([]); // Slash+ needs rank 3.
    slot.character.skills.find((s) => s.id === 'slash_plus')!.rank = 3;
    expect(unlockBranch(slot, 'blazing_slash')).not.toEqual([]);
    expect(slot.character.skillPoints).toBe(7); // 1 + 2 points spent.
    expect(unlockBranch(slot, 'blazing_slash')).toEqual([]); // No double purchase.
    expect(slot.character.skillPoints).toBe(7);
  });

  it('rejects branches sealed by the current form even when rank is sufficient', () => {
    const slot = createSlot(defaultSetup(), null);
    slot.character.skillPoints = 10;
    slot.character.skills.find((s) => s.id === 'slash')!.rank = 2;
    slot.character.form.skillTierCap = 0;
    expect(unlockBranch(slot, 'slash_plus')).toEqual([]);
    slot.character.form.skillTierCap = 1;
    expect(unlockBranch(slot, 'slash_plus')).not.toEqual([]);
    slot.character.skills.find((s) => s.id === 'slash_plus')!.rank = 2;
    expect(unlockBranch(slot, 'double_slash')).toEqual([]); // Tier 2 remains sealed.
    expect(slot.character.skillPoints).toBe(9);
  });

  it('never deducts points when a valid branch costs more than available', () => {
    const slot = createSlot(defaultSetup(), null);
    slot.character.skillPoints = 2;
    slot.character.skills.find((s) => s.id === 'slash')!.rank = 2;
    expect(unlockBranch(slot, 'slash_plus')).not.toEqual([]);
    slot.character.skills.find((s) => s.id === 'slash_plus')!.rank = 3;
    expect(unlockBranch(slot, 'blazing_slash')).toEqual([]); // Costs 2, only 1 left.
    expect(slot.character.skillPoints).toBe(1);
  });
});
