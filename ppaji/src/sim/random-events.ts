/**
 * 랜덤 이벤트 (G21) — 카이로의 「사건 + 선택지」. sim 은 뽑고 적재만 한다; 선택은 명령(`resolveEvent`)으로 들어온다.
 * 결정론: 뽑기는 rng.world 하루 한 번(뽑을지 → 무엇을). 효과는 buff 목록(끝나는 날)로 남아 스냅샷에 들어간다.
 */
import eventsJson from '../data/events.json';
import type { Rng } from './rng.js';

export interface EventEffect { arrivalMul?: number; popBonus?: number; days?: number; likes?: number; money?: number; clean?: number; /** P52-c 장마 유실 — 물 위 기구마다 이 확률로 떠내려간다(앵커 개조판 면제) */ rigLoss?: number; /** P52-c — 야외 수역 폐쇄 일수(입수 0) */ waterClosedDays?: number }
export interface EventChoice { label: string; cost?: number; effect: EventEffect }
export interface RandomEventDef { id: string; name: string; text: string; weight: number; season?: number[]; minYear?: number; weekend?: boolean; choices: EventChoice[] }
export interface Buff { arrivalMul: number; popBonus: number; until: number }
export interface RandomEventsSnapshot { pending: string | null; lastDay: number; lastId: string | null; buffs: Buff[] }

const DATA = eventsJson as { events: RandomEventDef[] };
export const EVENT_DEFS: ReadonlyMap<string, RandomEventDef> = new Map(DATA.events.map((e) => [e.id, e]));
export const EVENT_CHANCE = 0.25;
export const EVENT_MIN_GAP = 2;

export class RandomEvents {
  pending: string | null = null;
  private lastDay = -99;
  private lastId: string | null = null;
  buffs: Buff[] = [];

  constructor(private readonly rng: Rng) {}

  /** 개장 때 한 번 — 뽑히면 def 를 돌려준다 (부르는 쪽이 사건으로 적재한다). 뽑기 횟수는 언제나 정확히 2회 */
  roll(day: number, season: number, year: number, weekend: boolean): RandomEventDef | null {
    const a = this.rng.next();
    const b = this.rng.next();
    if (this.pending || day - this.lastDay < EVENT_MIN_GAP || a >= EVENT_CHANCE) return null;
    const pool = DATA.events.filter((e) => e.id !== this.lastId && (!e.season || e.season.includes(season)) && (e.minYear ?? 1) <= year && (!e.weekend || weekend));
    const total = pool.reduce((n, e) => n + e.weight, 0);
    if (total <= 0) return null;
    let t = b * total;
    let pick = pool[pool.length - 1] as RandomEventDef;
    for (const e of pool) { t -= e.weight; if (t <= 0) { pick = e; break; } }
    this.pending = pick.id;
    this.lastDay = day;
    this.lastId = pick.id;
    return pick;
  }

  /** 선택 — 효과를 buff·즉시값으로 돌려준다. 돈은 부르는 쪽이 낸다 */
  resolve(choice: number, day: number): { def: RandomEventDef; pick: EventChoice } | null {
    if (!this.pending) return null;
    const def = EVENT_DEFS.get(this.pending);
    const pick = def?.choices[choice] ?? def?.choices[0];
    if (!def || !pick) { this.pending = null; return null; }
    const e = pick.effect;
    if ((e.arrivalMul !== undefined || e.popBonus !== undefined) && (e.days ?? 0) > 0) this.buffs.push({ arrivalMul: e.arrivalMul ?? 1, popBonus: e.popBonus ?? 0, until: day + (e.days ?? 0) });
    this.pending = null;
    return { def, pick };
  }

  arrivalMul(day: number): number {
    return this.buffs.filter((b) => b.until > day).reduce((m, b) => m * b.arrivalMul, 1);
  }
  popBonus(day: number): number {
    return this.buffs.filter((b) => b.until > day).reduce((n, b) => n + b.popBonus, 0);
  }
  prune(day: number): void {
    this.buffs = this.buffs.filter((b) => b.until > day);
  }

  toSnapshot(): RandomEventsSnapshot { return { pending: this.pending, lastDay: this.lastDay, lastId: this.lastId, buffs: this.buffs.map((b) => ({ ...b })) }; }
  fromSnapshot(s: RandomEventsSnapshot | undefined): void {
    if (!s) { this.pending = null; this.lastDay = -99; this.lastId = null; this.buffs = []; return; }
    this.pending = s.pending; this.lastDay = s.lastDay; this.lastId = s.lastId; this.buffs = s.buffs.map((b) => ({ ...b }));
  }
}
