// Local, deterministic-ish stub DM. No network, no keys.
// Heuristic classifier + template narrator. Swap for an LLM provider via src/dm/index.ts.
import { MOB_XP, MUTATIONS, SKILL_BY_ID, SKILL_DEFS } from '../game/rules';
import type { CheckpointOffer, GameSetup, SaveSlot } from '../game/types';
import type { DMProvider, DMTurn, Intent, Resolution, SkillUseIntent } from './provider';

const pick = <T,>(arr: T[], seed: number): T => arr[Math.abs(seed) % arr.length];
const hash = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, the: 1, two: 2, pair: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, several: 3, some: 3, few: 3, many: 6, horde: 10, pack: 4, group: 4, all: 4,
};

const MOB_LOOT: Record<string, string> = {
  slime: 'Slime jelly', rat: 'Rat tail', bat: 'Bat wing', goblin: 'Goblin ear', kobold: 'Kobold scale',
  wolf: 'Wolf pelt', bandit: 'Stolen coin pouch', skeleton: 'Old bone', orc: 'Orc tusk', ogre: 'Ogre club',
  troll: 'Troll blood', wyvern: 'Wyvern scale', dragon: 'Dragon heartscale',
};

const ATTACK = /\b(attack|kill|slay|fight|strike|stab|slash|hit|smash|shoot|cast|bite|claw|punch|kick|charge|ambush|backstab|fireball|bolt|cut|swing|destroy|hunt)\w*/;
const THREAT = /\b(threaten|scare|menace|intimidate|frighten|warn|glare|to scare|so (he|she|they) (talks|backs off))\w*/;
const FRIENDLY = /\b(merchant|shopkeeper|child|kid|villager|princess|prince|king|queen|priest|innkeeper|farmer|maid|guard|captain|classmate|friend|companion|summoner|noble|old man|old woman)\b/;
const NONCOMBATANT = /\b(merchant|shopkeeper|child|kid|villager|innkeeper|farmer|maid|old man|old woman|priest)\b/;
const STUPID = /\b(myself|my own|lick|juggle|at a wall|at the sky|at the air|randomly|for no reason|while naked|at a tree|on a rock|eat the slime|swallow)\b/;
const PRACTICE = /\b(practice|practise|train|drill|spar|exercise|rehearse|meditate)\w*/;
const REST = /\b(rest|sleep|camp|heal|potion|herb|eat|nap|recover)\w*/;
const LOOT = /\b(loot|pick up|take the|grab|search the (body|bodies|corpse|chest|room)|open the chest|salvage|harvest)\b/;
const GAME_CHANGING = /\b(betray|overthrow|destroy the|claim the throne|seal the|free the|burn down|assassinate|unite|declare war|kill the (king|queen|demon lord|demon king)|forge a pact|found a (guild|kingdom|village|town)|abolish|start a revolution|steal the (crown|relic))\b/;
const IMPORTANT = /\b(save|rescue|ally|swear|promise|join|accept the quest|confess|befriend|reveal|discover|negotiate|protect|recruit|defend|escape|investigate|sign the contract|tame)\w*/;

const PLURALS: Record<string, string> = { wolf: 'wolves', dragon: 'dragons' };

function detectKills(t: string): { mob: string; count: number }[] {
  if (!ATTACK.test(t)) return [];
  const out: { mob: string; count: number }[] = [];
  for (const mob of Object.keys(MOB_XP)) {
    const plural = PLURALS[mob] ?? `${mob}s`;
    const re = new RegExp(`(?:(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s+(?:of\\s+)?(?:\\w+\\s+)?)?(${plural}|${mob})\\b`);
    const m = t.match(re);
    if (!m) continue;
    m[3] = m[2] === plural ? 's' : '';
    let count = 1;
    if (m[1]) count = /\d+/.test(m[1]) ? parseInt(m[1], 10) : NUMBER_WORDS[m[1]] ?? 1;
    if (m[3] && (!m[1] || m[1] === 'the')) count = Math.max(count, 3); // plural, unspecified
    out.push({ mob, count: Math.min(count, 50) });
  }
  return out;
}

