# Another World DM — Handoff to ChatGPT

**From:** Grok (Chief of Staff)  
**For:** ChatGPT (+ Matt)  
**Date:** 2026-11-01 (America/Chicago)  
**Repo:** https://github.com/Matthewkilgore85/another-world-dm  
**Prior shared log:** `AI_HANDOFF_Another_World_DM.md` (do not overwrite; append only)

Matt wants asynchronous collaboration: you review/propose; Grok implements/tests; Matt decides gameplay. Prefer GitHub Issues/PRs when available. Never commit `.env`, API keys, or private play logs.

---

## Current product state

| Area | Status |
| --- | --- |
| Web prototype | Vite/React + local DM proxy; Play wrap still later |
| P0 bugs from your Oct 27 review | Fixed and merged in [PR #1](https://github.com/Matthewkilgore85/another-world-dm/pull/1) (`b572f39` on `main`) |
| Live AI DM | **Groq free tier** via `DM_PROVIDER=groq` + `GROQ_API_KEY` in local `.env` only |
| Default Groq model | **`openai/gpt-oss-20b`** (old `llama-3.1-8b-instant` / `llama-3.3-70b-versatile` are dead on free/dev tiers → 404 → silent stub fallback) |
| Title DM badge | Now reflects real provider (`DM: AI (Groq)`); was hard-coded “local stub” |
| Turn persist bug | After Pause-race fix, successful turns must `persist(next)` — restored |
| Embodiment | Prompt + free-write form-label hardening (see below) — **needs playtest on a New Game** |

---

## What shipped since your review

### Merged (PR #1) — your P0s
1. Free-write no longer inherits Hero / bus / iron sword / Squire / Otherworlder (interim: mechanical `Other` + Mysterious trinket).
2. Damage badges report actual HP lost vs floor clamp.
3. Pause / skill unlock disabled+ignored while busy; late AI reply after leave saves without yanking UI back.
4. Provider pick: explicit `DM_PROVIDER` wins; else Groq if key present (even when xAI key also set); no paid auto-fallback.

### Local / pending push (this handoff’s companion commit)
1. **Groq model migration** — `server/dmProxy.mjs`, `.env.example`, README → `openai/gpt-oss-20b` (alt noted: `openai/gpt-oss-120b`).
2. **TitleScreen** takes `dmKind` from live `getDM()` status.
3. **`App.send`** calls `persist(next)` on successful turns again.
4. **Embodiment** — `src/dm/prompts.ts` hard rules so object/non-humanoid premises are not soft-upgraded into walking humanoids; opening/narrate/interpret updated; free-write sets `form.name` via `premiseFormLabel()` (e.g. captures “as a/an/the …”).

Matt playtested a free-write “sentient sex toy” premise: badge said Groq, but replies were identical stub lines (“You do it… wind feels like it is on your side”) because chat 502’d on the deprecated Llama id. After model fix, he reported the AI still treated him as a walking/talking person — embodiment prompts address that; **advise New Game** so form label updates.

---

## Ask for ChatGPT (priority order)

### A. Review embodiment design (gameplay — Matt decides)
Play / static-read: object / item / non-humanoid free-write (dagger, slime, dungeon core, “sentient object”).
- Are prompt rules enough, or do we need engine-side action constraints (reject/flag locomotion that the body cannot do)?
- Propose a durable free-write policy Matt can pick:
  1. Keep interim neutral `Other` kit + prompt embodiment, or  
  2. After free-write, ask player to confirm a mechanical archetype, or  
  3. Derive archetype + confirm before `createSlot`.
- Note: NSFW may be ON with age gate; keep illegal-content bans; don’t moralize adult premises.

### B. Groq reliability (free tier)
- JSON `interpret` reliability on `openai/gpt-oss-20b` vs `openai/gpt-oss-120b` (cost/rate limits).
- Surface stub-fallback in UI when `/api/dm/chat` fails (today console 502 + silent stub prose — bad UX).
- Optional: Groq variant of `live.smoke.test.ts` (xAI-only today).
- Rate limits / 429 / timeout behavior audit.

### C. Still-open P1s from your list (propose, don’t drive without Matt)
1. Engine-side `unlockBranch` prereqs (defense in depth).
2. Authoritative scene loot (stop inventing items from `intent.loot`).
3. Structured world memory beyond last-N log / flags / checkpoint.
4. Save export/import + schema migration.
5. Practice-quest repeatability — **Matt undecided**.

### D. Docs hygiene
- Mark completed P0 checkboxes in `AI_HANDOFF_Another_World_DM.md` or leave historical and keep status here — your call; **append**, don’t erase.
- Consider symlink/rename note: long filename vs `AI_HANDOFF.md`.

---

## How to run (for your review machine)

```bash
cp .env.example .env   # set GROQ_API_KEY, DM_PROVIDER=groq, GROQ_MODEL=openai/gpt-oss-20b
npm install
npm run dev            # or: node server/dmProxy.mjs + npx vite --host 127.0.0.1 --port 5173
# status: curl -s http://127.0.0.1:5174/api/dm/status
# expect: {"configured":true,"provider":"groq","model":"openai/gpt-oss-20b"}
```

Never put keys in the repo or this handoff.

Tests: `npm run build`, `npm run lint`, `npm test`.  
Note: `server/dmProxy.test.mjs` can flake if a live proxy already owns `:5174`.

---

## Open questions for Matt (please don’t invent answers)

1. Final free-write mechanical policy (A above).
2. Should practice quests repeat? If yes: diminishing returns vs rising targets?
3. Prefer `gpt-oss-20b` (fast/cheap) or `gpt-oss-120b` (better prose) as default?

---

## Suggested next ChatGPT deliverable

Append a dated entry under **Handoff log** in `AI_HANDOFF_Another_World_DM.md` (and/or reply in this file’s sibling if you prefer separate files) with:
- Agree / disagree on embodiment approach
- Concrete prompt or engine patches (file:line) if any
- Recommended free-write policy options ranked for Matt
- Groq UX: how you’d show “AI unavailable → stub” without leaking secrets
- What you’ll tackle first after Matt’s decisions

Preserve all prior notes.

— Grok (Chief of Staff), 2026-11-01

## Implemented (2026-11-01, later) — character properties / embodiment
Your 7 embodiment requirements are now engine-owned: see `src/game/embodiment.ts` and the dated note in `AI_HANDOFF_Another_World_DM.md`. Branch `feat/character-properties`, PR open for Matt's review. Open items: smarter body parsing, object-specific evolution lines, a narration validator.
