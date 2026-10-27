import type { ReactNode } from 'react';
import { HARD_CAP, SKILL_BY_ID, SOFT_STORY_CAP, jobXpToNext, practiceToRank, unlockableBranches, xpToNext } from '../game/rules';
import type { SaveSlot, Skill } from '../game/types';

function Bar({ value, max, kind }: { value: number; max: number; kind: 'hp' | 'xp' | 'job' }) {
  const pct = max === Infinity ? 100 : Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={`bar ${kind}`}><div style={{ width: `${pct}%` }} /></div>;
}

function fmt(n: number) {
  return n >= 1e9 ? n.toExponential(2) : n.toLocaleString();
}

export function Sheet({ slot, onUnlock }: { slot: SaveSlot; onUnlock: (id: string) => void }) {
  const c = slot.character;
  const next = xpToNext(c.level);
  const roots = c.skills.filter((s) => s.parentId === null || !c.skills.some((p) => p.id === s.parentId));
  const children = (id: string) => c.skills.filter((s) => s.parentId === id);
  const branches = unlockableBranches(c.skills, c.form);
  const visibleQuests = slot.quests.filter((q) => !q.silent);

  const renderSkill = (s: Skill, depth: number): ReactNode => {
    const locked = s.tier > c.form.skillTierCap;
    return (
      <li key={s.id} style={{ marginLeft: depth * 14 }} className={locked ? 'locked' : ''}>
        <div className="skill-row">
          <span>{depth > 0 && '↳ '}{s.name}</span>
          <span className="rank">R{s.rank}</span>
        </div>
        <Bar value={s.practice} max={practiceToRank(s.rank)} kind="job" />
        {locked && <span className="hint">sealed by form</span>}
        {children(s.id).length > 0 && <ul>{children(s.id).map((ch) => renderSkill(ch, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <aside className="sheet">
      <div className="sheet-head">
        <h3>{c.name}</h3>
        <span className="muted">{slot.setup.role === 'Custom race' || slot.setup.role === 'Other' ? slot.setup.roleCustom || slot.setup.role : slot.setup.role} · {c.form.name}</span>
      </div>

      <div className="stat">
        <div className="stat-row"><b>Lv {c.level}</b><span className="muted">soft {SOFT_STORY_CAP} / cap {HARD_CAP}</span></div>
        <Bar value={c.xp} max={next} kind="xp" />
        <div className="stat-row small"><span>XP {fmt(c.xp)} / {fmt(next)}</span><span>total {fmt(c.totalXp)}</span></div>
      </div>

      <div className="stat">
        <div className="stat-row"><b>HP</b><span>{c.hp} / {c.maxHp}</span></div>
        <Bar value={c.hp} max={c.maxHp} kind="hp" />
      </div>

      <div className="stat-row"><b>Skill points</b><span className="pill">{c.skillPoints}</span></div>

      <div className="stat">
        <div className="stat-row"><b>Job</b><span>{slot.setup.jobMode === 'Off' ? 'Off' : c.job ? `${c.job.name} · Job Lv ${c.job.level}` : 'Unseeded (Open)'}</span></div>
        {c.job && <Bar value={c.job.xp} max={jobXpToNext(c.job.level)} kind="job" />}
      </div>

      <div className="stat-row small"><span>Form line</span><span>{c.form.line}{c.form.permanent ? ' (permanent)' : ''} · tier cap {c.form.skillTierCap}</span></div>
      {slot.streak.kind && slot.streak.count > 0 && <div className="stat-row small"><span>Streak</span><span>{slot.streak.kind} ×{slot.streak.count}</span></div>}

      <h4>Skills</h4>
      <ul className="skills">{roots.map((r) => renderSkill(r, 0))}</ul>

      {branches.length > 0 && (
        <>
          <h4>Branches available</h4>
          <ul className="branches">
            {branches.map((b) => (
              <li key={b.id}>
                <span>{b.name} <span className="muted">from {SKILL_BY_ID[b.parentId!].name}</span></span>
                <button className="btn small" disabled={c.skillPoints < (b.cost ?? 1)} onClick={() => onUnlock(b.id)}>
                  Unlock ({b.cost ?? 1} SP)
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Inventory</h4>
      <ul className="inv">
        {c.inventory.map((i) => <li key={i.id}>{i.name}{i.qty > 1 && ` ×${i.qty}`}{i.note && <span className="muted"> — {i.note}</span>}</li>)}
      </ul>

      {visibleQuests.length > 0 && (
        <>
          <h4>Quests</h4>
          <ul className="inv">{visibleQuests.map((q) => <li key={q.id}>{q.name} {q.done ? '✓' : `${q.progress}/${q.target}`}</li>)}</ul>
        </>
      )}

      {slot.flags.length > 0 && (
        <>
          <h4>Story flags</h4>
          <div className="flags">{slot.flags.slice(-10).map((f) => <span key={f} className="pill">{f}</span>)}</div>
        </>
      )}
    </aside>
  );
}
