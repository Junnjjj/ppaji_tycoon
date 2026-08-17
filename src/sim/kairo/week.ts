import { Rng } from '../rng.js';
import type { KairoTerrain } from './terrain.js';
import { PlacementGrid, facilityDef } from './placement.js';
import type { GuestStore } from './guests.js';

/**
 * 주 단위 루프와 결산 — 스펙 v2/v4, CLAUDE.md 의 핵심 루프.
 *
 * ## 왜 주 단위인가
 *
 * 실시간은 폰 2분 세션에 안 맞는다. 한 주를 0.6초에 계산할 수 있으니 공짜로 가능하다.
 *
 * ## ⚠ v4 에서 고친 것 — "0.6초에 계산된다"와 "0.6초만 보여준다"는 다르다
 *
 * v3 는 계산이 빠르다는 이유로 연출을 생략했는데, **손님이 노는 광경이 이 게임 최대의
 * 보상**이라 그걸 리플레이로 격리하면 안 된다. 그래서 이 모듈은 한 주를 계산하면서
 * **tick 단위 기록**을 남긴다 — 렌더가 그걸 3~5초로 압축 재생한다.
 *
 * ## 날씨는 배수가 아니라 수요 구성을 바꾼다
 *
 * "비 오면 방문객 ×0.6" 은 RNG 세금이다. 대신 비는 `food`·`warm`·`rest` 수요를 올리고
 * `thrill`·`play` 를 내린다 — 플레이어가 시설 구성으로 대응할 수 있는 변화여야 한다.
 */

export const DAYS_PER_WEEK = 7;
/** 하루 tick 수. 10Hz 고정 timestep 기준 = 하루 12초 */
export const TICKS_PER_DAY = 120;
export const TICKS_PER_WEEK = DAYS_PER_WEEK * TICKS_PER_DAY;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'heat' | 'cold';
export type NeedKind =
  | 'food'
  | 'rest'
  | 'warm'
  | 'play'
  | 'thrill'
  | 'scenery'
  | 'hygiene'
  | 'service'
  | 'stay';

/** 요일 — 주말이 성수기다 */
export const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const;
const WEEKEND = [5, 6];

/**
 * 날씨별 수요 구성 배율. **방문객 수 배수가 아니다** — 무엇을 원하는지가 바뀐다.
 * 1.0 이 기준이고, 빠진 종류는 1.0 이다.
 */
export const WEATHER_DEMAND: Record<Weather, Partial<Record<NeedKind, number>>> = {
  clear: { thrill: 1.15, play: 1.1, scenery: 1.1 },
  cloudy: {},
  rain: { food: 1.4, warm: 1.5, rest: 1.3, thrill: 0.5, play: 0.6, scenery: 0.6 },
  heat: { thrill: 1.3, play: 1.25, food: 1.2, warm: 0.4, rest: 1.1 },
  cold: { warm: 1.6, food: 1.3, thrill: 0.5, play: 0.6 },
};

/** 계절별 방문객 기준치와 가능한 날씨 */
export const SEASON_PROFILE: Record<
  Season,
  { arrivalBase: number; weather: readonly Weather[] }
> = {
  spring: { arrivalBase: 0.55, weather: ['clear', 'cloudy', 'rain'] },
  summer: { arrivalBase: 1.0, weather: ['clear', 'heat', 'heat', 'cloudy', 'rain'] },
  autumn: { arrivalBase: 0.6, weather: ['clear', 'cloudy', 'rain'] },
  winter: { arrivalBase: 0.3, weather: ['cold', 'cold', 'cloudy', 'clear'] },
};

export interface DayReport {
  day: number;
  name: string;
  weather: Weather;
  /** 오려고 한 손님 (수요) */
  arrivals: number;
  /** 실제로 들어온 손님 */
  visitors: number;
  /**
   * 만석으로 돌려보낸 손님.
   *
   * v1 구현은 이걸 안 셌더니 **주말 방문객이 평일보다 적게** 나왔다 — 주중에 정원이 차서
   * 주말 입장이 전부 실패했고, 실패는 어디에도 기록되지 않았다. 이 숫자가 곧
   * "시설을 늘려야 한다"는 가장 직접적인 신호다.
   */
  turnedAway: number;
  revenue: number;
  upkeep: number;
  /** 그 날 동시 최대 손님 */
  peak: number;
  /** 그 날 퇴장 만족도 평균 */
  exitSatisfaction: number;
  /** 목적지를 못 찾고 나간 손님 */
  gaveUp: number;
}

