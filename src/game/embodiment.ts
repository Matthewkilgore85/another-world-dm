// Embodiment: engine-owned character properties derived from setup. The world adapts to the
// character, never the character to DM expectations. Sentience != mobility/speech/limbs.
import type { BodyKind, CharacterProperties, Communication, GameSetup, Role, SaveSlot, SenseChannel } from './types';

type ObjectRule = { re: RegExp; type: string; kind: BodyKind; size: string };

// Order matters: first match wins. Over-constrain on object keywords rather than under-constrain.
const OBJECT_RULES: ObjectRule[] = [
  { re: /\bdungeon[- ]?core\b|\bdungeon heart\b|\bcore crystal\b/i, type: 'dungeon core', kind: 'core', size: 'fist-sized crystal anchored in its dungeon' },
  { re: /\b(sword|blade|katana|dagger|sabre|saber|greatsword|rapier|axe|spear|weapon)\b/i, type: 'weapon', kind: 'object', size: 'handheld' },
  { re: /\b(book|tome|grimoire|spellbook|diary|journal|scroll)\b/i, type: 'book', kind: 'object', size: 'handheld' },
  { re: /\b(ring|amulet|necklace|pendant|bracelet|crown|circlet|jewel|gem)\b/i, type: 'jewelry', kind: 'object', size: 'tiny' },
  { re: /\b(statue|golem statue|gargoyle|figurine|idol)\b/i, type: 'statue', kind: 'object', size: 'person-sized, heavy stone' },
  { re: /\b(sex toy|vibrator|dildo|toy|doll|plush|teddy)\b/i, type: 'toy', kind: 'object', size: 'handheld' },
  { re: /\b(vending machine|lamp|mirror|chair|cup|mug|pot|kettle|shoe|sock|hat|coin|key|door|chest|box|rock|stone|pebble|phone|smartphone|computer|object|item|artifact|artefact|inanimate|tool)\b/i, type: 'object', kind: 'object', size: 'varies' },
];
const AMORPHOUS = /\b(slime|ooze|mist|cloud|gas|blob|puddle)\b/i;
const CREATURE = /\b(spider|dragon|wolf|cat|dog|snake|beast|monster|creature|animal|bird|fish|insect|bug|goblin|rat|fox|horse|lizard)\b/i;
const HUMANOID = /\b(human|person|man|woman|girl|boy|elf|dwarf|knight|hero|villain|mage|princess|prince|noble|student|orc)\b/i;
const MOVE_GRANT = /\b(can (move|walk|roll|fly|float|hover|crawl)|levitat\w*|floats?|hover\w*|animated)\b/i;
const SPEECH_GRANT = /\b(can (speak|talk)|talking|speaks?|voice)\b/i;
const TELEPATHY = /\btelepath\w*|mind[- ]?speech|mental(ly)? (speak|talk|link)\b/i;
const NO_MOVE = /\b(no|without|cannot|can't|unable to) (independent )?(move|movement|mobility|walk|limbs?)\b|\bimmobile\b/i;
const NO_SPEECH = /\b(no|without|cannot|can't|unable to) (ordinary |normal )?(speech|speak|talk|voice|mouth)\b|\bmute\b|\bvoiceless\b/i;

const premiseText = (s: GameSetup) => {
  const parts = [s.pathMode !== 'Toggles' ? s.freeWrite : '', s.pathMode !== 'Free write' ? s.roleCustom : ''];
  return parts.join(' ').trim();
};

const excerpt = (t: string) => (t.length > 180 ? t.slice(0, 177) + '…' : t);

function humanoid(notes: string, derived: boolean): CharacterProperties {
  return { bodyKind: 'humanoid', anatomyNotes: notes, hasLimbs: true, mobility: 'full', communication: ['speech', 'gesture'], senses: ['sight', 'hearing', 'touch', 'smell', 'taste'], canIndependentMove: true, canOrdinarySpeech: true, sizeHint: 'person-sized', derivedFromPremise: derived };
}

function creature(notes: string, derived: boolean, speech: boolean): CharacterProperties {
  return { bodyKind: 'creature', anatomyNotes: notes, hasLimbs: true, mobility: 'full', communication: speech ? ['speech', 'gesture'] : ['gesture'], senses: ['sight', 'hearing', 'smell', 'touch', 'vibration'], canIndependentMove: true, canOrdinarySpeech: speech, derivedFromPremise: derived };
}

export function derivePropertiesFromSetup(setup: GameSetup): CharacterProperties {
  const text = premiseText(setup);
  const derived = !!text;
  const notes = excerpt(text) || `Role: ${setup.role}`;
  const obj = text ? OBJECT_RULES.find((r) => r.re.test(text)) : undefined;
  // Humanoid wording only wins if it appears to describe the self and no object keyword hit.
  if (obj) {
    const telepathy = TELEPATHY.test(text);
    const moves = MOVE_GRANT.test(text) && !NO_MOVE.test(text);
    const speaks = SPEECH_GRANT.test(text) && !NO_SPEECH.test(text) && !/\bno\b[^.]*\bspeech\b/i.test(text);
    const comm: Communication[] = speaks ? ['speech'] : [];
    if (telepathy || !speaks) comm.push('telepathy', 'magic_projection');
    if (obj.type === 'book') comm.push('writing');
    const senses: SenseChannel[] = obj.kind === 'core' ? ['magic', 'vibration', 'temperature', 'other'] : ['touch', 'vibration', 'magic', 'temperature'];
    if (/\b(see|sight|eye|eyes|vision)\b/i.test(text)) senses.unshift('sight');
    if (/\b(hear|hearing|ears?)\b/i.test(text)) senses.push('hearing');
    return {
      bodyKind: obj.kind, objectType: obj.type, anatomyNotes: notes, hasLimbs: false,
      mobility: moves ? 'limited' : 'none',
      communication: [...new Set(comm)], senses: [...new Set(senses)],
      canIndependentMove: moves, canOrdinarySpeech: speaks, sizeHint: obj.size, derivedFromPremise: true,
    };
  }
  if (text && AMORPHOUS.test(text)) {
    return { bodyKind: 'amorphous', anatomyNotes: notes, hasLimbs: false, mobility: 'limited', communication: SPEECH_GRANT.test(text) ? ['speech', 'gesture'] : ['gesture', 'telepathy'], senses: ['touch', 'vibration', 'taste', 'magic'], canIndependentMove: true, canOrdinarySpeech: SPEECH_GRANT.test(text), derivedFromPremise: true };
  }
  if (text && CREATURE.test(text) && !/\b(human|person)\b/i.test(text)) return creature(notes, true, SPEECH_GRANT.test(text));
  if (text && HUMANOID.test(text)) return humanoid(notes, true);
  return fromRole(setup.pathMode === 'Free write' ? 'Other' : setup.role, notes, derived);
}

function fromRole(role: Role, notes: string, derived: boolean): CharacterProperties {
  switch (role) {
    case 'Battle creature': return creature(notes, derived, false);
    case 'Pet': return { ...creature(notes, derived, false), sizeHint: 'small' };
    case 'Custom race': return { ...humanoid(notes, derived), bodyKind: 'other' };
    case 'Other': return { ...humanoid(notes, derived), bodyKind: 'other' };
    default: return humanoid(notes, derived);
  }
}

export const isEmbodiedObject = (p: CharacterProperties) => p.bodyKind === 'object' || p.bodyKind === 'core' || !!p.objectType;

/** Backfill for saves created before properties existed. */
export function ensureProperties(slot: SaveSlot): CharacterProperties {
  if (!slot.character.properties) slot.character.properties = derivePropertiesFromSetup(slot.setup);
  return slot.character.properties;
}

/** Starter skills that fit the body (objects don't get walking-combat kits). */
export function bodyStarterSkills(p: CharacterProperties, roleSkills: string[]): string[] {
  if (p.objectType === 'weapon') return ['slash', 'intimidate', 'mana_sense'];
  if (isEmbodiedObject(p)) return ['appraise', 'mana_sense', 'intimidate'];
  if (!p.hasLimbs) return roleSkills.filter((s) => !['slash', 'guard', 'claw'].includes(s));
  return roleSkills;
}

/** Inventory for objects: traits of the body itself, not a human starter kit. */
export function objectStartingInventory(p: CharacterProperties): { name: string; note?: string }[] {
  const base: Record<string, { name: string; note?: string }[]> = {
    weapon: [{ name: 'Your own edge', note: 'you ARE the weapon; needs a wielder to swing' }, { name: 'Nicked blade', note: 'old battle scars' }],
    book: [{ name: 'Blank pages', note: 'your memory can grow here' }, { name: 'Faded bookplate', note: "a former owner's mark" }],
    jewelry: [{ name: 'Inset stone', note: 'faint stored mana' }, { name: 'Engraving', note: "a former owner's initials" }],
    statue: [{ name: 'Weathered plinth', note: 'where you stand, always' }, { name: 'Moss patch' }],
    'dungeon core': [{ name: 'Mana reservoir', note: 'shapes your rooms' }, { name: 'First chamber', note: 'your only territory so far' }],
    toy: [{ name: 'Residual enchantment', note: 'the spark that woke you' }, { name: 'Scuffs', note: 'proof of a previous life' }],
  };
  return base[p.objectType ?? ''] ?? [{ name: 'Residual magic', note: 'the spark that woke you' }, { name: "Owner's mark", note: 'scratched into your surface' }];
}

/** Soft check: returns a note if the player's text assumes a body they lack. */
export function actionConflictsWithBody(p: CharacterProperties | undefined, text: string): string | null {
  if (!p) return null;
  const t = text.toLowerCase();
  if (!p.canIndependentMove && /\b(walk(s|ing)?|run(s|ning)?|stand up|get up|climb(s)?|jump(s)?|kick(s|ing)?|crawl(s)?|stride|step(s)?|sprint|dash|roll over|move (myself|my body|toward|towards|to|over))\b/.test(t))
    return `Your body (${p.objectType ?? p.bodyKind}) can't move on its own — you'll need someone or something to move you.`;
  if (!p.hasLimbs && /\b(grab(s|bing)?|punch(es|ing)?|pinch(es|ing)?|slap(s)?|pick up|hold(s|ing)?|reach (out|for)|wave|point at|kick(s|ing)?|hands?|arms?|legs?|fists?|fingers?|nuts|squeeze)\b/.test(t))
    return `You have no limbs to do that; use what your body does have.`;
  if (!p.canOrdinarySpeech && /\b(i say|i shout|i yell|i whisper|i tell|i speak|i talk|say ")/.test(t) && !p.communication.length)
    return `You can't speak aloud.`;
  if (!p.canOrdinarySpeech && /\b(i shout|i yell|i speak aloud|out loud)\b/.test(t))
    return `You have no voice; it comes through as ${p.communication.filter((c) => c !== 'none').join('/') || 'nothing'} instead.`;
  if (isEmbodiedObject(p) && /\b(no (arms|limbs|hands|legs)|can'?t move|cannot move|unable to move|can'?t walk)\b/.test(t))
    return `Right — no limbs, no way to move yourself. As a ${p.objectType ?? p.bodyKind}, you can only sense and wait to be moved.`;
  return null;
}

export function describeEmbodiment(p: CharacterProperties): string {
  const yn = (b: boolean) => (b ? 'YES' : 'NO');
  return [
    `Body kind: ${p.bodyKind}${p.objectType ? ` (${p.objectType})` : ''}${p.sizeHint ? ` · size: ${p.sizeHint}` : ''}`,
    `Premise anatomy: ${p.anatomyNotes}`,
    `Has limbs: ${yn(p.hasLimbs)} · Independent movement: ${yn(p.canIndependentMove)} · Mobility: ${p.mobility}`,
    `Ordinary speech: ${yn(p.canOrdinarySpeech)} · Communication: ${p.communication.join(', ') || 'none'}`,
    `Senses: ${p.senses.join(', ')}`,
  ].join('\n');
}
