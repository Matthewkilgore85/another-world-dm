import { createSlot } from '../game/engine';
import { defaultSetup } from '../game/setup';
import type { GameSetup, SaveSlot } from '../game/types';

/** Custom "reincarnated as a spider" run used by tests and the live smoke. */
export function spiderSlot(over: Partial<GameSetup> = {}): SaveSlot {
  return createSlot({
    ...defaultSetup(),
    slotName: 'Spider run', characterName: 'Kumo', pathMode: 'Both',
    entrance: 'Reincarnation', role: 'Battle creature', tone: 'Comedic',
    freeWrite: 'I was reincarnated as a tiny spider monster in a vast dungeon after dying in a classroom accident.',
    ...over,
  }, null);
}
