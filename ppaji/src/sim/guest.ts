/**
 * 손님 — 개체 에이전트. FSM: enter → wander → walk(풀로) → swim → … → leave.
 * HP 를 쓰며 놀고, 바닥나면 나간다. 위치는 타일 + 진행률(보간은 렌더의 일).
 * 결정은 `guest` RNG 스트림에서만 뽑는다.
 */
import type { AreaTaste } from '../data/schema.js';
import type { Rng } from './rng.js';
import { capacityOf } from './facility.js';
import { TICK_SCALE } from './clock.js';
import type { Grid } from './grid.js';
import { guestWalkable } from './facility.js';
import { swimSkill } from './wristband.js';
import type { PoolStore, Pool } from './pool.js';
import { FacilityStore, type PlacedFacility } from './facility.js';
import type { FacilityDef } from '../data/schema.js';
import { buildField, type DistanceField, NEIGHBORS } from './nav.js';

/** G26: `climb`(탑 오르기) → `ride`(활강로 타기) → 착수는 `swim` 으로 이어진다 · `eat` 은 앉을 곳이 없어 서서 먹는 중 */
export type GuestState = 'enter' | 'wander' | 'walk' | 'swim' | 'use' | 'climb' | 'ride' | 'eat' | 'queue' | 'leave' | 'gone';
/** 대기 줄 (G34) — 시설 앞 최대 인원 · 참을성(tick) */
export const QUEUE_MAX = 3;
export const QUEUE_PATIENCE = 48;
/** 튜브 6종 (G26, R5) — 0 없음 · 1~3 링(빨강·파랑·노랑) · 4 오리 · 5 범고래 · 6 카약 */
export const FLOAT_KINDS = 6;
export const FLOAT_BY_GIFT: Record<string, number> = { red_tube: 1, swim_ring: 2, duck_float: 4, blue_orca: 5, kayak_float: 6, kairo_float: 3, donut_float: 1, banana_float: 6, watermelon_float: 3, river_orca: 5, hammock: 2, flamingo_float: 1, dreaming_orca: 5, shell_float: 2 };
export type GuestBuild = 'adult' | 'kid' | 'old';
/** P52-a ⑤ — 기구 끌림: 기운이 있으면 1.0, 지쳤으면 0.6 (수영 뒤 배고픔·매점 사슬로 돌아가게). P52-b 실측: 팔찌가 딥 기구를 열자 1.2 로는 기구 이용 몫 0.604 로 상한(0.6)을 넘겼다 */
export const swimUrgeRig = (g: { hp: number }): number => (g.hp >= 50 ? 1.0 : 0.6);
/** 체형은 나이에서 파생한다 — 저장하지 않는다 (≤12 어린이 · ≥58 노인) */
export function buildOf(g: { age: number }): GuestBuild {
  return g.age <= 12 ? 'kid' : g.age >= 58 ? 'old' : 'adult';
}
/** 활강로 한 칸을 지나는 tick (G26) · 서서 먹는 tick · 물 위에서 자리를 옮기는 주기 */
export const RIDE_TICKS_PER_TILE = 4;
export const EAT_TICKS = 12;
export const DRIFT_EVERY = 31;
export type GuestTarget = { kind: 'pool'; id: number } | { kind: 'facility'; uid: number };
export type GuestFacing = 0 | 1 | 2 | 3; // +I, +J, −I, −J
export type GuestMood = 'calm' | 'happy' | 'annoyed' | 'tired';

/** 표정은 상태에서 파생한다 — 저장하지 않는다 */
/** 머리 위 이모트 — 40tick(≈5초) 뒤 사라진다. 결정론: 난수 없음 */
export function setEmote(g: { emote: GuestEmote | null; emoteTtl: number }, e: GuestEmote, ttl = 40): void {
  g.emote = e;
  g.emoteTtl = ttl;
}

export function moodOf(g: { hp: number; sat: number; say: string | null }): GuestMood {
  if (g.hp < 30) return 'tired';
  if (g.say === '앗 뜨거!' || g.say === '으, 차가워' || g.say === '풀이 없네…') return 'annoyed';
  if (g.sat >= 60) return 'happy';
  return 'calm';
}

export interface Guest {
  uid: number;
  arrivalStep?: number;
  departureStep?: number;
  palette: number;
  i: number;
  j: number;
  fromI: number;
  fromJ: number;
  /** 0..1 — fromI/J 에서 i/j 로 가는 중 */
  progress: number;
  facing: GuestFacing;
  hp: number;
  sat: number;
  state: GuestState;
  stateTicks: number;
  target: GuestTarget | null;
  /** 수영 중 서 있는 풀 타일 인덱스 */
  swimTile: number | null;
  swims: number;
  uses: number;
  /** 취향 — 선호 수온 (G3) */
  prefTemp: number;
  /** 친구(이름 있는 손님)면 id */
  friendId: string | null;
  /** 오늘 올린 사진 수 (하루 최대 2) */
  photos: number;
  /** 최근 대사 (렌더가 읽고 지운다) */
  say: string | null;
  /** 머리 위 이모트 (G17) — 남은 tick 이 0 이면 없음 */
  emote: GuestEmote | null;
  emoteTtl: number;
  /** 튜브 (G26) — 0 이면 맨몸 수영 */
  float: number;
  /** 활강로 진행 칸 (`ride` 중에만 ≥ 0) */
  rideIdx: number;
  /** 식당에서 산 것을 들고 있다 (R3 — 앉을 자리를 찾는다) */
  carry: boolean;
  /** 대기 줄 순번 (G34, `queue` 중에만 ≥ 0) — 렌더가 줄 모양으로 비켜 세운다 */
  queuePos: number;
  /** 손님 카드 (G19) — 이름·나이·성별·동네·오늘 쓴 돈 */
  name: string;
  age: number;
  gender: 'M' | 'F';
  home: string;
  spentToday: number;
  /** 출신지 취향 (P9) — 없으면 보통 */
  taste?: AreaTaste;
  /** P17 팀 — 같은 버스로 온 손님끼리 같은 번호. null 이면 혼자 */
  teamId: number | null;
  /** P17 팀 자리 — 팀이 대여한 평상·테이블 uid */
  seatUid: number | null;
  /** P17 패키지 — 자리를 잡을 때 산 것 · 썼는가 */
  pkg: string | null;
  pkgUsed: boolean;
  /** P28-b D36: 이미 한 번 잤다 — 1박은 한 번. 아침에 `stays` 를 내리고 이 표지를 올려 다시 체크인하지 않는다(안 그러면 매일 자며 영원히 안 나간다 — 실측 overnight 596 → 6052) */
  slept: boolean;
  /** P45-b — 지금 목표가 「지나가며 사는」 것인가(입장·퇴장) · 퇴장 중(복도 점포에 들른 뒤 반드시 나간다) */
  passBy: 'enter' | 'leave' | null;
  /** P52-a G2 — 팔찌(자유이용권) 칸 id · 남은 회수. 없으면 조끼도 없다(`hasVest = band != null`) */
  band?: string;
  bandLeft?: number;
  /** 「팔찌가 없네…」 는 손님당 한 번(저장 0) */
  bandSaid?: boolean;
  leaving: boolean;
  /** P45-c — 오늘 밤 시설에 들렀다(하룻밤 한 번) */
  nightDone: boolean;
  /** P45-c — 지금 목표가 밤 분기로 고른 시설(집계용) */
  nightPick: boolean;
  /** P18 1박 — 숙박 자리를 잡았다. 폐장에 나가지 않고 자리로 가서 자고 다음 날 이어서 논다 */
  stays: boolean;
  /** P27 D33 배고픔 0~100 — 물놀이·탑승마다 오르고 식당에서 0. 체력(hp)과 다르다: 체력은 떠나는 조건, 배고픔은 목표 선택 */
  hunger: number;
}

