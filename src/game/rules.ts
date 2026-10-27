// Locked mechanics as data + pure functions. A real LLM DM should NOT re-implement these;
// it should emit intents and let this module compute numbers.
import type { Difficulty, Form, Job, JobMode, Role, Skill } from './types';

// ---------- Levels ----------
export const SOFT_STORY_CAP = 99;
export const HARD_CAP = 255;
export const DEMON_KING_LEVEL = 140; // still stronger than a fresh Lv 99
export const BASE_LEVEL_XP = 10;

/** XP needed to go from `level` to `level + 1`. Doubles each level. */
export function xpToNext(level: number): number {
  if (level >= HARD_CAP) return Infinity;
  return BASE_LEVEL_XP * Math.pow(2, level - 1);
}

// ---------- Mobs ----------
export const MOB_XP: Record<string, number> = {
  slime: 1,
  rat: 1,
  bat: 2,
  goblin: 5,
  kobold: 4,
  wolf: 8,
  bandit: 10,
  skeleton: 6,
  orc: 15,
  ogre: 40,
  troll: 60,
  wyvern: 150,
  dragon: 500,
};

export const MOB_THREAT: Record<string, number> = {
  slime: 1, rat: 1, bat: 1, goblin: 3, kobold: 2, wolf: 4, bandit: 4, skeleton: 3,
  orc: 7, ogre: 15, troll: 20, wyvern: 40, dragon: 120,
};

/** group = base × count; combo/stealth streak adds +10% / +25% per step (cap +100%). */
export function mobXp(mob: string, count: number, streak: { kind: string | null; count: number }, difficulty: Difficulty): number {
  const base = (MOB_XP[mob] ?? 3) * Math.max(1, count);
  let mult = 1;
  if (streak.kind === 'combo') mult += Math.min(1, 0.1 * streak.count);
  if (streak.kind === 'stealth') mult += Math.min(1, 0.25 * streak.count);
  if (difficulty === 'Easy') mult *= 1.5;
  return Math.max(1, Math.round(base * mult));
}

/** Important / game-changing actions scale with the curve so story beats stay meaningful at any level. */
export function storyXp(level: number, weight: 'important' | 'game-changing', difficulty: Difficulty): number {
  const frac = weight === 'game-changing' ? 0.5 : 0.2;
  const easy = difficulty === 'Easy' ? 1.5 : 1;
  return Math.max(2, Math.round(xpToNext(level) * frac * easy));
}

// ---------- Skills ----------
export interface SkillDef {
  id: string;
  name: string;
  rootId: string;
  parentId: string | null;
  tier: number;
  tags: string[];
  keywords: string[]; // stub DM uses these to detect use
  requiresRank?: number; // parent rank needed to unlock branch
  cost?: number; // skill points to unlock branch
}

