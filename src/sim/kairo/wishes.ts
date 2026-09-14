/**
 * 손님 소원 체인 (K43, 스펙 §3.3) — **해금이 해금을 부른다.**
 *
 * 인물 8명은 손님 유형(GroupId)의 대표다. EXP 는 개별 추적이 아니라 **그 유형의 주간
 * 입장 × 만족 집계**에서 쌓인다 — 1,200 에이전트에 개인사를 붙이지 않는다 (스펙 §9).
 * 문턱에 닿으면 소원이 열리고(다음 날 아침 인물이 말풍선으로 도착), 조건을 채우면
 * 보상이 온다: 시설 해금(11) · 다음 인물 초대(사슬 6) · 현금.
 *
 * 시작은 2명뿐이다 (민지·수연). 나머지는 소원 보상으로 등장한다 — PSS 의
 * "rewards include new visitors" 준거 (검수 A5).
 *
 * 판정은 결산 tick 에서만 (결정론) — 연출은 도착 큐가 아침에 푼다 (A6).
 */
import rawWishes from '../../data/kairo-wishes.json' with { type: 'json' };
import { evaluateCondition, supplyOf, type QuestCondition } from './progress.js';
import { evaluateCombos } from './combos.js';
import type { PlacementGrid } from './placement.js';
import type { WeekSummary } from './week.js';
import type { GroupId } from './groups.js';
import type { MenuPurchase, RegularVisit, TasteTag } from './menu.js';

export interface WishDef {
  exp: number;
  condition: QuestCondition;
  reward: { facility?: string; cash?: number; invite?: string };
  line: string;
}

export interface WishCharacter {
  id: string;
  name: string;
  group: GroupId;
  start?: boolean;
  regular?: {
    prefer: TasteTag[];
    avoid: TasteTag[];
    requests: RegularRequest[];
  };
  wishes: WishDef[];
}

export interface RegularRequest {
  recipeId: string;
  line: string;
  affinity: number;
  reward: {
    ingredient?: string;
    recipe?: string;
    facility?: string;
    invite?: string;
    cash?: number;
  };
}

export const WISH_CHARACTERS: readonly WishCharacter[] = (
  rawWishes as unknown as { characters: WishCharacter[] }
).characters;

/** Phase 3 첫 수직 슬라이스는 시작 인물 둘뿐. 나머지 6명은 기존 소원 사슬을 유지한다. */
export const REGULAR_CHARACTERS: readonly WishCharacter[] = WISH_CHARACTERS.filter(
  (c) => c.start === true && c.regular !== undefined,
);

/** 결산이 만드는 소원 사건 — main 이 도착 큐·보상으로 바꾼다 */
export type WishEvent =
  | { kind: 'arrive'; char: WishCharacter }
  | { kind: 'open'; char: WishCharacter; wish: WishDef }
  | { kind: 'done'; char: WishCharacter; wish: WishDef };

export interface WishSnapshot {
  exp: Partial<Record<GroupId, number>>;
  active: string[];
  /** 인물별 완수한 소원 수 */
  stage: Record<string, number>;
  /** 열려 있는 소원의 인물 id 들 */
  open: string[];
  /** 이름 있는 단골만 영속화. 주 안의 Guest agent는 담지 않는다. */
  regular?: Record<string, { stage: number; affinity: number }>;
}

export interface RegularStatus {
  char: WishCharacter;
  stage: number;
  affinity: number;
  request: RegularRequest;
  done: boolean;
}

export type RegularEvent =
  | {
      kind: 'regular-done';
      char: WishCharacter;
      request: RegularRequest;
      affinity: number;
    }
  | { kind: 'ingredient-unlock'; char: WishCharacter; id: string }
  | { kind: 'recipe-unlock'; char: WishCharacter; id: string }
  | { kind: 'reward'; char: WishCharacter; reward: RegularRequest['reward'] };

/** 현재 열린 소원 — UI 목록용 */
export interface OpenWish {
  char: WishCharacter;
  wish: WishDef;
  progress: number;
  detail: string;
}

