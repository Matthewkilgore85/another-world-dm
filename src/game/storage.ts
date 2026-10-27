// Save slots in localStorage. Each slot lives under its own key, so stories never mix.
// A linked New Game only copies a read-only summary snapshot (LinkedRun) of the old slot.
import type { LinkedRun, SaveSlot, SlotSummary } from './types';

const INDEX_KEY = 'awdm.index.v1';
const SLOT_KEY = (id: string) => `awdm.slot.v1.${id}`;
const LAST_KEY = 'awdm.lastSlot';

function readIndex(): SlotSummary[] {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]'); } catch { return []; }
}

export function listSlots(): SlotSummary[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadSlot(id: string): SaveSlot | null {
  try {
    const raw = localStorage.getItem(SLOT_KEY(id));
    return raw ? (JSON.parse(raw) as SaveSlot) : null;
  } catch { return null; }
}

export function saveSlot(slot: SaveSlot): void {
  localStorage.setItem(SLOT_KEY(slot.id), JSON.stringify(slot));
  const summary: SlotSummary = {
    id: slot.id, name: slot.name, characterName: slot.character.name,
    role: slot.setup.role === 'Custom race' || slot.setup.role === 'Other' ? (slot.setup.roleCustom || slot.setup.role) : slot.setup.role,
    level: slot.character.level, chapter: slot.chapter, updatedAt: slot.updatedAt,
    linkedFromName: slot.linkedFrom?.slotName ?? null,
  };
  const idx = readIndex().filter((s) => s.id !== slot.id);
  idx.push(summary);
  localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  localStorage.setItem(LAST_KEY, slot.id);
}

export function deleteSlot(id: string): void {
  localStorage.removeItem(SLOT_KEY(id));
  localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((s) => s.id !== id)));
}

export function snapshotForLink(id: string): LinkedRun | null {
  const s = loadSlot(id);
  if (!s) return null;
  const lastCheckpoint = [...s.log].reverse().find((m) => m.checkpoint)?.checkpoint;
  return {
    slotId: s.id, slotName: s.name, characterName: s.character.name, level: s.character.level,
    summary: lastCheckpoint?.summary ?? `They reached chapter ${s.chapter}.`,
    flags: s.flags.slice(-8),
  };
}
