import { describe, expect, it } from 'vitest';
import { extractJson, parseIntent } from './intentParse';

describe('parseIntent', () => {
  it('parses a clean Intent JSON', () => {
    const raw = JSON.stringify({
      meaningful: true, kills: [{ mob: 'goblins', count: 3 }],
      skillUses: [{ skillId: 'bite', quality: 'proper', reframedFrom: null, target: null }],
      practice: false, storyWeight: 'none', storyReason: null, rest: false, loot: [], evolve: false,
      mutate: null, flags: [], friendlyTarget: null,
    });
    const i = parseIntent(raw)!;
    expect(i.kills).toEqual([{ mob: 'goblin', count: 3 }]);
    expect(i.skillUses).toEqual([{ skillId: 'bite', quality: 'proper' }]);
    expect(i.storyWeight).toBe('none');
    expect(i.mutate).toBeNull();
  });

  it('handles fenced JSON with chatter and normalizes fields', () => {
    const raw = 'Sure! ```json\n{"meaningful":true,"kills":[{"mob":"Wolves","count":"99"}],"skillUses":[{"skillId":"Mana Sense","quality":"weird"},{"skillId":"laser_eyes","quality":"proper"},{"skillId":"slash","quality":"proper","reframedFrom":"slash"}],"practice":true,"storyWeight":"game-changing","storyReason":"Betrayed the king","rest":true,"loot":["Wolf pelt"],"evolve":false,"mutate":{"kind":"Abyssal","forced":true},"flags":["Betrayed The King!"],"friendlyTarget":"king"}\n```';
    const i = parseIntent(raw)!;
    expect(i.kills).toEqual([{ mob: 'wolf', count: 50 }]); // clamped
    expect(i.skillUses.map((u) => u.skillId)).toEqual(['mana_sense', 'slash']); // unknown id dropped
    expect(i.skillUses[0].quality).toBe('normal');
    expect(i.skillUses[1].reframedFrom).toBeUndefined(); // self-reframe dropped
    expect(i.practice).toBe(false); // practice + kills is not practice
    expect(i.rest).toBe(false);
    expect(i.storyReason).toBe('Betrayed the king');
    expect(i.flags).toEqual(['betrayed-the-king']);
    expect(i.mutate).toEqual({ kind: 'Abyssal', forced: true });
  });

  it('keeps reframes to valid skills', () => {
    const i = parseIntent('{"meaningful":true,"skillUses":[{"skillId":"intimidate","quality":"proper","reframedFrom":"slash","target":"merchant"}]}')!;
    expect(i.skillUses[0]).toEqual({ skillId: 'intimidate', quality: 'proper', reframedFrom: 'slash', target: 'merchant' });
    expect(i.kills).toEqual([]);
  });

  it('rejects garbage so the caller can fall back to the stub', () => {
    expect(parseIntent('I attack the goblin!')).toBeNull();
    expect(parseIntent('{"foo": 1}')).toBeNull();
    expect(parseIntent('[1,2,3]')).toBeNull();
    expect(extractJson('prefix {"a": "}"} suffix')).toEqual({ a: '}' });
  });
});
