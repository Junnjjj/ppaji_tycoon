import rawCards from '../../data/kairo-cards.json' with { type: 'json' };
import type { Rng } from '../rng.js';
import type { Season } from './week.js';

/**
 * 주간 의사결정 카드 — 스펙 §3.5. **루프를 지탱하는 장치다.**
 *
 * ## 왜 있는가
 *
 * 적대적 검증에서 나온 최대 결함: 시설을 20개쯤 지으면 할 게 없어지고 `한 주 진행` 이
 * **스킵 버튼**으로 전락한다. 방치형 게임의 전형적 붕괴다. 카드는 매주 선택을 강제한다.
 *
 * 어느 쪽도 명백한 정답이 아니어야 한다 — "돈을 쓰면 항상 이득"이면 카드가 아니라 청구서다.
 *
 * ## 효과 어휘를 8개로 묶은 이유
 *
 * 카드마다 새 효과를 만들면 24종이 **24개의 특수 규칙**이 되고, 그때부터 카드를 추가할 때
 * 시뮬을 고쳐야 한다. 그건 불변식 3(시설·장비·연구는 데이터다)이 막으려던 바로 그 상태다.
 * 카드 추가 = JSON 항목. 코드 변경 없음.
 *
 * ## 지속 효과는 주 수로 센다
 *
 * `weeks: 3` 이면 이번 주를 포함해 3주간 적용된다. `tickWeek()` 이 한 주마다 하나씩 깎고
 * 0 이 되면 버린다. 실시간 타이머가 아니라 주 수인 이유는 결정론이다 — 같은 시드가
 * 같은 순서로 같은 효과를 받아야 헤드리스 밸런싱이 의미를 갖는다.
 */

export type EffectKey =
  | 'cash'
  | 'arrivalMult'
  | 'revenueMult'
  | 'crowdMult'
  | 'satisfactionDelta'
  | 'reputationDelta'
  | 'accidentMult'
  | 'closed';

export interface CardEffects {
  /** 즉시 현금 (음수면 지출) */
  cash?: number;
  arrivalMult?: number;
  revenueMult?: number;
  /** 동시 손님 상한 배율 — 붐비게 만든다 */
  crowdMult?: number;
  satisfactionDelta?: number;
  reputationDelta?: number;
  accidentMult?: number;
  /** 그 주 폐쇄 */
  closed?: boolean;
  /** 지속 주 수. 없으면 즉시 1회 (cash 처럼) */
  weeks?: number;
}

export interface CardOption {
  label: string;
  detail: string;
  /**
   * 효과 **목록**. 한 객체에 몰면 서로 다른 기간의 효과를 못 담는다.
   *
   * ⚠ 실측 사고: 방송 촬영 카드에 `closed` 와 `reputationDelta` 를 한 객체에 넣고
   * `weeks: 4` 를 걸었더니 **4주 연속 폐쇄**가 됐다. 후반 수익 중앙값이 0 이 되고
   * 16판 중 4판이 파산했다 — "유지비가 무겁다"로 보였지만 유지비는 20만이었고
   * 수익이 사라진 것이었다. 목록으로 두면 폐쇄는 1주, 평판은 4주로 각각 산다.
   */
  effects: CardEffects[];
  /**
   * 이 선택지가 실제로 일어날 확률. 없으면 항상. **선택지 단위로 한 번만 굴린다.**
   *
   * "무시한다 → 적발되면 과태료" 처럼 **도박이 선택의 일부**인 카드에 쓴다.
   * 확률을 두지 않으면 "무시한다"가 항상 손해거나 항상 이득이라 고를 이유가 없다.
   */
  chance?: number;
}

export interface CardCondition {
  seasons?: Season[];
  minWeek?: number;
  minGrade?: number;
}

export interface CardDef {
  id: string;
  name: string;
  desc: string;
  options: CardOption[];
  weight: number;
  condition?: CardCondition;
  /**
   * 사건으로만 뜨는 카드. **무작위 뽑기에서 제외된다.**
   *
   * 사고 대응 같은 것은 "이번 주 카드"로 나오면 안 된다 — 사고가 안 났는데 사고 대응을
   * 고르는 화면이 뜬다.
   */
  trigger?: 'accident';
}

/**
 * 카드 전용 RNG salt. **손님·날씨와 같은 스트림을 쓰면 안 된다** (불변식 2) —
 * 카드를 하나 더 뽑는 것만으로 날씨 시퀀스가 밀려 밸런싱 실험에서 변수를 하나만
 * 바꿀 수 없다. 호출자는 `rng.fork(CARD_RNG_SALT)` 로 얻는다.
 */
export const CARD_RNG_SALT = 0xca7d;

export const CARDS: readonly CardDef[] = (rawCards as unknown as { cards: CardDef[] }).cards;