/** P17 대여 열쇠 — 팀은 팀 번호(음수)로, 혼자면 자기 uid. 같은 버스 손님이 같은 자리를 쓴다 */
export function rentKey(g: { uid: number; teamId: number | null }): number {
  return g.teamId !== null ? -1 - g.teamId : g.uid;
}

/** 취향 → 시설 가중치 (P9). 순수 함수 — 검사가 직접 부른다 */
export function tasteWeight(cls: string, menuSlots: number, taste: AreaTaste | undefined): number {
  if (!taste) return 1;
  if (menuSlots > 0 || cls === 'restaurant') return taste.food;
  if (cls === 'lounging') return taste.rest;
  if (cls === 'attraction' || cls === 'slide' || cls === 'rig') return taste.thrill; // P48-c: 기구도 스릴 취향
  return 1;
}

/** 이름 없는 손님의 이름 — 결정론(rng.guest). 카이로처럼 「누구나 이름이 있다」 */
/** 목표 고르기의 거리 감쇠 (P16) — 길만 걷는 세계는 길 거리가 잔디 직선보다 길다. 0.15 는 식당 방문을 1인당 1.5 → 0.4 회로 떨어뜨렸다(매점 몫 0.43 → 0.21) */
export const DIST_FALLOFF = 0.08;
export const GUEST_NAMES = ['민준', '서연', '도윤', '지우', '하준', '서현', '시우', '하윤', '지호', '수아', '예준', '지민', '유준', '채원', '준서', '다은', '건우', '가은', '현우', '나은', '우진', '예린', '선우', '소율', '연우', '지아', '준우', '윤서', '민재', '하은', '태오', '유나', '이안', '수빈', '지환', '아린', '승우', '보라', '은우', '세아'];

export type GuestEmote = 'heart' | 'note' | 'zz' | 'grr' | 'camera' | 'star';

export interface GuestBalance {
  guestHpStart: number;
  guestHpSwim: number;
  guestHpLeave: number;
  swimTicks: number;
  /** P27 배고픔 — 수영 1회 · 탑승 1회에 오르는 양, 배고플 때 식당 거리 감쇠 */
  hungerPerSwim: number;
  /** P57-i — 시설 이용 뒤 사진(좋아요) 확률 (옛 0.12 고정) */
  photoChance?: number;
  hungerPerRide: number;
  /** P60-b(D73 B1) — 물 위 기구·슬라이드 1회에 오르는 양 × 스릴(1~4). 옛 값은 0 이었다: 「기구를 많이 탈수록 매점이 산다」가 성립하지 않았다 */
  hungerPerRig: number;
  hungerFalloff: number;
  walkinTeamMin: number;
  walkinTeamMax: number;
  walkTicksPerTile: number;
  wanderTicks: number;
  /** 수온이 선호와 이만큼 벗어나면 조기 퇴수 + HP 두 배 */
  tempTolerance: number;
  /** P45-b D63 「지나가며 산다」 — 입장 때 복도 곁 점포 가중 · 퇴장 때 복도 곁 점포에 들를 확률 · 오늘 쓴 돈 상한 */
  passByEnterMul?: number;
  passByLeaveChance?: number;
  passBySpendCap?: number;
  /** P45-c D63 밤 분기 — 폐장 뒤 남는 팀 손님이 자리로 가기 전에 밤 시설(찜질·사우나·무대·노래방·오락기)에 들를 확률 */
  nightChance?: number;
}

export interface GuestHooks {
  onSwimEnter?: (g: Guest) => void;
  /** P17 자리 값 (그늘·뷰·매점 거리) — 평상 이용 만족에 곱한다 */
  seatValue?: (f: PlacedFacility) => number;
  /** P35 D44 — 이 손님의 자리 블록과 그 시설의 블록이 같거나 접했나 */
  blockNear?: (g: Guest, f: PlacedFacility) => boolean;
  /** P34 D43 — 비 오는 날 피할 실내 시설 uid 들 · 피할 확률 */
  indoorRefuge?: () => number[];
  rainRefuge?: () => number;
  onRainRefuge?: () => void;
  /** P45-b D63 — 복도 곁 점포 uid 집합(입장·퇴장) · 늦은 오후인가 · 지나가며 산 것을 센다 */
  passBy?: () => { enter: ReadonlySet<number>; leave: ReadonlySet<number> };
  lateDay?: () => boolean;
  onPassBy?: (g: Guest, f: PlacedFacility, kind: 'enter' | 'leave') => void;
  /** P45-c — 밤 시설 uid 집합(실내 놀이) · 밤 이용 집계 */
  nightSet?: () => ReadonlySet<number>;
  /** P45-c — 저녁(18시 뒤)인가: 남는 팀 손님은 저녁부터 밤 시설에 들를 수 있다 */
  evening?: () => boolean;
  onNightUse?: (g: Guest, f: PlacedFacility) => void;
  /** P28-b D35: 이 손님의 팀이 이미 빌렸거나 앉은 자리(uid). 팀은 한 줄만 쓴다 — 실측 새 판에서 한 팀이 킷 평상 두 줄을 다 빌려 14팀이 서성였다 */
  teamSeatUid?: (g: Guest) => number | null;
  /** P17 팀 손님이 앉을 자리를 못 찾아 서성인다 */
  onSeatless?: (g: Guest) => void;
  /** 풀 수온 — Game 이 파생 상태에서 준다 */
  poolTemp?: (poolId: number) => number;
  /** 계절 이상 수온에 얼마나 가까운가 0..1 (G42) — 체류 = swimTicks × (0.85 + 0.3·fit): 이상이면 +15%, 멀면 −15% (총량 중립) */
  poolTempFit?: (poolId: number) => number;
  /** 시설 이용 완료 — 요금이 있으면 돌려준다 (Game 이 돈에 더한다) */
  onFacilityUse?: (g: Guest, f: PlacedFacility) => void;
  /** 놀고 난 뒤 만족이 높으면 사진을 올린다 (G4 SNS) — Game 이 글로 만든다 */
  onPhoto?: (g: Guest, subject: { kind: 'pool' | 'facility'; ref: number }) => void;
  /** 손님이 나갈 때 (만족을 친구 EXP 로) */
  onLeave?: (g: Guest) => void;
  /** 폐장 1시간 전인가 (G34) — 새 목표를 안 잡고 입구로 간다 */
  closing?: () => boolean;
  /** 오늘 날씨 (G34) — 비면 야외 풀을 피하고 일부는 돌아간다 */
  weather?: () => string;
  poolIndoor?: (poolId: number) => boolean;
  /** P52-c — 수온 → 야외 입수 배수(실내 1 · 폐쇄 0 · 겨울 바닥) */
  swimUrge?: (poolId: number) => number;
  /** 직원·청결 배율 (G20) — 풀 체력 소모 · 만족 증가 · 사진 확률 */
  hpMul?: () => number;
  satMul?: () => number;
  photoMul?: () => number;
}

export interface GuestSnapshot {
  nextUid: number;
  guests: Guest[];
}

