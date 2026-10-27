// Parse + validate the LLM's Intent JSON. Pure (no network) so it is unit-testable.
// Anything malformed returns null and the caller falls back to StubDM.interpret.
import { MOB_XP, SKILL_BY_ID } from '../game/rules';
import type { Intent, SkillUseIntent, StoryWeight, UseQuality } from './provider';

/** JSON schema sent to the model (response_format json_schema). Mirrors the Intent interface. */
export const INTENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['meaningful', 'kills', 'skillUses', 'practice', 'storyWeight', 'rest', 'loot', 'evolve', 'mutate', 'flags', 'friendlyTarget'],
  properties: {
    meaningful: { type: 'boolean' },
    kills: {
      type: 'array',
      items: { type: 'object', required: ['mob', 'count'], properties: { mob: { type: 'string' }, count: { type: 'integer' } } },
    },
    skillUses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['skillId', 'quality'],
        properties: {
          skillId: { type: 'string' },
          quality: { type: 'string', enum: ['proper', 'normal', 'stupid'] },
          reframedFrom: { type: ['string', 'null'] },
          target: { type: ['string', 'null'] },
        },
      },
    },
    practice: { type: 'boolean' },
    storyWeight: { type: 'string', enum: ['none', 'important', 'game-changing'] },
    storyReason: { type: ['string', 'null'] },
    rest: { type: 'boolean' },
    loot: { type: 'array', items: { type: 'string' } },
    evolve: { type: 'boolean' },
    mutate: {
      anyOf: [{ type: 'null' }, { type: 'object', required: ['kind', 'forced'], properties: { kind: { type: 'string' }, forced: { type: 'boolean' } } }],
    },
    flags: { type: 'array', items: { type: 'string' } },
    friendlyTarget: { type: ['string', 'null'] },
  },
} as const;

/** Pull the first JSON object out of a model reply (handles ```json fences and chatter around it). */
export function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch { /* fall through */ }
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 80): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const bool = (v: unknown): boolean => v === true || v === 'true';
const slugFlag = (s: string) => s.toLowerCase().replace(/[^a-z0-9:]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

function normMob(m: string): string {
  const t = m.toLowerCase().trim();
  if (MOB_XP[t] !== undefined) return t;
  if (t === 'wolves') return 'wolf';
  const sing = t.replace(/(es|s)$/, '');
  if (MOB_XP[sing] !== undefined) return sing;
  const known = Object.keys(MOB_XP).find((k) => t.split(/\s+/).includes(k) || t.split(/\s+/).includes(k + 's'));
  return known ?? t.slice(0, 32); // unknown mobs are allowed; engine uses fallback XP/threat
}

/**
 * Validate a parsed object into an Intent. Returns null if the core shape is missing.
 * Unknown skill ids are dropped (the engine only knows SKILL_DEFS); counts are clamped.
 */
export function toIntent(v: unknown): Intent | null {
  if (!isObj(v)) return null;
  if (typeof v.meaningful !== 'boolean' && typeof v.storyWeight !== 'string' && !Array.isArray(v.skillUses)) return null;

  const kills = (Array.isArray(v.kills) ? v.kills : [])
    .filter(isObj)
    .map((k) => ({ mob: normMob(String(k.mob ?? '')), count: Math.min(50, Math.max(1, Math.round(Number(k.count) || 1))) }))
    .filter((k) => k.mob)
    .slice(0, 4);

  const seen = new Set<string>();
  const skillUses: SkillUseIntent[] = [];
  for (const u of Array.isArray(v.skillUses) ? v.skillUses : []) {
    if (!isObj(u)) continue;
    const id = String(u.skillId ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
    if (!SKILL_BY_ID[id] || seen.has(id)) continue;
    seen.add(id);
    const quality: UseQuality = u.quality === 'proper' || u.quality === 'stupid' ? u.quality : 'normal';
    const from = str(u.reframedFrom)?.toLowerCase().replace(/[\s-]+/g, '_');
    const use: SkillUseIntent = { skillId: id, quality };
    if (from && from !== id && SKILL_BY_ID[from]) use.reframedFrom = from;
    const target = str(u.target, 40);
    if (target) use.target = target;
    skillUses.push(use);
    if (skillUses.length >= 3) break;
  }

  const sw: StoryWeight = v.storyWeight === 'important' || v.storyWeight === 'game-changing' ? v.storyWeight : 'none';
  const loot = (Array.isArray(v.loot) ? v.loot : []).map((x) => str(x, 40)).filter((x): x is string => !!x).slice(0, 3);
  const flags = [...new Set((Array.isArray(v.flags) ? v.flags : []).map((x) => (typeof x === 'string' ? slugFlag(x) : '')).filter(Boolean))].slice(0, 3);
  let mutate: Intent['mutate'] = null;
  if (isObj(v.mutate) && str(v.mutate.kind)) mutate = { kind: str(v.mutate.kind, 24)!, forced: bool(v.mutate.forced) };

  const intent: Intent = {
    meaningful: typeof v.meaningful === 'boolean' ? v.meaningful : kills.length > 0 || skillUses.length > 0 || sw !== 'none',
    kills,
    skillUses,
    practice: bool(v.practice) && kills.length === 0,
    storyWeight: sw,
    rest: bool(v.rest) && kills.length === 0,
    loot,
    evolve: bool(v.evolve),
    mutate,
    flags,
    friendlyTarget: str(v.friendlyTarget, 40) ?? null,
  };
  const reason = str(v.storyReason, 80);
  if (reason && sw !== 'none') intent.storyReason = reason;
  return intent;
}

export function parseIntent(raw: string): Intent | null {
  return toIntent(extractJson(raw));
}