/** 계절별 주당 카드 수 (스펙 §3.5 등장 빈도) */
export const CARDS_PER_WEEK: Record<Season, [number, number]> = {
  summer: [1, 2],
  spring: [0, 1],
  autumn: [0, 1],
  winter: [0, 1],
};

export interface CardContext {
  season: Season;
  week: number;
  grade: number;
}

/** 선택지의 즉시 현금 합 (음수면 지출). UI·봇·검증이 같은 정의를 쓰게 한다 */
export function optionCash(opt: CardOption): number {
  return opt.effects.reduce((a, e) => a + (e.cash ?? 0), 0);
}

/**
 * **확정** 지출만 센다 — 확률에 걸린 선택지는 0 이다 (K37).
 *
 * `optionCash` 는 `chance` 를 무시하고 액수를 그대로 더한다. 그 값으로 "살 수 있나"를
 * 판정하면 **도박을 못 하게 막는다**: `safety_check` 의 "무시한다"는 35% 확률로
 * 과태료 ₩1,200,000 이 나오는 선택인데, 현금이 그보다 적으면 비활성이 됐다.
 * 아무것도 안 하겠다는 선택이 돈 때문에 막히는 것은 앞뒤가 안 맞는다.
 *
 * ⚠ 그리고 그게 **판을 잠갔다.** `safety_check`·`typhoon` 은 선택지가 **둘 다** 돈이 든다.
 * 현금이 마르면 두 버튼이 모두 비활성이 되고, 카드는 모달이라(K37) 메뉴도 안 열린다 —
 * 돌아올 길이 없다. 이 게임의 규칙은 "실패는 내 선택 때문이어야 하지, 회복 불가여야
 * 하는 건 아니다"(v4)다.
 */
export function optionCertainCash(opt: CardOption): number {
  if (opt.chance !== undefined) return 0;
  return optionCash(opt);
}

/** 선택지가 만드는 특정 효과의 합 — 델타는 더하고 배율은 곱한다 */
export function optionEffect(opt: CardOption, key: keyof CardEffects): number | undefined {
  let found = false;
  let acc = key.endsWith('Mult') ? 1 : 0;
  for (const e of opt.effects) {
    const v = e[key];
    if (typeof v !== 'number') continue;
    found = true;
    if (key.endsWith('Mult')) acc *= v;
    else acc += v;
  }
  return found ? acc : undefined;
}

export function isEligible(card: CardDef, ctx: CardContext): boolean {
  const c = card.condition;
  if (!c) return true;
  if (c.seasons && !c.seasons.includes(ctx.season)) return false;
  if (c.minWeek !== undefined && ctx.week < c.minWeek) return false;
  if (c.minGrade !== undefined && ctx.grade < c.minGrade) return false;
  return true;
}

export function eligibleCards(ctx: CardContext, exclude: ReadonlySet<string>): CardDef[] {
  // trigger 가 있는 카드는 사건이 부를 때만 나온다
  return CARDS.filter((c) => !c.trigger && isEligible(c, ctx) && !exclude.has(c.id));
}

/** 사건 카드를 이름으로 가져온다 (사고 대응 등) */
export function triggerCard(id: string): CardDef | undefined {
  return CARDS.find((c) => c.id === id);
}

/** 적용 중인 지속 효과 하나 */
export interface ActiveEffect {
  cardId: string;
  optionLabel: string;
  effects: CardEffects;
  /** 남은 주 수 */
  remaining: number;
}

/** 한 주에 실제로 넘길 수정치 — `WeekRunner.run` 이 이걸 받는다 */
export interface WeekModifiers {
  arrivalMult: number;
  revenueMult: number;
  crowdMult: number;
  satisfactionDelta: number;
  reputationDelta: number;
  accidentMult: number;
  closed: boolean;
}

export const NEUTRAL_MODIFIERS: WeekModifiers = {
  arrivalMult: 1,
  revenueMult: 1,
  crowdMult: 1,
  satisfactionDelta: 0,
  reputationDelta: 0,
  accidentMult: 1,
  closed: false,
};

/**
 * 누적 수정치의 상한. 카드 하나하나는 데이터지만 **겹칠 때의 한계는 규칙**이라 코드에 둔다 —
 * JSON 으로 열어두면 카드를 추가하다 나선을 다시 만든다.
 */
export const MOD_CAPS = {
  satisfaction: 12,
  arrivalMin: 0.5,
  arrivalMax: 2.0,
  revenueMin: 0.7,
  revenueMax: 1.5,
  crowdMin: 0.7,
  crowdMax: 1.6,
  reputation: 0.6,
  accidentMin: 0.3,
  accidentMax: 2.5,
} as const;

export interface CardSnapshot {
  active: ActiveEffect[];
  seen: string[];
}