export class GuestStore {
  private list: Guest[] = [];
  private nextUid = 1;
  private fields = new Map<number, DistanceField>();
  private fieldsVersion = -1;
  private gateField: DistanceField | null = null;
  private arrivalRoute: readonly { i: number; j: number }[] = [];
  private arrivalFields = new Map<number, DistanceField>();
  setArrivalRoute(route: readonly { i: number; j: number }[]): void { this.arrivalRoute = route; this.arrivalFields.clear(); }
  private followArrival(g: Guest, leaving = false): boolean {
    const prop = leaving ? 'departureStep' : 'arrivalStep';
    const step = g[prop] ?? 0;
    const index = leaving ? this.arrivalRoute.length - 1 - step : step;
    const target = this.arrivalRoute[index];
    if (!target) return false;
    g[prop] = step;
    if (g.i === target.i && g.j === target.j && g.progress >= 1) { g[prop] = step + 1; return this.followArrival(g, leaving); }
    // buildField seeds blocked targets too; never walk into a newly obstructed passage.
    if (!this.walkable(target.i, target.j)) return true;
    let field = this.arrivalFields.get(index);
    if (!field) { field = buildField(this.grid, [target], this.walkable); this.arrivalFields.set(index, field); }
    this.advance(g, field);
    return true;
  }
  /** 오늘 나간 손님 수 · 입장 수 (일일 집계용) */
  leftToday = 0;
  enteredToday = 0;

  constructor(
    private readonly grid: Grid,
    private readonly pools: PoolStore,
    private readonly facilities: FacilityStore,
    private readonly gate: { i: number; j: number },
    private readonly rng: Rng,
    private readonly b: GuestBalance,
  ) {}

  private facilityFields = new Map<number, DistanceField>();
  private facilitiesVersion = -1;

  get all(): readonly Guest[] {
    return this.list;
  }

  get count(): number {
    return this.list.length;
  }

  /** 손님이 설 수 있는 칸 — 잔디·포장·실내이고 시설이 안 점유한 곳 (풀은 못 선다) */
  walkable = (i: number, j: number): boolean => {
    // P16 D24: 손님은 **포장한 길·데크·실내**만 걷는다 — 잔디는 못 걷는다(레거시 K32-B 「길이 곧 동선 설계」). 여울도 안 걷는다(P1) · P50-a: 켜진 물 위 기구 발자국도 선다 — 술어는 `guestWalkable` 하나
    return guestWalkable(this.grid, this.facilities, i, j);
  };

  invalidate(): void {
    this.fields.clear();
    this.facilityFields.clear();
    this.gateField = null;
    this.arrivalFields.clear();
    this.fieldsVersion = this.pools.version;
    this.facilitiesVersion = this.facilities.version;
  }

  private stale(): boolean {
    return this.fieldsVersion !== this.pools.version || this.facilitiesVersion !== this.facilities.version;
  }

  private fieldToFacility(f: PlacedFacility): DistanceField {
    if (this.stale()) this.invalidate();
    let d = this.facilityFields.get(f.uid);
    if (!d) {
      d = buildField(this.grid, this.facilities.entryTiles(f, this.walkable), this.walkable);
      this.facilityFields.set(f.uid, d);
    }
    return d;
  }

  private fieldTo(pool: Pool): DistanceField {
    if (this.stale()) this.invalidate();
    let f = this.fields.get(pool.id);
    if (!f) {
      // 목표 = 풀 타일에 인접한 걸을 수 있는 칸들 (입수 지점)
      const targets: { i: number; j: number }[] = [];
      const seen = new Set<number>();
      for (const k of pool.tiles) {
        const i = k % this.grid.w;
        const j = Math.floor(k / this.grid.w);
        for (const [di, dj] of NEIGHBORS) {
          const ni = i + di;
          const nj = j + dj;
          if (!this.walkable(ni, nj) || !this.grid.canCross(i, j, ni, nj)) continue; // P39 벽
          const nk = nj * this.grid.w + ni;
          if (seen.has(nk)) continue;
          seen.add(nk);
          targets.push({ i: ni, j: nj });
        }
      }
      f = buildField(this.grid, targets, this.walkable);
      this.fields.set(pool.id, f);
    }
    return f;
  }

  private fieldToGate(): DistanceField {
    if (this.stale()) this.invalidate();
    if (!this.gateField) this.gateField = buildField(this.grid, [this.gate], this.walkable);
    return this.gateField;
  }

  /** 입구에서 손님 하나 — 입장료는 부르는 쪽이 받는다. `friend` 를 주면 이름 있는 손님 */
  spawn(friend?: { id: string; palette: number; name?: string; age?: number; gender?: 'M' | 'F'; home?: string; float?: number }, home = '이 동네', taste?: AreaTaste): Guest {
    const nameIdx = this.rng.int(GUEST_NAMES.length);
    const age = 6 + this.rng.int(54); // 6~59 — 어린이(≤12) 13% · 노인(≥58) 4%
    const gender: 'M' | 'F' = this.rng.chance(0.5) ? 'M' : 'F';
    // 튜브 — 선물받은 친구는 자기 튜브, 나머지는 30% 가 아무 튜브 (뽑기 횟수는 언제나 같다 — 결정론)
    const rolled = this.rng.chance(0.3) ? 1 + this.rng.int(FLOAT_KINDS) : 0;
    const float = friend?.float ? friend.float : rolled;
    const g: Guest = {
      uid: this.nextUid++,
      palette: friend ? friend.palette : this.rng.int(8),
      i: this.gate.i,
      j: this.gate.j,
      fromI: this.gate.i,
      fromJ: this.gate.j,
      progress: 1,
      facing: 3,
      hp: this.b.guestHpStart,
      sat: 0,
      state: 'enter',
      stateTicks: 0,
      target: null,
      swimTile: null,
      swims: 0,
      uses: 0,
      prefTemp: 24 + this.rng.int(9) + (taste?.tempBias ?? 0), // 24~32 (+ 출신지 치우침, P9)
      friendId: friend ? friend.id : null,
      photos: 0,
      say: null,
      emote: null,
      emoteTtl: 0,
      float,
      rideIdx: -1,
      carry: false,
      queuePos: -1,
      name: friend?.name ?? GUEST_NAMES[nameIdx] ?? '손님',
      age: friend?.age ?? age,
      gender: friend?.gender ?? gender,
      home: friend?.home ?? home,
      spentToday: 0,
      teamId: null, seatUid: null, pkg: null, pkgUsed: false, slept: false, passBy: null, leaving: false, nightDone: false, nightPick: false, // P17 · P28-b · P45-b · P45-c
      stays: false, // P18
      hunger: 0, // P27
      ...(taste ? { taste } : {}),
    };
    this.list.push(g);
    this.enteredToday++;
    return g;
  }

  /** 폐장 — 전원 즉시 퇴장 (친구는 만족 EXP 를 남긴다) */
  /** 폐장 — 남은 손님을 내보낸다. `keep` 이 참인 손님(P18 숙박)은 남긴다. 돌려주는 값은 내보낸 수 */
  flush(onLeave?: (g: Guest) => void, keep?: (g: Guest) => boolean): number {
    const stay = keep ? this.list.filter((g) => g.state !== 'gone' && keep(g)) : [];
    const out = this.list.filter((g) => !stay.includes(g));
    this.leftToday += out.length;
    for (const g of out) onLeave?.(g);
    this.list = stay;
    return out.length;
  }

  /** P18 지금 자고 갈 손님 수 (동시 상한 계산용) */
  get staying(): number { let n = 0; for (const g of this.list) if (g.stays) n++; return n; }