function detectSkills(t: string, slot: SaveSlot, hasKills: boolean): SkillUseIntent[] {
  const owned = new Set(slot.character.skills.map((s) => s.id));
  const matches: { id: string; len: number }[] = [];
  for (const def of SKILL_DEFS) {
    if (def.tier > 0 && !owned.has(def.id)) continue; // branches only once unlocked
    if (def.tier === 0 && !owned.has(def.id) && def.keywords.every((k) => !t.includes(k))) continue;
    const kw = def.keywords.filter((k) => new RegExp(`\\b${k.replace(/[+]/g, '\\+')}`).test(t)).sort((a, b) => b.length - a.length)[0];
    if (kw) matches.push({ id: def.id, len: kw.length });
  }
  // Within a tree prefer the most specific (longest keyword) match: "blazing slash" beats "slash".
  const byRoot = new Map<string, { id: string; len: number }>();
  for (const m of matches) {
    const root = SKILL_BY_ID[m.id].rootId;
    const cur = byRoot.get(root);
    if (!cur || m.len > cur.len) byRoot.set(root, m);
  }
  let ids = [...byRoot.values()].map((m) => m.id);
  if (hasKills && !ids.some((id) => SKILL_BY_ID[id].tags.includes('combat'))) {
    const combat = slot.character.skills.find((s) => s.tags.includes('combat') && s.tier === 0);
    if (combat) ids.push(combat.id);
  }
  ids = ids.slice(0, 3);

  const friendly = t.match(FRIENDLY)?.[0] ?? null;
  const threat = THREAT.test(t);
  const uses: SkillUseIntent[] = [];
  for (const id of ids) {
    const def = SKILL_BY_ID[id];
    const combat = def.tags.includes('combat');
    if (combat && friendly && threat && !hasKills) {
      // Threat → Intimidate reframe instead of punishing.
      if (!uses.some((u) => u.skillId === 'intimidate')) uses.push({ skillId: 'intimidate', quality: 'proper', reframedFrom: id, target: friendly });
      continue;
    }
    if (STUPID.test(t) || (combat && NONCOMBATANT.test(t) && !hasKills)) {
      uses.push({ skillId: id, quality: 'stupid', target: friendly ?? undefined });
      continue;
    }
    let proper = false;
    if (combat && hasKills) proper = true;
    if (def.tags.includes('social') && friendly) proper = true;
    if (id === 'stealth' && /\b(shadow|night|dark|behind|quietly|silently|bushes)\b/.test(t)) proper = true;
    if (id === 'appraise' && /\b(item|sword|stone|monster|enemy|slime|goblin|status)\b/.test(t)) proper = true;
    uses.push({ skillId: id, quality: proper ? 'proper' : 'normal', target: friendly ?? undefined });
  }
  // One use per skill per turn; a reframed use wins over a duplicate direct match.
  const seen = new Map<string, SkillUseIntent>();
  for (const u of uses) if (!seen.has(u.skillId) || u.reframedFrom) seen.set(u.skillId, u);
  return [...seen.values()];
}

function pronoun(setup: GameSetup) {
  if (setup.gender === 'Male') return 'young man';
  if (setup.gender === 'Female') return 'young woman';
  if (setup.gender === 'Non-binary') return 'traveler';
  return setup.genderCustom || 'traveler';
}

const TONE_FLAVOR: Record<string, string[]> = {
  Heroic: ['Somewhere, trumpets would be appropriate.', 'The wind feels like it is on your side.', 'Destiny takes notes.'],
  Grimdark: ['Crows watch, patient.', 'The mud here remembers older wars.', 'Nobody is coming to save anyone.'],
  Comedic: ['A nearby chicken looks deeply unimpressed.', 'You hear a faint, cosmic laugh track.', 'Somewhere a narrator sighs.'],
  Cozy: ['The air smells of bread and rain.', 'A cat follows you for a while, approving.', 'Lanterns hum softly.'],
  Intrigue: ['Someone in a hood is definitely writing this down.', 'Every smile here costs something.', 'A sealed letter changes hands nearby.'],
  Horror: ['Something under the floorboards shifts its weight.', 'The silence is the wrong shape.', 'Your shadow lags half a step behind you.'],
};

function flavor(slot: SaveSlot, seed: number) {
  const tone = slot.setup.tone === 'Custom' ? 'Heroic' : slot.setup.tone;
  return pick(TONE_FLAVOR[tone] ?? TONE_FLAVOR.Heroic, seed);
}

const ENTRANCE_TEXT: Record<string, string> = {
  'Hit by bus': 'Headlights. A horn. Then — nothing, and then grass under your cheek and two moons overhead.',
  'Summoned by country': 'Light tears through you. When it fades you are kneeling inside a glowing circle in a marble hall, and a court of nobles is staring.',
  'Summoned by individual': 'A tug behind your navel, a smell of ozone — and you stumble out of a chalk circle in a cramped tower room, face to face with a very nervous summoner.',
  'Reality glitch': 'The world stutters. Pixels peel off a streetlight. You blink, and the city is a forest, and a translucent window hangs in the air reading [ERROR: ORIGIN NOT FOUND].',
  Reincarnation: 'Darkness, warmth, a voice — and then you open eyes that are not your old ones, in a body that is very new.',
  Other: 'However it happened, it happened: you are somewhere else now.',
};