export class WishStore {
  private exp: Partial<Record<GroupId, number>> = {};
  private readonly active = new Set<string>();
  private readonly stage = new Map<string, number>();
  private readonly open = new Set<string>();
  private readonly regular = new Map<string, { stage: number; affinity: number }>();

  constructor() {
    for (const c of WISH_CHARACTERS) if (c.start) this.active.add(c.id);
    for (const c of REGULAR_CHARACTERS) this.regular.set(c.id, { stage: 0, affinity: 0 });
  }

  regularStatus(id: string): RegularStatus | null {
    const char = REGULAR_CHARACTERS.find((c) => c.id === id);
    const state = this.regular.get(id);
    const requests = char?.regular?.requests;
    if (!char || !state || !requests || requests.length === 0) return null;
    const done = state.stage >= requests.length;
    const request = requests[Math.min(state.stage, requests.length - 1)] as RegularRequest;
    return { char, stage: state.stage, affinity: state.affinity, request, done };
  }

  /**
   * 이름 있는 손님은 주마다 한 명씩 교대로 온다. 시드·RNG를 추가로 소비하지 않고
   * 주차·데이터 순서의 함수라 run·분할 step·로드 후가 같다.
   */
  regularVisitsForWeek(week: number): RegularVisit[] {
    if (REGULAR_CHARACTERS.length === 0) return [];
    for (let offset = 0; offset < REGULAR_CHARACTERS.length; offset++) {
      const idx = (Math.max(1, week) - 1 + offset) % REGULAR_CHARACTERS.length;
      const char = REGULAR_CHARACTERS[idx] as WishCharacter;
      const status = this.regularStatus(char.id);
      if (!status || status.done || !char.regular) continue;
      return [
        {
          characterId: char.id,
          group: char.group,
          requestedRecipeId: status.request.recipeId,
          prefer: [...char.regular.prefer],
          avoid: [...char.regular.avoid],
        },
      ];
    }
    return [];
  }

  /** 요청한 메뉴를 실제 agent가 산 사건만 친밀도와 다음 요청으로 바꾼다. */
  settleRegularPurchases(purchases: readonly MenuPurchase[]): RegularEvent[] {
    const events: RegularEvent[] = [];
    for (const purchase of purchases) {
      if (!purchase.characterId) continue;
      const status = this.regularStatus(purchase.characterId);
      if (!status || status.done || purchase.menuId !== status.request.recipeId) continue;
      const state = this.regular.get(purchase.characterId) as { stage: number; affinity: number };
      state.stage += 1;
      state.affinity += status.request.affinity;
      events.push({
        kind: 'regular-done',
        char: status.char,
        request: status.request,
        affinity: state.affinity,
      });
      const reward = status.request.reward;
      if (reward.ingredient) events.push({ kind: 'ingredient-unlock', char: status.char, id: reward.ingredient });
      if (reward.recipe) events.push({ kind: 'recipe-unlock', char: status.char, id: reward.recipe });
      if (reward.facility || reward.invite || reward.cash !== undefined) {
        events.push({ kind: 'reward', char: status.char, reward });
      }
    }
    return events;
  }

  /** 유형별 EXP — 입장 수 × (0.5 + 만족/200). 만족이 높은 주가 두 배 가깝게 쳐 준다 */
  private gainExp(summary: WeekSummary, byGroup: Partial<Record<GroupId, number>>): void {
    const satMult = 0.5 + Math.max(0, Math.min(100, summary.exitSatisfaction)) / 200;
    for (const [g, n] of Object.entries(byGroup) as [GroupId, number][]) {
      this.exp[g] = (this.exp[g] ?? 0) + n * satMult;
    }
  }

  expOf(group: GroupId): number {
    return this.exp[group] ?? 0;
  }

