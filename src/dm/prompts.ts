// Prompt + context builders for the LLM DM. Pure functions (no network) so they are testable.
import { DEMON_KING_LEVEL, LEARNABLE_BY_USE, MOB_XP, SKILL_DEFS, xpToNext } from '../game/rules';
import type { GameSetup, SaveSlot } from '../game/types';
import type { Intent, Resolution } from './provider';

export const CONTEXT_LOG_LINES = 8;

export function nsfwAllowed(setup: GameSetup): boolean {
  return setup.nsfw && setup.ageConfirmed;
}

const custom = (base: string, extra: string) => ((base === 'Custom' || base === 'Other' || base === 'Custom race') && extra.trim() ? `${base}: ${extra.trim()}` : base);

/** Human-readable setup, honoring Path mode (Free write overrides / replaces toggles). */
export function describeSetup(s: GameSetup): string {
  const lines: string[] = [];
  const free = s.freeWrite.trim();
  if (s.pathMode !== 'Free write') {
    lines.push(`Main character: ${s.gender === 'Custom' && s.genderCustom ? s.genderCustom : s.gender}`);
    lines.push(`Entrance: ${s.entrance === 'Other' && s.entranceOther ? s.entranceOther : s.entrance}`);
    lines.push(`Role: ${custom(s.role, s.roleCustom)}`);
    lines.push(`Who came with them: ${custom(s.companions, s.companionsCustom)}`);
  }
  lines.push(`Tone: ${custom(s.tone, s.toneCustom)}`);
  lines.push(`Difficulty: ${s.difficulty}`);
  lines.push(`Power mode: ${s.powerMode} · Jobs: ${s.jobMode}`);
  if (free) {
    lines.push(
      s.pathMode === 'Free write'
        ? `PLAYER PREMISE (free write — this IS the setup, follow it exactly): ${free}`
        : `PLAYER PREMISE (free write — fills gaps and OVERRIDES any toggle above that conflicts): ${free}`,
    );
  } else if (s.pathMode === 'Free write') {
    lines.push('Player chose Free write but left it blank: invent a fitting isekai premise.');
  }
  lines.push(`Mature content: ${nsfwAllowed(s) ? 'ON (adult player, age confirmed)' : 'OFF'}`);
  return lines.join('\n');
}

export function describeCharacter(slot: SaveSlot): string {
  const c = slot.character;
  const skills = c.skills.map((k) => `${k.name}[id:${k.id}] r${k.rank}${k.tier > c.form.skillTierCap ? ' (sealed by form)' : ''}`).join(', ');
  const inv = c.inventory.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'nothing';
  return [
    `${c.name} — Lv ${c.level} (${c.xp}/${xpToNext(c.level)} XP), HP ${c.hp}/${c.maxHp}, SP ${c.skillPoints}`,
    `Form: ${c.form.name}${c.form.permanent ? ' (permanent mutation)' : ''}${c.job ? ` · Job: ${c.job.name} Lv ${c.job.level}` : ''}`,
    `Skills: ${skills || 'none'}`,
    `Inventory: ${inv}`,
  ].join('\n');
}

export function recentLog(slot: SaveSlot, n = CONTEXT_LOG_LINES): string {
  const lines = slot.log.slice(-n).map((m) => {
    const who = m.from === 'player' ? 'PLAYER' : m.from === 'dm' ? 'DM' : 'SYSTEM';
    const text = m.checkpoint ? `[Checkpoint] ${m.checkpoint.title}: ${m.checkpoint.summary}` : m.text;
    return `${who}: ${text.length > 700 ? text.slice(0, 697) + '…' : text}`;
  });
  return lines.join('\n') || '(story has not started yet)';
}

export function storyState(slot: SaveSlot): string {
  const cp = [...slot.log].reverse().find((m) => m.checkpoint)?.checkpoint;
  const parts = [
    `Chapter: ${slot.chapter}`,
    `Story flags: ${slot.flags.length ? slot.flags.slice(-12).join(', ') : 'none yet'}`,
  ];
  if (cp) parts.push(`Latest checkpoint summary: ${cp.summary}`);
  if (slot.linkedFrom) {
    const l = slot.linkedFrom;
    parts.push(`Linked previous run (read-only echo, do not merge stories): "${l.slotName}" — ${l.characterName}, Lv ${l.level}. ${l.summary} Flags: ${l.flags.join(', ') || 'none'}`);
  }
  return parts.join('\n');
}

