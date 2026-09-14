import type { Carryover } from '../sim/endgame.js';

export const PROFILE_KEY = 'wp.profile';

export function loadProfile(storage: Pick<Storage, 'getItem'> = localStorage): Carryover | null {
  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Carryover;
    return c.version === 1 ? c : null;
  } catch {
    return null;
  }
}

export function saveProfile(c: Carryover, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(PROFILE_KEY, JSON.stringify(c));
}
