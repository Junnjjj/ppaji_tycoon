/**
 * 상점(Pumpkin Products) — 매일 17:00 입고. 랭크 티어 이하의 진열 후보 중 6개를 `shop` 스트림으로 뽑는다.
 * 산 것은 **해금**된다 (시설·아이템·선물의 종류가 열린다). 재고는 안 든다 — 무엇을 샀는지는 unlocked 집합이 안다.
 */
import type { ShopEntry } from '../data/schema.js';
import type { Rng } from './rng.js';

export const SHOP_SLOTS = 6;

export interface ShopState {
  stock: string[];
  restockDay: number;
}

export class Shop {
  readonly entries: ReadonlyMap<string, ShopEntry>;
  state: ShopState = { stock: [], restockDay: -1 };

  constructor(entries: readonly ShopEntry[], private readonly rng: Rng) {
    this.entries = new Map(entries.map((e) => [e.id, e]));
  }

  /** 입고 — 아직 안 산 것 중 티어 이하에서 최대 6개 (뽑기 횟수는 후보 수와 무관하게 6회 고정) */
  restock(day: number, rank: number, owned: (e: ShopEntry) => boolean): void {
    const cands = [...this.entries.values()].filter((e) => e.tier <= Math.max(1, rank) && !owned(e));
    const picked: string[] = [];
    for (let k = 0; k < SHOP_SLOTS; k++) {
      const r = this.rng.next();
      if (cands.length === 0) continue;
      const at = Math.floor(r * cands.length);
      const e = cands.splice(at, 1)[0] as ShopEntry;
      picked.push(e.id);
    }
    this.state = { stock: picked, restockDay: day };
  }

  /** 진열에서 뺀다 (산 뒤) */
  take(id: string): void {
    this.state.stock = this.state.stock.filter((x) => x !== id);
  }

  toSnapshot(): ShopState {
    return { stock: [...this.state.stock], restockDay: this.state.restockDay };
  }

  fromSnapshot(s: ShopState): void {
    this.state = { stock: [...s.stock], restockDay: s.restockDay };
  }
}
