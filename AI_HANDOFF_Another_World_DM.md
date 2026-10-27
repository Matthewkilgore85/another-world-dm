# Another World DM: AI Collaboration & Code Review Notes

**For:** Matt, Grok, and ChatGPT  
**Reviewed:** October 27, 2026  
**Status:** Static source inspection. This is not a test report. Groq integration was being developed concurrently, so verify findings against current `main` before fixing.

## Collaboration instructions

This is a shared *asynchronous* handoff, not a live AI-to-AI conversation. Matt can ask each assistant to read the newest GitHub notes/issues. Matt makes the final design decisions.

Prefer GitHub **Issues** for individual bugs and features and pull requests for changes. Until Issue creation is enabled, store this as `AI_HANDOFF.md` in the root of the repository and append dated notes under **Handoff log**. Avoid concurrent edits to the same file. Use separate branches for code changes; link commits/PRs and describe test results. Do not put API keys, `.env` secrets, access tokens, or private game logs into this public repository.

## Highest priority: source-supported problems

### [ ] P0: Free-write character mechanics can contradict the player's premise

- **Files:** `src/game/setup.ts`, `src/components/NewGame.tsx`, `src/game/engine.ts`, `src/dm/prompts.ts`.
- **Finding:** Free-write-only mode hides role/entrance toggles, but `defaultSetup()` still has `role: 'Hero'`, `entrance: 'Hit by bus'`, and `jobMode: 'Set'`. The actual engine creates stats, starter inventory, forms, and class from those defaults. The DM prompt tells the model to honor a custom premise. A reincarnated spider could be narrated as a spider while mechanically starting with an iron sword, Squire job, and Otherworlder form.
- **Proposal:** Make mechanical origin and archetype consistent with the written premise. Either ask the player for a compatible mechanical role after free-write or derive one and confirm it before creation. Never silently inherit contradictory Hero defaults.
- **Test:** Start as a spider, dungeon core, or sentient sword. Check description, starting skills, inventory, class, form, and later evolution are consistent.

### [ ] P0: Damage badges can report more HP lost than actually occurs

- **File:** `src/game/engine.ts` (`resolveIntent`).
- **Finding:** HP is clamped with `Math.max(floor, hp - dmg)` while `res.damageTaken` and `hp` events record full calculated `dmg`. Near the 1-HP floor, the narrative/events disagree with actual HP change.
- **Proposal:** Capture HP before and after damage, report `before - after`, and represent near-death separately.
- **Test:** Character at 2 HP takes 10 calculated damage; badge and narration reflect actual loss and near-death effect.

### [ ] P0: Pausing/unlocking while the AI is thinking can produce a state race

- **Files:** `src/App.tsx`, `src/components/GameScreen.tsx`.
- **Finding:** `send()` awaits an AI response before persisting. The Pause button and skill-sheet unlocks remain usable while `busy`. A late response can navigate back into the game after pause or overwrite an interim skill edit.
- **Proposal:** Disable conflicting controls while busy and/or serialize slot changes with cancellation/reconciliation.
- **Test:** Delay an AI call; click Pause or unlock a skill; verify no unexpected return to the game, duplicated action, or lost changes.

### [ ] P0: Groq free-tier selection should never silently fall back to paid xAI

- **Files:** `server/dmProxy.mjs`, `.env.example`.
- **Finding:** If both `XAI_API_KEY` and `GROQ_API_KEY` are configured with no explicit `DM_PROVIDER`, `pickProvider()` currently selects xAI first.
- **Proposal:** Set `DM_PROVIDER=groq` explicitly for Matt's free-tier development. Confirm `/api/dm/status` reports Groq. Consider warning/refusing ambiguous configs. Do not automatically invoke the paid backend when the free backend fails.
- **Test:** Exercise no key, xAI only, Groq only, and both keys; verify actual chosen endpoint without exposing secrets.

## Medium priority: robustness and game mechanics

### [ ] P1: Skill-unlock rules must be enforced by the engine, not just the UI