  /** P18 아침 — 잔 손님이 자리에서 일어나 새 하루를 시작한다 (체력 회복 · 만족 +10 · 오늘 지출·사진 0) */
  wakeUp(): number {
    let n = 0;
    for (const g of this.list) {
      if (!g.stays) continue;
      n++;
      g.stays = false; g.slept = true; // D36: 1박은 한 번 — 오늘은 놀다가 평소처럼 나간다
      g.state = 'wander'; g.stateTicks = 0; g.target = null; g.carry = false; g.queuePos = -1; g.rideIdx = -1; g.swimTile = null;
      g.hp = 100; g.sat = Math.min(100, g.sat + 10); g.photos = 0; g.spentToday = 0; g.progress = 1; g.passBy = null; g.leaving = false; g.nightDone = false; g.nightPick = false;
      const back = this.adjacentWalkable(g);
      if (back) { g.fromI = back.i; g.fromJ = back.j; g.i = back.i; g.j = back.j; }
      else { g.fromI = this.gate.i; g.fromJ = this.gate.j; g.i = this.gate.i; g.j = this.gate.j; }
      g.say = this.rng.chance(0.5) ? '잘 잤다!' : null;
    }
    return n;
  }

  resetDay(): void {
    this.leftToday = 0;
    this.enteredToday = 0;
  }