  /** 인물의 다음(현재) 소원 — 3개를 다 이뤘으면 null */
  private currentWish(c: WishCharacter): WishDef | null {
    return c.wishes[this.stage.get(c.id) ?? 0] ?? null;
  }

  /** 열린 소원 목록 (UI) — 진행도는 의뢰와 같은 평가기로 잰다 */
  openWishes(
    placement: PlacementGrid,
    summary: WeekSummary | null,
    zones: Parameters<typeof evaluateCombos>[2] = [],
  ): OpenWish[] {
    const supply = supplyOf(placement);
    const combos = evaluateCombos(placement, undefined, zones);
    const out: OpenWish[] = [];
    for (const id of this.open) {
      const c = WISH_CHARACTERS.find((x) => x.id === id);
      const w = c ? this.currentWish(c) : null;
      if (!c || !w) continue;
      const ev = evaluateCondition(w.condition, placement, summary, supply, combos);
      out.push({ char: c, wish: w, progress: ev.progress, detail: ev.detail });
    }
    return out;
  }

  /**
   * 결산 처리 — EXP 적립 → 문턱 도달한 소원 열기 → 열린 소원 판정.
   * 사건 배열을 돌려준다 (연출·보상은 부르는 쪽 소관 — sim 은 화면을 모른다).
   */
  settle(
    summary: WeekSummary,
    byGroup: Partial<Record<GroupId, number>>,
    placement: PlacementGrid,
    zones: Parameters<typeof evaluateCombos>[2] = [],
  ): WishEvent[] {
    const events: WishEvent[] = [];
    this.gainExp(summary, byGroup);

    for (const c of WISH_CHARACTERS) {
      if (!this.active.has(c.id) || this.open.has(c.id)) continue;
      const w = this.currentWish(c);
      if (w && this.expOf(c.group) >= w.exp) {
        this.open.add(c.id);
        events.push({ kind: 'open', char: c, wish: w });
      }
    }

    const supply = supplyOf(placement);
    const combos = evaluateCombos(placement, undefined, zones);
    for (const id of [...this.open]) {
      const c = WISH_CHARACTERS.find((x) => x.id === id);
      const w = c ? this.currentWish(c) : null;
      if (!c || !w) {
        this.open.delete(id);
        continue;
      }
      const ev = evaluateCondition(w.condition, placement, summary, supply, combos);
      if (!ev.done) continue;
      this.open.delete(id);
      this.stage.set(id, (this.stage.get(id) ?? 0) + 1);
      events.push({ kind: 'done', char: c, wish: w });
      if (w.reward.invite !== undefined) {
        const invited = WISH_CHARACTERS.find((x) => x.id === w.reward.invite);
        if (invited && !this.active.has(invited.id)) {
          this.active.add(invited.id);
          events.push({ kind: 'arrive', char: invited });
        }
      }
    }
    return events;
  }

  toSnapshot(): WishSnapshot {
    return {
      exp: { ...this.exp },
      active: [...this.active],
      stage: Object.fromEntries(this.stage),
      open: [...this.open],
      regular: Object.fromEntries(
        REGULAR_CHARACTERS.map((c) => {
          const state = this.regular.get(c.id) ?? { stage: 0, affinity: 0 };
          return [c.id, { ...state }];
        }),
      ),
    };
  }

  static fromSnapshot(s: WishSnapshot | undefined): WishStore {
    const w = new WishStore();
    if (!s) return w;
    w.exp = { ...s.exp };
    w.active.clear();
    for (const id of s.active) w.active.add(id);
    for (const [id, n] of Object.entries(s.stage)) w.stage.set(id, n);
    for (const id of s.open) w.open.add(id);
    for (const c of REGULAR_CHARACTERS) {
      const raw = s.regular?.[c.id];
      const max = c.regular?.requests.length ?? 0;
      w.regular.set(c.id, {
        stage: Math.max(0, Math.min(max, Math.floor(raw?.stage ?? 0))),
        affinity: Math.max(0, Math.floor(raw?.affinity ?? 0)),
      });
    }
    return w;
  }
}