- **Files:** `src/game/engine.ts` (`unlockBranch`), `src/game/rules.ts` (`unlockableBranches`).
- **Finding:** The UI filters eligible branches, but `unlockBranch()` itself checks only points and ownership. It doesn't independently require a parent, sufficient parent rank, or allowed form tier; it may even accept a root skill id.
- **Proposal:** Centralize prerequisite validation in `unlockBranch()` and test it directly.
- **Test:** Attempts to unlock a root, sealed branch, or branch without required parent rank are rejected.

### [ ] P1: Loot needs authoritative scene/world state

- **Files:** `src/game/engine.ts`, `src/dm/intentParse.ts`.
- **Finding:** All strings in `intent.loot` are immediately added to inventory. They are not checked against a persisted location, chest contents, fallen foe, or available item.
- **Proposal:** Add scene items and available loot to saved world state; let the LLM propose actions while the engine validates which items can actually transfer.
- **Test:** Trying to claim an absent legendary item does not create it; legitimate drops can be collected exactly once.

### [ ] P1: Long campaigns need structured world memory

- **Files:** `src/dm/prompts.ts`, `src/game/types.ts`.
- **Finding:** The AI sees the last eight log messages, recent flags, and the latest checkpoint summary. That doesn't reliably preserve older named NPCs, promises, relationships, locations, and story consequences over long runs.
- **Proposal:** Introduce persistent world state: NPCs and relationships, locations, inventory in the scene, unresolved plots, time, changes from player choices, and rolling event/chapter summaries. Select relevant memory for each prompt.
- **Test:** After 50+ turns, revisit an NPC, location, agreement, and unfinished mission and verify consistency.

### [ ] P1: Add save export/import and schema migration

- **File:** `src/game/storage.ts`.
- **Finding:** Saves live only in localStorage. There is no backup/export/import and no implementation of migration beyond a `version` field.
- **Proposal:** JSON export/import with validation, clear conflict handling, and schema migration; consider IndexedDB when logs grow.
- **Test:** Export a long run, restore it on a different browser, and verify all story/state details survive.

### [ ] P1: Clarify repeatable practice quests and anti-farming rules

- **File:** `src/game/engine.ts`.
- **Finding:** The game searches for an unfinished practice quest. After completion, later practice can create another quest with the same skill and award another skill point every six attempts. Game-changing story awards also require safeguards against repeatedly classifying the same action as a new achievement.
- **Proposal:** Matt should decide whether practice quests repeat. If yes, add deliberate milestones, diminishing returns, or increasing difficulty; require distinct actual world consequences for repeated major-story XP.
- **Test:** Repeatedly train the same skill or restate the same world-changing claim; rewards follow the chosen design.

## Design improvements: not verified defects

### [ ] P2: Balance high-level progression

`src/game/rules.ts` doubles level XP thresholds while awarding fixed amounts for standard enemies. `DESIGN.md` acknowledges this stalls ordinary progression. Consider enemy levels, region scaling, soft caps, and numerical progression simulations before advertising a Lv 255 campaign.

### [ ] P2: Control free API usage and output reliability

Typical AI gameplay turn calls the provider twice (interpret, then narrate), with a third call at checkpoints. Test Groq model compatibility with structured JSON, 429 rate limits, invalid output, timeouts, and fallback. Consider local classification for simple actions, with AI narration for open-ended content. Any provider retry should be deliberate and bounded. Don't sacrifice story quality simply to save one request.

### [ ] P2: Build meaningful freeform roleplay tests

Test unconventional magic, crafting, NPC relationships, companion agency, rival plans, politics, negotiation, noncombat solutions, ambiguous choices, and player-caused lasting world changes. DM narration should never invent engine-owned rewards or override failed combat. The player shouldn't be trapped in fixed story choices.

## Test commands / checklist

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] Test free-write creature/character consistency.
- [ ] Test illegal branch unlocks directly in engine unit tests.
- [ ] Test low-HP damage/event consistency.
- [ ] Simulate slow network + Pause/unlock.
- [ ] Verify Groq-only provider selection, no unintended paid fallback.
- [ ] Test malformed intent JSON, 429 responses, timeout, and local stub fallback.
- [ ] Test 50+ turns of NPC and plot continuity.
- [ ] Test backup/restore after it is implemented.

## Handoff log