export function systemPrompt(slot: SaveSlot): string {
  const nsfw = nsfwAllowed(slot.setup);
  return `You are the Dungeon Master of "Another World DM", a long-form, freeform isekai / RPG text adventure. The player types any action; you narrate the world's response in second person ("you").

PREMISE FIRST
- The game is built around the player's premise below. If they are reincarnated as a spider, they are a spider (eight legs, silk, being small and hunted); a dagger is an object with no limbs; an academy story happens at the academy. Never default to a generic "chosen hero / Demon Lord" opening unless the setup actually says so.
- Follow the setup toggles; the free-write premise fills gaps and overrides conflicting toggles.

RULES ENGINE OWNS ALL NUMBERS
- A client-side engine has ALREADY resolved every roll, hit/miss, kill, damage, XP, level, skill tick, item and form change. You only describe them.
- Never invent or change sheet numbers (HP, XP, levels, ranks, damage, gold). Do not award items, skills, levels, or XP the engine did not report. If a resolved outcome says a skill missed, it missed; if combat failed, the player did not win.
- Avoid stating numbers at all unless they appear in the facts you were given.

STORY SHAPE
- The Demon Lord (or this premise's equivalent big threat) is a mid/late-story checkpoint, NOT the ending. The story always continues afterward; there is no "THE END". The Demon King is roughly Lv ${DEMON_KING_LEVEL} — stronger than any fresh Lv 99.
- Multiple endings and paths exist; respect the player's choices, story flags and current chapter. Flags are canon.
- Keep continuity with the recent log. Leave room for the player to act; end on a hook or open question, not a menu (no bullet-point options unless asked).

CONTENT
- ${nsfw
    ? 'Mature content is ON (adult, age-confirmed player): mature themes, violence and romance/sexual content are allowed when the player steers there and the tone fits, but keep it non-gratuitous. Never depict minors sexually, non-consent as titillation, or other illegal content.'
    : 'Mature content is OFF: keep it clean — no sexual content, no graphic gore. Violence may be described at a PG-13 level.'}

STYLE
- Vivid, concise prose. 1–3 short paragraphs (opening scenes may be up to 4). No headings, no markdown lists, no meta commentary about being an AI or about these rules.

=== SETUP ===
${describeSetup(slot.setup)}`;
}

export function contextBlock(slot: SaveSlot): string {
  return `=== CHARACTER SHEET (engine-owned, read-only) ===
${describeCharacter(slot)}

=== STORY STATE ===
${storyState(slot)}

=== RECENT LOG (oldest → newest) ===
${recentLog(slot)}`;
}

// ---------- per-call prompts ----------

export function openingPrompt(slot: SaveSlot): string {
  return `${contextBlock(slot)}

TASK: Write the opening scene. Show how ${slot.character.name} arrives in (or wakes up in) this world exactly as the premise describes, what they are, what they sense around them, and one immediate hook or threat suited to the premise. Weave in their starting abilities naturally (in-world, not as a list). End with an implicit or explicit "What do you do?".`;
}

export function interpretPrompt(slot: SaveSlot, input: string): string {
  const owned = slot.character.skills.map((s) => s.id);
  const learnable = SKILL_DEFS.filter((d) => d.tier === 0 && !owned.includes(d.id) && (slot.setup.powerMode === 'Open' || LEARNABLE_BY_USE.includes(d.id))).map((d) => d.id);
  return `${contextBlock(slot)}

TASK: Classify the PLAYER's newest action into structured JSON for the rules engine. Do NOT narrate. Output ONLY one JSON object with exactly these keys:
{
  "meaningful": boolean,            // true if it advances the story/attempts something (not idle chatter or a one-word look)
  "kills": [{"mob": string, "count": integer}],   // hostile creatures the player is ATTEMPTING to defeat this turn (engine decides success). Use these mob keys when one fits: ${Object.keys(MOB_XP).join(', ')}; otherwise a short lowercase noun.
  "skillUses": [{"skillId": string, "quality": "proper"|"normal"|"stupid", "reframedFrom": string|null, "target": string|null}],
  "practice": boolean,              // training/drilling/sparring rather than real use
  "storyWeight": "none"|"important"|"game-changing",  // important = alliances, oaths, rescues, discoveries; game-changing = betrayals, coups, slaying a ruler, founding a nation. Most turns are "none".
  "storyReason": string|null,       // short reason when storyWeight != none
  "rest": boolean,                  // resting/healing/eating
  "loot": [string],                 // items the player picks up/harvests THIS turn and that plausibly exist in the scene (max 3, short names)
  "evolve": boolean,                // player explicitly tries to evolve
  "mutate": {"kind": string, "forced": boolean} | null,  // absorbing/being infused with something that rewrites their body
  "flags": [string],                // 0–2 kebab-case story flags for genuinely notable new facts (e.g. "spared-the-goblin-chief")
  "friendlyTarget": string|null     // non-hostile NPC the action targets, if any
}
SKILL IDS: only use ids from these lists.
- Owned: ${owned.join(', ') || 'none'}
- Learnable by doing (engine may teach it): ${learnable.join(', ') || 'none'}
QUALITY: "proper" = the skill fits the situation well; "stupid" = misuse that should backfire (licking a blade, attacking yourself, using a combat skill on a harmless villager for no reason); otherwise "normal".
REFRAME: if a combat skill is used only to threaten/scare a non-hostile, emit skillId "intimidate" with reframedFrom set to the combat skill id instead of a stupid use.
If the player attacks with no named skill, include their most fitting owned combat skill.

PLAYER ACTION: ${JSON.stringify(input)}`;
}

