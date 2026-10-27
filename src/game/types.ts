// Core data models for Another World DM.
// These are provider-agnostic: the DM layer (stub or LLM) proposes, the client engine owns state.

export type Gender = 'Male' | 'Female' | 'Non-binary' | 'Custom';
export type Entrance =
  | 'Hit by bus'
  | 'Summoned by country'
  | 'Summoned by individual'
  | 'Reality glitch'
  | 'Reincarnation'
  | 'Other';
export type Role = 'Hero' | 'Villain' | 'Battle creature' | 'Pet' | 'Civilian' | 'Custom race' | 'Other';
export type Companions = 'Alone' | 'You + one' | 'Whole class' | 'Custom';
export type Tone = 'Heroic' | 'Grimdark' | 'Comedic' | 'Cozy' | 'Intrigue' | 'Horror' | 'Custom';
export type Difficulty = 'Easy' | 'Normal';
export type PowerMode = 'Set' | 'Open';
export type JobMode = 'Off' | 'Set' | 'Open';
export type PathMode = 'Toggles' | 'Free write' | 'Both';

export interface GameSetup {
  slotName: string;
  characterName: string;
  linkedSlotId: string | null;
  pathMode: PathMode;
  freeWrite: string; // fills gaps / overrides toggles
  gender: Gender;
  genderCustom: string;
  entrance: Entrance;
  entranceOther: string;
  role: Role;
  roleCustom: string;
  companions: Companions;
  companionsCustom: string;
  tone: Tone;
  toneCustom: string;
  nsfw: boolean;
  ageConfirmed: boolean; // age-gate stub
  difficulty: Difficulty;
  powerMode: PowerMode;
  jobMode: JobMode;
}

export interface Skill {
  id: string;
  name: string;
  rootId: string; // base skill of its tree (Slash for Blazing Slash). Basics are never overwritten.
  parentId: string | null;
  tier: number; // 0 = base
  rank: number;
  practice: number; // ticks toward next rank
  uses: number;
  learnable: boolean;
  tags: string[];
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  note?: string;
}

export interface Job {
  name: string;
  level: number;
  xp: number;
  ladderIndex: number; // for Set mode
}

export type FormLine = 'origin' | 'evolution' | 'mutation';

export interface Form {
  name: string;
  line: FormLine;
  stage: number;
  skillTierCap: number; // devolved forms restrict access toward base skills
  permanent: boolean; // forced mutation / shape-loss is permanent
  history: string[];
}

export interface Character {
  name: string;
  level: number;
  xp: number; // xp into current level
  totalXp: number;
  hp: number;
  maxHp: number;
  skillPoints: number; // separate from level XP
  skills: Skill[];
  inventory: Item[];
  job: Job | null;
  jobTagCounts: Record<string, number>; // Open job seeding
  form: Form;
}

export interface PracticeQuest {
  id: string;
  skillId: string;
  name: string;
  progress: number;
  target: number;
  silent: boolean; // hidden from the player until complete
  done: boolean;
}

export interface Streak {
  kind: 'combo' | 'stealth' | null;
  count: number;
}

export type GameEvent =
  | { type: 'xp'; amount: number; reason: string }
  | { type: 'levelUp'; level: number }
  | { type: 'skillTick'; skillId: string; amount: number; reason: string }
  | { type: 'skillRank'; skillId: string; rank: number }
  | { type: 'skillLearn'; skillId: string; name: string }
  | { type: 'skillPoints'; amount: number; reason: string }
  | { type: 'hp'; delta: number; reason: string }
  | { type: 'item'; name: string; qty: number }
  | { type: 'flag'; flag: string }
  | { type: 'job'; text: string }
  | { type: 'form'; text: string }
  | { type: 'quest'; text: string }
  | { type: 'note'; text: string };

export interface CheckpointOffer {
  chapter: number;
  title: string;
  summary: string;
  flags: string[];
  options: string[]; // 2–4 next rational chapters
}

export interface ChatMessage {
  id: string;
  from: 'dm' | 'player' | 'system';
  text: string;
  ts: number;
  events?: GameEvent[];
  checkpoint?: CheckpointOffer;
  checkpointResolved?: boolean;
}

export interface LinkedRun {
  slotId: string;
  slotName: string;
  characterName: string;
  level: number;
  summary: string;
  flags: string[];
}

export interface SaveSlot {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  setup: GameSetup;
  character: Character;
  log: ChatMessage[];
  flags: string[];
  chapter: number;
  meaningfulActions: number;
  actionsSinceCheckpoint: number;
  streak: Streak;
  quests: PracticeQuest[];
  linkedFrom: LinkedRun | null; // read-only snapshot; stories never mix otherwise
  pendingCheckpoint: boolean;
  rngSeed: number;
}

export interface SlotSummary {
  id: string;
  name: string;
  characterName: string;
  role: string;
  level: number;
  chapter: number;
  updatedAt: number;
  linkedFromName: string | null;
}