const d = (s: SkillDef) => s;
export const SKILL_DEFS: SkillDef[] = [
  // Slash tree — branches never overwrite the base.
  d({ id: 'slash', name: 'Slash', rootId: 'slash', parentId: null, tier: 0, tags: ['combat'], keywords: ['slash', 'cut', 'swing my sword', 'sword'] }),
  d({ id: 'slash_plus', name: 'Slash+', rootId: 'slash', parentId: 'slash', tier: 1, tags: ['combat'], keywords: ['slash+'], requiresRank: 2, cost: 1 }),
  d({ id: 'double_slash', name: 'Double Slash', rootId: 'slash', parentId: 'slash_plus', tier: 2, tags: ['combat'], keywords: ['double slash'], requiresRank: 2, cost: 1 }),
  d({ id: 'blazing_slash', name: 'Blazing Slash', rootId: 'slash', parentId: 'slash_plus', tier: 2, tags: ['combat', 'magic'], keywords: ['blazing slash', 'flaming slash'], requiresRank: 3, cost: 2 }),
  d({ id: 'ranged_blazing_slash', name: 'Ranged Blazing Slash', rootId: 'slash', parentId: 'blazing_slash', tier: 3, tags: ['combat', 'magic'], keywords: ['ranged blazing slash'], requiresRank: 2, cost: 2 }),
  d({ id: 'guard', name: 'Guard', rootId: 'guard', parentId: null, tier: 0, tags: ['combat'], keywords: ['block', 'parry', 'shield', 'guard stance', 'brace'] }),
  d({ id: 'appraise', name: 'Appraise', rootId: 'appraise', parentId: null, tier: 0, tags: ['utility'], keywords: ['appraise', 'examine', 'inspect', 'analyze', 'status'] }),
  d({ id: 'intimidate', name: 'Intimidate', rootId: 'intimidate', parentId: null, tier: 0, tags: ['social'], keywords: ['intimidate', 'threaten', 'scare', 'menace', 'glare'] }),
  d({ id: 'dark_bolt', name: 'Dark Bolt', rootId: 'dark_bolt', parentId: null, tier: 0, tags: ['combat', 'magic'], keywords: ['dark bolt', 'shadow bolt', 'curse'] }),
  d({ id: 'scheme', name: 'Scheme', rootId: 'scheme', parentId: null, tier: 0, tags: ['social'], keywords: ['scheme', 'plot', 'manipulate', 'deceive', 'lie'] }),
  d({ id: 'bite', name: 'Bite', rootId: 'bite', parentId: null, tier: 0, tags: ['combat'], keywords: ['bite', 'chomp'] }),
  d({ id: 'claw', name: 'Claw', rootId: 'claw', parentId: null, tier: 0, tags: ['combat'], keywords: ['claw', 'scratch', 'rake'] }),
  d({ id: 'venom_bite', name: 'Venom Bite', rootId: 'bite', parentId: 'bite', tier: 1, tags: ['combat'], keywords: ['venom'], requiresRank: 3, cost: 1 }),
  d({ id: 'roar', name: 'Roar', rootId: 'roar', parentId: null, tier: 0, tags: ['social', 'combat'], keywords: ['roar', 'howl'] }),
  d({ id: 'charm', name: 'Charm', rootId: 'charm', parentId: null, tier: 0, tags: ['social'], keywords: ['charm', 'cute', 'purr', 'nuzzle', 'beg'] }),
  d({ id: 'sniff', name: 'Sniff', rootId: 'sniff', parentId: null, tier: 0, tags: ['utility'], keywords: ['sniff', 'smell', 'track'] }),
  d({ id: 'dodge', name: 'Dodge', rootId: 'dodge', parentId: null, tier: 0, tags: ['combat'], keywords: ['dodge', 'evade', 'roll away', 'duck'] }),
  d({ id: 'haggle', name: 'Haggle', rootId: 'haggle', parentId: null, tier: 0, tags: ['social', 'craft'], keywords: ['haggle', 'bargain', 'negotiate', 'trade', 'sell', 'buy'] }),
  d({ id: 'cook', name: 'Cook', rootId: 'cook', parentId: null, tier: 0, tags: ['craft'], keywords: ['cook', 'bake', 'stew', 'roast'] }),
  d({ id: 'stealth', name: 'Stealth', rootId: 'stealth', parentId: null, tier: 0, tags: ['stealth'], keywords: ['sneak', 'hide', 'stealth', 'creep', 'tiptoe', 'ambush', 'backstab'] }),
  d({ id: 'persuade', name: 'Persuade', rootId: 'persuade', parentId: null, tier: 0, tags: ['social'], keywords: ['persuade', 'convince', 'reason with', 'talk', 'ask'] }),
  d({ id: 'mana_sense', name: 'Mana Sense', rootId: 'mana_sense', parentId: null, tier: 0, tags: ['magic'], keywords: ['mana', 'meditate', 'sense magic', 'feel the magic'] }),
  d({ id: 'fireball', name: 'Fireball', rootId: 'fireball', parentId: null, tier: 0, tags: ['combat', 'magic'], keywords: ['fireball', 'fire spell', 'cast fire'] }),
  d({ id: 'racial_instinct', name: 'Racial Instinct', rootId: 'racial_instinct', parentId: null, tier: 0, tags: ['utility'], keywords: ['instinct'] }),
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILL_DEFS.map((s) => [s.id, s]));

/** Skills anyone can pick up by doing the thing (if Power mode is Open, more are learnable). */
export const LEARNABLE_BY_USE = ['stealth', 'intimidate', 'persuade', 'appraise', 'dodge', 'mana_sense', 'cook', 'haggle'];

export function practiceToRank(rank: number): number {
  return 4 + rank * 2;
}