const ROLE_TEXT: Record<string, string> = {
  Hero: 'A status window flickers: [Class: Hero]. People will expect things of you.',
  Villain: 'A status window bleeds red: [Alignment: Villain]. Interesting.',
  'Battle creature': 'You are not human anymore. Claws, hunger, and a status window that reads [Species: Monster].',
  Pet: 'You are small, fluffy, and — according to the status window — [Tamed: pending].',
  Civilian: 'The status window reads [Class: Civilian]. No cheat skills. Just you and your wits.',
  'Custom race': 'Your body is unfamiliar — something this world has a name for, even if you do not yet.',
  Other: 'The status window is oddly blank about what you are.',
};

const COMPANION_TEXT: Record<string, string> = {
  Alone: 'You are alone.',
  'You + one': 'Beside you, someone from home groans and sits up — you are not alone.',
  'Whole class': 'All around you, your entire class is waking up, panicking, comparing status windows.',
};

export class StubDM implements DMProvider {
  readonly id = 'stub';
  readonly label = 'Local stub DM (offline)';

  async openingScene(slot: SaveSlot): Promise<DMTurn> {
    const s = slot.setup;
    const c = slot.character;
    const seed = hash(slot.id);
    const useToggles = s.pathMode !== 'Free write';
    const parts: string[] = [];
    if (slot.linkedFrom) {
      parts.push(`(Linked run) Echoes of "${slot.linkedFrom.slotName}" linger: ${slot.linkedFrom.characterName} once reached Lv ${slot.linkedFrom.level}. ${slot.linkedFrom.summary}`);
    }
    if (useToggles) {
      parts.push(s.entrance === 'Other' && s.entranceOther ? s.entranceOther : ENTRANCE_TEXT[s.entrance]);
      parts.push(`You are ${c.name}, a ${pronoun(s)} from another world.`);
      parts.push(s.role === 'Custom race' || s.role === 'Other' ? (s.roleCustom ? `The status window insists you are: [${s.roleCustom}].` : ROLE_TEXT[s.role]) : ROLE_TEXT[s.role]);
      parts.push(s.companions === 'Custom' ? (s.companionsCustom || 'Someone came with you.') : COMPANION_TEXT[s.companions]);
    } else {
      parts.push(`You are ${c.name}.`);
    }
    if (s.freeWrite.trim()) parts.push(`The world has bent to your design: ${s.freeWrite.trim()}`);
    parts.push(flavor(slot, seed));
    parts.push('Far to the north, people speak of a Demon Lord — a great threat, though you sense the story will not end there.');
    parts.push(s.difficulty === 'Easy' ? 'The world feels forgiving.' : 'The world will not hold your hand.');
    parts.push(`Skills: ${c.skills.map((k) => k.name).join(', ')}.${c.job ? ` Job: ${c.job.name}.` : ''} What do you do?`);
    return { narrative: parts.join('\n\n'), suggestions: this.suggest(slot) };
  }

  suggest(slot: SaveSlot): string[] {
    const role = slot.setup.role;
    const base = ['Look around and appraise my surroundings', 'Sneak toward the nearest sound'];
    if (role === 'Hero' || role === 'Battle creature') base.push('Attack the slime with Slash'.replace('Slash', role === 'Hero' ? 'Slash' : 'Bite'));
    else if (role === 'Villain') base.push('Threaten the nearest villager for information');
    else base.push('Ask the nearest villager where I am');
    return base;
  }