/**
 * 카드 뽑기와 지속 효과를 소유한다.
 *
 * ## 최근에 나온 카드는 다시 안 뽑는다
 *
 * 24종이 있어도 무작위로 뽑으면 같은 카드가 연달아 나온다. 그러면 플레이어는 카드를
 * 읽지 않고 같은 버튼을 누르게 되고, 그건 카드가 막으려던 바로 그 상태다.
 * 풀이 소진될 때까지 안 겹치게 뽑고, 소진되면 비운다.
 */
export class CardStore {
  private readonly activeList: ActiveEffect[] = [];
  private readonly seen = new Set<string>();

  get active(): readonly ActiveEffect[] {
    return this.activeList;
  }

  get seenCount(): number {
    return this.seen.size;
  }

  /**
   * 이번 주 카드를 뽑는다. **`rng` 는 카드 전용 스트림이어야 한다**
   * (`rng.fork(CARD_RNG_SALT)`) —
   * 손님·날씨와 같은 스트림을 쓰면 카드를 하나 더 뽑는 것만으로 날씨 시퀀스가 밀려
   * 밸런싱 실험에서 변수를 하나만 바꿀 수 없다 (불변식 2).
   */
  draw(rng: Rng, ctx: CardContext): CardDef[] {
    const [lo, hi] = CARDS_PER_WEEK[ctx.season];
    const n = lo + Math.floor(rng.next() * (hi - lo + 1));
    const out: CardDef[] = [];
    const usedThisWeek = new Set<string>();
    for (let k = 0; k < n; k++) {
      let pool = eligibleCards(ctx, new Set([...this.seen, ...usedThisWeek]));
      if (pool.length === 0) {
        // 풀이 소진됐다 — 비우고 다시. 이번 주에 뽑은 것만 제외한다
        this.seen.clear();
        pool = eligibleCards(ctx, usedThisWeek);
      }
      if (pool.length === 0) break;
      const total = pool.reduce((a, c) => a + Math.max(1, c.weight), 0);
      let r = rng.next() * total;
      let pickIdx = pool.length - 1;
      for (let idx = 0; idx < pool.length; idx++) {
        r -= Math.max(1, (pool[idx] as CardDef).weight);
        if (r <= 0) {
          pickIdx = idx;
          break;
        }
      }
      const pick = pool[pickIdx] as CardDef;
      this.seen.add(pick.id);
      usedThisWeek.add(pick.id);
      out.push(pick);
    }
    return out;
  }

  /**
   * 선택을 적용한다. 즉시 현금은 돌려주고(호출자가 지갑을 소유한다), 지속 효과는 담아둔다.
   *
   * 확률 효과는 **여기서 굴린다** — 주를 돌릴 때 굴리면 "선택했을 때 이미 정해졌다"는
   * 인상을 못 주고, 결과를 결산에서야 알게 된다.
   */
  choose(rng: Rng, card: CardDef, optionIndex: number): { cash: number; happened: boolean } {
    const opt = card.options[optionIndex];
    if (!opt) return { cash: 0, happened: false };
    // ★ 확률은 선택지 단위로 **한 번** 굴린다 — 효과마다 굴리면 절반만 일어나는 이상한 상태가 된다
    const happened = opt.chance === undefined || rng.next() < opt.chance;
    if (!happened) return { cash: 0, happened: false };

    let cash = 0;
    for (const e of opt.effects) {
      cash += e.cash ?? 0;
      const weeks = e.weeks ?? 0;
      if (weeks > 0) {
        this.activeList.push({
          cardId: card.id,
          optionLabel: opt.label,
          effects: e,
          remaining: weeks,
        });
      }
    }
    return { cash, happened: true };
  }