export interface WeekReport {
  week: number;
  season: Season;
  days: DayReport[];
  arrivals: number;
  visitors: number;
  turnedAway: number;
  revenue: number;
  upkeep: number;
  profit: number;
  exitSatisfaction: number;
  gaveUp: number;
  /**
   * 혼잡 히트맵 — 타일별 손님 체류 tick. 결산에서 병목을 **눈으로** 보게 한다.
   * v4 에서 "숫자 표만으로는 다시 엑셀 게임이 된다"고 고친 부분.
   */
  heat: number[];
  heatW: number;
  heatH: number;
  /** 가장 붐빈 타일 (i, j, 값) */
  hotspot: { i: number; j: number; value: number } | null;
  /** 수요 대비 공급이 가장 부족한 종류 — "다음에 무엇을 지을까" 의 근거 */
  bottleneck: { need: NeedKind; demand: number; supply: number } | null;
  /** 압축 연출용 기록 — tick 마다 손님 위치 요약 */
  playback: PlaybackFrame[];
}

/** 압축 재생 프레임 — 위치만 남긴다 (스프라이트는 렌더가 정한다) */
export interface PlaybackFrame {
  tick: number;
  guests: { i: number; j: number; pose: string; facing: string; palette: number }[];
}

export interface WeekOptions {
  season?: Season;
  /** 압축 연출용 기록을 남길 간격 (0 이면 기록 안 함) */
  playbackEvery?: number;
  /** 손님 입장 간격의 기준 tick — 계절·요일·평판으로 조정된다 */
  arrivalBaseTicks?: number;
  /**
   * 평판 배율 (등급에서 온다). 1.0 이 기본.
   *
   * 시설 수만으로 수요를 올리면 배율이 곧 상한에 붙어 후반에 수요가 고정된다
   * (실측: 11주차부터 320 고정). 평판을 축으로 두면 "만족도를 관리하면 손님이 더 온다"가
   * 되고, 그건 등급이 돈으로 안 사진다는 결정과 같은 방향이다.
   */
  reputation?: number;
}

export class WeekRunner {
  private weekNo = 0;
  private money = 5_000_000;

  /**
   * 벽은 받지 않는다 — 도달 검사는 **배치 시점**에 이미 하므로 결산에서 다시 볼 필요가
   * 없다. 안 쓰는 의존을 들고 있으면 나중에 "여기서도 도달을 봐야 하나" 를 매번 다시
   * 생각하게 된다.
   */
  constructor(
    private readonly terrain: KairoTerrain,
    private readonly placement: PlacementGrid,
    private readonly guests: GuestStore,
  ) {}

  get week(): number {
    return this.weekNo;
  }

  get cash(): number {
    return this.money;
  }

  /** 시설 구성이 채우는 수요 — 종류별 총 용량 */
  supply(): Record<NeedKind, number> {
    const out = {} as Record<NeedKind, number>;
    for (const item of this.placement.all()) {
      const def = facilityDef(item.defId);
      if (!def) continue;
      const need = (def as { need?: NeedKind }).need;
      if (!need) continue;
      out[need] = (out[need] ?? 0) + Math.max(1, def.capacity);
    }
    return out;
  }

  /** 이번 주 유지비 (주 단위) */
  weeklyUpkeep(): number {
    let n = 0;
    for (const item of this.placement.all()) {
      n += (facilityDef(item.defId) as { upkeep?: number } | undefined)?.upkeep ?? 0;
    }
    return n;
  }