  async interpret(slot: SaveSlot, input: string): Promise<Intent> {
    const t = input.toLowerCase();
    const kills = detectKills(t);
    const skillUses = detectSkills(t, slot, kills.length > 0);
    const gc = t.match(GAME_CHANGING);
    const imp = t.match(IMPORTANT);
    const storyWeight = gc ? 'game-changing' : imp ? 'important' : 'none';
    const loot: string[] = [];
    if (LOOT.test(t)) {
      const recentKills = slot.log.slice(-4).flatMap((m) => m.events ?? []).filter((e) => e.type === 'xp');
      const mob = Object.keys(MOB_LOOT).find((m) => recentKills.some((e) => e.type === 'xp' && e.reason.includes(m)) || t.includes(m));
      loot.push(mob ? MOB_LOOT[mob] : /chest/.test(t) ? 'Rusty coin pouch' : 'Odd trinket');
    }
    const mutateMatch = /\b(mutate|absorb the rune|touch the rune|corrupt|infuse)\w*/.test(t);
    const flags: string[] = [];
    if (gc) flags.push(gc[0].replace(/\s+/g, '-'));
    const words = t.split(/\s+/).filter(Boolean).length;
    return {
      meaningful: words >= 3 || kills.length > 0 || skillUses.length > 0 || storyWeight !== 'none',
      kills,
      skillUses,
      practice: PRACTICE.test(t) && kills.length === 0,
      storyWeight,
      storyReason: gc ? `Game-changing: ${gc[0]}` : imp ? `Important: ${imp[0]}` : undefined,
      rest: REST.test(t) && kills.length === 0,
      loot,
      evolve: /\bevolve\b/.test(t),
      mutate: mutateMatch ? { kind: /rune/.test(t) ? 'Runic' : pick(MUTATIONS, hash(t)), forced: /\b(curse|forced|corrupt)\w*/.test(t) } : null,
      flags,
      friendlyTarget: t.match(FRIENDLY)?.[0] ?? null,
    };
  }

  async narrate(slot: SaveSlot, input: string, intent: Intent, res: Resolution): Promise<DMTurn> {
    const seed = hash(input + slot.meaningfulActions);
    const lines: string[] = [];
    for (const r of res.reframes) {
      lines.push(`You raise your weapon — not to strike, but to make a point. The ${intent.skillUses.find((u) => u.reframedFrom)?.target ?? 'target'} goes pale. (${r.from} reframed as ${r.to}.)`);
    }
    if (res.killed.length) {
      const what = res.killed.map((k) => `${k.count > 1 ? k.count + ' ' + (PLURALS[k.mob] ?? k.mob + 's') : 'the ' + k.mob}`).join(' and ');
      lines.push(pick([
        `Steel and instinct carry you through. ${cap(what)} fall${res.killed.length === 1 && res.killed[0].count === 1 ? 's' : ''}.`,
        `It is messy, fast, and over. You stand over ${what}, breathing hard.`,
        `You move before you think. When you stop, ${what} ${res.killed.reduce((a, k) => a + k.count, 0) > 1 ? 'are' : 'is'} no longer a problem.`,
      ], seed));
    } else if (res.combatFailed) {
      lines.push(pick(['The fight goes badly. You are forced to retreat, bruised and furious.', 'They are stronger — or more numerous — than you hoped. You break off and run.'], seed));
    }
    if (!intent.practice && res.hits.length && !res.killed.length) lines.push(`Your ${res.hits.join(' and ')} ${res.hits.length > 1 ? 'work' : 'works'}. ${outcomeFor(intent, slot)}`.trim());
    if (!intent.practice && res.misses.length) lines.push(`Your ${res.misses.join(' and ')} ${res.misses.length > 1 ? 'fall' : 'falls'} short — but your body remembers the attempt.`);
    if (res.stupid.length) lines.push(pick([
      `That was… not what ${res.stupid[0]} is for. It goes about as well as you'd expect.`,
      `The world punishes creativity of that particular kind. ${res.stupid[0]} backfires.`,
    ], seed));
    if (intent.practice && !res.killed.length) lines.push('You drill until your arms ache. Progress is slow, but real.');
    if (res.questCompleted) lines.push(`A chime only you can hear: [${res.questCompleted}] complete.`);
    if (res.learned.length) lines.push(`[New skill: ${res.learned.join(', ')}]`);
    if (res.leveledTo) lines.push(`Power floods through you. [Level ${res.leveledTo}]`);
    if (res.evolvedTo) lines.push(`Your body cracks, reshapes, settles. You have evolved: ${res.evolvedTo}.`);
    if (res.evolveBlockedReason) lines.push(`You reach for evolution, but: ${res.evolveBlockedReason}`);
    if (res.mutatedTo) lines.push(`Something foreign rewrites you from the inside. You are now ${res.mutatedTo}.`);
    if (intent.storyWeight !== 'none') lines.push(intent.storyWeight === 'game-changing'
      ? 'This will ripple. Factions will hear of it by nightfall.'
      : 'It matters — maybe more than you know yet.');
    if (res.healed) lines.push('You rest and patch yourself up.');
    if (intent.loot.length) lines.push(`You collect: ${intent.loot.join(', ')}.`);
    if (!lines.length) lines.push(genericBeat(slot, input, seed));
    lines.push(flavor(slot, seed + 1));
    return { narrative: lines.join(' ') };
  }

