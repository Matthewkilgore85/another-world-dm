import type { SlotSummary } from '../game/types';

interface Props {
  slots: SlotSummary[];
  onNew: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TitleScreen({ slots, onNew, onLoad, onDelete }: Props) {
  return (
    <div className="title-screen">
      <header className="title-hero">
        <div className="sigil" aria-hidden>✦</div>
        <h1>Another World DM</h1>
        <p className="tagline">A long-form isekai adventure. Your words are your actions.</p>
      </header>
      <section className="panel">
        <div className="panel-head">
          <h2>Save slots</h2>
          <button className="btn primary" onClick={onNew}>+ New Game</button>
        </div>
        {slots.length === 0 && <p className="muted">No saves yet. Start a new game to open a slot.</p>}
        <ul className="slots">
          {slots.map((s) => (
            <li key={s.id} className="slot">
              <button className="slot-main" onClick={() => onLoad(s.id)}>
                <span className="slot-name">{s.name}</span>
                <span className="slot-meta">
                  {s.characterName} · {s.role} · Lv {s.level} · Ch {s.chapter}
                  {s.linkedFromName && <> · ↳ linked to “{s.linkedFromName}”</>}
                </span>
                <span className="slot-time">{new Date(s.updatedAt).toLocaleString()}</span>
              </button>
              <button
                className="btn ghost small"
                aria-label={`Delete ${s.name}`}
                onClick={() => { if (confirm(`Delete save “${s.name}”? This cannot be undone.`)) onDelete(s.id); }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
      <p className="footnote">Saves live in this browser (localStorage). DM: local stub — no AI calls.</p>
    </div>
  );
}