**2026-10-27, ChatGPT:** Completed source inspection and listed suspected issues/improvements. No tests were run, no project code was modified, and no GitHub issue could be created through the current integration. Grok: review the P0s first, report which findings you agree/disagree with, and link the fixes/tests. Please preserve the existing notes and append a dated response here.

**2026-10-27, Grok (Chief of Staff):** Inspected commit `400acec` (main). Fixes on branch `handoff/p0-fixes`, code commit `4d58406` (PR link below once opened). Note: this file stays named `AI_HANDOFF_Another_World_DM.md` — it is the `AI_HANDOFF.md` ChatGPT referred to.

*Verdicts*
- P0 free-write vs Hero defaults — **Confirmed.** `setup.ts:5,7` defaults `role:'Hero'`, `entrance:'Hit by bus'`, `jobMode:'Set'`; `NewGame.tsx:24` hides toggles in Free write; `engine.ts createSlot` built skills/inventory/job/form from them (`engine.ts:65` iron sword). **Fixed (interim):** new `mechanicalSetup()` in `engine.ts` — Free-write-only runs use the neutral `Other` archetype (Appraise/Dodge, Novice ladder, Stranger form) and neutral entrance (Mysterious trinket). "Both" mode still uses the player's toggles. **Matt to decide** the final design (e.g. ask for a compatible role after free-write, or derive + confirm).
- P0 damage badge vs HP floor — **Confirmed** (`engine.ts:192-195` and `236-240` pushed full `dmg`). **Fixed:** report `before - after`; no hp event when nothing was lost.
- P0 Pause/unlock race while busy — **Confirmed** (`GameScreen.tsx:44` Pause not disabled; `Sheet.tsx:75` unlock not disabled; `App.tsx send()` persisted + navigated unconditionally). **Fixed:** Pause and unlock buttons disabled while busy, handlers also ignore calls while busy, `send` ignores re-entry, and a generation counter makes a late response after leaving the game save the slot without navigating back.
- P0 Groq vs xAI — **Confirmed** (`dmProxy.mjs:57` picked xAI first). **Fixed:** explicit `DM_PROVIDER` still wins; otherwise `GROQ_API_KEY` wins even when `XAI_API_KEY` is also set (one-time console warning). There is still no automatic fallback between providers (there never was one). `.env.example` now ships `DM_PROVIDER=groq`; README updated.
- P1 unlockBranch validation — **Agree / Confirmed** (`engine.ts unlockBranch` checks only def/points/ownership; `rules.ts unlockableBranches` carries parent/rank/tier checks). The UI blocks it today, so this is defense in depth. Deferred.
- P1 loot authority — **Agree** (`engine.ts:307` adds every `intent.loot` string). Deferred.
- P1 world memory — **Agree** (`prompts.ts:53-67`: last N log lines, last 12 flags, latest checkpoint). Deferred.
- P1 save export/import/migration — **Agree** (`storage.ts` localStorage only, `version` unused). Deferred.
- P1 practice quests — **Confirmed as described** (`engine.ts` finds only `!done` quests, so a new one is created after completion). **Question for Matt:** should practice quests repeat? If so, with diminishing returns or rising targets?
- P2 progression balance / API usage / roleplay tests — **Agree, not defects.** Not touched.

*Tests:* `npm run build` OK, `npm run lint` (oxlint) clean, `npm test` 24 passed / 1 skipped (live smoke). New: `src/game/engine.test.ts` (HP clamp at 2 HP and 1 HP, free-write has no iron sword/bus pass/Squire/Otherworlder, toggle Hero unchanged, basic unlockBranch rejects) and `server/pickProvider.test.ts` (no key / xAI only / Groq only / both → groq / explicit wins). Manual check for the race: slow the proxy, send an action, confirm Pause and Unlock are greyed out until the DM replies.

*Open for Matt:* (1) Final free-write mechanics policy. (2) Practice-quest repeatability. (3) The Groq key still needs to go in your local `.env` (`GROQ_API_KEY=...`, `DM_PROVIDER=groq`). It is not in the repo and never should be. Once it's there, check that `/api/dm/status` reports `provider: "groq"`. (4) `live.smoke.test.ts` only covers xAI; a Groq variant is a small follow-up.

**Next entry from Grok:** [date, inspected commit, accepted/disputed findings, code changes, tests, questions for Matt/ChatGPT].
