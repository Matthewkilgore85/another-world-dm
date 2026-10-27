// Client-side game engine: authoritative over HP, XP, skills, inventory, job and form.
import type { DMProvider, Intent, Resolution } from '../dm/provider';
import {
  EVOLUTION_LINES, EVOLVE_LEVEL_STEP, HARD_CAP, LEARNABLE_BY_USE, MOB_THREAT, OPEN_JOB_BY_TAG,
  OPEN_JOB_SEED_THRESHOLD, JOB_LADDERS, SKILL_BY_ID, SOFT_STORY_CAP, STARTER_SKILLS,
  initialForm, initialJob, jobXpToNext, makeSkill, mobXp, nextRandom, practiceToRank, storyXp, xpToNext,
} from './rules';
import type { ChatMessage, GameEvent, GameSetup, LinkedRun, SaveSlot, Skill } from './types';

export const CHECKPOINT_EVERY = 5; // meaningful actions between fake checkpoints
export const PRACTICE_QUEST_TARGET = 6;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function msg(from: ChatMessage['from'], text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: uid(), from, text, ts: Date.now(), ...extra };
}

/**
 * Free-write-only runs hide the Role/Entrance toggles, so their defaults (Hero / Hit by bus) must not
 * drive mechanics that contradict the written premise (iron sword, Squire, Otherworlder form...).
 * Interim policy (pending Matt's call): use the neutral 'Other' archetype and a neutral entrance.
 */
export function mechanicalSetup(setup: GameSetup): GameSetup {
  if (setup.pathMode !== 'Free write') return setup;
  return { ...setup, role: 'Other', roleCustom: '', entrance: 'Other', entranceOther: '' };
}

export function createSlot(rawSetup: GameSetup, linked: LinkedRun | null): SaveSlot {
  const setup = mechanicalSetup(rawSetup);
  const role = setup.role;
  const now = Date.now();
  const starter = [...STARTER_SKILLS[role]];
  if (setup.powerMode === 'Open' && !starter.includes('mana_sense')) starter.push('mana_sense');
  return {
    version: 1,
    id: uid(),
    name: setup.slotName.trim() || 'Untitled run',
    createdAt: now,
    updatedAt: now,
    setup,
    character: {
      name: setup.characterName.trim() || 'Traveler',
      level: 1, xp: 0, totalXp: 0,
      hp: 20, maxHp: 20,
      skillPoints: 0,
      skills: starter.map(makeSkill),
      inventory: startingInventory(setup),
      job: initialJob(setup.jobMode, role),
      jobTagCounts: {},
      form: initialForm(role),
    },
    log: [],
    flags: linked ? [`linked:${linked.slotName}`] : [],
    chapter: 1,
    meaningfulActions: 0,
    actionsSinceCheckpoint: 0,
    streak: { kind: null, count: 0 },
    quests: [],
    linkedFrom: linked,
    pendingCheckpoint: false,
    rngSeed: Math.floor(Math.random() * 2 ** 31),
  };
}

function startingInventory(setup: GameSetup) {
  const items: { name: string; note?: string }[] = [];
  switch (setup.entrance) {
    case 'Hit by bus': items.push({ name: 'Cracked smartphone', note: '3% battery' }, { name: 'Bus pass' }); break;
    case 'Summoned by country': items.push({ name: 'Royal stipend', note: '50 silver' }, { name: 'Ceremonial blade' }); break;
    case 'Summoned by individual': items.push({ name: "Summoner's sigil", note: 'warm to the touch' }); break;
    case 'Reality glitch': items.push({ name: 'Flickering keycard', note: 'not from this world' }); break;
    case 'Reincarnation': items.push({ name: 'Swaddling cloth' }); break;
    default: items.push({ name: 'Mysterious trinket' });
  }
  if (setup.role === 'Hero') items.push({ name: 'Iron sword' });
  if (setup.role === 'Civilian') items.push({ name: 'Frying pan' });
  items.push({ name: 'Healing herb', note: '+8 HP' });
  return items.map((i) => ({ id: uid(), qty: 1, ...i }));
}

// ---------- event application ----------

function rand(slot: SaveSlot): number {
  const [r, seed] = nextRandom(slot.rngSeed);
  slot.rngSeed = seed;
  return r;
}