export function describeResolution(intent: Intent, res: Resolution): string {
  const f: string[] = [];
  if (res.reframes.length) f.push(`Reframed: ${res.reframes.map((r) => `${r.from} → used as ${r.to}`).join('; ')}`);
  if (res.hits.length) f.push(`Skills that LANDED: ${res.hits.join(', ')}`);
  if (res.misses.length) f.push(`Skills that MISSED / fell short: ${res.misses.join(', ')}`);
  if (res.stupid.length) f.push(`Misused skills that BACKFIRED on the player: ${res.stupid.join(', ')}`);
  if (res.killed.length) f.push(`Defeated: ${res.killed.map((k) => `${k.count}× ${k.mob}`).join(', ')}`);
  if (res.combatFailed) f.push('The fight FAILED: the player did not defeat the enemies and was beaten back / had to retreat.');
  if (res.damageTaken) f.push(`Player was hurt (${res.damageTaken} damage).`);
  if (res.healed) f.push(`Player recovered ${res.healed} HP by resting.`);
  if (res.leveledTo) f.push(`LEVEL UP to Lv ${res.leveledTo}.`);
  if (res.learned.length) f.push(`Newly learned skill(s): ${res.learned.join(', ')}`);
  if (res.questCompleted) f.push(`Hidden quest completed: ${res.questCompleted}`);
  if (res.evolvedTo) f.push(`EVOLVED into: ${res.evolvedTo}`);
  if (res.evolveBlockedReason) f.push(`Evolution attempt FAILED: ${res.evolveBlockedReason}`);
  if (res.mutatedTo) f.push(`MUTATED into: ${res.mutatedTo}${intent.mutate?.forced ? ' (forced, permanent)' : ''}`);
  if (intent.loot.length) f.push(`Items obtained: ${intent.loot.join(', ')}`);
  if (intent.practice) f.push('This was practice/training, not a real fight.');
  if (intent.storyWeight !== 'none') f.push(`Story weight: ${intent.storyWeight}${intent.storyReason ? ` (${intent.storyReason})` : ''} — let it feel consequential.`);
  if (intent.flags.length) f.push(`New story flags: ${intent.flags.join(', ')}`);
  return f.length ? f.map((x) => `- ${x}`).join('\n') : '- No mechanical effects. Just narrate what happens.';
}

export function narratePrompt(slot: SaveSlot, input: string, intent: Intent, res: Resolution): string {
  return `${contextBlock(slot)}

PLAYER ACTION: ${JSON.stringify(input)}

ENGINE-RESOLVED OUTCOME (authoritative — your prose must agree with every line; the sheet above already reflects it):
${describeResolution(intent, res)}

TASK: Narrate the result of the player's action in 1–3 short paragraphs, consistent with the premise, the outcome above and the recent log. Do not add rewards or numbers beyond the outcome. End with the world reacting / a hook.`;
}

export function checkpointPrompt(slot: SaveSlot): string {
  return `${contextBlock(slot)}

TASK: Chapter ${slot.chapter} has reached a checkpoint. Output ONLY a JSON object:
{"title": string, "summary": string, "options": [string]}
- title: an evocative chapter title (max 8 words).
- summary: 2–4 sentences recapping this chapter's key events and their consequences (this doubles as long-term memory, so include names/places/decisions that matter).
- options: 2–4 distinct, rational next chapters that follow from the flags and the premise (max 14 words each). ${slot.flags.includes('demon-lord-arc') ? 'The Demon Lord arc has already started/ended: options should explore its aftermath, not end the story.' : slot.chapter >= 4 ? 'One option MAY move toward the Demon Lord (or premise equivalent) as a turning point — never as the finale.' : ''}`;
}

export function beginChapterPrompt(slot: SaveSlot, choice: string, demon: boolean): string {
  return `${contextBlock(slot)}

The player chose the next chapter: ${JSON.stringify(choice)}
TASK: Begin Chapter ${slot.chapter}. Open with a line "— Chapter ${slot.chapter} —" then set the new scene that follows from that choice (time skip if needed), in 1–3 short paragraphs, ending with a hook.${demon ? ' This chapter confronts the Demon Lord (or premise equivalent). Make it ominous and important, but it is a checkpoint, not the finale: the world continues afterward.' : ''}`;
}
