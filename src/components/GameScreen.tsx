import { useEffect, useRef, useState } from 'react';
import type { GameEvent, SaveSlot } from '../game/types';
import { SKILL_BY_ID } from '../game/rules';
import { Sheet } from './Sheet';

interface Props {
  slot: SaveSlot;
  busy: boolean;
  onSend: (text: string) => void;
  onPause: () => void;
  onUnlock: (skillId: string) => void;
  dmLabel: string;
  dmKind: string; // 'AI (xAI)' | 'AI (Groq)' | 'Stub'
}

function eventLabel(e: GameEvent): { text: string; cls: string } | null {
  const sk = (id: string) => SKILL_BY_ID[id]?.name ?? id;
  switch (e.type) {
    case 'xp': return { text: `+${e.amount} XP · ${e.reason}`, cls: 'xp' };
    case 'levelUp': return { text: `LEVEL UP → ${e.level}`, cls: 'lvl' };
    case 'skillTick': return { text: `${sk(e.skillId)} ${e.amount > 0 ? '+' : ''}${e.amount} · ${e.reason}`, cls: e.amount < 0 ? 'bad' : 'skill' };
    case 'skillRank': return { text: `${sk(e.skillId)} → Rank ${e.rank}`, cls: 'lvl' };
    case 'skillLearn': return { text: `Learned ${e.name}`, cls: 'lvl' };
    case 'skillPoints': return { text: `${e.amount > 0 ? '+' : ''}${e.amount} SP · ${e.reason}`, cls: 'skill' };
    case 'hp': return { text: `${e.delta > 0 ? '+' : ''}${e.delta} HP · ${e.reason}`, cls: e.delta < 0 ? 'bad' : 'good' };
    case 'item': return { text: `${e.qty > 0 ? '+' : ''}${e.qty} ${e.name}`, cls: 'item' };
    case 'flag': return { text: `⚑ ${e.flag}`, cls: 'flag' };
    case 'job': case 'form': case 'quest': case 'note': return { text: e.text, cls: e.type };
  }
}

export function GameScreen({ slot, busy, onSend, onPause, onUnlock, dmLabel, dmKind }: Props) {
  const [input, setInput] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [slot.log.length]);

  const send = (t: string) => { if (!t.trim() || busy) return; onSend(t); setInput(''); };
  const c = slot.character;

  return (
    <div className="game">
      <header className="game-bar">
        <button className="btn ghost small" disabled={busy} onClick={onPause} title="Autosave and return to saves">⏸ Pause</button>
        <div className="game-title">
          <b>{slot.name}</b>
          <span className="muted">Chapter {slot.chapter}</span>
          <span className={`dm-badge ${dmKind.startsWith('AI') ? 'ai' : 'stub'}`} title={dmLabel}>DM: {dmKind}</span>
        </div>
        <button className="btn ghost small sheet-toggle" onClick={() => setSheetOpen((o) => !o)}>
          Lv {c.level} · HP {c.hp}/{c.maxHp}
        </button>
      </header>

      <div className="game-body">
        <main className="chat">
          {slot.log.map((m) => (
            <div key={m.id} className={`msg ${m.from}`}>
              {m.checkpoint ? (
                <div className="checkpoint">
                  <div className="cp-title">✦ {m.checkpoint.title}</div>
                  <p>{m.checkpoint.summary}</p>
                  {!m.checkpointResolved && slot.pendingCheckpoint && (
                    <div className="cp-options">
                      {m.checkpoint.options.map((o) => (
                        <button key={o} className="btn" disabled={busy} onClick={() => send(o)}>{o}</button>
                      ))}
                      <span className="hint">…or type your own next chapter below.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bubble">{m.text}</div>
              )}
              {m.events && m.events.length > 0 && (
                <div className="events">
                  {m.events.map((e, i) => { const l = eventLabel(e); return l && <span key={i} className={`ev ${l.cls}`}>{l.text}</span>; })}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="msg dm"><div className="bubble typing">The DM is writing…</div></div>}
          <div ref={endRef} />
        </main>

        <div className={`sheet-wrap ${sheetOpen ? 'open' : ''}`}>
          <button className="btn ghost small sheet-close" onClick={() => setSheetOpen(false)}>Close ✕</button>
          <Sheet slot={slot} busy={busy} onUnlock={onUnlock} />
        </div>
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          rows={2}
          value={input}
          placeholder={slot.pendingCheckpoint ? 'Pick a chapter above or describe your own…' : 'What do you do?'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        <button className="btn primary" disabled={busy || !input.trim()}>Act</button>
      </form>
      <div className="dm-label">{dmLabel}</div>
    </div>
  );
}