function addXp(slot: SaveSlot, amount: number, reason: string, ev: GameEvent[], res: Resolution) {
  const c = slot.character;
  if (c.level >= HARD_CAP) return;
  // Soft story cap: past ~99 the world stops handing out XP so freely.
  const amt = c.level >= SOFT_STORY_CAP ? Math.max(1, Math.round(amount * 0.5)) : amount;
  c.xp += amt;
  c.totalXp += amt;
  ev.push({ type: 'xp', amount: amt, reason });
  while (c.level < HARD_CAP && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level += 1;
    c.maxHp += 5;
    c.hp = c.maxHp;
    const sp = 1 + (c.level % 5 === 0 ? 1 : 0);
    c.skillPoints += sp;
    ev.push({ type: 'levelUp', level: c.level });
    ev.push({ type: 'skillPoints', amount: sp, reason: `Reached Lv ${c.level}` });
    res.leveledTo = c.level;
  }
}

function tickSkill(slot: SaveSlot, skill: Skill, amount: number, reason: string, ev: GameEvent[]) {
  skill.practice = Math.max(0, skill.practice + amount);
  if (amount !== 0) ev.push({ type: 'skillTick', skillId: skill.id, amount, reason });
  while (skill.practice >= practiceToRank(skill.rank)) {
    skill.practice -= practiceToRank(skill.rank);
    skill.rank += 1;
    ev.push({ type: 'skillRank', skillId: skill.id, rank: skill.rank });
  }
  const tag = skill.tags[0];
  if (tag && amount > 0) slot.character.jobTagCounts[tag] = (slot.character.jobTagCounts[tag] ?? 0) + 1;
}

function canLearnByUse(slot: SaveSlot, skillId: string): boolean {
  const def = SKILL_BY_ID[skillId];
  if (!def || def.tier > 0) return false; // branches need skill points
  if (slot.setup.powerMode === 'Open') return true;
  return LEARNABLE_BY_USE.includes(skillId);
}

function jobProgress(slot: SaveSlot, amount: number, ev: GameEvent[]) {
  const c = slot.character;
  if (slot.setup.jobMode === 'Off') return;
  if (!c.job && slot.setup.jobMode === 'Open') {
    const [tag, count] = Object.entries(c.jobTagCounts).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (tag && (count as number) >= OPEN_JOB_SEED_THRESHOLD) {
      c.job = { name: OPEN_JOB_BY_TAG[tag] ?? 'Wanderer', level: 1, xp: 0, ladderIndex: 0 };
      ev.push({ type: 'job', text: `Job seeded from how you play: ${c.job.name}` });
    }
  }
  if (!c.job) return;
  c.job.xp += amount;
  while (c.job.xp >= jobXpToNext(c.job.level)) {
    c.job.xp -= jobXpToNext(c.job.level);
    c.job.level += 1;
    ev.push({ type: 'job', text: `${c.job.name} → Job Lv ${c.job.level}` });
    if (slot.setup.jobMode === 'Set' && c.job.level % 5 === 0) {
      const ladder = JOB_LADDERS[slot.setup.role];
      if (c.job.ladderIndex < ladder.length - 1) {
        c.job.ladderIndex += 1;
        c.job.name = ladder[c.job.ladderIndex];
        ev.push({ type: 'job', text: `Class advancement: ${c.job.name}` });
      }
    }
  }
}

export function emptyResolution(): Resolution {
  return {
    hits: [], misses: [], stupid: [], reframes: [], killed: [], combatFailed: false, damageTaken: 0,
    healed: 0, leveledTo: null, learned: [], evolvedTo: null, mutatedTo: null, evolveBlockedReason: null, questCompleted: null,
  };
}

