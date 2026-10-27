import { useEffect, useState, useRef } from 'react';
import { GameScreen } from './components/GameScreen';
import { NewGame } from './components/NewGame';
import { TitleScreen } from './components/TitleScreen';
import { getDM, getStubDM, type DMProvider } from './dm';
import { createSlot, playTurn, startGame, unlockBranch, uid } from './game/engine';
import { deleteSlot, listSlots, loadSlot, saveSlot, snapshotForLink } from './game/storage';
import type { GameSetup, SaveSlot } from './game/types';

type Screen = { kind: 'title' } | { kind: 'new' } | { kind: 'game'; slot: SaveSlot };

export default function App() {
  // Start on the stub; upgrade to the AI DM once the local proxy confirms a key is configured.
  const [dm, setDm] = useState<DMProvider>(getStubDM);
  useEffect(() => {
    let live = true;
    getDM().then((d) => { if (live) setDm(d); });
    return () => { live = false; };
  }, []);
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const [slots, setSlots] = useState(listSlots);
  const [busy, setBusy] = useState(false);

  const refresh = () => setSlots(listSlots());
  const persist = (slot: SaveSlot) => { saveSlot(slot); setScreen({ kind: 'game', slot }); };

  const start = async (setup: GameSetup) => {
    const linked = setup.linkedSlotId ? snapshotForLink(setup.linkedSlotId) : null;
    setBusy(true);
    try {
      persist(await startGame(createSlot(setup, linked), dm));
    } finally {
      setBusy(false);
    }
  };

  // Bumped on pause/navigation so a late AI response can't pull the player back into the game.
  const turnGen = useRef(0);

  const send = async (text: string) => {
    if (screen.kind !== 'game' || busy) return;
    const gen = ++turnGen.current;
    setBusy(true);
    try {
      const next = await playTurn(screen.slot, text, dm);
      if (gen !== turnGen.current) { saveSlot(next); refresh(); return; } // paused meanwhile: save, don't navigate
    } finally {
      setBusy(false);
    }
  };

  const unlock = (skillId: string) => {
    if (screen.kind !== 'game' || busy) return; // avoid being overwritten by an in-flight turn
    const s = structuredClone(screen.slot);
    const events = unlockBranch(s, skillId);
    if (!events.length) return;
    s.log.push({ id: uid(), from: 'system', text: 'You spend skill points. The new technique branches from its root — the base skill remains.', ts: Date.now(), events });
    s.updatedAt = Date.now();
    persist(s);
  };

  // Pause = autosave + return to save select. Switching games = pause, then pick another slot.
  const pause = () => {
    if (busy) return; // wait for the DM so the in-flight turn isn't lost or duplicated
    turnGen.current++;
    if (screen.kind === 'game') saveSlot({ ...screen.slot, updatedAt: Date.now() });
    refresh();
    setScreen({ kind: 'title' });
  };

  return (
    <div className="app">
      {screen.kind === 'title' && (
        <TitleScreen
          slots={slots}
          onNew={() => setScreen({ kind: 'new' })}
          onLoad={(id) => { const s = loadSlot(id); if (s) setScreen({ kind: 'game', slot: s }); }}
          onDelete={(id) => { deleteSlot(id); refresh(); }}
        />
      )}
      {screen.kind === 'new' && <NewGame slots={slots} onCancel={() => setScreen({ kind: 'title' })} onStart={start} />}
      {screen.kind === 'game' && (
        <GameScreen slot={screen.slot} busy={busy} onSend={send} onPause={pause} onUnlock={unlock} dmLabel={dm.label} dmKind={dm.id === 'llm' ? `AI (${(dm as { providerName?: string }).providerName ?? 'xAI'})` : 'Stub'} />
      )}
    </div>
  );
}