  /** 한 tick. 훅은 렌더 연출·돈·좋아요(G4)가 듣는다 */
  step(hooks?: GuestHooks): void {
    for (const g of this.list) {
      g.stateTicks++;
      if (g.emoteTtl > 0 && --g.emoteTtl === 0) g.emote = null;
      switch (g.state) {
        case 'enter':
          if (this.followArrival(g)) break;
          g.state = 'wander';
          g.stateTicks = 0;
          break;
        case 'wander': {
          if (hooks?.closing?.()) {
            // P18 숙박 손님은 나가지 않고 제 자리로 가서 잔다
            if (g.stays && g.seatUid !== null && this.facilities.byUid(g.seatUid)) {
              // P45-c D63 밤 분기: 자리로 가기 전에 밤 시설(실내 놀이) 하나 — 확률 nightChance, 한 번만(nightDone)
              if (!g.nightDone && this.tryNight(g, hooks)) break;
              g.target = { kind: 'facility', uid: g.seatUid }; g.state = 'walk'; g.stateTicks = 0; g.say = this.rng.chance(0.3) ? '불멍하다 자야지' : null; break;
            }
            g.state = 'leave'; g.stateTicks = 0; g.say = this.rng.chance(0.3) ? '문 닫을 시간이네' : null; break;
          }
          if (g.leaving) { g.state = 'leave'; g.stateTicks = 0; break; } // P45-b: 걷기 실패·줄 포기로 되돌아온 퇴장 손님
          if (g.stays && !g.nightDone && hooks?.evening?.() && this.tryNight(g, hooks)) break; // P45-c: 저녁부터 밤 시설 한 번
          if (g.stateTicks < this.b.wanderTicks) break;
          // P17 자리 없으면 서성임 — 팀 손님이 앉을 평상이 하나도 안 닿으면 만족이 깎이고 말한다
          if (g.teamId !== null && g.seatUid === null && g.stateTicks === this.b.wanderTicks && !this.nearestLounge(g)) { g.sat = Math.max(0, g.sat - 1); g.say = '자리가 없네…'; setEmote(g, 'grr'); hooks?.onSeatless?.(g); }
          if (hooks?.weather?.() === 'rain' && this.rng.chance(0.12)) {
            // P34 D43 — 실내가 있으면 나가는 대신 피한다(확률 rainRefuge). 실내동이 곧 비 오는 날의 매출이다
            const refuge = hooks?.indoorRefuge?.() ?? [];
            if (refuge.length > 0 && this.rng.chance(hooks?.rainRefuge?.() ?? 0)) { const uid = refuge[this.rng.int(refuge.length)] as number; g.target = { kind: 'facility', uid }; g.state = 'walk'; g.stateTicks = 0; g.say = '비 오네 — 안으로'; hooks?.onRainRefuge?.(); break; }
            this.leaveOrRetreat(g, hooks); g.say = '비 오네…'; setEmote(g, 'grr'); break;
          }
          const t = this.pickTarget(g, hooks);
          if (!t) {
            this.leaveOrRetreat(g, hooks);
            g.say = this.pools.all.length === 0 ? '풀이 없네…' : null;
            break;
          }
          g.target = t;
          g.state = 'walk';
          g.stateTicks = 0;
          break;
        }
        case 'walk': {
          const t = g.target;
          if (!t) {
            g.state = 'wander';
            g.stateTicks = 0;
            break;
          }
          if (t.kind === 'facility') {
            const f = this.facilities.byUid(t.uid);
            if (!f) {
              g.target = null;
              g.state = 'wander';
              g.stateTicks = 0;
              break;
            }
            if (!this.advance(g, this.fieldToFacility(f))) {
              const def = this.facilities.defOf(f);
              g.stateTicks = 0;
              if (this.busyAt(f) >= capacityOf(def, f)) {
                // 가득 찼다 — 줄을 선다 (G34). 줄도 찼으면 포기
                const q = this.queueAt(f);
                if (q >= QUEUE_MAX) { g.target = null; g.state = 'wander'; setEmote(g, 'grr'); break; }
                g.queuePos = q;
                g.state = 'queue';
                g.progress = 1;
                break;
              }
              this.startUse(g, f, def);
            }
            break;
          }
          const pool = this.pools.byId(t.id);
          if (!pool) {
            g.target = null;
            g.state = 'wander';
            g.stateTicks = 0;
            break;
          }
          const f = this.fieldTo(pool);
          if (!this.advance(g, f)) {
            const tile = this.adjacentPoolTile(g, pool);
            if (tile === null) {
              g.target = null;
              g.state = 'wander';
              g.stateTicks = 0;
              break;
            }
            g.swimTile = tile;
            g.fromI = g.i;
            g.fromJ = g.j;
            g.i = tile % this.grid.w;
            g.j = Math.floor(tile / this.grid.w);
            g.progress = 0;
            g.state = 'swim';
            g.stateTicks = 0;
            g.swims++;
            const temp = hooks?.poolTemp?.(pool.id) ?? 26;
            const off = Math.abs(temp - g.prefTemp) > this.b.tempTolerance;
            g.say = off ? (temp > g.prefTemp ? '앗 뜨거!' : '으, 차가워') : this.rng.chance(0.4) ? SWIM_LINES[this.rng.int(SWIM_LINES.length)] ?? null : null;
            if (off) setEmote(g, 'grr');
            hooks?.onSwimEnter?.(g);
          }
          break;
        }
        case 'use': {
          const t = g.target;
          const f = t && t.kind === 'facility' ? this.facilities.byUid(t.uid) : undefined;
          if (!f) {
            g.state = 'wander';
            g.stateTicks = 0;
            g.target = null;
            break;
          }
          const def = this.facilities.defOf(f);
          if (g.progress < 1) g.progress = Math.min(1, g.progress + 0.5);
          if (g.stays && f.uid === g.seatUid && hooks?.closing?.()) break; // P18 폐장 뒤엔 자리에서 잔다 — 하루가 닫힐 때까지
          if (g.stateTicks < def.useTicks * TICK_SCALE) break; // useTicks 는 분 단위 데이터
          const wasCarrying = g.carry;
          this.finishUse(g, f, hooks);
          if (def.class === 'lounging') {
            // 시설 칸에서 입구 칸으로 내려온다
            const back = this.adjacentWalkable(g);
            if (back) { g.fromI = g.i; g.fromJ = g.j; g.i = back.i; g.j = back.j; g.progress = 0; }
            if (wasCarrying) { g.carry = false; g.sat = Math.min(100, g.sat + 5); setEmote(g, 'note'); }
          }
          this.afterUse(g, hooks);
          break;
        }
        case 'climb': {
          const t = g.target;
          const f = t && t.kind === 'facility' ? this.facilities.byUid(t.uid) : undefined;
          const def = f ? this.facilities.defOf(f) : null;
          if (!f || !def || !def.slide) { g.state = 'wander'; g.stateTicks = 0; g.target = null; break; }
          if (g.progress < 1) g.progress = Math.min(1, g.progress + 0.5);
          if (g.stateTicks < Math.max(4, Math.round(def.useTicks * TICK_SCALE / 2))) break;
          const lane = FacilityStore.lane(def, f.i, f.j, f.facing);
          const first = lane[0];
          if (!first) { this.finishUse(g, f, hooks); this.afterUse(g, hooks); break; }
          g.rideIdx = 0;
          g.fromI = g.i; g.fromJ = g.j; g.i = first.i; g.j = first.j; g.progress = 0;
          g.facing = f.facing === 0 ? 0 : 1;
          g.state = 'ride';
          g.stateTicks = 0;
          g.say = this.rng.chance(0.5) ? RIDE_LINES[this.rng.int(RIDE_LINES.length)] ?? null : null;
          break;
        }
        case 'ride': {
          const t = g.target;
          const f = t && t.kind === 'facility' ? this.facilities.byUid(t.uid) : undefined;
          const def = f ? this.facilities.defOf(f) : null;
          if (!f || !def || !def.slide) { g.rideIdx = -1; g.state = 'wander'; g.stateTicks = 0; g.target = null; break; }
          g.progress = Math.min(1, g.progress + 1 / RIDE_TICKS_PER_TILE);
          if (g.progress < 1) break;
          const lane = FacilityStore.lane(def, f.i, f.j, f.facing);
          const next = lane[g.rideIdx + 1];
          if (next) {
            g.rideIdx++;
            g.fromI = g.i; g.fromJ = g.j; g.i = next.i; g.j = next.j; g.progress = 0;
            break;
          }
          // 착수 — 출구 다음 칸이 풀이면 그 풀로 뛰어든다, 아니면 뭍으로 내려온다
          g.rideIdx = -1;
          g.hunger = Math.min(100, g.hunger + this.b.hungerPerRide); // P27
          this.finishUse(g, f, hooks);
          const beyond = f.facing === 0 ? { i: g.i + 1, j: g.j } : { i: g.i, j: g.j + 1 };
          const bk = beyond.j * this.grid.w + beyond.i;
          const pool = this.pools.isOpenAt(beyond.i, beyond.j) ? this.pools.at(beyond.i, beyond.j) : undefined; // P50-a: 기구 밑(open 아님)은 착수 못 한다
          if (pool && g.hp >= this.b.guestHpLeave) {
            g.target = { kind: 'pool', id: pool.id };
            g.swimTile = bk;
            g.fromI = g.i; g.fromJ = g.j; g.i = beyond.i; g.j = beyond.j; g.progress = 0;
            g.state = 'swim';
            g.stateTicks = Math.floor(this.b.swimTicks / 2); // 슬라이드 뒤 수영은 절반만
            g.swims++;
            g.say = '풍덩!';
            hooks?.onSwimEnter?.(g);
            break;
          }
          const back = this.adjacentWalkable(g) ?? this.nearestWalkable(g, 4);
          if (back) { g.fromI = g.i; g.fromJ = g.j; g.i = back.i; g.j = back.j; g.progress = 0; }
          this.afterUse(g, hooks);
          break;
        }
        case 'queue': {
          const t = g.target;
          const f = t && t.kind === 'facility' ? this.facilities.byUid(t.uid) : undefined;
          if (!f || hooks?.closing?.()) { g.queuePos = -1; g.target = null; if (hooks?.closing?.()) this.leaveOrRetreat(g, hooks); else { g.state = 'wander'; g.stateTicks = 0; } break; }
          const def = this.facilities.defOf(f);
          if (g.queuePos === 0 && this.busyAt(f) < capacityOf(def, f)) {
            // 내 차례 — 뒤 사람들이 한 칸씩 당겨진다
            for (const o of this.list) if (o.state === 'queue' && o.target?.kind === 'facility' && o.target.uid === f.uid && o.queuePos > 0) o.queuePos--;
            g.queuePos = -1;
            this.startUse(g, f, def);
            break;
          }
          if (g.stateTicks >= QUEUE_PATIENCE) {
            // 참을성이 다했다 — 만족 −3, 뒤 사람들이 당겨진다
            for (const o of this.list) if (o.state === 'queue' && o.target?.kind === 'facility' && o.target.uid === f.uid && o.queuePos > g.queuePos) o.queuePos--;
            g.queuePos = -1; g.target = null; g.sat = Math.max(0, g.sat - 3); g.say = '너무 오래 기다렸어'; setEmote(g, 'grr');
            g.state = 'wander'; g.stateTicks = 0;
          }
          break;
        }
        case 'eat': {
          if (g.stateTicks < EAT_TICKS) break;
          g.carry = false;
          if (g.hp < this.b.guestHpLeave) this.leaveOrRetreat(g, hooks); else g.state = 'wander';
          g.stateTicks = 0;
          break;
        }
        case 'swim': {
          if (g.progress < 1) g.progress = Math.min(1, g.progress + 0.125);
          const poolId = g.target && g.target.kind === 'pool' ? g.target.id : null;
          // 물 위에서 떠다닌다 (G26) — 주기마다 같은 풀의 이웃 칸으로 옮긴다
          if (g.stateTicks % DRIFT_EVERY === 0 && g.progress >= 1) {
            const pool = poolId === null ? undefined : this.pools.byId(poolId);
            if (pool) {
              const opts = NEIGHBORS.map(([di, dj]) => (g.j + dj) * this.grid.w + (g.i + di)).filter((k) => this.pools.ownerIdK(k) === pool.id && this.pools.isOpenK(k)); // P50-a R7: 기구 밑으론 안 떠간다
              const k = opts[this.rng.int(Math.max(1, opts.length))];
              if (k !== undefined) { g.fromI = g.i; g.fromJ = g.j; g.i = k % this.grid.w; g.j = Math.floor(k / this.grid.w); g.progress = 0; g.swimTile = k; }
            }
          }
          const temp = poolId === null ? 26 : (hooks?.poolTemp?.(poolId) ?? 26);
          const off = Math.abs(temp - g.prefTemp) > this.b.tempTolerance;
          const fit = poolId === null ? 1 : (hooks?.poolTempFit?.(poolId) ?? 1);
          const stay = Math.floor((off ? this.b.swimTicks / 2 : this.b.swimTicks) * (0.85 + 0.3 * fit));
          if (g.stateTicks < stay) break;
          g.hp -= this.b.guestHpSwim * (off ? 2 : 1) * (hooks?.hpMul?.() ?? 1);
          const satBefore = g.sat;
          g.sat = Math.min(100, g.sat + (off ? 3 : 10) * (hooks?.satMul?.() ?? 1));
          if (satBefore < 100 && g.sat >= 100) g.say = '최고의 하루!';
          setEmote(g, off ? 'grr' : 'heart');
          // P60-a: 색·향 취향 일치(favHit 0.3) 삭제 — 수영 뒤 사진 확률은 0.12 고정
          if (!off && g.sat >= 50 && g.photos < 1 && poolId !== null && this.rng.chance(Math.min(0.6, 0.12 * (hooks?.photoMul?.() ?? 1)))) {
            g.photos++;
            hooks?.onPhoto?.(g, { kind: 'pool', ref: poolId });
          }
          // 뭍으로 — 떠다니다 풀 안쪽에 있으면 가장 가까운 물가로 헤엄쳐 나온다 (G26: 없으면 손님이 조용히 증발했다)
          const back = this.adjacentWalkable(g) ?? this.nearestWalkable(g, 6);
          if (back) {
            g.fromI = g.i;
            g.fromJ = g.j;
            g.i = back.i;
            g.j = back.j;
            g.progress = 0;
          }
          g.swimTile = null;
          g.target = null;
          g.hunger = Math.min(100, g.hunger + this.b.hungerPerSwim); // P27: 물에서 나오면 배가 고프다 — 출구 가까운 먹거리가 먼저 팔린다
          if (g.hp < this.b.guestHpLeave || hooks?.closing?.()) this.leaveOrRetreat(g, hooks); else g.state = 'wander';
          g.stateTicks = 0;
          break;
        }
        case 'leave': {
          if (this.followArrival(g, true)) break;
          const f = this.fieldToGate();
          if (!this.advance(g, f)) {
            g.state = 'gone';
            this.leftToday++;
            hooks?.onLeave?.(g);
          }
          break;
        }
        case 'gone':
          break;
      }
    }
    this.list = this.list.filter((g) => g.state !== 'gone');
  }