/** Resolve an intent against the rules. Mutates slot; returns events + resolution for narration. */
export function resolveIntent(slot: SaveSlot, intent: Intent): { events: GameEvent[]; res: Resolution } {
  const ev: GameEvent[] = [];
  const res = emptyResolution();
  const c = slot.character;
  const easy = slot.setup.difficulty === 'Easy';

  // --- skill uses ---
  let combatHit = false;
  let usedCombat = false;
  let usedStealth = false;
  for (const use of intent.skillUses) {
    let skill = c.skills.find((s) => s.id === use.skillId);
    if (!skill && canLearnByUse(slot, use.skillId)) {
      skill = makeSkill(use.skillId);
      skill.rank = 0;
      c.skills.push(skill);
      res.learned.push(skill.name);
      ev.push({ type: 'skillLearn', skillId: skill.id, name: skill.name });
    }
    if (use.reframedFrom) {
      res.reframes.push({ from: SKILL_BY_ID[use.reframedFrom]?.name ?? use.reframedFrom, to: SKILL_BY_ID[use.skillId]?.name ?? use.skillId });
    }
    if (!skill) {
      ev.push({ type: 'note', text: `You don't know ${SKILL_BY_ID[use.skillId]?.name ?? use.skillId} yet.` });
      continue;
    }
    if (skill.tier > c.form.skillTierCap) {
      ev.push({ type: 'note', text: `${skill.name} is out of reach in your current form (${c.form.name}).` });
      continue;
    }
    skill.uses += 1;
    const isCombat = skill.tags.includes('combat');
    if (isCombat) usedCombat = true;
    if (skill.tags.includes('stealth')) usedStealth = true;

    if (use.quality === 'stupid') {
      res.stupid.push(skill.name);
      tickSkill(slot, skill, -1, 'Misused', ev);
      const dmg = 2 + Math.floor(rand(slot) * 4);
      const before = c.hp;
      c.hp = Math.max(1, c.hp - dmg);
      const lost = before - c.hp;
      res.damageTaken += lost;
      if (lost > 0) ev.push({ type: 'hp', delta: -lost, reason: `Consequence of misusing ${skill.name}` });
      continue;
    }

    const chance = Math.min(0.95, 0.5 + 0.06 * skill.rank + (easy ? 0.15 : 0) + (use.quality === 'proper' ? 0.1 : 0));
    const hit = rand(slot) < chance;
    if (hit) res.hits.push(skill.name); else res.misses.push(skill.name);
    if (hit && isCombat) combatHit = true;

    if (intent.practice) {
      // Practice seeds a silent quest; only ~half the ticks count as real rank progress.
      let q = slot.quests.find((x) => x.skillId === skill!.id && !x.done);
      if (!q) {
        q = { id: uid(), skillId: skill.id, name: `Diligence: ${skill.name}`, progress: 0, target: PRACTICE_QUEST_TARGET, silent: true, done: false };
        slot.quests.push(q);
      }
      q.progress += 1;
      if (q.progress % 2 === 0) tickSkill(slot, skill, 1, 'Practice (counts)', ev);
      else ev.push({ type: 'note', text: `${skill.name} practice… something is building.` });
      if (q.progress >= q.target) {
        q.done = true;
        q.silent = false;
        c.skillPoints += 1;
        res.questCompleted = q.name;
        ev.push({ type: 'quest', text: `Hidden quest complete: ${q.name}` });
        ev.push({ type: 'skillPoints', amount: 1, reason: q.name });
      }
    } else {
      // +1 even on a miss (learnable); proper use earns extra.
      const amt = 1 + (hit && use.quality === 'proper' ? 1 : 0);
      tickSkill(slot, skill, amt, hit ? (use.quality === 'proper' ? 'Proper use' : 'Used') : 'Missed, still learned', ev);
    }
  }

  // --- kills ---
  if (intent.kills.length) {
    // No skill named? Resolve a raw attack.
    const attempted = usedCombat ? combatHit || rand(slot) < 0.4 : rand(slot) < (easy ? 0.75 : 0.6);
    const threat = intent.kills.reduce((a, k) => a + (MOB_THREAT[k.mob] ?? 3) * k.count, 0);
    const levelEdge = c.level * 4;
    const success = attempted && threat <= levelEdge + 6 + Math.floor(rand(slot) * 8);
    const dmg = Math.max(0, Math.round(threat * (success ? 0.4 : 1) * (easy ? 0.6 : 1) * (0.5 + rand(slot))));
    if (dmg > 0) {
      const before = c.hp;
      c.hp = Math.max(easy ? 1 : 0, c.hp - dmg);
      const lost = before - c.hp;
      res.damageTaken += lost;
      if (lost > 0) ev.push({ type: 'hp', delta: -lost, reason: success ? 'Took hits in the fight' : 'Beaten back' });
    }
    if (success) {
      const prevKind = slot.streak.kind;
      const kind = usedStealth ? 'stealth' : 'combo';
      slot.streak = { kind, count: prevKind === kind ? slot.streak.count + 1 : 0 };
      for (const k of intent.kills) {
        const amt = mobXp(k.mob, k.count, slot.streak, slot.setup.difficulty);
        const streakNote = slot.streak.count > 0 ? ` (${slot.streak.kind} ×${slot.streak.count})` : '';
        addXp(slot, amt, `${k.count}× ${k.mob}${streakNote}`, ev, res);
        res.killed.push(k);
      }
      jobProgress(slot, intent.kills.reduce((a, k) => a + k.count, 0), ev);
    } else {
      res.combatFailed = true;
      slot.streak = { kind: null, count: 0 };
    }
    if (c.hp <= 0) {
      c.hp = 1;
      slot.flags.push('near-death');
      ev.push({ type: 'flag', flag: 'near-death' });
      ev.push({ type: 'note', text: 'You collapse — and wake later, barely alive. (No game over in this prototype.)' });
    }
  } else if (usedStealth && res.hits.length) {
    slot.streak = { kind: 'stealth', count: slot.streak.kind === 'stealth' ? slot.streak.count + 1 : 0 };
  } else if (intent.meaningful && !usedCombat) {
    slot.streak = { kind: null, count: 0 };
  }

  // --- story weight ---
  if (intent.storyWeight !== 'none') {
    addXp(slot, storyXp(c.level, intent.storyWeight, slot.setup.difficulty), intent.storyReason ?? (intent.storyWeight === 'game-changing' ? 'Game-changing action' : 'Important action'), ev, res);
    if (intent.storyWeight === 'game-changing') {
      c.skillPoints += 1;
      ev.push({ type: 'skillPoints', amount: 1, reason: 'Changed the course of the story' });
    }
    jobProgress(slot, intent.storyWeight === 'game-changing' ? 3 : 1, ev);
  } else if (intent.meaningful) {
    jobProgress(slot, 1, ev);
  }

  // --- rest / loot ---
  if (intent.rest) {
    const herb = c.inventory.find((i) => i.name === 'Healing herb' && i.qty > 0);
    let heal = Math.ceil(c.maxHp * 0.3);
    if (herb && c.hp < c.maxHp) { herb.qty -= 1; heal += 8; ev.push({ type: 'item', name: 'Healing herb', qty: -1 }); }
    const before = c.hp;
    c.hp = Math.min(c.maxHp, c.hp + heal);
    res.healed = c.hp - before;
    if (res.healed) ev.push({ type: 'hp', delta: res.healed, reason: 'Rest' });
    c.inventory = c.inventory.filter((i) => i.qty > 0);
  }
  for (const name of intent.loot) {
    const existing = c.inventory.find((i) => i.name === name);
    if (existing) existing.qty += 1; else c.inventory.push({ id: uid(), name, qty: 1 });
    ev.push({ type: 'item', name, qty: 1 });
  }

  // --- evolution / mutation ---
  const line = EVOLUTION_LINES[slot.setup.role];
  if (intent.evolve) {
    const needed = (c.form.stage + 1) * EVOLVE_LEVEL_STEP;
    if (c.form.line === 'mutation' && c.form.permanent) {
      res.evolveBlockedReason = 'Your forced mutation has rewritten your line; the old evolution path is gone.';
    } else if (c.form.stage >= line.length - 1) {
      res.evolveBlockedReason = 'You are at the peak of this line. Only a mutation could fork it now.';
    } else if (c.level < needed) {
      res.evolveBlockedReason = `Your body isn't ready (needs Lv ${needed}).`;
    } else {
      c.form.stage += 1;
      c.form.name = c.form.line === 'mutation' ? `${c.form.name.split(' ')[0]} ${line[c.form.stage]}` : line[c.form.stage];
      if (c.form.line === 'origin') c.form.line = 'evolution';
      c.form.skillTierCap += 1;
      c.form.history.push(c.form.name);
      c.maxHp += 10; c.hp = c.maxHp;
      res.evolvedTo = c.form.name;
      ev.push({ type: 'form', text: `Evolved → ${c.form.name} (growth along your line; skill access +1 tier)` });
    }
  }
  if (intent.mutate) {
    const kind = intent.mutate.kind;
    c.form.line = 'mutation';
    c.form.name = `${kind} ${line[c.form.stage]}`;
    c.form.history.push(c.form.name);
    if (intent.mutate.forced) {
      c.form.permanent = true;
      c.form.skillTierCap = Math.max(0, c.form.skillTierCap - 2); // shape-loss devolves access toward base
      ev.push({ type: 'form', text: `Forced mutation → ${c.form.name}. Permanent. Advanced techniques sealed; base skills remain.` });
    } else {
      ev.push({ type: 'form', text: `Mutation → ${c.form.name}. Your line forks; base tools kept as add-ons.` });
    }
    res.mutatedTo = c.form.name;
    slot.flags.push(`mutation:${kind}`);
  }

  for (const f of intent.flags) if (!slot.flags.includes(f)) { slot.flags.push(f); ev.push({ type: 'flag', flag: f }); }

  if (intent.meaningful) {
    slot.meaningfulActions += 1;
    slot.actionsSinceCheckpoint += 1;
  }
  return { events: ev, res };
}