  /**
   * 지금 적용되는 수정치 — 곱은 곱하고 델타는 더한다. **그리고 총합에 상한을 둔다.**
   *
   * ## 왜 상한이 필요한가 (실측)
   *
   * 상한 없이 누적하면 **K10 에서 없앤 죽음의 나선이 카드로 되살아난다.** 음수 만족도
   * 카드가 몇 장 겹치면 −20 이 몇 주 이어지고, 만족도가 떨어져 등급이 내려가고, 등급이
   * 수요와 입장 상한을 깎고, 다시 만족도가... 실측으로 16판 중 4판이 파산하고 만족도가
   * 0·등급 1 로 주저앉았다.
   *
   * 원칙: **어떤 한 시스템도 게임을 나선으로 밀 수 없다.** 카드는 한 주를 흔들 뿐이고,
   * 회복 불가능한 상태를 만드는 것은 플레이어의 선택(안전 무시·확장 과속)이어야 한다.
   */
  modifiers(): WeekModifiers {
    const m: WeekModifiers = { ...NEUTRAL_MODIFIERS };
    for (const a of this.activeList) {
      const e = a.effects;
      if (e.arrivalMult !== undefined) m.arrivalMult *= e.arrivalMult;
      if (e.revenueMult !== undefined) m.revenueMult *= e.revenueMult;
      if (e.crowdMult !== undefined) m.crowdMult *= e.crowdMult;
      if (e.satisfactionDelta !== undefined) m.satisfactionDelta += e.satisfactionDelta;
      if (e.reputationDelta !== undefined) m.reputationDelta += e.reputationDelta;
      if (e.accidentMult !== undefined) m.accidentMult *= e.accidentMult;
      if (e.closed) m.closed = true;
    }
    const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
    m.satisfactionDelta = clamp(m.satisfactionDelta, -MOD_CAPS.satisfaction, MOD_CAPS.satisfaction);
    m.arrivalMult = clamp(m.arrivalMult, MOD_CAPS.arrivalMin, MOD_CAPS.arrivalMax);
    m.revenueMult = clamp(m.revenueMult, MOD_CAPS.revenueMin, MOD_CAPS.revenueMax);
    m.crowdMult = clamp(m.crowdMult, MOD_CAPS.crowdMin, MOD_CAPS.crowdMax);
    m.reputationDelta = clamp(m.reputationDelta, -MOD_CAPS.reputation, MOD_CAPS.reputation);
    m.accidentMult = clamp(m.accidentMult, MOD_CAPS.accidentMin, MOD_CAPS.accidentMax);
    return m;
  }

  /** 한 주가 끝났다 — 남은 주 수를 깎고 만료된 것을 버린다 */
  tickWeek(): void {
    for (let k = this.activeList.length - 1; k >= 0; k--) {
      const a = this.activeList[k] as ActiveEffect;
      a.remaining -= 1;
      if (a.remaining <= 0) this.activeList.splice(k, 1);
    }
  }

  toSnapshot(): CardSnapshot {
    return {
      active: this.activeList.map((a) => ({ ...a, effects: { ...a.effects } })),
      seen: [...this.seen],
    };
  }

  static fromSnapshot(s: CardSnapshot): CardStore {
    const st = new CardStore();
    for (const a of s.active) st.activeList.push({ ...a, effects: { ...a.effects } });
    for (const id of s.seen) st.seen.add(id);
    return st;
  }
}

/** 데이터 검증 — 카드를 추가하다 규칙을 깨는 사고를 막는다 */
export function validateCards(): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const ALLOWED = new Set([
    'cash',
    'arrivalMult',
    'revenueMult',
    'crowdMult',
    'satisfactionDelta',
    'reputationDelta',
    'accidentMult',
    'closed',
    'weeks',
  ]);
  for (const c of CARDS) {
    if (ids.has(c.id)) problems.push(`중복 ID: ${c.id}`);
    ids.add(c.id);
    if (c.options.length < 2) problems.push(`${c.id} — 선택지가 2개 미만이면 선택이 아니다`);
    if (c.trigger && c.trigger !== 'accident') problems.push(`${c.id} — 모르는 trigger`);
    if (c.options.length > 3) problems.push(`${c.id} — 선택지 3개 초과는 폰에서 5초에 못 읽는다`);
    for (const o of c.options) {
      if (!Array.isArray(o.effects)) {
        problems.push(`${c.id} — 효과가 목록이 아니다`);
        continue;
      }
      /*
       * 효과가 아예 없는 선택지는 허용한다 ("불참한다", "그대로 간다").
       * "아무것도 안 한다"가 선택지에 있어야 카드가 청구서가 아니게 된다.
       */
      if (o.chance !== undefined && (o.chance <= 0 || o.chance > 1)) {
        problems.push(`${c.id} — 확률이 범위를 벗어났다: ${o.chance}`);
      }
      for (const e of o.effects) {
        for (const k of Object.keys(e)) {
          if (!ALLOWED.has(k)) problems.push(`${c.id} — 모르는 효과 ${k}`);
        }
        if (e.weeks !== undefined && (e.weeks < 1 || !Number.isInteger(e.weeks))) {
          problems.push(`${c.id} — 지속 주 수가 올바르지 않다: ${String(e.weeks)}`);
        }
        /*
         * ⚠ 폐쇄는 **1주만** 허용한다. 여러 주 폐쇄는 수익을 0 으로 만들어 판을 죽인다
         * (실측: 4주 폐쇄로 16판 중 4판 파산). 카드를 추가하다 이걸 다시 하는 걸 막는다.
         */
        if (e.closed && (e.weeks ?? 1) !== 1) {
          problems.push(`${c.id} — 폐쇄는 1주만 허용한다 (${String(e.weeks)}주로 적혀 있다)`);
        }
      }
    }
    if (c.weight < 1) problems.push(`${c.id} — 가중치가 1 미만`);
  }
  return problems;
}
