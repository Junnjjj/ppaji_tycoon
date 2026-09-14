/**
 * 기구 개조 저장부 (P49-a1 §4.2) — `CookingStore` 의 세 번째 얼굴. 요리(재료 → 요리)·공방(부품 → 견인 기구)과 같은 「섞어서 발견」인데
 * 실패작이 없고 결과가 새 시설이 아니라 **놓인 기구의 개조판**이다. a1 은 저장부(소유 부품·경험치·시도 수)와 rng 스트림만 낸다 —
 * 레시피(`rigs.json` 20)·`craft()`·개조 실행은 P51.
 */
import { CookingStore, type DiscoveryWords, type RecipeLike, type CookResultOf, recipeKey } from './cooking.js';
import rigsJson from '../data/rigs.json';
import type { RigPartDef } from '../data/schema.js';
import type { Rng } from './rng.js';

export interface RigUpgradeDef extends RecipeLike { from: string; to: string; add: string[] }
/** P51 §4.2 — 개조 레시피 20 (`rigs.json`). `from → to` 는 놓인 기구의 같은 자리 교체 */
export const RIG_UPGRADES: readonly RigUpgradeDef[] = rigsJson as RigUpgradeDef[];
export const RIG_WORDS: DiscoveryWords = { item: '부품', cost: 400, minCount: 2, maxCount: 4, unlockRank: 0, unlockLabel: '기구 개조' };
/** 실패작 없음(§4.2) — 부르는 곳이 없어야 한다. 부르면 던진다 */
export const RIG_FAIL_PICK = (): string => { throw new Error('기구 개조는 실패작이 없다 — P51 craft() 가 성공/미발견 둘만 낸다'); };

export class RigStore extends CookingStore<RigUpgradeDef, RigPartDef> {
  constructor(recipes: readonly RigUpgradeDef[], parts: readonly RigPartDef[], rng: Rng) {
    super(recipes, parts, rng, RIG_WORDS, RIG_FAIL_PICK);
  }
  /** P51 — 실패작 없음: 정확 키만 본다(성공/미발견 둘). 뽑기 0 이라 `rng.rig` 스트림이 안 민다(검사가 전후 state 를 대조한다) */
  override cook(ids: readonly string[]): CookResultOf<RigUpgradeDef> {
    this.attempts++;
    const hit = this.byKey.get(recipeKey(ids));
    if (!hit) return { ok: false, reason: '맞는 개조가 없다 — 부품 조합을 바꿔 보자 (도감의 빈 칸이 힌트)' };
    const first = !this.known.has(hit.id);
    this.known.add(hit.id);
    this.exp += first ? 20 : 6;
    return { ok: true, recipe: hit, first, via: 'exact' };
  }
  /** 이 정의를 개조할 수 있는(아는) 레시피들 */
  upgradesFor(fromDefId: string): RigUpgradeDef[] { return [...this.recipes.values()].filter((r) => r.from === fromDefId && this.known.has(r.id)); }
}
