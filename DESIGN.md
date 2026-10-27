# Another World DM — Design Notes (locked mechanics)

This summarizes the locked design and how the prototype implements it, so a real LLM DM can be wired in later
without re-deciding rules.

## Architecture: DM proposes, client disposes

```
player text ─▶ DMProvider.interpret(slot, text) ─▶ Intent (structured JSON)
                                                    │
                     engine.resolveIntent(slot, intent)  ◀── rules.ts (all numbers live here)
                                                    │  rolls, XP, HP, skill ticks, items, job, form
                                                    ▼
               DMProvider.narrate(slot, text, intent, Resolution) ─▶ prose that matches the numbers
                                                    │
         every CHECKPOINT_EVERY meaningful actions ─▶ DMProvider.checkpoint(slot) ─▶ 2–4 options
         next player input while pending ─▶ DMProvider.beginChapter(slot, choice)
```

- The **client owns** HP, XP, level, skills, inventory, job, form and flags. The DM never writes them directly.
- An LLM provider implements `DMProvider` (`src/dm/provider.ts`): `interpret` becomes a JSON/tool-call that returns
  `Intent`; `narrate` receives the `Resolution` so the prose agrees with hits/misses/level-ups.
- Swap point: `getDM()` in `src/dm/index.ts`. Keep API keys server-side (a tiny proxy) — never in the browser bundle.
  **Implemented:** `src/dm/llmDM.ts` (`LLMDM`) talks to `server/dmProxy.mjs`, which forwards to xAI
  (`grok-4.3`, `reasoning_effort: none` by default). `interpret` requests `response_format: json_schema` and is
  validated by `src/dm/intentParse.ts`; invalid JSON → `StubDM.interpret`. Any network/API error → stub for that
  call plus a one-time chat notice (`DMProvider.takeNotice`). `getDM()` picks LLMDM only when
  `GET /api/dm/status` reports `configured: true`.
- Context for the LLM: `setup`, `character`, `flags`, `chapter`, `linkedFrom`, last N log entries + latest checkpoint
  summary (checkpoints double as long-context compression).

## Saves

- Multiple slots; each `SaveSlot` is stored under its own localStorage key (`awdm.slot.v1.<id>`) plus an index.
- Stories never mix. **Link to previous run** (New Game) copies only a read-only `LinkedRun` snapshot
  (name, character, level, last checkpoint summary, recent flags) into the new slot.
- Pause = autosave + return to save select. Switching games = Pause then pick another slot. Every turn also autosaves.
- Future: move to IndexedDB when logs get large; `version` field on `SaveSlot` for migrations.

## New Game

Slot name; character name; link to previous run; Path = Toggles / Free write / Both (free write fills gaps and
overrides); Main character (Male/Female/Non-binary/Custom); Entrance (Hit by bus, Summoned by country, Summoned by
individual, Reality glitch, Reincarnation, Other); Role (Hero/Villain/Battle creature/Pet/Civilian/Custom race/Other);
Who came with you (Alone / You + one / Whole class / Custom); Tone; NSFW Off/On (age-gate stub; stub DM generates no
NSFW content regardless); Difficulty Easy/Normal (default Normal); Power mode Set/Open; Jobs Off/Set/Open.

**Soft spine:** the Demon Lord (or premise equivalent) is a mid/late checkpoint, not the end. Play continues after.
No THE END screen exists.

## Core loop

Freeform chat; typed actions matter. Optional suggestion chips are allowed but not required (stub shows a "Try:"
line after the opening only).

## XP & levels

- XP to next level doubles each level: `xpToNext(L) = 10 × 2^(L−1)` (`BASE_LEVEL_XP` tunable).
- Soft story cap ~99 (XP gains halved past 99), hard cap 255. `DEMON_KING_LEVEL = 140` — still stronger than a
  fresh Lv 99.
- Mobs: slime 1, goblin 5 (table in `rules.ts`). Group = base × count.
  Combo streak +10%/step, stealth streak +25%/step (cap +100%). Easy = ×1.5.
- Important / game-changing actions: XP scales with the curve (20% / 50% of the current level's requirement) so story
  beats stay meaningful at any level; game-changing also grants +1 skill point.
- Level up: +5 max HP, full heal, +1 skill point (+1 extra every 5th level).
- **Note for tuning:** a pure doubling curve with flat mob XP stalls quickly; real play will need mob XP to scale by
  mob level / zone, which is left for the LLM-era balance pass.

## Skill points vs skill practice

- Skill points (SP) are separate from level XP. Spent to unlock branches.
- Skill use: **+1 tick even on a miss** if the skill is learnable; **proper use** (+1 extra on a hit);
  **stupid use** → −1 tick and an HP consequence, OR a **reframe** when intent is clear (threatening with Slash →
  Intimidate tick instead).
- Ticks to next rank: `4 + 2 × rank`.
- Learn-by-use: Power mode **Open** = any base skill; **Set** = a short list (Stealth, Intimidate, Persuade, Appraise,
  Dodge, Mana Sense, Cook, Haggle). Learned skills start at rank 0.
- **Practice** (train/drill/spar…) seeds a **silent practice quest** for that skill. Each practice action advances the
  quest; only every other one (~half) counts as a real rank tick. Completing it (6) reveals the quest and grants +1 SP.

## Skill trees

- Branches never overwrite the base: Slash stays; Slash+ → Double Slash, Blazing Slash → Ranged Blazing Slash.
- Unlock needs parent rank (`requiresRank`) + SP cost. Unlocked branches appear nested under their root.
- Form can **devolve access toward base**: each form has `skillTierCap`; skills above it show "sealed by form".

## Evolution vs Mutation

- **Evolution** = growth along the role's line (Egg → Hatchling → Juvenile → Adult → Elder for Battle creature, etc.),
  every 5 levels; +1 tier cap, +10 max HP. (Future: hunt-specific traits.)
- **Mutation** = fork/rewrite of the line (e.g. Runic). Elective mutation keeps base tools as add-ons. **Forced /
  shape-loss mutation is permanent** and reduces tier cap by 2 (advanced techniques sealed, base skills remain) and
  blocks the old evolution line.

## Jobs

- Role is the frame; Job adds optional Job Lv. Job XP to next = 5 × Job Lv.
- **Set:** role ladder (Hero: Squire → Knight → Paladin → Holy Knight → Hero King), advancing every 5 Job Lv.
- **Open:** no job at start; seeded from the most-used skill tag once it reaches 5 uses (combat → Fighter,
  stealth → Shadow, social → Silver Tongue, magic → Mage, craft → Artisan, utility → Scout).
- **Off:** role frame only.

## Checkpoints

- After big beats (prototype: every 5 meaningful actions) the DM summarizes level/job/form + recent flags and offers
  2–4 rational next chapters. Player clicks one or types their own; chapter increments, a flag is recorded.
- From chapter 4+, "March on the Demon Lord's domain" is offered; after the Demon Lord arc, options continue
  (power vacuum, what it was guarding against). Never a THE END splash.

## Prototype shortcuts

- Stub DM uses regex heuristics + templates; narration is repetitive by design.
- No death/game over (HP floors at 1 with a `near-death` flag).
- Combat is a single resolution per message (no turn-by-turn enemy HP).
- NSFW is a stored flag + age-gate checkbox only.
- localStorage only (no IndexedDB yet).