/** Spend skill points on a branch. Branches are added beside the base, never replacing it. */
export function unlockBranch(slot: SaveSlot, skillId: string): GameEvent[] {
  const def = SKILL_BY_ID[skillId];
  const c = slot.character;
  const cost = def?.cost ?? 1;
  if (!def || c.skillPoints < cost || c.skills.some((s) => s.id === skillId)) return [];
  c.skillPoints -= cost;
  c.skills.push(makeSkill(skillId));
  return [{ type: 'skillLearn', skillId, name: def.name }, { type: 'skillPoints', amount: -cost, reason: `Unlocked ${def.name}` }];
}

// ---------- turn orchestration ----------

function pushNotice(s: SaveSlot, dm: DMProvider) {
  const n = dm.takeNotice?.();
  if (n) s.log.push(msg('system', n));
}

export async function startGame(slot: SaveSlot, dm: DMProvider): Promise<SaveSlot> {
  const s = structuredClone(slot);
  const open = await dm.openingScene(s);
  pushNotice(s, dm);
  s.log.push(msg('dm', open.narrative, { events: [] }));
  if (open.suggestions?.length) s.log.push(msg('system', 'Try: ' + open.suggestions.join(' · ')));
  s.updatedAt = Date.now();
  return s;
}

export async function playTurn(slot: SaveSlot, input: string, dm: DMProvider): Promise<SaveSlot> {
  const s = structuredClone(slot);
  const text = input.trim();
  if (!text) return s;
  s.log.push(msg('player', text));

  if (s.pendingCheckpoint) {
    // Player picked a next chapter (button) or typed their own.
    const offerMsg = [...s.log].reverse().find((m) => m.checkpoint && !m.checkpointResolved);
    if (offerMsg) offerMsg.checkpointResolved = true;
    s.pendingCheckpoint = false;
    s.chapter += 1;
    s.actionsSinceCheckpoint = 0;
    const flag = `ch${s.chapter}:${text.slice(0, 48)}`;
    s.flags.push(flag);
    if (/demon (lord|king)|overlord|calamity/i.test(text)) s.flags.push('demon-lord-arc');
    const turn = await dm.beginChapter(s, text);
    pushNotice(s, dm);
    s.log.push(msg('dm', turn.narrative, { events: [{ type: 'flag', flag }] }));
    s.updatedAt = Date.now();
    return s;
  }

  const intent = await dm.interpret(s, text);
  const { events, res } = resolveIntent(s, intent);
  const turn = await dm.narrate(s, text, intent, res);
  pushNotice(s, dm);
  s.log.push(msg('dm', turn.narrative, { events }));

  if (s.actionsSinceCheckpoint >= CHECKPOINT_EVERY) {
    const offer = await dm.checkpoint(s);
    pushNotice(s, dm);
    s.pendingCheckpoint = true;
    s.log.push(msg('system', offer.summary, { checkpoint: offer }));
  }
  s.updatedAt = Date.now();
  return s;
}
