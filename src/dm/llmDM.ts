// LLM-backed DM (xAI Grok via the local proxy in server/dmProxy.mjs — the key never reaches the browser).
// Proposes Intent + prose only; src/game/engine.ts still owns every number. Any failure falls back to
// StubDM for that call and surfaces a one-line notice in chat (once per outage).
import type { CheckpointOffer, SaveSlot } from '../game/types';
import { extractJson, INTENT_JSON_SCHEMA, parseIntent } from './intentParse';
import {
  beginChapterPrompt, checkpointPrompt, interpretPrompt, narratePrompt, openingPrompt, systemPrompt,
} from './prompts';
import type { DMProvider, DMTurn, Intent, Resolution } from './provider';
import { StubDM } from './stubDM';

export const DM_API_BASE = '/api/dm';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
interface ChatOpts { json?: boolean | { name: string; schema: unknown }; temperature?: number; max_tokens?: number }

export async function dmStatus(base = DM_API_BASE): Promise<{ configured: boolean; model?: string }> {
  try {
    const r = await fetch(`${base}/status`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { configured: false };
    const j = await r.json();
    return { configured: j?.configured === true, model: typeof j?.model === 'string' ? j.model : undefined };
  } catch {
    return { configured: false };
  }
}

const CHECKPOINT_SCHEMA = {
  type: 'object',
  required: ['title', 'summary', 'options'],
  properties: { title: { type: 'string' }, summary: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } },
};

export class LLMDM implements DMProvider {
  readonly id = 'llm';
  readonly label: string;
  private stub = new StubDM();
  private notice: string | null = null;
  private outageReported = false;
  private base: string;

  constructor(opts: { model?: string; base?: string } = {}) {
    this.base = opts.base ?? DM_API_BASE;
    this.label = `AI DM (xAI ${opts.model ?? 'Grok'})`;
  }

  /** Engine calls this after each DM step; returns a one-line error to show in chat, at most once per outage. */
  takeNotice(): string | null {
    const n = this.notice;
    this.notice = null;
    return n;
  }

  private fail(e: unknown) {
    console.warn('[LLMDM] falling back to stub:', e);
    if (this.outageReported) return;
    this.outageReported = true;
    const m = e instanceof Error ? e.message : String(e);
    this.notice = `⚠ AI DM unavailable (${m.slice(0, 140)}) — the stub DM is covering this turn.`;
  }

  private async chat(slot: SaveSlot, user: string, opts: ChatOpts = {}): Promise<string> {
    const messages: Msg[] = [{ role: 'system', content: systemPrompt(slot) }, { role: 'user', content: user }];
    const r = await fetch(`${this.base}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, ...opts }),
      signal: AbortSignal.timeout(60000),
    });
    let j: { content?: string; error?: string } = {};
    try { j = await r.json(); } catch { /* ignore */ }
    if (!r.ok || typeof j.content !== 'string') throw new Error(j.error || `proxy HTTP ${r.status}`);
    this.outageReported = false; // recovered: a later outage gets reported again
    return j.content;
  }

  private async prose(slot: SaveSlot, prompt: string, max_tokens = 600): Promise<string> {
    const t = (await this.chat(slot, prompt, { temperature: 0.85, max_tokens })).trim();
    if (!t) throw new Error('empty narrative');
    return t;
  }

  async openingScene(slot: SaveSlot): Promise<DMTurn> {
    try {
      return { narrative: await this.prose(slot, openingPrompt(slot), 800) };
    } catch (e) {
      this.fail(e);
      return this.stub.openingScene(slot);
    }
  }

  async interpret(slot: SaveSlot, input: string): Promise<Intent> {
    try {
      const raw = await this.chat(slot, interpretPrompt(slot, input), {
        json: { name: 'intent', schema: INTENT_JSON_SCHEMA }, temperature: 0.1, max_tokens: 500,
      });
      const intent = parseIntent(raw);
      if (intent) return intent;
      console.warn('[LLMDM] intent JSON invalid, using stub classifier:', raw.slice(0, 300));
    } catch (e) {
      this.fail(e);
    }
    return this.stub.interpret(slot, input);
  }

  async narrate(slot: SaveSlot, input: string, intent: Intent, res: Resolution): Promise<DMTurn> {
    try {
      return { narrative: await this.prose(slot, narratePrompt(slot, input, intent, res)) };
    } catch (e) {
      this.fail(e);
      return this.stub.narrate(slot, input, intent, res);
    }
  }

  async checkpoint(slot: SaveSlot): Promise<CheckpointOffer> {
    try {
      const raw = await this.chat(slot, checkpointPrompt(slot), { json: { name: 'checkpoint', schema: CHECKPOINT_SCHEMA }, temperature: 0.7, max_tokens: 500 });
      const j = extractJson(raw) as { title?: unknown; summary?: unknown; options?: unknown } | null;
      const options = Array.isArray(j?.options) ? j.options.filter((o): o is string => typeof o === 'string' && !!o.trim()).map((o) => o.trim().slice(0, 120)).slice(0, 4) : [];
      if (j && typeof j.summary === 'string' && options.length >= 2) {
        return {
          chapter: slot.chapter,
          title: typeof j.title === 'string' && j.title.trim() ? j.title.trim().slice(0, 80) : `End of Chapter ${slot.chapter}`,
          summary: `${j.summary.trim()} Pick a next chapter — or type your own.`,
          flags: slot.flags.slice(-6),
          options,
        };
      }
      console.warn('[LLMDM] checkpoint JSON invalid, using stub:', raw.slice(0, 300));
    } catch (e) {
      this.fail(e);
    }
    return this.stub.checkpoint(slot);
  }

  async beginChapter(slot: SaveSlot, choice: string): Promise<DMTurn> {
    // Same deterministic flag rule as the stub (client-owned state, not model-owned).
    const demon = /demon (lord|king)/i.test(choice) && !slot.flags.includes('demon-lord-defeated');
    try {
      const narrative = await this.prose(slot, beginChapterPrompt(slot, choice, demon));
      if (demon && !slot.flags.includes('demon-lord-confronted')) slot.flags.push('demon-lord-confronted');
      return { narrative };
    } catch (e) {
      this.fail(e);
      return this.stub.beginChapter(slot, choice); // stub applies the same flag itself
    }
  }
}