  /** 시설에 들어간다 — 슬라이드는 탑으로, 라운지는 시설 칸 위로, 나머지는 입구 칸에서 (G26/G34 공용) */
  private startUse(g: Guest, f: PlacedFacility, def: FacilityDef): void {
    g.stateTicks = 0;
    if (def.slide) {
      // 탑 위로 오른다 — 활강로가 시작되는 탑 칸 (drawLanes 의 exitSide 와 같은 칸)
      const top = FacilityStore.slideTop(def, f.i, f.j, f.facing);
      g.fromI = g.i; g.fromJ = g.j; g.i = top.i; g.j = top.j; g.progress = 0;
      g.state = 'climb';
    } else if (def.class === 'lounging') {
      // 시설 칸 위로 올라가 눕는다/앉는다 — 나올 때 fromI/J(입구 칸)로 돌아온다
      g.fromI = g.i; g.fromJ = g.j; g.i = f.i; g.j = f.j; g.progress = 0;
      g.state = 'use';
    } else {
      g.state = 'use';
      g.progress = 1;
    }
  }

  /** 지금 시설을 쓰는 인원 (use·climb·ride) */
  /** P52-b — 사고 확률의 혼잡(busy/cap) 읽기 표면 */
  busyCount(f: PlacedFacility): number { return this.busyAt(f); }
  private busyAt(f: PlacedFacility): number {
    return this.list.filter((o) => (o.state === 'use' || o.state === 'climb' || o.state === 'ride') && o.target?.kind === 'facility' && o.target.uid === f.uid).length;
  }

  /** 시설 앞에 선 줄 길이 */
  queueAt(f: PlacedFacility): number {
    return this.list.filter((o) => o.state === 'queue' && o.target?.kind === 'facility' && o.target.uid === f.uid).length;
  }

  /** 시설 이용 완료 — HP·만족·이모트·사진·훅. `use`(즉시 시설)와 `ride`(슬라이드 착수)가 같이 쓴다 */
  private finishUse(g: Guest, f: PlacedFacility, hooks?: GuestHooks): void {
    const def = this.facilities.defOf(f);
    g.hp = Math.max(0, Math.min(100, g.hp + def.hpDelta));
    if (def.class === 'rig' || def.class === 'slide') g.hunger = Math.min(100, g.hunger + this.b.hungerPerRig * Math.max(1, def.thrill ?? 1)); // P60-b B1: 기구·슬라이드도 배를 곯린다(스릴 ×) — 수영(30)·탑승(25)과 같은 축, 링 위 먹거리가 먼저 팔린다
    if (def.menuSlots > 0) g.hunger = 0; // P27 먹었다
    g.sat = Math.min(100, g.sat + def.pop * 0.15 * (hooks?.satMul?.() ?? 1) * (def.class === 'lounging' ? 1 + 0.1 * (hooks?.seatValue?.(f) ?? 0) : 1)); // P17 자리 값
    g.uses++;
    setEmote(g, def.class === 'lounging' ? 'zz' : def.menuSlots > 0 ? 'note' : def.class === 'slide' || def.class === 'attraction' || def.class === 'rig' ? 'star' : 'heart'); // P48-c: 기구는 별
    f.usesToday++;
    hooks?.onFacilityUse?.(g, f);
    if (g.passBy) { hooks?.onPassBy?.(g, f, g.passBy); g.passBy = null; } // P45-b
    if (g.nightPick) { g.nightPick = false; if (hooks?.nightSet?.().has(f.uid)) hooks?.onNightUse?.(g, f); } // P45-c: 밤 분기로 고른 것만 센다(대조군 0)
    if (g.sat >= 50 && g.photos < 1 && def.pop >= 10 && this.rng.chance(Math.min(0.5, (this.b.photoChance ?? 0.12) * (hooks?.photoMul?.() ?? 1)))) { // P57-i: 손님 수를 줄인 만큼(≈0.6) 한 명의 사진 확률을 올려 좋아요 속도(친구·출신지·랭크 페이싱)를 지킨다
      g.photos++;
      g.say = '찰칵!';
      setEmote(g, 'camera');
      hooks?.onPhoto?.(g, { kind: 'facility', ref: f.uid });
    }
  }

  /** 이용 뒤 다음 상태 — 들고 있는 게 있으면 앉을 곳을 찾고(R3), 없으면 서서 먹는다 */
  private afterUse(g: Guest, hooks?: GuestHooks): void {
    g.target = null;
    g.stateTicks = 0;
    if (g.leaving) { g.state = 'leave'; return; } // P45-b: 복도 점포에 들른 뒤엔 곧장 나간다
    if (hooks?.closing?.() && g.stays && g.seatUid !== null && this.facilities.byUid(g.seatUid)) { if (!g.nightDone && this.tryNight(g, hooks)) return; g.target = { kind: 'facility', uid: g.seatUid }; g.state = 'walk'; return; } // P18 · P45-c
    if (g.hp < this.b.guestHpLeave || hooks?.closing?.()) { this.leaveOrRetreat(g, hooks); return; }
    if (g.carry) {
      const seat = this.nearestLounge(g);
      if (seat) { g.target = { kind: 'facility', uid: seat.uid }; g.state = 'walk'; return; }
      g.state = 'eat';
      setEmote(g, 'note', EAT_TICKS);
      return;
    }
    g.state = 'wander';
  }