  async checkpoint(slot: SaveSlot): Promise<CheckpointOffer> {
    const c = slot.character;
    const ch = slot.chapter;
    const keyFlags = slot.flags.slice(-6);
    const pastDemon = slot.flags.includes('demon-lord-arc');
    const opts: string[] = [];
    if (pastDemon) {
      opts.push('Deal with the power vacuum the Demon Lord left behind');
      opts.push('Follow rumors of what the Demon Lord was guarding against');
    } else if (ch >= 4) {
      opts.push('March on the Demon Lord’s domain (a turning point — not the end)');
    }
    const roleOpts: Record<string, string[]> = {
      Hero: ['Answer the royal summons in the capital', 'Clear the dungeon outside town', 'Search for the other summoned heroes'],
      Villain: ['Recruit a lieutenant from the slums', 'Undermine the Hero’s reputation', 'Seize a border fortress'],
      'Battle creature': ['Claim a hunting territory', 'Hunt something bigger to trigger an evolution', 'Track the adventurers hunting you'],
      Pet: ['Find a worthy master', 'Escape the tamer’s guild', 'Follow the strange scent into the forest'],
      Civilian: ['Open a shop with your otherworld knowledge', 'Join a caravan heading to the capital', 'Investigate the missing villagers'],
      'Custom race': ['Seek others of your kind', 'Hide what you are in a human city', 'Visit the ancient ruins tied to your race'],
      Other: ['Follow the road to the nearest city', 'Look for a way home', 'Investigate the ruins on the hill'],
    };
    for (const o of roleOpts[slot.setup.role]) if (opts.length < 3) opts.push(o);
    if (slot.setup.companions !== 'Alone' && opts.length < 4) opts.push('Reunite with the ones who came with you');
    const summary = [
      `Chapter ${ch} checkpoint.`,
      `${c.name} — Lv ${c.level}${c.job ? `, ${c.job.name} Job Lv ${c.job.level}` : ''}, form: ${c.form.name}.`,
      keyFlags.length ? `Story flags: ${keyFlags.join(', ')}.` : 'No major flags yet.',
      'Pick a next chapter — or type your own.',
    ].join(' ');
    return { chapter: ch, title: `End of Chapter ${ch}`, summary, flags: keyFlags, options: opts.slice(0, 4) };
  }

  async beginChapter(slot: SaveSlot, choice: string): Promise<DMTurn> {
    const seed = hash(choice);
    const demon = /demon (lord|king)/i.test(choice) && !slot.flags.includes('demon-lord-defeated');
    if (demon) slot.flags.push('demon-lord-confronted');
    const text = [
      `— Chapter ${slot.chapter} —`,
      `You chose: ${choice}.`,
      demon
        ? 'The Demon Lord’s domain looms. Whatever happens here, the world will keep turning afterward — this is a checkpoint, not a finale. (Remember: the Demon King is stronger than any fresh Lv 99.)'
        : pick(['The road bends toward new trouble.', 'Days pass. The world shifts around your choice.', 'A new thread pulls taut.'], seed),
      flavor(slot, seed),
      'What do you do?',
    ];
    return { narrative: text.join('\n\n') };
  }
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function outcomeFor(intent: Intent, slot: SaveSlot): string {
  const u = intent.skillUses[0];
  if (!u) return '';
  switch (u.skillId) {
    case 'stealth': return 'Nobody notices you.';
    case 'intimidate': return `${u.target ? 'The ' + u.target : 'They'} back${u.target ? 's' : ''} off, eyes down.`;
    case 'persuade': return 'They hesitate — then nod.';
    case 'appraise': return `Information scrolls past your vision. Your current Lv ${slot.character.level} feels very small.`;
    case 'haggle': return 'You get a better price than you deserve.';
    case 'cook': return 'The smell draws a small crowd.';
    case 'charm': return 'Someone melts a little.';
    case 'sniff': return 'You catch a trail.';
    default: return '';
  }
}

function genericBeat(slot: SaveSlot, input: string, seed: number): string {
  const short = input.length > 80 ? input.slice(0, 77) + '…' : input;
  return pick([
    `You ${short.replace(/^i\s+/i, '').replace(/^(\w)/, (m) => m.toLowerCase())}. The world takes note, quietly.`,
    `"${short}" — you act on it. Nothing explodes, which in ${slot.setup.tone === 'Comedic' ? 'this world' : 'a place like this'} counts as progress.`,
    'You do it. For a moment, nothing changes — then a small detail shifts that you will remember later.',
  ], seed);
}