export function makeSkill(id: string): Skill {
  const def = SKILL_BY_ID[id];
  return {
    id: def.id, name: def.name, rootId: def.rootId, parentId: def.parentId, tier: def.tier,
    rank: 1, practice: 0, uses: 0, learnable: true, tags: def.tags,
  };
}

export const STARTER_SKILLS: Record<Role, string[]> = {
  Hero: ['slash', 'guard', 'appraise'],
  Villain: ['intimidate', 'dark_bolt', 'scheme'],
  'Battle creature': ['bite', 'claw', 'roar'],
  Pet: ['charm', 'sniff', 'dodge'],
  Civilian: ['haggle', 'cook', 'dodge'],
  'Custom race': ['racial_instinct', 'appraise', 'dodge'],
  Other: ['appraise', 'dodge'],
};

/** Branches whose prerequisites are met (unlock spends skill points). */
export function unlockableBranches(skills: Skill[], form: Form): SkillDef[] {
  const owned = new Map(skills.map((s) => [s.id, s]));
  return SKILL_DEFS.filter((def) => {
    if (!def.parentId || owned.has(def.id)) return false;
    const parent = owned.get(def.parentId);
    return !!parent && parent.rank >= (def.requiresRank ?? 1) && def.tier <= form.skillTierCap;
  });
}

// ---------- Jobs ----------
export const JOB_LADDERS: Record<Role, string[]> = {
  Hero: ['Squire', 'Knight', 'Paladin', 'Holy Knight', 'Hero King'],
  Villain: ['Lackey', 'Dark Acolyte', 'Warlock', 'Archfiend', 'Overlord'],
  'Battle creature': ['Hatchling', 'Hunter', 'Alpha', 'Apex', 'Calamity'],
  Pet: ['Stray', 'Companion', 'Familiar', 'Guardian Beast', 'Divine Beast'],
  Civilian: ['Apprentice', 'Journeyman', 'Artisan', 'Master', 'Legend of the Trade'],
  'Custom race': ['Wanderer', 'Adept', 'Elder', 'Paragon', 'Progenitor'],
  Other: ['Novice', 'Adept', 'Expert', 'Master', 'Grandmaster'],
};

export const OPEN_JOB_BY_TAG: Record<string, string> = {
  combat: 'Fighter', stealth: 'Shadow', social: 'Silver Tongue', magic: 'Mage', craft: 'Artisan', utility: 'Scout',
};
export const OPEN_JOB_SEED_THRESHOLD = 5;

export function jobXpToNext(level: number): number {
  return 5 * level;
}

export function initialJob(mode: JobMode, role: Role): Job | null {
  if (mode === 'Set') return { name: JOB_LADDERS[role][0], level: 1, xp: 0, ladderIndex: 0 };
  return null; // Off = no job; Open = seeded by play
}

// ---------- Forms (Evolution vs Mutation) ----------
export const EVOLUTION_LINES: Record<Role, string[]> = {
  Hero: ['Otherworlder', 'Awakened Otherworlder', 'Ascendant', 'Demi-god'],
  Villain: ['Otherworlder', 'Fallen', 'Demonkin', 'Archdemon'],
  'Battle creature': ['Egg', 'Hatchling', 'Juvenile', 'Adult', 'Elder'],
  Pet: ['Pup', 'Young Beast', 'Grown Beast', 'Mythic Beast'],
  Civilian: ['Otherworlder', 'Seasoned Local', 'Notable', 'Living Legend'],
  'Custom race': ['Hatchling', 'Youth', 'Adult', 'Elder', 'Ancestral'],
  Other: ['Stranger', 'Adapted', 'Transcended'],
};
export const EVOLVE_LEVEL_STEP = 5; // can evolve every N levels

export function initialForm(role: Role): Form {
  const line = EVOLUTION_LINES[role];
  return { name: line[0], line: 'origin', stage: 0, skillTierCap: role === 'Battle creature' ? 1 : 3, permanent: false, history: [line[0]] };
}

export const MUTATIONS = ['Runic', 'Abyssal', 'Crystalline', 'Verdant', 'Storm-touched'];

// ---------- RNG ----------
/** Deterministic per-slot RNG (mulberry32) so saves replay consistently. */
export function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [r, (seed + 0x6d2b79f5) | 0];
}