  /** 자리가 빈 가장 가까운 라운지 (도달 가능한 것만). 없으면 null */
  private nearestLounge(g: Guest): PlacedFacility | null {
    let best: PlacedFacility | null = null;
    let bestD = 0xffff;
    for (const f of this.facilities.all) {
      const def = this.facilities.defOf(f);
      if (def.class !== 'lounging' || capacityOf(def, f) <= 0) continue;
      if (def.usageFee > 0 && f.rentedBy !== null && f.rentedBy !== rentKey(g)) continue;
      if (this.busyAt(f) >= capacityOf(def, f) && this.queueAt(f) >= QUEUE_MAX) continue;
      const d = this.fieldToFacility(f).at(g.i, g.j);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  /** 검사용·렌더용 — 손님이 서 있는 시설 (use·climb·ride 중) */
  usingFacility(g: Guest): PlacedFacility | null {
    if (g.state !== 'use' && g.state !== 'climb' && g.state !== 'ride' && g.state !== 'queue') return null;
    return g.target && g.target.kind === 'facility' ? (this.facilities.byUid(g.target.uid) ?? null) : null;
  }

  /** 목표 고르기 — 풀과 시설을 한 통에 넣고 인기·거리·필요(HP)로 가중 추첨한다 */
  /** P28-b D36 — 나갈 순간(비·목표 없음·체력·폐장)에 1박 손님은 나가지 않고 제 자리로 간다. 실측: 숙박비를 내고 정오에 「비 오네…」 하며 나갔다 */
  private leaveOrRetreat(g: Guest, hooks?: GuestHooks): void {
    if (g.stays && g.seatUid !== null && this.facilities.byUid(g.seatUid)) { g.target = { kind: 'facility', uid: g.seatUid }; g.state = 'walk'; g.stateTicks = 0; return; }
    if (!g.leaving && this.tryPassByLeave(g, hooks)) return; // P45-b: 나가는 길에 복도 곁 점포
    g.state = 'leave'; g.stateTicks = 0;
  }

  private pickTarget(g: Guest, hooks?: GuestHooks): GuestTarget | undefined {
    const cands: { t: GuestTarget; w: number }[] = [];
    const rain = hooks?.weather?.() === 'rain';
    // P45-b D63 「지나가며 산다」(입장): 아직 아무것도 안 한 손님(막 들어온)이 복도 곁 점포에 끌린다 — 백화점 스토리의 동선 위 점포
    const fresh = g.uses === 0 && g.swims === 0 && !g.carry && !(hooks?.lateDay?.()) && g.spentToday < (this.b.passBySpendCap ?? 1200);
    const enterSet = fresh && (this.b.passByEnterMul ?? 3) > 1 ? hooks?.passBy?.().enter : undefined; // 배수 1 이하 = 끔(대조군)
    for (const p of this.pools.all) {
      if (this.pools.openTilesOf(p).length === 0) continue; // P50-a R7: 기구가 다 덮은 수역은 유영 목적지가 아니다
      const d = this.fieldTo(p).at(g.i, g.j);
      if (d >= 0xffff) continue;
      let w = (1 + p.tiles.length * 0.1) / (1 + d * DIST_FALLOFF) * (g.taste?.water ?? 1); // P9 출신지 취향
      // 비 오는 날 (G34) — 실내 풀로 몰리고 야외 풀은 피한다 (매뉴얼: 실내는 날씨 무관)
      if (rain) w *= hooks?.poolIndoor?.(p.id) ? 2.5 : 0.4;
      w *= hooks?.swimUrge?.(p.id) ?? 1; // P52-c 수온
      if (g.pkg === 'swim' && !g.pkgUsed) w *= 3; // P17 수영 패키지
      cands.push({ t: { kind: 'pool', id: p.id }, w });
    }
    for (const f of this.facilities.all) {
      const def = this.facilities.defOf(f);
      if (capacityOf(def, f) <= 0) continue;
      if (def.guardRadius !== undefined) continue; // P52-b: 망루는 손님 시설이 아니다(알바 자리라 정원 1 이 붙어 있을 뿐) — 실측 128일 망루 「이용」 1,715 이 기구 몫을 0.05 부풀렸다
      if (def.usageFee > 0 && f.rentedBy !== null && f.rentedBy !== rentKey(g)) continue;
      const full = this.busyAt(f) >= capacityOf(def, f);
      if (full && this.queueAt(f) >= QUEUE_MAX) continue; // 줄도 찼다
      const d = this.fieldToFacility(f).at(g.i, g.j);
      if (d >= 0xffff) continue;
      // P27 D33 (RCT): 먹는 것은 욕구가 정한다 — 배고프면 식당 ×3 에 거리 감쇠를 좁히고(가까운 먹거리), 안 배고프면 ×0.3
      const hungry = g.hunger >= 25 && def.menuSlots > 0; // 수영 한 번(+25)이면 배고프다
      // P52-a G3 — 딥 기구는 팔찌 회수가 있어야(하드) · 어린이 딥 금지 · 팀 기구는 팀만 · 수영 실력이 깊이 선호를 대칭으로 기울인다 · 슬라이드는 팔찌 없으면 ×0.3(소프트)
      let rigMul = 1;
      if (def.class === 'rig') {
        const deep = def.depth === 'deep', s = swimSkill(g.taste?.thrill);
        if (deep && (g.band === undefined || (g.bandLeft ?? 0) < (def.bandCost ?? 1))) { if (!g.bandSaid) { g.bandSaid = true; g.say = '팔찌가 없네…'; } continue; } // ①
        if (deep && buildOf(g) === 'kid') continue; // ②
        if (def.team === true && g.teamId === null) continue; // ③
        rigMul = (deep ? s : 2 - s) * swimUrgeRig(g); // ④ ⑤
      } else if (def.class === 'slide' && g.band === undefined) rigMul = 0.3;
      let w = rigMul * (0.6 + def.pop * 0.02) / (1 + d * (hungry ? this.b.hungerFalloff : DIST_FALLOFF));
      if (def.menuSlots > 0) w *= hungry ? 3 : 0.5; // ×0.3 은 매점 몫을 0.21 로 눌렀다 — 군것질은 남긴다
      if (def.menuSlots > 0 && hooks?.blockNear?.(g, f)) w *= 1.5; // P35 D44: 내 자리 블록·접한 블록의 매점
      if (full) w *= 0.5; // 줄 서야 한다 — 절반만 끌린다 (G34)
      w *= tasteWeight(def.class, def.menuSlots, g.taste); // P9 출신지 취향
      // P17 팀 자리 — 자리가 없는 팀 손님은 평상부터, 자리가 있으면 제 자리로 돌아온다 · 패키지는 그 시설을 먼저
      if (def.class === 'lounging' && g.teamId !== null) { const ts = g.seatUid ?? hooks?.teamSeatUid?.(g) ?? null; w *= ts === null ? 5 * (1 + 0.5 * (hooks?.seatValue?.(f) ?? 0)) : f.uid === ts ? 4 : 0.3; } // P24: 좋은 자리부터 · P28-b: 팀이 잡은 줄로 모인다
      if (g.pkg && !g.pkgUsed) { if (g.pkg === 'meat' && def.menuSlots > 0) w *= 4; if (g.pkg === 'gear' && def.id === 'dock') w *= 4; if (g.pkg === 'stay' && def.lodging === true) w *= 4; }
      if (g.carry) w *= def.class === 'lounging' ? 6 : 0.2; // 산 것을 들고 있으면 앉을 곳부터 (R3)
      if (g.hp < 40 && def.hpDelta > 0) w *= 3;
      if (g.hp >= 70 && def.hpDelta > 0) w *= 0.3;
      if (enterSet?.has(f.uid)) w *= this.b.passByEnterMul ?? 3; // P45-b 복도 곁
      cands.push({ t: { kind: 'facility', uid: f.uid }, w });
    }
    if (cands.length === 0) return undefined;
    const total = cands.reduce((s, c) => s + c.w, 0);
    let r = this.rng.next() * total;
    let chosen: GuestTarget | undefined = cands[cands.length - 1]?.t;
    for (const c of cands) {
      r -= c.w;
      if (r <= 0) { chosen = c.t; break; }
    }
    g.passBy = chosen && chosen.kind === 'facility' && enterSet?.has(chosen.uid) ? 'enter' : null;
    return chosen;
  }

  /** P45-c D63 밤 분기: 폐장 뒤 남는 팀 손님이 밤 시설(실내 놀이 — 찜질·사우나·무대·노래방·오락기) 하나에 들른다. 손님 rng 만 */
  private tryNight(g: Guest, hooks?: GuestHooks): boolean {
    const set = hooks?.nightSet?.(); if (!set || set.size === 0) return false;
    if (!this.rng.chance(this.b.nightChance ?? 0.5)) { g.nightDone = true; return false; }
    const cands: { uid: number; w: number }[] = [];
    for (const uid of set) {
      const f = this.facilities.byUid(uid); if (!f) continue;
      const def = this.facilities.defOf(f);
      if (capacityOf(def, f) <= 0 || this.busyAt(f) >= capacityOf(def, f)) continue;
      const d = this.fieldToFacility(f).at(g.i, g.j); if (d >= 0xffff) continue;
      cands.push({ uid, w: (1 + def.pop * 0.02) / (1 + d * 0.05) });
    }
    g.nightDone = true;
    if (cands.length === 0) return false;
    const total = cands.reduce((a, c) => a + c.w, 0);
    let r = this.rng.next() * total; let pick = cands[cands.length - 1]!.uid;
    for (const c of cands) { r -= c.w; if (r <= 0) { pick = c.uid; break; } }
    g.target = { kind: 'facility', uid: pick }; g.state = 'walk'; g.stateTicks = 0; g.nightPick = true; g.say = this.rng.chance(0.4) ? '밤엔 실내지' : null;
    return true;
  }
  /** P45-b D63 「지나가며 산다」(퇴장): 나가려는 손님이 복도 곁 퇴장 점포(샤워·드라이룸·기념품·포장)에 들른다 — 지갑·확률(늦은 오후 ×1.5). 손님 rng 만 쓴다(결정론) */
  private tryPassByLeave(g: Guest, hooks?: GuestHooks): boolean {
    if (g.stays || g.leaving || hooks?.closing?.() || g.spentToday >= (this.b.passBySpendCap ?? 1200)) return false;
    const set = hooks?.passBy?.().leave; if (!set || set.size === 0) return false;
    const cands: { uid: number; w: number }[] = [];
    for (const uid of set) {
      const f = this.facilities.byUid(uid); if (!f) continue;
      const def = this.facilities.defOf(f);
      if (capacityOf(def, f) <= 0) continue;
      const full = this.busyAt(f) >= capacityOf(def, f);
      if (full && this.queueAt(f) >= QUEUE_MAX) continue;
      const d = this.fieldToFacility(f).at(g.i, g.j); if (d >= 0xffff) continue;
      cands.push({ uid, w: 1 / (1 + d * 0.05) });
    }
    if (cands.length === 0) return false;
    if (!this.rng.chance(Math.min(1, (this.b.passByLeaveChance ?? 0.3) * (hooks?.lateDay?.() ? 1.5 : 1)))) return false;
    const total = cands.reduce((a, c) => a + c.w, 0);
    let r = this.rng.next() * total; let pick = cands[cands.length - 1]!.uid;
    for (const c of cands) { r -= c.w; if (r <= 0) { pick = c.uid; break; } }
    g.target = { kind: 'facility', uid: pick }; g.state = 'walk'; g.stateTicks = 0; g.leaving = true; g.passBy = 'leave';
    return true;
  }

  /** 거리장을 따라 한 tick 전진. 목표에 이미 있으면 false */
  private advance(g: Guest, f: DistanceField): boolean {
    if (g.progress < 1) {
      g.progress = Math.min(1, g.progress + 1 / this.b.walkTicksPerTile);
      return true;
    }
    if (f.at(g.i, g.j) === 0) return false;
    const n = f.next(g.i, g.j);
    if (!n) return false;
    g.fromI = g.i;
    g.fromJ = g.j;
    g.facing = n.i > g.i ? 0 : n.j > g.j ? 1 : n.i < g.i ? 2 : 3;
    g.i = n.i;
    g.j = n.j;
    g.progress = 0;
    return true;
  }

  private adjacentPoolTile(g: Guest, pool: Pool): number | null {
    for (const [di, dj] of NEIGHBORS) {
      const k = (g.j + dj) * this.grid.w + (g.i + di);
      if (this.pools.ownerIdK(k) === pool.id && this.pools.isOpenK(k)) return k; // P50-a R7: 입수는 open 물로만
    }
    return null;
  }

  /** 반경 r 안의 가장 가까운(맨해튼) 설 수 있는 칸 — 동점은 (dj, di) 순서로 결정론 */
  /** 시설이 놓인 발자국 위에 서 있던 손님을 가장 가까운 뭍으로 (G57 — 그 자리에서 즉시 퇴장하거나 시설로 순간이동하던 버그) */
  evictFrom(tiles: readonly { i: number; j: number }[]): number {
    const set = new Set(tiles.map((t) => `${t.i},${t.j}`));
    let n = 0;
    for (const g of this.list) {
      if (!set.has(`${g.i},${g.j}`)) continue;
      // P14: 발자국이 2×2 이상이면 「옆 칸」도 발자국 안일 수 있다 — 발자국 밖으로만 민다
      const out = (t: { i: number; j: number } | null): { i: number; j: number } | null => (t && !set.has(`${t.i},${t.j}`) ? t : null);
      let to = out(this.adjacentWalkable(g));
      if (!to) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) { const c = { i: g.i + di, j: g.j + dj }; if (this.grid.wallBetween(g.i, g.j, c.i, c.j)) continue; /* P39 */ if (!set.has(`${c.i},${c.j}`) && this.walkable(c.i, c.j)) { to = c; break; } }
      if (!to) to = out(this.nearestWalkable(g, 6)) ?? this.nearestWalkable(g, 8) ?? { i: this.gate.i, j: this.gate.j }; // P16: 길만 걷는 세계라 근처에 없을 수 있다 — 입구로
      if (!to) continue;
      g.i = to.i; g.j = to.j; g.fromI = to.i; g.fromJ = to.j;
      g.target = null;
      if (g.state !== 'leave') { g.state = 'wander'; g.stateTicks = 0; }
      n++;
    }
    return n;
  }

  private nearestWalkable(g: Guest, r: number): { i: number; j: number } | null {
    for (let d = 2; d <= r; d++) {
      for (let dj = -d; dj <= d; dj++) {
        const rem = d - Math.abs(dj);
        for (const di of rem === 0 ? [0] : [-rem, rem]) {
          if (this.walkable(g.i + di, g.j + dj)) return { i: g.i + di, j: g.j + dj };
        }
      }
    }
    return null;
  }

  private adjacentWalkable(g: Guest): { i: number; j: number } | null {
    // 들어온 방향을 우선 — 없으면 아무 뭍
    const back = { i: g.fromI, j: g.fromJ };
    if (this.walkable(back.i, back.j) && this.grid.canCross(g.i, g.j, back.i, back.j)) return back;
    for (const [di, dj] of NEIGHBORS) {
      if (this.walkable(g.i + di, g.j + dj) && this.grid.canCross(g.i, g.j, g.i + di, g.j + dj)) return { i: g.i + di, j: g.j + dj }; // P39 벽
    }
    return null;
  }

  toSnapshot(): GuestSnapshot {
    return { nextUid: this.nextUid, guests: this.list.map((g) => ({ ...g })) };
  }

  fromSnapshot(s: GuestSnapshot): void {
    this.nextUid = s.nextUid;
    this.list = s.guests.map((g) => ({ ...g, passBy: g.passBy ?? null, leaving: g.leaving ?? false, nightDone: g.nightDone ?? false, nightPick: g.nightPick ?? false, teamId: g.teamId ?? null, seatUid: g.seatUid ?? null, pkg: g.pkg ?? null, pkgUsed: g.pkgUsed ?? false, slept: g.slept ?? false, stays: g.stays ?? false, hunger: g.hunger ?? 0, name: g.name ?? '손님', age: g.age ?? 20, gender: g.gender ?? 'M', home: g.home ?? '이 동네', spentToday: g.spentToday ?? 0, emote: g.emote ?? null, emoteTtl: g.emoteTtl ?? 0, float: g.float ?? 0, rideIdx: g.rideIdx ?? -1, carry: g.carry ?? false, queuePos: g.queuePos ?? -1 }));
    this.invalidate();
  }
}

const SWIM_LINES = ['시원해!', '첨벙!', '좋다~', '물이 딱 좋아'];
const RIDE_LINES = ['우와아—!', '꺄악!', '한 번 더!'];
