/**
 * 기구 공방 (P7, D5) — 요리 개발 문법(`CookingStore`)을 그대로 쓴다: 부품 ≤5 → 정렬 키 → 기구 **발견**(= 그 기구를 소유) ·
 * 와일드카드 `@engine` · 강화 사슬 · 실패작(구멍 난 튜브·엉킨 로프·가라앉은 판) · 공방 Lv 소급(스릴 배수).
 * 데이터는 `parts.json`(부품 41) · `gears.json`(기구 33 = 승계 19 + 공방 11 + 실패작 3). 결정은 `workshop` 스트림만 쓴다.
 */
import partsJson from '../data/parts.json';
import gearsJson from '../data/gears.json';
import type { GearDef, PartDef } from '../data/schema.js';
import { CookingStore, type DiscoveryWords, type FailPicker } from './cooking.js';

export const PART_DEFS = partsJson as unknown as PartDef[];
export const GEAR_DEFS = gearsJson as unknown as GearDef[];

/** 공방 낱말·비용 — 개발비는 요리보다 조금 비싸고(부품이 비싸다), 랭크 제한은 없다(선착장이 곧 공방이다) */
export const WORKSHOP_WORDS: DiscoveryWords = { item: '부품', cost: 400, minCount: 2, maxCount: 5, unlockRank: 0, unlockLabel: '기구 공방' };
/** 공방 Lv 소급 — 스릴 배수 (요리의 가격 배수와 같은 눈금 5%/Lv) */
export const WORKSHOP_THRILL_MULT = 0.05;
/** 실패작 규칙 — 튜브만 = 구멍 난 튜브 · 로프가 섞이면 엉킨 로프 · 그 외 가라앉은 판 */
export const GEAR_FAIL_PICK: FailPicker = (classes) => classes.every((c) => c === 'tube') ? 'flat_tube' : classes.includes('rope') ? 'tangled_rope' : 'sunk_board';

export class WorkshopStore extends CookingStore<GearDef, PartDef> {
  /** 스릴 배수 — 놓인 코스 전부에 소급 */
  get thrillMult(): number {
    return 1 + WORKSHOP_THRILL_MULT * (this.level - 1);
  }
}
