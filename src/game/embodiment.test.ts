import { describe, expect, it } from 'vitest';
import { actionConflictsWithBody, derivePropertiesFromSetup } from './embodiment';
import { createSlot } from './engine';
import { defaultSetup } from './setup';
import { contextBlock, openingPrompt, systemPrompt } from '../dm/prompts';

const fw = (freeWrite: string) => ({ ...defaultSetup(), pathMode: 'Free write' as const, freeWrite });

describe('derivePropertiesFromSetup', () => {
  const objects: [string, string][] = [
    ['I wake up as a sentient sword in a stone', 'weapon'],
    ['Reincarnated as a living book in a library', 'book'],
    ['I am a magical ring on a dead king\'s finger', 'jewelry'],
    ['I become a dungeon core deep underground', 'dungeon core'],
    ['An enchanted statue in a temple courtyard', 'statue'],
    ['A sentient sex toy for women, adult, inanimate, no limbs, cannot move, no ordinary speech', 'toy'],
    ['an ordinary coffee mug that gained consciousness', 'object'],
  ];
  for (const [text, type] of objects) {
    it(`object premise: ${type}`, () => {
      const p = derivePropertiesFromSetup(fw(text));
      expect(p.objectType).toBe(type);
      expect(p.hasLimbs).toBe(false);
      expect(p.mobility).toBe('none');
      expect(p.canIndependentMove).toBe(false);
      expect(p.canOrdinarySpeech).toBe(false);
      expect(p.senses).not.toContain('smell');
      expect(p.derivedFromPremise).toBe(true);
    });
  }
  it('normal Hero is a humanoid', () => {
    const p = derivePropertiesFromSetup(defaultSetup());
    expect(p).toMatchObject({ bodyKind: 'humanoid', hasLimbs: true, mobility: 'full', canOrdinarySpeech: true, canIndependentMove: true });
  });
  it('book communicates by writing', () => {
    expect(derivePropertiesFromSetup(fw('a cursed grimoire')).communication).toContain('writing');
  });
});

