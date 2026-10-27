// The DM provider contract. The stub implements it locally; a real LLM provider can be
// dropped in later (see DESIGN.md). Providers PROPOSE (intent + prose); the client engine
// in src/game/engine.ts DISPOSES (rolls, XP math, HP, inventory, sheet).
import type { CheckpointOffer, SaveSlot } from '../game/types';

export type StoryWeight = 'none' | 'important' | 'game-changing';
export type UseQuality = 'proper' | 'normal' | 'stupid';

export interface SkillUseIntent {
  skillId: string;
  quality: UseQuality;
  reframedFrom?: string; // e.g. a threat with Slash -> Intimidate
  target?: string;
}

/** Structured read of what the player typed. An LLM would return this as JSON (tool call). */
export interface Intent {
  meaningful: boolean;
  kills: { mob: string; count: number }[];
  skillUses: SkillUseIntent[];
  practice: boolean;
  storyWeight: StoryWeight;
  storyReason?: string;
  rest: boolean;
  loot: string[];
  evolve: boolean;
  mutate: { kind: string; forced: boolean } | null;
  flags: string[];
  friendlyTarget: string | null;
}

/** What the engine actually resolved; fed back to the narrator so prose matches numbers. */
export interface Resolution {
  hits: string[]; // skill names that landed
  misses: string[];
  stupid: string[];
  reframes: { from: string; to: string }[];
  killed: { mob: string; count: number }[];
  combatFailed: boolean;
  damageTaken: number;
  healed: number;
  leveledTo: number | null;
  learned: string[];
  evolvedTo: string | null;
  mutatedTo: string | null;
  evolveBlockedReason: string | null;
  questCompleted: string | null;
}

export interface DMTurn {
  narrative: string;
  suggestions?: string[];
}

export interface DMProvider {
  readonly id: string;
  readonly label: string;
  openingScene(slot: SaveSlot): Promise<DMTurn>;
  interpret(slot: SaveSlot, input: string): Promise<Intent>;
  narrate(slot: SaveSlot, input: string, intent: Intent, res: Resolution): Promise<DMTurn>;
  checkpoint(slot: SaveSlot): Promise<CheckpointOffer>;
  beginChapter(slot: SaveSlot, choice: string): Promise<DMTurn>;
  /** Optional one-line status/error to show in chat after a DM step (e.g. LLM fell back to stub). */
  takeNotice?(): string | null;
}
