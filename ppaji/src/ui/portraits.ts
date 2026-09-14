/**
 * 인물 초상 (P56-b2) — 이름 있는 인물(사장·알바·심사위원 셋)은 등록부 그림 `pic/portrait/<id>_<mood>`(32px), 없으면 코드 초상(`drawPortrait`).
 * 손님·친구(71)는 그대로 코드 초상이다 — 팔레트 조합이 곧 얼굴이라 그림 71×2 는 다음 무리.
 */
import { drawPortrait } from '../assets/draw/portrait.js';
import { hasPicture, pictureEl, pictureId } from './pictures.js';
import portraitsJson from '../data/portraits.json';

export interface PortraitDef { id: string; name: string; palette: number; hair: number }
export const PORTRAITS: ReadonlyMap<string, PortraitDef> = new Map((portraitsJson as PortraitDef[]).map((p) => [p.id, p]));

/** 심사위원 셋의 id — `cert.ts`·`cert-result.ts` 가 같은 순서로 쓴다 (군청 공무원 · 해경 · 유튜버) */
export const JUDGE_IDS = ['judge', 'coastguard', 'youtuber'] as const;

export function portraitEl(id: string, mood: 'calm' | 'happy', fallback?: { palette: number; hair: number }): HTMLElement {
  const pid = pictureId('portrait', `${id}_${mood}`);
  if (hasPicture(pid)) return pictureEl(pid, 'friends', 'kportrait-pic');
  const def = PORTRAITS.get(id);
  const pal = fallback?.palette ?? def?.palette ?? 0;
  const hair = fallback?.hair ?? def?.hair ?? pal % 5;
  return drawPortrait(pal, hair, mood);
}
