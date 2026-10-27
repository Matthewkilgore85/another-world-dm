import { useState } from 'react';
import type {
  Companions, Difficulty, Entrance, GameSetup, Gender, JobMode, PathMode, PowerMode, Role, SlotSummary, Tone,
} from '../game/types';
import { defaultSetup } from '../game/setup';
import { Segmented } from './Segmented';

const GENDERS: Gender[] = ['Male', 'Female', 'Non-binary', 'Custom'];
const ENTRANCES: Entrance[] = ['Hit by bus', 'Summoned by country', 'Summoned by individual', 'Reality glitch', 'Reincarnation', 'Other'];
const ROLES: Role[] = ['Hero', 'Villain', 'Battle creature', 'Pet', 'Civilian', 'Custom race', 'Other'];
const COMPANIONS: Companions[] = ['Alone', 'You + one', 'Whole class', 'Custom'];
const TONES: Tone[] = ['Heroic', 'Grimdark', 'Comedic', 'Cozy', 'Intrigue', 'Horror', 'Custom'];


interface Props {
  slots: SlotSummary[];
  onCancel: () => void;
  onStart: (setup: GameSetup) => void;
}

export function NewGame({ slots, onCancel, onStart }: Props) {
  const [s, setS] = useState<GameSetup>(defaultSetup);
  const set = <K extends keyof GameSetup>(k: K, v: GameSetup[K]) => setS((p) => ({ ...p, [k]: v }));
  const showToggles = s.pathMode !== 'Free write';
  const showFree = s.pathMode !== 'Toggles';
  const nsfwBlocked = s.nsfw && !s.ageConfirmed;
  const canStart = s.slotName.trim().length > 0 && !nsfwBlocked && (showToggles || s.freeWrite.trim().length > 0);

  return (
    <form className="newgame panel" onSubmit={(e) => { e.preventDefault(); if (canStart) onStart(s); }}>
      <div className="panel-head">
        <h2>New Game</h2>
        <button type="button" className="btn ghost" onClick={onCancel}>← Back</button>
      </div>

      <div className="grid2">
        <label className="field">
          <span className="label">Slot name *</span>
          <input value={s.slotName} onChange={(e) => set('slotName', e.target.value)} placeholder="e.g. Slime Run" required />
        </label>
        <label className="field">
          <span className="label">Character name</span>
          <input value={s.characterName} onChange={(e) => set('characterName', e.target.value)} placeholder="Traveler" />
        </label>
      </div>

      <label className="field">
        <span className="label">Link to previous run (optional)</span>
        <select value={s.linkedSlotId ?? ''} onChange={(e) => set('linkedSlotId', e.target.value || null)}>
          <option value="">— Fresh story (no link) —</option>
          {slots.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.characterName}, Lv {x.level})</option>)}
        </select>
        <span className="hint">Only a read-only summary carries over. Stories never otherwise mix.</span>
      </label>

      <Segmented<PathMode> label="Path" value={s.pathMode} options={['Toggles', 'Free write', 'Both']} onChange={(v) => set('pathMode', v)}
        hint="Free write fills gaps and overrides toggles." />

      {showFree && (
        <label className="field">
          <span className="label">Free write</span>
          <textarea rows={4} value={s.freeWrite} onChange={(e) => set('freeWrite', e.target.value)}
            placeholder="Describe the premise, who you are, how you arrived, anything you want…" />
        </label>
      )}

      {showToggles && (
        <>
          <Segmented<Gender> label="Main character" value={s.gender} options={GENDERS} onChange={(v) => set('gender', v)} />
          {s.gender === 'Custom' && <input className="sub" placeholder="Describe your character" value={s.genderCustom} onChange={(e) => set('genderCustom', e.target.value)} />}

          <Segmented<Entrance> label="Entrance" value={s.entrance} options={ENTRANCES} onChange={(v) => set('entrance', v)} />
          {s.entrance === 'Other' && <input className="sub" placeholder="How did you arrive?" value={s.entranceOther} onChange={(e) => set('entranceOther', e.target.value)} />}

          <Segmented<Role> label="Role" value={s.role} options={ROLES} onChange={(v) => set('role', v)} />
          {(s.role === 'Custom race' || s.role === 'Other') && <input className="sub" placeholder="Race / role (e.g. Spider, Dungeon core)" value={s.roleCustom} onChange={(e) => set('roleCustom', e.target.value)} />}

          <Segmented<Companions> label="Who came with you" value={s.companions} options={COMPANIONS} onChange={(v) => set('companions', v)} />
          {s.companions === 'Custom' && <input className="sub" placeholder="Who came with you?" value={s.companionsCustom} onChange={(e) => set('companionsCustom', e.target.value)} />}

          <Segmented<Tone> label="Tone" value={s.tone} options={TONES} onChange={(v) => set('tone', v)} />
          {s.tone === 'Custom' && <input className="sub" placeholder="Describe the tone" value={s.toneCustom} onChange={(e) => set('toneCustom', e.target.value)} />}
        </>
      )}

      <div className="grid2">
        <Segmented<Difficulty> label="Difficulty" value={s.difficulty} options={['Easy', 'Normal']} onChange={(v) => set('difficulty', v)} />
        <fieldset className="field">
          <legend>NSFW</legend>
          <div className="seg">
            <button type="button" className={!s.nsfw ? 'on' : ''} onClick={() => set('nsfw', false)}>Off</button>
            <button type="button" className={s.nsfw ? 'on' : ''} onClick={() => set('nsfw', true)}>On</button>
          </div>
          {s.nsfw && (
            <label className="check">
              <input type="checkbox" checked={s.ageConfirmed} onChange={(e) => set('ageConfirmed', e.target.checked)} />
              I confirm I am 18 or older. <span className="hint">(age-gate stub)</span>
            </label>
          )}
        </fieldset>
      </div>

      <div className="grid2">
        <Segmented<PowerMode> label="Power mode" value={s.powerMode} options={['Set', 'Open']} onChange={(v) => set('powerMode', v)}
          hint={s.powerMode === 'Set' ? 'Fixed starting kit; few skills learnable by use.' : 'Any base skill can be learned by doing it.'} />
        <Segmented<JobMode> label="Jobs" value={s.jobMode} options={['Off', 'Set', 'Open']} onChange={(v) => set('jobMode', v)}
          hint={s.jobMode === 'Set' ? 'Role ladder (e.g. Squire → Knight → Paladin).' : s.jobMode === 'Open' ? 'Seeded from what you actually do.' : 'Role frame only.'} />
      </div>

      <p className="spine-note">⚑ Soft spine: the Demon Lord (or your premise’s equivalent) is a mid/late checkpoint — not the end. The story continues after.</p>

      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary" disabled={!canStart}>Begin</button>
      </div>
      {nsfwBlocked && <p className="warn">Confirm age or turn NSFW off to begin.</p>}
    </form>
  );
}
