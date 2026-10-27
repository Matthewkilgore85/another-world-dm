import type { GameSetup } from './types';

export const defaultSetup = (): GameSetup => ({
  slotName: '', characterName: '', linkedSlotId: null, pathMode: 'Toggles', freeWrite: '',
  gender: 'Male', genderCustom: '', entrance: 'Hit by bus', entranceOther: '', role: 'Hero', roleCustom: '',
  companions: 'Alone', companionsCustom: '', tone: 'Heroic', toneCustom: '', nsfw: false, ageConfirmed: false,
  difficulty: 'Normal', powerMode: 'Set', jobMode: 'Set',
});
