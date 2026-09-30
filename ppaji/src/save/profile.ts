import { activeStorageKeys } from './storage-keys.js';
import type { Carryover } from '../sim/endgame.js';

export const PROFILE_KEY = activeStorageKeys.profile;

export function loadProfile(storage: Pick<Storage, 'getItem'> = localStorage): Carryover | null {
  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Carryover;
    return c.version === 1 || c.version === 2 ? c : null; // P53-b: v2(개조 도감·부품) — v1 은 그대로 읽는다(`tiles` 는 읽고 버린다)
  } catch {
    return null;
  }
}

export function saveProfile(c: Carryover, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(PROFILE_KEY, JSON.stringify(c));
}