  /**
   * 한 주를 돌린다. **여기서 시간이 흐르는 유일한 지점**이다 —
   * 렌더가 프레임마다 tick 을 돌리면 결산이 언제 끝났는지 알 수 없다.
   */
  run(rng: Rng, opts: WeekOptions = {}): WeekReport {
    const season = opts.season ?? 'summer';
    const profile = SEASON_PROFILE[season];
    const playbackEvery = opts.playbackEvery ?? 0;
    const w = this.terrain.width;
    const h = this.terrain.height;
    const heat = new Array<number>(w * h).fill(0);
    const days: DayReport[] = [];
    const playback: PlaybackFrame[] = [];

    const supply = this.supply();
    let weekRevenue = 0;
    let tick = 0;

    for (let day = 0; day < DAYS_PER_WEEK; day++) {
      const weather = rng.pick(profile.weather);
      const weekendBoost = WEEKEND.includes(day) ? 1.6 : 1.0;
      // 시설이 조금 끌어당기고, 나머지는 평판이 결정한다
      const facilityPull = 1 + Math.min(0.6, this.placement.count * 0.015);
      const reputation = opts.reputation ?? 1;
      const arrivalRate = profile.arrivalBase * weekendBoost * facilityPull * reputation;
      const baseTicks = opts.arrivalBaseTicks ?? 10;
      /**
       * ⚠ 간격을 정수 tick 으로 반올림하면 **1 에서 바닥을 친다** — 그 위로는 수요를
       * 아무리 올려도 하루 120명이 상한이 된다 (실측). 누적기로 소수 비율을 그대로 쓴다.
       */
      const perTick = arrivalRate / baseTicks;

      const before = this.guests.stats();
      let arrivals = 0;
      let visitors = 0;
      let turnedAway = 0;
      let peak = 0;
      let dayRevenue = 0;

      let arrivalAcc = 0;
      for (let t = 0; t < TICKS_PER_DAY; t++, tick++) {
        arrivalAcc += perTick;
        while (arrivalAcc >= 1) {
          arrivalAcc -= 1;
          arrivals++;
          if (this.guests.spawn(rng)) visitors++;
          else turnedAway++;
        }
        const usingBefore = this.countUsing();
        this.guests.tick(rng);
        // 이용이 끝난 손님만큼 요금을 받는다 (이용 시작이 아니라 완료 기준)
        dayRevenue += this.collectFees(usingBefore, weather);

        for (const g of this.guests.all) {
          const k = g.j * w + g.i;
          if (k >= 0 && k < heat.length) heat[k] = (heat[k] as number) + 1;
        }
        peak = Math.max(peak, this.guests.count);

        if (playbackEvery > 0 && tick % playbackEvery === 0) {
          playback.push({
            tick,
            guests: this.guests.all.map((g) => ({
              i: g.i,
              j: g.j,
              pose: g.pose,
              facing: g.facing,
              palette: g.palette,
            })),
          });
        }
      }

      const after = this.guests.stats();
      const dayExited = after.exited - before.exited;
      const daySat =
        dayExited > 0
          ? (after.exitSatisfaction * after.exited - before.exitSatisfaction * before.exited) /
            dayExited
          : 0;
      const dayUpkeep = Math.round(this.weeklyUpkeep() / DAYS_PER_WEEK);
      days.push({
        day,
        name: DAY_NAMES[day] as string,
        weather,
        arrivals,
        visitors,
        turnedAway,
        revenue: dayRevenue,
        upkeep: dayUpkeep,
        peak,
        exitSatisfaction: daySat,
        gaveUp: after.gaveUp - before.gaveUp,
      });
      weekRevenue += dayRevenue;
    }

    const upkeep = this.weeklyUpkeep();
    this.money += weekRevenue - upkeep;
    this.weekNo++;

    // 히트맵 최고점
    let hotspot: WeekReport['hotspot'] = null;
    for (let k = 0; k < heat.length; k++) {
      const v = heat[k] as number;
      if (v > 0 && (!hotspot || v > hotspot.value)) {
        hotspot = { i: k % w, j: ((k - (k % w)) / w) | 0, value: v };
      }
    }

    // 병목 — 수요(날씨 가중 평균) 대비 공급이 가장 부족한 종류
    const demand = {} as Record<NeedKind, number>;
    for (const d of days) {
      const mods = WEATHER_DEMAND[d.weather];
      for (const need of Object.keys(supply) as NeedKind[]) {
        demand[need] = (demand[need] ?? 0) + (mods[need] ?? 1);
      }
    }
    let bottleneck: WeekReport['bottleneck'] = null;
    for (const need of Object.keys(demand) as NeedKind[]) {
      const sup = supply[need] ?? 0;
      const dem = demand[need] ?? 0;
      const ratio = sup === 0 ? Infinity : dem / sup;
      if (!bottleneck || ratio > (bottleneck.demand / Math.max(1, bottleneck.supply))) {
        bottleneck = { need, demand: dem, supply: sup };
      }
    }

    const totalExited = days.reduce((a, d) => a + (d.exitSatisfaction > 0 ? 1 : 0), 0);
    return {
      week: this.weekNo,
      season,
      days,
      arrivals: days.reduce((a, d) => a + d.arrivals, 0),
      visitors: days.reduce((a, d) => a + d.visitors, 0),
      turnedAway: days.reduce((a, d) => a + d.turnedAway, 0),
      revenue: weekRevenue,
      upkeep,
      profit: weekRevenue - upkeep,
      exitSatisfaction:
        totalExited === 0
          ? 0
          : days.reduce((a, d) => a + d.exitSatisfaction, 0) / totalExited,
      gaveUp: days.reduce((a, d) => a + d.gaveUp, 0),
      heat,
      heatW: w,
      heatH: h,
      hotspot,
      bottleneck,
      playback,
    };
  }

  private countUsing(): number {
    let n = 0;
    for (const g of this.guests.all) if (g.state === 'using') n++;
    return n;
  }

  /**
   * 요금 징수 — 이용이 **끝난** 손님 수만큼. 날씨가 수요 구성을 바꾸므로 그 종류의
   * 시설은 요금을 더 받는다 (비 오는 날 카페가 붐빈다).
   */
  private collectFees(usingBefore: number, weather: Weather): number {
    const usingNow = this.countUsing();
    const finished = Math.max(0, usingBefore - usingNow);
    if (finished === 0) return 0;
    // 어떤 시설이 끝났는지는 추적하지 않고 평균 요금을 쓴다 — K9 밸런싱에서 정밀화한다
    let feeSum = 0;
    let n = 0;
    const mods = WEATHER_DEMAND[weather];
    for (const item of this.placement.all()) {
      const def = facilityDef(item.defId) as
        | { fee?: number; need?: NeedKind }
        | undefined;
      if (!def?.fee) continue;
      feeSum += def.fee * (mods[def.need as NeedKind] ?? 1);
      n++;
    }
    if (n === 0) return 0;
    return Math.round((feeSum / n) * finished);
  }
}