describe('createSlot with object premise', () => {
  const slot = createSlot(fw('A sentient inanimate object with no limbs, no independent movement, and no ordinary speech'), null);
  it('locks the body', () => {
    expect(slot.character.properties).toMatchObject({ hasLimbs: false, mobility: 'none', canOrdinarySpeech: false, canIndependentMove: false });
  });
  it('has body-fitting starters', () => {
    const ids = slot.character.skills.map((s) => s.id);
    expect(ids).not.toContain('dodge');
    expect(ids).not.toContain('slash');
    const inv = slot.character.inventory.map((i) => i.name);
    expect(inv).not.toContain('Iron sword');
    expect(inv).not.toContain('Swaddling cloth');
    expect(inv).not.toContain('Healing herb');
  });
  it('sword body IS the weapon', () => {
    const s = createSlot(fw('a sentient sword'), null);
    expect(s.character.inventory.map((i) => i.name)).not.toContain('Iron sword');
    expect(s.character.skills.map((k) => k.id)).toContain('slash');
  });
  it('prompts include the EMBODIMENT block', () => {
    for (const t of [systemPrompt(slot), contextBlock(slot), openingPrompt(slot)]) {
      expect(t).toContain('=== EMBODIMENT (ENGINE CANON) ===');
      expect(t).toContain('Has limbs: NO');
      expect(t).toContain('Independent movement: NO');
      expect(t).toContain('Mobility: none');
      expect(t).toContain('Ordinary speech: NO');
    }
  });
  it('flags impossible locomotion', () => {
    expect(actionConflictsWithBody(slot.character.properties, 'I walk to the door')).toMatch(/can't move/);
    expect(actionConflictsWithBody(slot.character.properties, 'I sense the magic around me')).toBeNull();
  });
});

describe('StubDM respects embodiment', () => {
  it.each(['I am reincarnated as a sentient sex toy', 'I wake up as a sentient sword in a stone'])('opening for %s is not humanoid', async (premise) => {
    const { StubDM } = await import('../dm/stubDM');
    const dm = new StubDM();
    const slot = createSlot(fw(premise), null);
    const open = await dm.openingScene(slot);
    expect(open.narrative).not.toMatch(/young (man|woman)|open (your )?eyes|Far to the north/i);
    expect(open.narrative).toMatch(/toy|sword|weapon|no limbs|telepath|move on your own/i);
    expect(open.narrative).toMatch(/What do you do\?/);
    expect(dm.suggest(slot).join(' ')).not.toMatch(/Sneak|Slash/);
  });
});

describe('StubDM narrate for limbless object bodies', () => {
  const empty = { hits: [], misses: [], stupid: [], reframes: [], killed: [], combatFailed: false, damageTaken: 0, healed: 0, leveledTo: null, learned: [], evolvedTo: null, mutatedTo: null, evolveBlockedReason: null, questCompleted: null };
  const toyRole = () => ({ ...defaultSetup(), role: 'Custom', roleCustom: 'sentientsex toy' } as ReturnType<typeof defaultSetup>);
  it('Toggles roleCustom "sentientsex toy" derives as toy', () => {
    expect(derivePropertiesFromSetup(toyRole()).objectType).toBe('toy');
  });
  it('widened conflicts: punches/pinch/kick/arms on toy; telepathy is fine', () => {
    const p = createSlot(fw('I am reincarnated as a sentient sex toy'), null).character.properties!;
    for (const t of ['I punches myself', 'pinch his nuts', 'I kick the door', 'use my arms', 'I look around but can\'t move', 'I have no arms']) expect(actionConflictsWithBody(p, t)).not.toBeNull();
    for (const t of ['I telepathically call out', 'I sense the magic around me', 'I listen carefully']) expect(actionConflictsWithBody(p, t)).toBeNull();
  });
  it.each(['punches myself', "look around but can't move", 'I listen carefully', 'I hum quietly', 'I wait'])('no humanoid template for "%s"', async (input) => {
    const { StubDM } = await import('../dm/stubDM');
    const dm = new StubDM();
    const slot = createSlot(fw('I am reincarnated as a sentient sex toy'), null);
    const intent = await dm.interpret(slot, input);
    const out = (await dm.narrate(slot, input, intent, empty)).narrative;
    expect(out).not.toMatch(/Nothing explodes|You do it|you act on it|arms ache/);
    expect(out).toMatch(/limb|move|arms|body|vibrat|warmth|noticed|senses|hum|footsteps/i);
  });
  it('object beats vary across turns', async () => {
    const { StubDM } = await import('../dm/stubDM');
    const dm = new StubDM();
    const slot = createSlot(fw('I am reincarnated as a sentient sex toy'), null);
    const seen = new Set<string>();
    for (const input of ['I wait', 'I listen', 'I hum', 'I wonder', 'I focus', 'I dream']) {
      slot.meaningfulActions++;
      seen.add((await dm.narrate(slot, input, await dm.interpret(slot, input), empty)).narrative.split('"')[0].slice(0, 20));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('object beats can advance the scene (found / picked up / noticed) and do not share one closer', async () => {
    const { StubDM } = await import('../dm/stubDM');
    const dm = new StubDM();
    const slot = createSlot(fw('I am reincarnated as a sentient sex toy'), null);
    const outs: string[] = [];
    for (let i = 0; i < 24; i++) {
      const input = `I wait ${i}`;
      slot.meaningfulActions++;
      outs.push((await dm.narrate(slot, input, await dm.interpret(slot, input), empty)).narrative);
    }
    expect(outs.some((o) => /picks you up|scoops you up|pockets you|noticed|lift your/i.test(o))).toBe(true);
    const closers = new Set(outs.map((o) => o.slice(-40)));
    expect(closers.size).toBeGreaterThan(2);
    for (const o of outs) expect(o).not.toMatch(/Nothing explodes|slides itself|slips out|young man/i);
  });
});

describe('prompts: advance + NSFW honoring', () => {
  const nsfwSlot = () => { const s = createSlot({ ...fw('I am reincarnated as a sentient sex toy'), nsfw: true, ageConfirmed: true }, null); return s; };
  it('system prompt demands advancing every turn', () => {
    const sp = systemPrompt(createSlot(fw('I am reincarnated as a sentient sex toy'), null));
    expect(sp).toMatch(/ADVANCE EVERY TURN/);
    expect(sp).toMatch(/Never end two turns the same way/);
  });
  it('NSFW on: honors sexual steering, no fade/moralizing', () => {
    const sp = systemPrompt(nsfwSlot());
    expect(sp).toMatch(/Do NOT fade to black/);
    expect(sp).toMatch(/moralize/);
    expect(sp).not.toMatch(/non-gratuitous/);
    expect(sp).not.toMatch(/fade to black or summarize within limits/);
  });
  it('NSFW off keeps content clean', () => {
    expect(systemPrompt(createSlot(fw('I am reincarnated as a sentient sex toy'), null))).toMatch(/Mature content is OFF/);
  });
  it('narratePrompt requires the world to change', async () => {
    const { narratePrompt } = await import('../dm/prompts');
    const { StubDM } = await import('../dm/stubDM');
    const slot = nsfwSlot();
    const intent = await new StubDM().interpret(slot, 'I wait');
    const empty2 = { hits: [], misses: [], stupid: [], reframes: [], killed: [], combatFailed: false, damageTaken: 0, healed: 0, leveledTo: null, learned: [], evolvedTo: null, mutatedTo: null, evolveBlockedReason: null, questCompleted: null };
    const np = narratePrompt(slot, 'I wait', intent, empty2 as never);
    expect(np).toMatch(/The world MUST change this turn/);
    expect(np).toMatch(/without fading or moralizing/);
  });
});
