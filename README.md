# Another World DM (working name)

Web prototype of a long-form isekai / RPG text adventure. Freeform typed actions, an **AI DM** (xAI Grok, via a
tiny local proxy) with an offline **stub DM** fallback, client-owned character sheet, multiple isolated save slots,
and chapter checkpoints.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env      # then edit .env:  XAI_API_KEY=xai-...
npm run dev
```

Open http://localhost:5173. (`npm run dev -- --host` to reach it from a phone on the same network.)

`npm run dev` starts two processes: Vite (:5173) and the DM proxy `server/dmProxy.mjs` (:5174). Vite forwards
`/api/*` to the proxy, which adds the `Authorization: Bearer $XAI_API_KEY` header and calls
`https://api.x.ai/v1/chat/completions`. **The key is only read by the proxy (env or `.env`) and never reaches the
browser bundle.** `.env` is gitignored; only `.env.example` is committed.

- No key? The app still boots and plays on the stub DM. The play screen shows a badge: **DM: AI** or **DM: Stub**.
- API error mid-game? That turn falls back to the stub and a one-line ⚠ notice appears in chat (once per outage).
- Model: `grok-4.3` with `reasoning_effort: none` (fast/cheap chat) by default. Override with `XAI_MODEL` /
  `XAI_REASONING_EFFORT` in `.env` (e.g. `XAI_MODEL=grok-4.7`). `DM_PROXY_PORT` changes the proxy port.
- **Groq Cloud alternative:** set `GROQ_API_KEY=gsk_...` in `.env` (free key at console.groq.com). Default model
  `llama-3.1-8b-instant`; override with `GROQ_MODEL=llama-3.3-70b-versatile`. Pick explicitly with
  `DM_PROVIDER=xai|groq`; otherwise Groq (free tier) is used if `GROQ_API_KEY` is set — even when `XAI_API_KEY` is also set (a warning is logged) — else xAI if only `XAI_API_KEY` is set, else the stub. There is no automatic fallback to paid xAI.
  The in-game badge shows `DM: AI (xAI)`, `DM: AI (Groq)` or `DM: Stub`.
- Proxy endpoints: `GET /api/dm/status` → `{ configured, provider, model }`; `POST /api/dm/chat` `{ messages, json? }` → `{ content }`.

Other scripts: `npm run build` (type-check + production build), `npm run preview` (proxy + vite preview),
`npm run lint`, `npm test` (unit/smoke tests, no network), `npm run test:live` (one real xAI call: spider-premise
opening scene; skipped unless `XAI_API_KEY` is exported), `npm run dev:vite` / `npm run dev:proxy` individually.

## What's in it

- **Title / save select** – list of slots (name, character, role, Lv, chapter, linked-from), continue or delete.
- **New Game** – slot name, character name, link to previous run, Path (Toggles / Free write / Both), Main character,
  Entrance, Role, Who came with you, Tone, NSFW (with 18+ age-gate stub), Difficulty (Normal default),
  Power mode (Set/Open), Jobs (Off/Set/Open), soft-spine note.
- **In-run** – chat log with event chips (XP, skill ticks, HP, items, flags), checkpoint cards with 2–4 next-chapter
  options (or type your own), sheet sidebar (Lv/XP, HP, skill points, job, form, skill trees with branch unlocks,
  inventory, revealed quests, story flags). On mobile the sheet is a slide-over (tap the Lv/HP pill).
- **Pause** – autosaves and returns to save select. Switch game = Pause → pick another slot.

## Try these actions

- `I attack the slime with my sword` / `I slash at three goblins` – mob XP (slime 1, goblin 5, group = base × count, combo streaks)
- `I threaten the merchant with my sword` – Slash reframed as Intimidate (learned by use)
- `I practice slash on a training dummy` (repeat) – silent practice quest, ~half ticks count as real ranks
- `I sneak quietly through the shadows` – Stealth learned by use, stealth streak
- `I lick my sword and slash myself` – stupid use: −1 tick + HP consequence
- `I swear to protect the village` / `I betray the king` – important / game-changing XP (+SP)
- `I loot the bodies`, `I rest at camp`, `I evolve`, `I touch the rune` (mutation), `cursed, I am forced to mutate`
- After 5 meaningful actions a checkpoint appears.

## Layout

```
src/
  game/types.ts     data models (SaveSlot, Character, Skill, Form, Job, events, checkpoints)
  game/rules.ts     locked mechanics as data + pure functions (XP curve, mob table, skill trees, jobs, forms)
  game/engine.ts    authoritative client engine: resolves intents, applies XP/HP/skills/items, runs turns
  game/storage.ts   localStorage save slots (one key per slot)
  game/setup.ts     New Game defaults
  dm/provider.ts    DMProvider interface (interpret → engine resolves → narrate; checkpoint; beginChapter)
  dm/stubDM.ts      offline heuristic classifier + template narrator (fallback)
  dm/llmDM.ts       xAI-backed DM: JSON Intent via the proxy, prose narration, stub fallback per call
  dm/prompts.ts     system prompt + context (setup, sheet, flags, chapter, last 8 log lines)
  dm/intentParse.ts validates model JSON into an Intent (unknown skills dropped, counts clamped)
  dm/index.ts       getDM() – LLMDM if /api/dm/status says configured, else StubDM
server/dmProxy.mjs  zero-dependency Node proxy that holds the xAI key
scripts/dev.mjs     runs proxy + vite together
  components/       TitleScreen, NewGame, GameScreen, Sheet, Segmented
```

See **DESIGN.md** for the locked mechanics and how to wire a real LLM.
