/**
 * 카이로 헤드리스 밸런싱 러너.
 *
 *   npm run sim:kairo                        기본 (시드 20개 × 12주)
 *   npm run sim:kairo -- --seeds 100 --weeks 24
 *   npm run sim:kairo -- --determinism       같은 시드가 같은 결과를 내는지
 *   npm run sim:kairo -- --maps              맵마다 결과가 달라지는지 (§4.5)
 *   npm run sim:kairo -- --json
 *
 * ## 왜 헤드리스인가
 *
 * 불변식 1(sim 은 렌더러를 모른다) 덕에 브라우저 없이 돈다. 이게 도는 것 자체가 그
 * 불변식의 실증이다. 수백 시즌을 몇 초에 돌려야 "이 숫자가 재미있는 범위인가"를 눈이
 * 아니라 분포로 판단할 수 있다.
 *
 * ## 어떤 봇으로 짓나
 *
 * 사람처럼 "결산의 병목을 보고 그 종류를 짓는" 봇이다. 무작위로 짓는 봇은 밸런스가
 * 나쁜지 봇이 멍청한지 구분이 안 된다.
 */
import { Rng } from '../src/sim/rng.js';
import { KairoTerrain } from '../src/sim/kairo/terrain.js';
import { WallGrid } from '../src/sim/kairo/walls.js';
import { bakeIndoorWalls } from '../src/sim/kairo/indoor.js';
import { applyStartKit } from '../src/sim/kairo/startkit.js';
import { GROUND_KINDS } from '../src/sim/kairo/terrain.js';
import {
  PlacementGrid,
  allFacilityDefs,
  FACILITY_MAX_LEVEL,
  guestWalkable,
} from '../src/sim/kairo/placement.js';
import { GuestStore, GUEST_DEFAULTS, TICKET_DEF_ID } from '../src/sim/kairo/guests.js';
import { WeekRunner, type NeedKind, type Season, type WeekReport } from '../src/sim/kairo/week.js';
import { evaluateCombos, comboEffect } from '../src/sim/kairo/combos.js';
import { CardStore, CARD_RNG_SALT, optionCash, triggerCard } from '../src/sim/kairo/cards.js';
import { assessRisk, accidentChance } from '../src/sim/kairo/risk.js';
import { mapType, shiftedShares, MAP_TYPES } from '../src/sim/kairo/scenario.js';
import { seasonShares } from '../src/sim/kairo/groups.js';
import { StaffStore, STAFF_ROLES, neededFor } from '../src/sim/kairo/staff.js';
import {
  CourseStore,
  PRESETS,
  COURSE_EQUIPMENT,
  defaultHandles,
  validateCourse,
  fitOf,
} from '../src/sim/kairo/course.js';
import {
  questStatuses,
  ProgressStore,
  gradeFor,
  nextGrade,
  admissionLimit,
  Reputation,
  landRect,
  GRADES,
} from '../src/sim/kairo/progress.js';
import { poolZones, POOL_KIND, POOL_MIN_TILES } from '../src/sim/kairo/swim.js';
import { UnlockStore } from '../src/sim/kairo/unlocks.js';
import { ExamStore } from '../src/sim/kairo/exam.js';
import { WishStore } from '../src/sim/kairo/wishes.js';
import { COMBOS } from '../src/sim/kairo/combos.js';

const args = process.argv.slice(2);
const flag = (name: string, dflt: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const SEEDS = flag('seeds', 20);
const WEEKS = flag('weeks', 12);
const JSON_OUT = args.includes('--json');
const DETERMINISM = args.includes('--determinism');
/** 맵별 비교 — 맵마다 최적 빌드가 달라지는지 (§4.5) */
const MAPS = args.includes('--maps');
/**
 * 판별 결과를 **판마다** 찍는다.
 *
 * 중앙값만 보면 "절반은 5등급, 절반은 1등급" 같은 **양극화를 못 본다** — 중앙값은 그
 * 가운데 어딘가를 가리킬 뿐이다. 원인을 찾으려면 갈린 판을 각각 봐야 한다.
 */
const EACH = args.includes('--each');

/*
 * ⚠ **실제 판과 같은 격자여야 한다** (K36).
 *
 * K9 부터 여기는 40×32 · 게이트 (2,2) 였다. K25 에서 게임이 64×48 이 된 뒤로 헤드리스
 * 밸런싱은 **실제 판과 다른 세계**를 재고 있었다 — 등급 4~5 토지(당시 54×46)를 봇은
 * 격자 밖이라 아예 못 썼다. "후반이 빈다" 경보의 일부가 그 때문일 수 있었다.
 *
 * 렌더 상수를 sim 도구가 import 하면 불변식 1(sim 은 렌더를 모른다)에 걸리므로,
 * 값을 여기 적되 **테스트가 iso.ts 와 같은지 확인**한다.
 */
const GRID_W = 96;
const GRID_H = 72;

const GATE = KairoTerrain.parkGate();

/** 봇이 건설에 안 쓰고 남기는 예비비 — 카드 한 장의 최대 지출을 버틸 만큼 */
const BUILD_RESERVE = 1_500_000;

/** 가장 싼 시설 — 이보다 예산이 적으면 "자리"가 아니라 "돈"이 문제다 */
const CHEAPEST_FACILITY = Math.min(...allFacilityDefs().map((d) => d.cost));

interface RunResult {
  seed: number;
  weeks: number;
  cash: number;
  facilities: number;
  /**
   * 수영장(땅) 구역 수 (S2) — 0 이면 봇이 수영 경제를 안 재고 있는 것이다.
   * 봇이 파는 것은 수영장뿐이라 강 구역(덱 밀폐)은 안 센다 — 세려면 `riverZones` 에
   * `waterBarrierKeys()` 까지 넘겨야 한다.
   */
  swimZones: number;
  /**
   * 가장 큰 수영장의 면적 (칸, P1-A). 구역 **수**만 보면 면적 비례 증폭이 재지는지
   * 알 수 없다 — 4칸짜리 하나와 32칸짜리 하나는 콤보 배율이 2배 차이인데 둘 다 "1" 이다.
   */
  swimArea: number;
  /** 심사로 딴 실제 등급 (K42) — `grade`(만족도 환산 표시값)와 다르다. 해금은 이걸 따른다 */
  examGrade: number;
  combos: number;
  /**
   * 마지막 주 기준 콤보 원점수 합 (체감·면적 배율까지 곱한 값). **발동 수만 보면
   * 경제에 얼마나 실렸는지 알 수 없다** — 소형 40종은 3점이고 대형은 15점이라
   * "27개 발동"이 81점일 수도 200점일 수도 있다. 상한이 무는지도 이 줄로 본다.
   */
  comboSatRaw: number;
  comboRevRaw: number;
  /** 상한을 통과한 뒤 실제로 경제에 실린 값 (`comboEffect`) */
  comboSatApplied: number;
  comboRevPct: number;
  grade: number;
  exitSat: number;
  turnedAwayRatio: number;
  gaveUpRatio: number;
  questsDone: number;
  bankrupt: boolean;
  /** 주차별 손익 — 성장 곡선을 본다 */
  profitByWeek: number[];
  /** 주차별 계절 — 성장 판정은 **같은 계절끼리** 비교해야 한다 */
  seasonByWeek: Season[];
  /** 건설이 막힌 주 — **안 짓기로 / 돈이 없어서 / 자리가 없어서**를 나눠서 센다 */
  buildPoor: number;
  buildReserved: number;
  buildNoSpace: number;
  buildFailWhy: [string, number][];
  buildCapped: number;
  /** 개선에 쓴 돈과 평균 단계 — 후반 공백이 메워졌는지 본다 */
  upgradeSpend: number;
  avgLevel: number;
  /** 사고 횟수 — 위험도 관리가 계측에 나타나는지 */
  accidents: number;
  /** 마지막 위험 단계 — "사고 0회"가 관리 덕인지 확률이 0이라 그런지 가른다 */
  riskLevel: string;
  mapId: string;
  /**
   * 마지막 주의 손님 상태. **만족도 0 이 "나쁜 경험"인지 "아무도 퇴장하지 않음"인지**
   * 가른다 — 둘은 원인이 완전히 다르다.
   */
  lastAlive: number;
  lastGaveUp: number;
  lastIdle: number;
  lastVisitors: number;
  /** 마지막 주에 매표소를 못 지나 돌아간 손님 — 0 이 아니면 입장 자체가 막힌 것이다 */
  lastNoTicket: number;
  /** 매표소를 다시 지은 횟수 (가둬져서) */
  ticketRebuilds: number;
  /** 마지막 주 손님 구성 비율 — 맵이 구성을 바꾸는지 확인 */
  familyRatio: number;
  friendsRatio: number;
  /** 위험 단계였던 주의 비율 */
  riskyWeeks: number;
  /** 뽑힌 카드 수와 카드로 나간 돈 — 카드가 경제를 얼마나 흔드나 */
  cardsSeen: number;
  cardSpend: number;
  /** 주 평균 직원 수와 주차별 인건비 */
  staffWeeks: number;
  wagesByWeek: number[];
  courseCount: number;
  /** 산(단≥1) 위에 놓인 시설 수와 전체 — 높이가 헤드리스에서도 쓰이는지 (K37) */
  onSlope: number;
  builtTotal: number;
  courseFail: string;
  courseRevByWeek: number[];
  /** 주차별 수익·유지비 — "무엇이 손익을 깎는가"를 가른다 */
  revenueByWeek: number[];
  upkeepByWeek: number[];
  cashByWeek: number[];
  buildSpendByWeek: number[];
}

/**
 * 실내 시설을 놓을 방을 마련한다 — 없으면 하나 짓는다.
 *
 * ⚠ 봇에 **진짜 건물**이 필요해진 이유: 실내 시설 9종의 조건이 "벽에 접함"에서
 * "건물 안"으로 바뀌었다 (K25 검토 ①). 예전처럼 경계 몇 줄만 세워 두면 봇은 위생
 * 시설을 하나도 못 지어, 밸런싱이 실제 게임과 완전히 다른 판을 돌게 된다.
 *
 * ⚠ 건물값은 아직 안 낸다 (검토 ⑥ — 플레이어는 칸당 4만원을 낸다). 그 차이를 메우는
 * 것은 밸런스를 움직이는 변경이라 따로 다룬다.
 */
function ensureRoom(
  t: KairoTerrain,
  w: WallGrid,
  p: PlacementGrid,
  land: ReturnType<typeof landRect>,
  rng: Rng,
  need: { w: number; h: number },
): number {
  const stand = guestWalkable(t, p);
  const floorCost = GROUND_KINDS.find((k) => k.id === 'floor_indoor')?.cost ?? 0;

  /** 이 칸에 실내 바닥을 깔아도 되나 — 실외 시설을 삼키지 않는 게 핵심이다 */
  const paintable = (i: number, j: number): boolean =>
    t.inside(i, j) &&
    i < land.w &&
    j < land.h &&
    t.isWalkable(i, j) &&
    !(i === GATE.i && j === GATE.j) &&
    (p.handleAt(i, j) === 0 || t.isIndoor(i, j));

  /** 사각형만큼 깔아 본다. 벽 굽기가 실패하면 통째로 되돌린다 */
  const tryPatch = (i0: number, j0: number, pw: number, ph: number): number => {
    const before: [number, number, string][] = [];
    for (let j = j0; j < j0 + ph; j++) {
      for (let i = i0; i < i0 + pw; i++) {
        if (!paintable(i, j)) return 0;
        const k = t.kindAt(i, j);
        if (k === null) return 0;
        if (k !== 'floor_indoor') before.push([i, j, k]);
      }
    }
    if (before.length === 0) return 0; // 이미 전부 실내다
    for (const [i, j] of before) t.paint(i, j, 'floor_indoor');
    if (bakeIndoorWalls(t, w, GATE, stand).ok) return before.length * floorCost;
    for (const [i, j, k] of before) t.paint(i, j, k);
    bakeIndoorWalls(t, w, GATE, stand);
    return 0;
  };

  /*
   * ① **기존 방 옆에 이어 깐다.** 카이로에서 방을 넓히는 건 옆 칸에 바닥을 한 줄 더
   * 까는 것뿐이다 — 사각형을 다시 그리는 절차가 없다.
   */
  const strip = Math.max(2, need.h + 1);
  for (let j = 0; j < land.h; j++) {
    for (let i = 0; i < land.w; i++) {
      if (!t.isIndoor(i, j)) continue;
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
        [-need.w, 0],
        [0, -strip],
      ] as const) {
        const spent = tryPatch(i + di, j + dj, need.w + 1, strip);
        if (spent > 0) return spent;
      }
    }
  }

  /*
   * ② **한 칸씩 넓힌다.** ①의 덩어리 확장은 외곽선이 크게 바뀌어 문 낼 자리가 사라지는
   * 일이 잦다 (실측: 실패 623건 중 대부분이 `bake-fail`). 봇이 방 둘레를 시설로 둘러싸면
   * 큰 사각형은 어디로도 못 자란다.
   *
   * 사람은 그럴 때 **옆 칸에 한 칸만 더 깐다.** 외곽선이 조금만 바뀌니 문이 살아남는다.
   * 한 번에 시설이 들어갈 만큼은 아니지만 몇 주에 걸쳐 방이 자란다.
   */
  for (let j = 0; j < land.h; j++) {
    for (let i = 0; i < land.w; i++) {
      if (!t.isIndoor(i, j)) continue;
      for (const [di, dj] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as const) {
        const spent = tryPatch(i + di, j + dj, 1, 1);
        if (spent > 0) return spent;
      }
    }
  }

  // ③ 이어 깔 수 없으면 새 자리에 한 덩어리
  for (let attempt = 0; attempt < 60; attempt++) {
    const pw = need.w + 2;
    const ph = Math.max(3, need.h + 2);
    const spent = tryPatch(
      rng.int(Math.max(1, land.w - pw)),
      rng.int(Math.max(1, land.h - ph)),
      pw,
      ph,
    );
    if (spent > 0) return spent;
  }
  return 0;
}

/** 병목을 보고 그 종류를 짓는 봇 */
/**
 * 시설 자리까지 **길을 깐다** (K32-B).
 *
 * ⚠ 봇에도 넣어야 한다. 잔디를 못 걷게 되면서 봇이 뽑은 자리는 대부분 `unreachable` 이
 * 된다 — 안 넣으면 헤드리스 숫자가 "아무것도 못 짓는 판"이 되어 실제 게임과 갈라진다.
 * 토지 해금을 봇에 안 넣었을 때와 같은 종류의 사고다.
 *
 * 0-1 BFS 로 **새로 깔 칸이 가장 적은** 경로를 찾는다. 이미 포장된 칸은 값이 0,
 * 잔디는 1. 물·시설이 막은 칸은 못 지난다. 실제로 깐 칸 수 × 석재값을 돌려준다.
 */
function ensurePath(
  t: KairoTerrain,
  w: WallGrid,
  p: PlacementGrid,
  land: ReturnType<typeof landRect>,
  target: { i: number; j: number; w: number; h: number },
): number {
  const stand = guestWalkable(t, p);
  const stoneCost = GROUND_KINDS.find((k) => k.id === 'path_stone')?.cost ?? 0;
  const W = t.width;
  const H = t.height;

  /** 목표 발자국에 인접한 칸들 — 손님은 시설 옆에 서서 쓴다 */
  const goals: number[] = [];
  for (let dj = -1; dj <= target.h; dj++) {
    for (let di = -1; di <= target.w; di++) {
      const inI = di >= 0 && di < target.w;
      const inJ = dj >= 0 && dj < target.h;
      if (inI === inJ) continue; // 발자국 자신과 대각선은 뺀다
      const ni = target.i + di;
      const nj = target.j + dj;
      /*
       * ⚠ 경계는 i0+w 다 — **크기(w)와 비교하던 버그**가 있었다. 토지가 게이트 중심으로
       * 좌우로 자라면서 i0 > 0 이 됐는데(K36), i ≥ 26 인 목표가 전부 버려져 ensurePath 가
       * 지도 대부분에서 조용히 0 을 돌려줬다. unreachable 57회/판의 정체가 이것이었다.
       */
      if (
        !t.inside(ni, nj) ||
        ni < land.i0 ||
        nj < land.j0 ||
        ni >= land.i0 + land.w ||
        nj >= land.j0 + land.h
      ) continue;
      goals.push(nj * W + ni);
    }
  }
  if (goals.length === 0) return 0;

  const INF = 1 << 20;
  const dist = new Int32Array(W * H).fill(INF);
  const prev = new Int32Array(W * H).fill(-1);
  const start = GATE.j * W + GATE.i;
  dist[start] = 0;
  /* 0-1 BFS — 덱 대신 배열 두 개(현재 값 / 다음 값)를 번갈아 쓴다 */
  let cur: number[] = [start];
  let next: number[] = [];
  let d = 0;
  while (cur.length > 0 || next.length > 0) {
    if (cur.length === 0) {
      cur = next;
      next = [];
      d++;
      continue;
    }
    const k = cur.pop() as number;
    if ((dist[k] as number) < d) continue;
    const i = k % W;
    const j = (k - i) / W;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      /*
       * ⚠ 여기도 크기-vs-경계 버그였다 (위 goals 필터와 같은 짝). 게이트가 i=48 인데
       * `ni >= land.w(26)` 로 걸러서 **BFS 가 첫 발도 못 뗐다** — K36(토지가 게이트
       * 중심으로 좌우 성장) 이후 ensurePath 전체가 조용히 0 만 돌려주고 있었다.
       * 봇의 unreachable 57회/판의 진짜 원인.
       */
      if (
        !t.inside(ni, nj) ||
        ni < land.i0 ||
        nj < land.j0 ||
        ni >= land.i0 + land.w ||
        nj >= land.j0 + land.h
      ) continue;
      if (w.blocksMove(i, j, ni, nj)) continue;
      if (!t.isWalkable(ni, nj)) continue; // 물은 못 지난다
      if (p.blocksWalk(ni, nj)) continue; // 시설이 막은 칸
      const step = stand(ni, nj) ? 0 : 1;
      const nk = nj * W + ni;
      if ((dist[k] as number) + step >= (dist[nk] as number)) continue;
      dist[nk] = (dist[k] as number) + step;
      prev[nk] = k;
      (step === 0 ? cur : next).push(nk);
    }
  }

  let best = -1;
  for (const g of goals) if (best < 0 || (dist[g] as number) < (dist[best] as number)) best = g;
  if (best < 0 || (dist[best] as number) >= INF) return 0;
  if ((dist[best] as number) === 0) return 0; // 이미 이어져 있다

  let paved = 0;
  for (let k = best; k >= 0; k = prev[k] as number) {
    const i = k % W;
    const j = (k - i) / W;
    if (!stand(i, j) && t.paint(i, j, 'path_stone')) paved++;
  }
  return paved * stoneCost;
}

/**
 * 매표소를 **먼저** 세운다 (K36-B②).
 *
 * ⚠ 매표소가 없으면 손님이 한 명도 못 들어와 판이 통째로 죽는다 — 수입 0 · 등급 1 ·
 * 예산 0 이라 다시 지을 수도 없다. 물려받은 빠지(`applyStartKit`)가 보통 하나를 주지만,
 * 지형에 따라 `skipped` 로 빠질 수 있다. 사람이라면 그때 제일 먼저 매표소를 짓는다 —
 * 봇의 정책도 그래야 헤드리스가 재는 것이 "게임"이지 "봇의 실수"가 아니다.
 *
 * 게이트에서 가까운 순으로 훑는다 — 무작위로 뽑으면 판마다 매표소가 딴 데 서서
 * 정류장→매표소 거리가 시드 잡음이 된다. 결정론 (불변식 2).
 */
function ensureTicket(
  t: KairoTerrain,
  w: WallGrid,
  p: PlacementGrid,
  g: GuestStore,
  land: ReturnType<typeof landRect>,
  cash: number,
): number {
  /*
   * ⚠ **"있다"가 아니라 "닿는다"를 본다.**
   *
   * 배치 검사(`p.check`)의 도달 판정은 **놓는 시설**만 본다 — 새 시설이 이미 있던 시설을
   * 가둬도 아무도 막지 않는다 (실내만 `would-strand` 가 지킨다). 예전엔 그래 봐야 시설
   * 하나가 놀았지만, 매표소가 갇히면 **입장이 0** 이 되어 판이 통째로 죽는다
   * (실측: 12판 중 7판이 3~9주차에 이 상태로 들어가 만족도 0 · 등급 1 로 끝났다).
   * 사람이라면 "손님이 안 들어온다"를 보고 입구 옆에 하나 더 짓는다.
   */
  const stop = KairoTerrain.busStop();
  if (p.all().some((it) => it.defId === TICKET_DEF_ID && g.distanceTo(it.handle, stop.i, stop.j) >= 0)) {
    return 0;
  }
  const def = allFacilityDefs().find((d) => d.id === TICKET_DEF_ID);
  if (!def || def.cost > cash) return 0;
  const opts = { land };
  for (let r = 1; r <= 12; r++) {
    for (let dj = 0; dj <= r; dj++) {
      for (const di of [-r, r, ...Array.from({ length: 2 * r - 1 }, (_, k) => k - r + 1)]) {
        const i = GATE.i + di;
        const j = GATE.j + dj;
        if (Math.max(Math.abs(di), dj) !== r) continue;
        if (!p.check(t, w, GATE, TICKET_DEF_ID, i, j, opts).ok) {
          // 길만 없으면 깔고 다시 본다 (다른 시설과 같은 정책)
          const paved = ensurePath(t, w, p, land, {
            i,
            j,
            w: def.size[0] as number,
            h: def.size[1] as number,
          });
          if (paved === 0) continue;
          if (!p.check(t, w, GATE, TICKET_DEF_ID, i, j, opts).ok) continue;
          p.place(t, w, GATE, TICKET_DEF_ID, i, j, opts);
          return (def as unknown as { cost: number }).cost + paved;
        }
        p.place(t, w, GATE, TICKET_DEF_ID, i, j, opts);
        return (def as unknown as { cost: number }).cost;
      }
    }
  }
  return 0;
}

/** 수영장 붓값 — **칸당**. `kairo-ground.json` 의 pool_water `cost` 와 같아야 한다 */
const POOL_TILE_COST = 40_000;

/**
 * 한 주에 넓히는 최대 칸 수. 4칸 = 16만 — 최소 규격 하나치다.
 *
 * ⚠ 한 번에 목표 크기(32칸= 128만)를 파게 하면 **오히려 수영장이 줄어든다**: 봇의
 * 예비비(`BUILD_RESERVE`)가 150만인데 현금 중앙값이 156만이라, 예비비 위로 남는 돈이
 * 한 주에 수십만 뿐이다 — 128만짜리 지출은 사실상 승인되지 않는다. 16만짜리
 * 2×2 조차 26주 중앙값 0판이었다 (P1-A 전 실측). 사람도 풀을 조금씩 넓힌다.
 */
const POOL_GROW_TILES = 4;

/**
 * 봇이 목표하는 수영장 면적 — `kairo-combos.json` 의 `medium_pool_party`
 * `areaScale`(base 8 · cap 2) 상한 도달점 base × cap² = 32칸.
 *
 * ⚠ 이 값이 곧 **헤드리스가 재는 면적 축의 폭**이다. 4칸(최소 규격)만 파면 면적 배율이
 * 영원히 1 이라, 면적 비례를 넣고도 밸런싱은 "상수 콤보 세계"를 잰다 (P1-A 착수 시 실측).
 */
const POOL_TARGET_TILES = 32;

const POOL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * 수영장을 판다 (S2) — 2등급부터. 없으면 최소 규격 2×2 를 파고, **있으면 목표 면적까지
 * 매주 조금씩 넓힌다** (P1-A).
 *
 * 봇이 안 지으면 헤드리스가 수영 경제(play 공급·요금·위험)를 영영 안 재서,
 * 골든이 "수영장 없는 세계"를 잰다 — 토지 해금을 봇에 안 넣었을 때와 같은 실수다.
 * 자리는 게이트 근처의 잔디 2×2 중 포장에 접한 곳 (입수점 규칙 — 문이 길 닿은 쪽에
 * 나는 것과 같다).
 *
 * `budget` 은 이번 주에 수영장에 쓸 수 있는 돈이다 — 칸값으로 나눠 나온 만큼만 칠한다.
 */
function ensurePool(
  t: KairoTerrain,
  p: PlacementGrid,
  land: ReturnType<typeof landRect>,
  budget: number,
): number {
  const stand = (i: number, j: number): boolean => t.isGuestWalkable(i, j);
  const afford = Math.floor(Math.max(0, budget) / POOL_TILE_COST);
  if (afford <= 0) return 0;
  const zones = poolZones(t, stand);
  if (zones.length > 0) return growPool(t, p, land, zones, Math.min(afford, POOL_GROW_TILES));
  if (afford < POOL_MIN_TILES) return 0;
  const fits = (i0: number, j0: number): boolean => {
    if (i0 < land.i0 || j0 < land.j0 || i0 + 2 > land.i0 + land.w || j0 + 2 > land.j0 + land.h)
      return false;
    if (!t.levelUniform(i0, j0, 2, 2)) return false;
    let touchesPath = false;
    for (let j = j0; j < j0 + 2; j++) {
      for (let i = i0; i < i0 + 2; i++) {
        if (t.kindAt(i, j) !== 'lawn' || p.handleAt(i, j) !== 0) return false;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (t.isGuestWalkable(i + di, j + dj)) touchesPath = true;
        }
      }
    }
    return touchesPath;
  };
  /*
   * 게이트에서 가까운 순 **결정적 스캔** — 무작위 표본은 잔디 2×2 + 포장 인접이라는
   * 조건을 26주 안에 못 찾는 시드가 대부분이었다 (실측: 12시드 중앙값 0).
   * 사람은 "입구 근처 빈 잔디"를 눈으로 찾는다 — 그게 봇의 모델이어야 한다.
   */
  const spots: { i: number; j: number; d: number }[] = [];
  for (let j = land.j0; j < land.j0 + land.h - 2; j++) {
    for (let i = land.i0; i < land.i0 + land.w - 2; i++) {
      spots.push({ i, j, d: Math.abs(i - GATE.i) + Math.abs(j - GATE.j) });
    }
  }
  spots.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  for (const sp of spots) {
    if (!fits(sp.i, sp.j)) continue;
    for (let j = sp.j; j < sp.j + 2; j++) {
      for (let i = sp.i; i < sp.i + 2; i++) t.paint(i, j, POOL_KIND);
    }
    return POOL_TILE_COST * POOL_MIN_TILES;
  }
  return 0;
}

/**
 * 이미 있는 수영장을 목표 면적까지 **한 칸씩** 넓힌다 (P1-A).
 *
 * 후보는 풀에 붙은 잔디 칸이다:
 *   · 포장은 안 덮는다 — 손님 동선이고, 입수점이 사라진다 (잔디는 `guestWalk: false` 라
 *     원래 입수점이 아니었으니 덮어도 입수점 수가 안 준다)
 *   · 시설이 놓인 칸도 안 덮는다 (`handleAt`)
 *   · **단이 같아야** 한다 — 다른 단을 물로 칠하면 절벽 옆에 물이 붙는다
 *
 * 순서는 풀 중심에서 가까운 순 → 좌표 순. 무작위로 고르면 물이 실뱀처럼 뻗어 나가
 * 같은 면적인데 판마다 다른 모양이 되고, 결정론 대조에서 원인을 못 읽는다.
 */
function growPool(
  t: KairoTerrain,
  p: PlacementGrid,
  land: ReturnType<typeof landRect>,
  zones: ReturnType<typeof poolZones>,
  maxTiles: number,
): number {
  // 가장 큰 구역 하나만 키운다 — 여러 개를 조금씩 키우면 어느 것도 상한에 못 닿는다
  const zone = zones.reduce((a, b) => (b.area > a.area ? b : a));
  const room = POOL_TARGET_TILES - zone.area;
  if (room <= 0) return 0;
  const level = t.levelAt(zone.tiles[0]!.x, zone.tiles[0]!.y);
  let ci = 0;
  let cj = 0;
  for (const tile of zone.tiles) {
    ci += tile.x;
    cj += tile.y;
  }
  ci /= zone.tiles.length;
  cj /= zone.tiles.length;

  const seen = new Set<number>();
  const cand: { i: number; j: number; d: number }[] = [];
  for (const tile of zone.tiles) {
    for (const [di, dj] of POOL_DIRS) {
      const i = tile.x + di;
      const j = tile.y + dj;
      const k = j * 4096 + i;
      if (seen.has(k)) continue;
      seen.add(k);
      if (i < land.i0 || j < land.j0 || i >= land.i0 + land.w || j >= land.j0 + land.h) continue;
      if (t.kindAt(i, j) !== 'lawn' || p.handleAt(i, j) !== 0) continue;
      if (t.levelAt(i, j) !== level) continue;
      cand.push({ i, j, d: Math.abs(i - ci) + Math.abs(j - cj) });
    }
  }
  cand.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);

  let painted = 0;
  for (const c of cand) {
    if (painted >= Math.min(maxTiles, room)) break;
    t.paint(c.i, c.j, POOL_KIND);
    painted++;
  }
  return painted * POOL_TILE_COST;
}

function buildOne(
  t: KairoTerrain,
  w: WallGrid,
  p: PlacementGrid,
  cash: number,
  want: NeedKind | null,
  rng: Rng,
  /**
   * 해금 술어 (K41). ⚠ 예전 봇은 등급조차 안 봤다 (`gradeFor(0); void grade`) —
   * 1주차에 5등급 시설을 지어 왔고, 헤드리스가 실제 판보다 부유한 세계를 쟀다.
   * UI 와 같은 `isUnlocked` 하나를 쓴다.
   */
  isUnlocked: (id: string) => boolean,
  /**
   * 해금된 토지 (K25). 봇이 이걸 무시하면 밸런싱이 **실제로 못 쓰는 땅**까지 쓰게 되어,
   * 헤드리스 숫자와 손으로 하는 판이 갈라진다. 검증이 조용히 통과하는 전형적인 모양이다.
   */
  land: ReturnType<typeof landRect>,
  /** 실내 판정 — 실내 시설 9종은 **실제 건물 안**에만 놓인다 (K25 검토) */
  /**
   * 왜 못 놓았는지 — **한 통으로 세면 엉뚱한 곳을 가리킨다** (K23 의 교훈 그대로).
   * "자리 부족"이 실은 "방이 없어서"일 수 있고, 그 둘은 처방이 정반대다.
   */
  why?: Map<string, number>,
): number {
  const opts = { land };
  const cands = allFacilityDefs()
    .filter((d) => {
      const x = d as unknown as {
        need?: NeedKind;
        cost: number;
        placement?: { requiresDeck?: boolean };
      };
      if (!isUnlocked(d.id)) return false;
      /*
       * 수상(데크 전용) 시설은 봇이 안 짓는다 — 봇은 뭍 좌표만 뽑아서, 넣으면 시도의
       * 대부분이 wrong-terrain 으로 타 버린다 (실측 68회/판 — K41 보상으로 수상 시설이
       * 열리자 no-space 경보가 울렸다). 데크·코스 배치는 봇 모델 밖이다 (코스와 동일).
       */
      if (x.placement?.requiresDeck === true) return false;
      if (x.cost > cash) return false;
      if (want && x.need !== want) return false;
      return true;
    })
    .sort((a, b) => {
      const ax = a as unknown as { cost: number };
      const bx = b as unknown as { cost: number };
      return ax.cost - bx.cost;
    });
  if (cands.length === 0) return 0;

  // 싼 쪽 절반에서 하나 뽑는다 — 항상 최저가만 지으면 성장이 안 보인다
  const pick = cands[rng.int(Math.max(1, Math.ceil(cands.length / 2)))];
  if (!pick) return 0;

  let lastFail = 'unknown';
  /** 이번에 깐 바닥값 — 시설을 못 놓아도 바닥은 남으므로 값은 치른다 */
  let roomSpend = 0;
  for (let round = 0; round < 2; round++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      /*
       * ⚠ **게이트 근처부터 짓는다** (K36).
       *
       * 예전엔 해금된 토지 전체에 균일 난수로 뽑았다. 40×32 시절엔 그래도 됐지만
       * 96×72 에서는 봇이 판 전체에 흩뿌려서 손님 걷는 거리가 폭발하고, 길값도
       * 같이 폭발한다 (실측: 26주 현금 204만 · "돈이 없어 건설이 막힌다").
       * 사람은 입구 근처부터 채운다 — 그게 봇의 모델이어야 한다.
       *
       * 반경은 **시설 수와 함께 자란다.** 고정하면 다 차고도 밖으로 못 나간다.
       */
      const reach = 8 + p.count * 2;
      const lo = Math.max(land.i0, GATE.i - reach);
      const hi = Math.min(land.i0 + land.w - pick.size[0], GATE.i + reach);
      const jHi = Math.min(land.j0 + land.h - pick.size[1], GATE.j + reach);
      const i = lo + rng.int(Math.max(1, hi - lo + 1));
      const j = land.j0 + rng.int(Math.max(1, jHi - land.j0 + 1));
      /*
       * 물 칸은 시도 전에 거른다 — 토지 사각형의 아래쪽은 강이라, 반경이 자라면
       * 표본의 절반이 물에 떨어져 wrong-terrain 으로 시도 예산을 태운다
       * (실측 72회/판 — 봇이 부유해진 K41 뒤 no-space 경보의 진범이었다).
       */
      if (t.isWater(i, j)) continue;
      const c = p.check(t, w, GATE, pick.id, i, j, opts);
      if (c.ok) {
        p.place(t, w, GATE, pick.id, i, j, opts);
        return (pick as unknown as { cost: number }).cost + roomSpend;
      }
      /*
       * 길만 없는 자리면 깔고 다시 본다 (K32-B). 다른 이유(점유·지형)면 그냥 다음 자리로 —
       * 아무 데나 포장하면 봇이 판 전체를 깔아 값이 왜곡된다.
       */
      if (c.fail === 'unreachable') {
        const pathSpend = ensurePath(t, w, p, land, {
          i,
          j,
          w: pick.size[0] as number,
          h: pick.size[1] as number,
        });
        if (pathSpend > 0) {
          roomSpend += pathSpend;
          if (p.check(t, w, GATE, pick.id, i, j, opts).ok) {
            p.place(t, w, GATE, pick.id, i, j, opts);
            return (pick as unknown as { cost: number }).cost + roomSpend;
          }
        }
      }
      lastFail = c.fail ?? 'unknown';
    }
    // 실내 시설인데 자리가 없으면 **방이 모자란 것**이다 — 새로 짓고 다시 본다
    const needsRoom = (pick as unknown as { placement?: { requiresIndoor?: boolean } }).placement
      ?.requiresIndoor;
    if (!needsRoom || round === 1) break;
    /*
     * 실내 바닥값을 **봇도 낸다** (K27). 플레이어만 내면 밸런싱이 실제보다 부유한 판을
     * 돌게 된다 — 사각형 건물 시절에 실제로 그랬다 (검토 ⑥).
     */
    const floorSpent = ensureRoom(t, w, p, land, rng, { w: pick.size[0], h: pick.size[1] });
    if (floorSpent === 0) {
      lastFail = 'no-room';
      break;
    }
    roomSpend += floorSpent;
  }
  if (why) why.set(lastFail, (why.get(lastFail) ?? 0) + 1);
  return roomSpend;
}

function runOne(seed: number, weeks: number, mapId = 'bukhan'): RunResult {
  const rng = new Rng(seed);
  const map = mapType(mapId);
  const t = KairoTerrain.generate(GRID_W, GRID_H, rng.fork(1), map);
  const w = new WallGrid(GRID_W, GRID_H);
  const p = new PlacementGrid(GRID_W, GRID_H);
  const g = new GuestStore(t, w, p, GATE, GUEST_DEFAULTS);
  const week = new WeekRunner(t, p, g);
  const progress = new ProgressStore();
  const unlocks = new UnlockStore();
  const exam = new ExamStore();
  const wishes = new WishStore();
  const discovered = new Set<string>();
  /**
   * 평판 — 퇴장 만족도의 이동평균 (§9.2). 지난주 값 하나로 등급을 정하면 진동한다
   * (실측: 40주에 등급이 35번 바뀌었다).
   */
  const reputation = new Reputation();
  let gradeNo = 1;
  const cards = new CardStore();
  /**
   * 카드는 **전용 RNG 스트림**을 쓴다 (불변식 2). 손님·날씨와 같은 스트림을 쓰면
   * 카드를 하나 더 뽑는 것만으로 날씨 시퀀스가 밀려, 밸런싱 실험에서 변수를 하나만
   * 바꿀 수 없다.
   */
  const cardRng = rng.fork(CARD_RNG_SALT);
  const staff = new StaffStore();
  /** 직원 전용 스트림 — 고장 판정이 날씨·손님을 밀면 안 된다 (불변식 2) */
  const staffRng = rng.fork(0x57aff);
  const courses = new CourseStore();
  /** 코스 전용 스트림 — 장비 선택이 날씨·손님을 밀면 안 된다 (불변식 2) */
  const courseRng = rng.fork(0xc0125);

  /*
   * 물려받은 빠지 (K30) — **게임과 같은 함수**를 쓴다.
   *
   * 예전에는 여기서 8×4 실내 바닥을 즉석으로 칠했다. 그러면 헤드리스가 실제 판과 다른
   * 시작에서 출발하고, 밸런스 숫자가 실제 플레이를 안 나타낸다 — 이 프로젝트에서 반복해서
   * 겪은 실패다 (토지 해금·건물값이 같은 이유로 봇에 들어왔다).
   */
  const kit = applyStartKit({ terrain: t, walls: w, placement: p, gate: GATE, map, courses });
  if (kit.skipped.length > 0) console.warn(`[봇] 시드 ${seed} 시작 배치 생략:`, kit.skipped);

  let cash = 5_000_000;
  let last: WeekReport | null = null;
  const profitByWeek: number[] = [];
  const seasonByWeek: Season[] = [];
  let buildPoor = 0;
  /*
   * 예비비를 지키느라 안 지은 주 (K42 재분류). 현금이 예비비(150만) **위**인데 여유가
   * 최저가 시설에 못 미치는 상태는 "돈이 없다"(궁핍)가 아니라 **"안 짓기로 했다"**(신중)다.
   * K41 로 경제가 현금 적체형에서 소비형으로 바뀌자, 예비비 언저리에서 도는 건강한 판이
   * 궁핍으로 잘못 세어져 경보가 울렸다 (실측 11회/판 — 손익은 흑자, 현금은 완만한 상승).
   * 진짜 궁핍(현금이 예비비 아래로 꺼짐)만 buildPoor 로 남긴다.
   */
  let buildReserved = 0;
  let buildNoSpace = 0;
  /** 매표소를 다시 지은 횟수 — 0 이 아니면 앞선 건설이 매표소를 가뒀다는 뜻이다 */
  let ticketRebuilds = 0;
  /** 못 지은 이유별 횟수 — 경보가 엉뚱한 처방을 내지 않게 */
  const buildFailWhy = new Map<string, number>();
  let buildCapped = 0;
  let upgradeSpend = 0;
  let accidents = 0;
  let riskyWeeks = 0;
  const accidentIdle = new Map<number, number>();
  let courseFail = '';
  let cardsSeen = 0;
  let cardSpend = 0;
  let staffWeeks = 0;
  const wagesByWeek: number[] = [];
  const courseRevByWeek: number[] = [];
  const revenueByWeek: number[] = [];
  const upkeepByWeek: number[] = [];
  const cashByWeek: number[] = [];
  const buildSpendByWeek: number[] = [];
  const seasons: Season[] = ['summer', 'summer', 'autumn', 'winter', 'spring'];

  for (let k = 0; k < weeks; k++) {
    /*
     * 방을 **미리** 넓힌다.
     *
     * ⚠ 다 찬 뒤에 넓히려 하면 이미 늦다 — 그때는 둘레가 실외 시설로 막혀 있어서 어디로도
     * 못 자란다 (실측: 확장 실패가 판당 100건을 넘었고 경보가 "토지를 넓혀야 한다"고
     * 엉뚱한 곳을 가리켰다). 사람은 방이 차기 전에 미리 늘린다.
     */
    let freeIndoor = 0;
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        if (t.isIndoor(i, j) && p.handleAt(i, j) === 0) freeIndoor++;
      }
    }
    if (freeIndoor < 8) {
      const grade0 = GRADES[gradeNo - 1] ?? GRADES[0]!;
      cash -= ensureRoom(t, w, p, landRect(grade0), rng, { w: 4, h: 1 });
    }

    // 결산의 병목을 보고 짓는다
    const want = last?.bottleneck?.need ?? null;
    let buildSpend = 0;
    /*
     * ⚠ **매표소가 제일 먼저다.** 없으면 입장이 0 이라 나머지 정책이 아무 의미가 없다.
     * 예비비도 안 본다 — 문을 못 여는 판에 예비비를 남기는 것은 판단이 아니다.
     */
    {
      // 거리장을 먼저 최신으로 — 지난주 건설이 매표소를 가뒀는지 여기서 드러난다
      g.invalidate();
      const spent = ensureTicket(t, w, p, g, landRect(GRADES[gradeNo - 1] ?? GRADES[0]!), cash);
      if (spent > 0) ticketRebuilds++;
      cash -= spent;
      buildSpend += spent;
    }
    /*
     * 수영장 (S2) — 2등급부터. 없으면 최소 규격 2×2, 있으면 목표 면적까지 조금씩 넓힌다
     * (P1-A). 봇이 안 파면 헤드리스가 수영 경제를 안 재고, **면적 축**도 안 잰다.
     */
    if (gradeNo >= 2 && cash - BUILD_RESERVE > POOL_TILE_COST) {
      const spent = ensurePool(
        t,
        p,
        landRect(GRADES[gradeNo - 1] ?? GRADES[0]!),
        cash - BUILD_RESERVE,
      );
      if (spent > 0) {
        g.invalidate();
        cash -= spent;
        buildSpend += spent;
      }
    }
    /*
     * 이번 주 건설 예산.
     *
     * 두 가지를 함께 본다 — **수입**과 **쌓인 현금**.
     *   · 매주 무조건 3채를 지으면 유지비·인건비가 붙은 뒤로 초기 자금을 태우다 후반에
     *     아무것도 못 짓는다 (실측: 마지막 8주 건설비 0)
     *   · ⚠ 그렇다고 **수입만** 보면 성장 교착이 생긴다. 초기 자금을 안 쓰니 시설이 12개에
     *     머물고, 슬롯이 모자라 손님이 전부 헛걸음하고(헛걸음 106%), 만족도 0 · 등급 1 ·
     *     수입 0 이 되어 예산이 영원히 최저에 머문다 (실측). 작아서 못 크는 상태다.
     *
     * 그래서 **쌓인 현금의 1/4** 도 예산에 넣는다 — 은행에 돈이 있으면 사람은 짓는다.
     */
    const income = last ? Math.max(0, last.profit) : 0;
    let weekBudget = Math.max(
      CHEAPEST_FACILITY,
      Math.round(income * 1.5),
      Math.floor(Math.max(0, cash - BUILD_RESERVE) * 0.25),
    );

    /*
     * ⚠ **공급이 등급 상한을 넘으면 그만 짓는다.**
     *
     * 입장은 `min(등급 상한, 공급×1.5)` 다. 공급×1.5 가 이미 등급 상한을 넘었으면 시설을
     * 더 지어도 **한 명도 더 안 들어오고 유지비만 는다.** 봇이 이걸 모르고 계속 지어
     * 80주에서 시설 133개 · 만석 44% · 유지비가 수익의 74% · 파산 9/48 이 됐다.
     *
     * 사람이라면 "만석인데 지어도 안 들어온다"를 보고 멈춘다. 계측 도구가 그 판단을 안 하면
     * 우리는 **게임이 무너졌다고 잘못 읽는다** — 무너진 건 봇의 정책이다.
     * (게임 쪽에도 이 사실을 알리는 표시가 필요하다 — 결산 병목 줄에 넣었다.)
     */
    const gradeNow = nextGrade(gradeNo, reputation.value);
    const capped = p.totalCapacity() * 1.5 > gradeNow.maxGuests * 1.3;
    if (capped) weekBudget = 0;

    /*
     * 확장이 막혔으면 **개선한다** (§15.9). 정원은 안 늘고 요금·만족도가 오르므로,
     * 등급 상한에 막힌 구간에서 유일하게 남는 성장 수단이다.
     *
     * 이게 없으면 80주 중 58주가 "지을 게 없다"가 되고 현금이 2,220만까지 쌓인다 (실측).
     */
    if (capped) {
      /*
       * ⚠ 개선 횟수를 **쌓인 현금에 맞춘다** (K36-B②).
       *
       * 3회 고정이면 수입이 늘어도 지출이 안 늘어 현금만 쌓인다. 입장료가 들어오자
       * 52주 현금이 5,335만이 됐는데 **평균 개선 단계는 2.4/5** 였다 — 쓸 곳이 없던 게
       * 아니라 봇이 **안 쓴 것**이다. 그 상태로 "후반이 빈다" 경보를 믿으면 게임이
       * 무너졌다고 잘못 읽는다 (이 파일이 상한 도달·예비비에서 이미 겪은 실패다).
       *
       * 사람은 지을 게 없으면 있는 것을 고친다. 돈이 많을수록 더 고친다.
       * 현금이 예비비 수준이면 3회 — 예전과 같다.
       */
      const rounds = Math.max(3, Math.min(24, Math.floor((cash - BUILD_RESERVE) / 2_000_000)));
      for (let k = 0; k < rounds; k++) {
        const targets = p
          .all()
          .filter((it) => p.levelOf(it.handle) < FACILITY_MAX_LEVEL)
          .sort((a, b) => p.levelOf(a.handle) - p.levelOf(b.handle) || a.handle - b.handle);
        const t0 = targets[0];
        if (!t0) break;
        const cost = p.upgradeCost(t0.handle);
        if (cost <= 0 || cost > cash - BUILD_RESERVE) break;
        p.upgrade(t0.handle);
        cash -= cost;
        upgradeSpend += cost;
      }
    }
    for (let b = 0; b < 3; b++) {
      /*
       * 예비비를 남긴다. **이게 없으면 봇이 스스로 파산하고, 그러면 우리는 게임이 아니라
       * 봇의 무모함을 재게 된다** (실측: 예비비 없이 매주 3채를 지어 건설 70만 + 카드 19만
       * vs 손익 40만 — 초기 자금을 다 쓰고 16판 중 4판이 파산했다).
       *
       * 150만은 카드 한 장의 최대 지출(160만)에 가깝게 잡았다 — 사람도 "카드가 하나 터져도
       * 버틸 만큼"은 남긴다.
       */
      const budget = Math.min(weekBudget, Math.max(0, cash - BUILD_RESERVE));
      const spent = buildOne(
        t,
        w,
        p,
        budget,
        b === 0 ? want : null,
        rng,
        (id) => unlocks.isUnlocked(id, gradeNo),
        landRect(GRADES[gradeNo - 1] ?? GRADES[0]!),
        buildFailWhy,
      );
      cash -= spent;
      buildSpend += spent;
      weekBudget -= spent;
      if (spent === 0) {
        /*
         * ⚠ "못 지었다"를 한 통으로 세면 안 된다 — 자리가 없어서인지 돈이 없어서인지
         * 구분이 안 되고, 경보가 "토지 해금을 보라"고 엉뚱한 곳을 가리킨다 (실측:
         * 직원 인건비로 돈이 마른 상태였는데 자리 문제로 보고했다).
         * 가장 싼 시설도 못 살 예산이면 **돈 문제**다.
         */
        /*
         * ⚠ 셋을 구분해야 한다: **안 짓기로 했다 / 돈이 없다 / 자리가 없다.**
         * 예산을 0 으로 둔 것(공급이 등급 상한을 넘어 그만 짓기로 한 것)을 "돈이 없다"로
         * 세면, 현금 2,220만인 판이 "돈이 없어 건설이 막힌다"로 보고된다 (실측).
         */
        if (weekBudget <= 0) buildCapped++;
        else if (cash < BUILD_RESERVE) buildPoor++;
        else if (budget < CHEAPEST_FACILITY) buildReserved++;
        else buildNoSpace++;
        break;
      }
    }
    g.invalidate();

    /*
     * 등급 (K42) — 강등만 자동, 승급은 심사로. 봇은 **자격이 되면 즉시 신청**한다.
     * 이걸 안 넣으면 봇이 1등급에 갇혀 골든·밸런싱이 성장 없는 세계를 잰다
     * (봇과 골든은 실제 규칙으로 돈다 — K36 교훈).
     */
    const downTo = nextGrade(gradeNo, reputation.value).grade;
    if (downTo < gradeNo) gradeNo = downTo;
    const elig = exam.eligible(gradeNo, reputation.value);
    if (elig) {
      const fee = elig.examFee ?? 0;
      if (cash >= fee) {
        cash -= fee;
        exam.apply(elig.grade, k + 1, 0); // 주 시작에 신청 — 이번 주말 판정
      }
    }
    const gr = GRADES[gradeNo - 1] ?? GRADES[0]!;
    const season = seasons[Math.floor(k / 4) % seasons.length] as Season;

    /*
     * 카드를 뽑고 **봇 정책**으로 고른다.
     *
     * 정책: **낼 수 있는 선택지 중에서 균등 무작위.** 사람의 최적 플레이가 아니다 —
     * 목적은 "카드가 있는 상태의 경제"를 재는 것이고, 정책이 정교할수록 밸런스가
     * 좋아 보이는 착시가 생긴다.
     *
     * ⚠ 처음엔 "낼 수 있으면 지출 쪽"으로 썼는데, 루프가 항상 **마지막 무지출 선택지**로
     * 끝나서 혼잡(단체 예약)·폐쇄(방송 촬영) 분기를 한 번도 안 탔다. 카드를 넣기 전과
     * 숫자가 완전히 같아서 알아챘다 — 정책이 분기를 안 태우면 계측이 없는 것과 같다.
     */
    for (const card of cards.draw(cardRng, {
      season,
      week: k + 1,
      grade: gr.grade,
      isUnlocked: (id) => unlocks.isUnlocked(id, gradeNo),
    })) {
      const affordable: number[] = [];
      for (let oi = 0; oi < card.options.length; oi++) {
        const opt = card.options[oi];
        const c = opt ? optionCash(opt) : 0;
        if (c >= 0 || -c <= cash) affordable.push(oi);
      }
      const pool = affordable.length > 0 ? affordable : [card.options.length - 1];
      const pick = pool[Math.floor(cardRng.next() * pool.length)] as number;
      const r = cards.choose(cardRng, card, pick);
      cash += r.cash;
      cardsSeen++;
      if (r.cash < 0) cardSpend += -r.cash;
    }

    /*
     * 직원 정책: **필요 인원을 채우되, 비수기에는 줄이고, 낼 수 있는 만큼만.**
     *
     * 비수기 감원이 여기 들어가는 이유는 그게 §11 이 요구하는 판단이기 때문이다 —
     * 인건비는 고정비라 손님이 없어도 나간다. 봇이 그 판단을 안 하면 비수기 인건비가
     * 수익을 앞서고, 우리는 "기계가 나쁘다"로 잘못 읽는다 (실측: 겨울 손익 −50%).
     *
     * 사람의 최적 플레이는 아니다. 목적은 "직원이 있는 상태의 경제"를 재는 것이다.
     */
    /*
     * 코스 정책: **여유가 있으면 한 판에 서너 개까지.** 형태는 그 장비에 ◎ 인 것을 고른다
     * (§7.8 이 요구하는 학습을 봇도 흉내낸다 — 아무 형태나 고르면 적합도가 경제에
     * 반영되지 않아 "적합도가 있어도 없어도 같다"는 잘못된 결론이 나온다).
     */
    if (courses.count < 4 && cash - BUILD_RESERVE > 800_000) {
      const affordable = COURSE_EQUIPMENT.filter(
        (e) => e.vehicleCost * 2 <= cash - BUILD_RESERVE,
      );
      if (affordable.length > 0) {
        const eq = affordable[Math.floor(courseRng.next() * affordable.length)] as
          (typeof COURSE_EQUIPMENT)[number];
        const best = PRESETS.filter((pr) => fitOf(eq.id, pr.id) === 'best' && pr.grade <= gr.grade);
        const pick = (best.length > 0 ? best : PRESETS.filter((pr) => pr.grade <= gr.grade))[0];
        if (pick) {
          // 물가를 찾아 선착장으로 삼는다
          let dock: { x: number; y: number } | null = null;
          let handles: { x: number; y: number }[] = [];
          /*
           * ⚠ **코스마다 다른 물자리를 쓴다** (K37). 예전엔 "첫 물 타일" 하나만 봤고,
           * 판정도 기존 코스를 안 봐서 넷이 같은 좌표에 쌓였다. 겹침을 막은 지금
           * 봇이 한 자리만 보면 두 번째부터 전부 거절되어 헤드리스가 실제 판과 갈라진다.
           *
           * 가장자리는 피한다 — 판정이 격자 밖을 물로 안 세므로 억울하게 좁아진다.
           * 성큼성큼(`STRIDE`) 훑는 이유는 비용이다: 후보마다 판정이 수면을 세고 기존
           * 코스를 샘플링하므로 칸마다 부르면 주당 수백만 번이 된다.
           */
          const STRIDE = 4;
          for (let j = 0; j < GRID_H && !dock; j += STRIDE) {
            for (let i = 6; i < GRID_W - 6; i += STRIDE) {
              if (!t.isWater(i, j)) continue;
              const at = { x: i, y: j };
              const hs = defaultHandles(pick, at, { x: 0, y: 1 }, 6);
              const v = validateCourse(t, hs, at, pick, eq.id, gr.grade, courses.all);
              if (!v.ok) {
                if (courseFail === '') courseFail = v.issues.join(',') + ' @' + i + ',' + j;
                continue;
              }
              dock = at;
              handles = hs;
              break;
            }
          }
          if (dock) {
            /*
             * 선착장(dock) 시설값도 치른다 (K45) — 실제 규칙은 "선착장이 붙은 잔교에서만
             * 코스 시작"인데, 봇은 물자리를 추상화하므로 배치는 생략하고 값만 낸다.
             * 값마저 빼면 헤드리스가 실제보다 코스를 싸게 얻는다.
             */
            cash -= eq.vehicleCost * 2 + 772_800;
            courses.add({ presetId: pick.id, equipId: eq.id, vehicles: 2, dock, handles });
          }
        }
      }
    }
    const courseWeek = courses.weekly();

    const staffSeasonMult = season === 'summer' ? 1 : season === 'winter' ? 0.5 : 0.75;
    for (const role of STAFF_ROLES) {
      const need = Math.ceil(neededFor(role, p) * staffSeasonMult);
      const canPay = Math.floor(Math.max(0, cash - BUILD_RESERVE) / (role.wage * 8));
      staff.set(role.id, Math.min(need, Math.max(0, canPay)));
    }
    const staffEff = staff.effects(p);
    staffWeeks += staff.total;

    // 카드 선택이 끝난 뒤에 상한을 정한다 — 혼잡 배율이 이번 주에 반영되어야 한다
    const mods = cards.modifiers();
    g.setMaxGuests(admissionLimit(gr, p.totalCapacity(), mods.crowdMult));
    /*
     * 요금 정책: 만족도가 여유 있으면 올리고, 빠듯하면 내린다.
     * 사람이 슬라이더로 하는 판단을 흉내낸다 — 안 하면 "값을 매긴다"가 경제에 안 나타난다.
     */
    const sat = reputation.value === 0 ? 60 : reputation.value;
    /*
     * 요금 정책. **5등급을 못 찍었고 돈이 남으면 값을 내려 만족도를 산다** —
     * 값을 올리면 만족도가 깎여 등급이 막히고, 등급이 막히면 확장이 막혀 돈이 쌓인다.
     * 남는 돈으로 진행을 사는 것이 사람의 판단이다.
     */
    /*
     * ⚠ 0.7 로 크게 내렸더니 매출이 무너져 인건비를 못 내고, 청소부 부족으로 만족도가
     * 오히려 **떨어졌다** (등급 1 사분위가 생겼다). 값 내리기는 만족도를 사는 수단이지만
     * 그 돈이 인건비를 깎으면 역효과다. 0.9 로만 내린다.
     */
    const wantGrade5 = gradeNo === 4 && cash > 20_000_000;
    const priceMult = wantGrade5 ? 0.9 : sat > 78 ? 1.2 : sat < 62 ? 0.85 : 1;

    const rep = week.run(rng, {
      season,
      reputation: gr.reputationPull,
      priceMult,
      mapShares: shiftedShares(seasonShares(season), map),
      mapSceneryBonus: map.sceneryBonus,
      modifiers: mods,
      courses: {
        revenue: courseWeek.revenue,
        upkeep: courseWeek.upkeep,
        riders: courseWeek.riders,
      },
      // 콤보 보너스 (S5) — `src/main.ts` 의 assembleWeekOpts 와 **같은 함수·같은 인자**.
      // 한쪽만 넘기면 헤드리스와 실제 판이 갈라진다 (week.test.ts 정적 검사가 지킨다)
      combos: comboEffect(evaluateCombos(p, undefined, g.swimZones())),
      // 사고 — 위험 단계에서만 (§12.1). 안 넣으면 안전 시설을 지을 이유가 계측에 안 나온다
      accidentChance: (() => {
        const r = assessRisk(p, g, { staffSafety: staffEff.safetyPoints });
        if (r.accidentPossible) riskyWeeks++;
        return accidentChance(r, mods.accidentMult);
      })(),
      staff: {
        wages: staffEff.wages,
        satisfactionDelta: staffEff.satisfactionDelta,
        foodMult: staffEff.foodMult,
        idle: new Set([...staff.idleHandles(p, staffRng), ...accidentIdle.keys()]),
      },
    });

    // 사고로 닫힌 시설의 남은 주를 깎고, 새 사고를 기록한다
    for (const [handle, left] of [...accidentIdle]) {
      if (left <= 1) accidentIdle.delete(handle);
      else accidentIdle.set(handle, left - 1);
    }
    if (rep.accident) {
      accidentIdle.set(rep.accident.handle, rep.accident.weeks);
      accidents++;
      // 봇 정책: 낼 수 있으면 전면 점검, 아니면 법적 대응 (가장 싼 쪽)
      const card = triggerCard('accident_response');
      if (card) {
        const audit = card.options.findIndex((o) => o.effects.some((e) => (e.accidentMult ?? 1) < 1));
        const pickIdx = audit >= 0 && optionCash(card.options[audit]!) * -1 <= cash ? audit : 1;
        const r = cards.choose(cardRng, card, pickIdx);
        cash += r.cash;
      }
    }
    wagesByWeek.push(rep.wages);
    courseRevByWeek.push(rep.courseRevenue);
    cards.tickWeek();
    last = rep;
    reputation.push(rep.exitSatisfaction);
    cash += rep.profit;
    profitByWeek.push(rep.profit);
    seasonByWeek.push(season);
    revenueByWeek.push(rep.revenue);
    upkeepByWeek.push(rep.upkeep);
    buildSpendByWeek.push(buildSpend);
    cashByWeek.push(cash);

    const claimed = progress.claim(questStatuses(p, rep, g.swimZones()));
    cash += claimed.cash;
    for (const fid of claimed.facilities) unlocks.grant(fid); // 봇도 보상을 받는다 (K41)
    // 소원 (K43) — UI 와 같은 규칙. 보상 시설·현금을 그대로 받는다
    for (const ev of wishes.settle(rep, rep.byGroup, p, g.swimZones())) {
      if (ev.kind !== 'done') continue;
      if (ev.wish.reward.cash !== undefined) cash += ev.wish.reward.cash;
      if (ev.wish.reward.facility !== undefined) unlocks.grant(ev.wish.reward.facility);
    }
    // 숨은 콤보 발견 (K43) — activeComboIds 는 ui 모듈이라 헤드리스에선 직접 센다
    for (const cid of evaluateCombos(p, undefined, g.swimZones()).active.map((x) => x.id)) {
      if (discovered.has(cid)) continue;
      discovered.add(cid);
      const combo = COMBOS.find((x) => x.id === cid);
      if (combo?.hidden && combo.discoverCash !== undefined) cash += combo.discoverCash;
    }
    // 심사 판정 (K42) — 결산과 같은 요약으로
    const verdict = exam.judge(k + 1, p, rep, g.swimZones());
    if (verdict?.passed) {
      gradeNo = verdict.target;
      cash += verdict.grant; // 통과 지원금 — UI 와 같은 규칙
    }
  }

  const combos = evaluateCombos(p, undefined, g.swimZones());
  const comboFx = comboEffect(combos);
  const exitSat = last?.exitSatisfaction ?? 0;
  const arrivals = Math.max(1, last?.arrivals ?? 1);
  return {
    seed,
    weeks,
    cash,
    facilities: p.count,
    swimZones: poolZones(t, (i, j) => t.isGuestWalkable(i, j)).length,
    swimArea: poolZones(t, (i, j) => t.isGuestWalkable(i, j)).reduce(
      (a, z) => Math.max(a, z.area),
      0,
    ),
    examGrade: gradeNo,
    combos: combos.active.length,
    comboSatRaw: comboFx.satRaw,
    comboRevRaw: comboFx.revRaw,
    comboSatApplied: comboFx.satisfactionDelta,
    comboRevPct: (comboFx.revenueMult - 1) * 100,
    grade: gradeFor(exitSat).grade,
    exitSat,
    turnedAwayRatio: (last?.turnedAway ?? 0) / arrivals,
    gaveUpRatio: (last?.gaveUp ?? 0) / Math.max(1, last?.visitors ?? 1),
    questsDone: progress.claimedCount,
    bankrupt: cash < 0,
    profitByWeek,
    seasonByWeek,
    buildPoor,
    buildReserved,
    buildNoSpace,
    buildFailWhy: [...buildFailWhy.entries()].sort((a, b2) => b2[1] - a[1]),
    buildCapped,
    upgradeSpend,
    avgLevel: p.averageLevel(),
    accidents,
    riskLevel: assessRisk(p, g, { staffSafety: staff.effects(p).safetyPoints }).level,
    mapId,
    lastAlive: g.stats().alive,
    lastGaveUp: last ? last.gaveUp : 0,
    lastIdle: g.idleCount,
    lastVisitors: last ? last.visitors : 0,
    lastNoTicket: last ? last.noTicket : 0,
    ticketRebuilds,
    familyRatio: last ? last.byGroup.family / Math.max(1, last.visitors) : 0,
    friendsRatio: last ? last.byGroup.friends / Math.max(1, last.visitors) : 0,
    riskyWeeks,
    cardsSeen,
    cardSpend,
    staffWeeks,
    wagesByWeek,
    courseCount: courses.count,
    /*
     * ⚠ 산 위에 몇 개 놓였나 (K37). 0 이면 **높이가 헤드리스에서 죽은 것**이다 —
     * 실제 판에는 테라스가 있는데 봇이 안 쓰면 밸런싱이 다른 세계를 잰다. K36 에서
     * 격자 크기로 정확히 같은 사고를 열 페이즈 동안 겪었다.
     */
    onSlope: p.all().filter((f) => t.levelAt(f.i, f.j) >= 1).length,
    builtTotal: p.all().length,
    courseFail,
    courseRevByWeek,
    revenueByWeek,
    upkeepByWeek,
    cashByWeek,
    buildSpendByWeek,
  };
}

function stats(xs: number[]): { min: number; p25: number; med: number; p75: number; max: number } {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.floor(q * s.length))] as number;
  return { min: s[0] as number, p25: at(0.25), med: at(0.5), p75: at(0.75), max: s[s.length - 1] as number };
}

function fmt(n: number): string {
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 10_000)}만`;
  return String(Math.round(n));
}

/**
 * 맵별 비교 (§4.5 검증) — **맵마다 최적 빌드가 실제로 달라지는지.**
 * 달라지지 않으면 "맵 타입"은 지형 무늬일 뿐이고 2회차 이유가 안 된다.
 */
function compareMaps(seeds: number, weeks: number): void {
  console.log(`\n맵별 비교 — 시드 ${seeds} × ${weeks}주`);
  console.log(
    `${'맵'.padEnd(7)} ${'손익'.padStart(8)} ${'만족'.padStart(5)} ${'시설'.padStart(5)} ` +
      `${'가족%'.padStart(6)} ${'친구%'.padStart(6)} ${'코스'.padStart(5)}`,
  );
  for (const m of MAP_TYPES) {
    const runs: RunResult[] = [];
    for (let s = 0; s < seeds; s++) runs.push(runOne(1000 + s, weeks, m.id));
    const med = (pick: (r: RunResult) => number): number => stats(runs.map(pick)).med;
    console.log(
      `${m.name.padEnd(6)} ${fmt(med((r) => r.profitByWeek[weeks - 1] ?? 0)).padStart(8)} ` +
        `${med((r) => r.exitSat).toFixed(0).padStart(5)} ` +
        `${med((r) => r.facilities).toString().padStart(5)} ` +
        `${(med((r) => r.familyRatio) * 100).toFixed(0).padStart(6)} ` +
        `${(med((r) => r.friendsRatio) * 100).toFixed(0).padStart(6)} ` +
        `${med((r) => r.courseCount).toString().padStart(5)}`,
    );
  }
}

function main(): void {
  if (DETERMINISM) {
    const a = runOne(4242, 6);
    const b = runOne(4242, 6);
    const same = JSON.stringify(a) === JSON.stringify(b);
    console.log(same ? '✅ 결정론 OK — 같은 시드가 같은 결과' : '❌ 결정론 깨짐');
    process.exit(same ? 0 : 1);
  }

  if (MAPS) {
    compareMaps(SEEDS, WEEKS);
    return;
  }

  const t0 = Date.now();
  const runs: RunResult[] = [];
  for (let s = 0; s < SEEDS; s++) runs.push(runOne(1000 + s * 7, WEEKS));
  const ms = Date.now() - t0;

  if (JSON_OUT) {
    console.log(JSON.stringify({ seeds: SEEDS, weeks: WEEKS, ms, runs }, null, 2));
    return;
  }

  console.log(`카이로 헤드리스 — 시드 ${SEEDS} × ${WEEKS}주 · ${ms}ms (${(ms / SEEDS).toFixed(1)}ms/판)`);
  const rows: [string, number[], (n: number) => string][] = [
    ['현금', runs.map((r) => r.cash), fmt],
    ['시설 수', runs.map((r) => r.facilities), (n) => String(n)],
    ['수영 구역', runs.map((r) => r.swimZones), (n) => String(n)],
    ['최대 풀 면적', runs.map((r) => r.swimArea), (n) => `${n.toFixed(0)}칸`],
    ['심사 등급', runs.map((r) => r.examGrade), (n) => String(n)],
    ['콤보 발동', runs.map((r) => r.combos), (n) => String(n)],
    ['콤보 원점수(만족)', runs.map((r) => r.comboSatRaw), (n) => n.toFixed(0)],
    ['콤보 만족 보너스', runs.map((r) => r.comboSatApplied), (n) => `+${n.toFixed(1)}`],
    ['콤보 매출 보너스', runs.map((r) => r.comboRevPct), (n) => `+${n.toFixed(1)}%`],
    ['등급', runs.map((r) => r.grade), (n) => String(n)],
    ['퇴장 만족도', runs.map((r) => r.exitSat), (n) => n.toFixed(0)],
    ['만석 비율', runs.map((r) => r.turnedAwayRatio * 100), (n) => `${n.toFixed(0)}%`],
    ['헛걸음 비율', runs.map((r) => r.gaveUpRatio * 100), (n) => `${n.toFixed(0)}%`],
    ['의뢰 완료', runs.map((r) => r.questsDone), (n) => String(n)],
  ];
  console.log(`\n${'항목'.padEnd(14)}${'최소'.padStart(9)}${'25%'.padStart(9)}${'중앙'.padStart(9)}${'75%'.padStart(9)}${'최대'.padStart(9)}`);
  console.log('-'.repeat(60));
  for (const [name, xs, f] of rows) {
    const s = stats(xs);
    console.log(
      name.padEnd(14) +
        f(s.min).padStart(9) +
        f(s.p25).padStart(9) +
        f(s.med).padStart(9) +
        f(s.p75).padStart(9) +
        f(s.max).padStart(9),
    );
  }

  const bankrupt = runs.filter((r) => r.bankrupt).length;
  console.log(`\n파산 ${bankrupt}/${SEEDS}판`);

  // 성장 곡선 — 주차별 손익 중앙값
  const byWeek: number[] = [];
  for (let k = 0; k < WEEKS; k++) {
    byWeek.push(stats(runs.map((r) => r.profitByWeek[k] ?? 0)).med);
  }
  console.log(`주차별 손익 중앙값: ${byWeek.map(fmt).join(' → ')}`);
  const seasonLine = [...new Set(runs[0]?.seasonByWeek ?? [])]
    .map((se) => {
      const xs = runs.flatMap((r) =>
        r.profitByWeek.filter((_, k) => r.seasonByWeek[k] === se),
      );
      return `${se} ${fmt(stats(xs).med)}`;
    })
    .join(' · ');
  console.log(`계절별 손익 중앙값: ${seasonLine}`);
  console.log(
    `건설 막힘 중앙값: 상한 도달 ${stats(runs.map((r) => r.buildCapped)).med}회 · ` +
      `돈 부족 ${stats(runs.map((r) => r.buildPoor)).med}회 · ` +
      `자리 부족 ${stats(runs.map((r) => r.buildNoSpace)).med}회 (판당)` +
        (() => {
          const agg = new Map<string, number>();
          for (const r of runs) for (const [k, v] of r.buildFailWhy) agg.set(k, (agg.get(k) ?? 0) + v);
          const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
          return top.length ? ` — 사유 ${top.map(([k, v]) => `${k} ${v}`).join(' · ')}` : '';
        })(),
  );
  const perWeekMed = (pick: (r: RunResult) => number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k < WEEKS; k++) out.push(stats(runs.map((r) => pick(r)[k] ?? 0)).med);
    return out;
  };
  const revW = perWeekMed((r) => r.revenueByWeek);
  const upkW = perWeekMed((r) => r.upkeepByWeek);
  const cashW = perWeekMed((r) => r.cashByWeek);
  const bldW = perWeekMed((r) => r.buildSpendByWeek);
  const every4 = (a: number[]): string =>
    a.filter((_, k) => k % 4 === 3).map(fmt).join(' → ');
  console.log(`수익 (4주마다):   ${every4(revW)}`);
  console.log(`유지비 (4주마다): ${every4(upkW)}`);
  console.log(`인건비 (4주마다): ${every4(perWeekMed((r) => r.wagesByWeek))}`);
  console.log(`코스매출 (4주마다): ${every4(perWeekMed((r) => r.courseRevByWeek))}`);
  console.log(`건설비 (4주마다): ${every4(bldW)}`);
  console.log(`현금 (4주마다):   ${every4(cashW)}`);
  console.log(
    `직원 평균: ${(stats(runs.map((r) => r.staffWeeks)).med / WEEKS).toFixed(1)}명/주`,
  );
  if (EACH) {
    console.log(
      `\n판별 결과 — ${'시드'.padStart(5)} ${'등급'.padStart(4)} ${'만족'.padStart(5)} ` +
        `${'시설'.padStart(5)} ${'현금'.padStart(9)} ${'만석%'.padStart(6)} ` +
        `${'직원'.padStart(5)} ${'개선'.padStart(5)} ${'사고'.padStart(5)}`,
    );
    for (const r of runs) {
      console.log(
        `      ${String(r.seed).padStart(5)} ${String(r.grade).padStart(4)} ` +
          `${r.exitSat.toFixed(0).padStart(5)} ${String(r.facilities).padStart(5)} ` +
          `${fmt(r.cash).padStart(9)} ${(r.turnedAwayRatio * 100).toFixed(0).padStart(6)} ` +
          `${(r.staffWeeks / WEEKS).toFixed(1).padStart(5)} ${r.avgLevel.toFixed(2).padStart(5)} ` +
          `${String(r.accidents).padStart(5)} ` +
          `| 살아 ${String(r.lastAlive).padStart(3)} 입장 ${String(r.lastVisitors).padStart(3)} ` +
          `헛걸음 ${String(r.lastGaveUp).padStart(3)} 선시설 ${String(r.lastIdle).padStart(3)} ` +
          `못들어감 ${String(r.lastNoTicket).padStart(4)} 매표소재건 ${String(r.ticketRebuilds).padStart(2)}`,
      );
    }
  }

  const levels = new Map<string, number>();
  for (const r of runs) levels.set(r.riskLevel, (levels.get(r.riskLevel) ?? 0) + 1);
  console.log(
    `사고 중앙값: ${stats(runs.map((r) => r.accidents)).med}회/판 · ` +
      `사고 가능 주 ${stats(runs.map((r) => r.riskyWeeks)).med}회 · ` +
      `마지막 위험 단계 ${[...levels].map(([k, v]) => `${k} ${v}판`).join(' · ')}`,
  );
  console.log(
    `매표소: 못 지나간 손님 중앙 ${stats(runs.map((r) => r.lastNoTicket)).med}명/마지막 주 · ` +
      `가둬져 다시 지은 횟수 중앙 ${stats(runs.map((r) => r.ticketRebuilds)).med}회/판`,
  );
  {
    const slope = stats(runs.map((r) => r.onSlope));
    const total = stats(runs.map((r) => r.builtTotal));
    console.log(
      `산 위 시설: 중앙 ${slope.med}개 / 전체 ${total.med}개 · 최대 ${slope.max}개` +
        (slope.max === 0 ? '  ⚠ 높이가 헤드리스에서 안 쓰인다 — 실제 판과 갈라진다' : ''),
    );
  }
  console.log(`코스 수 중앙값: ${stats(runs.map((r) => r.courseCount)).med}개` +
    (runs[0]?.courseFail ? ` (막힌 사유: ${runs[0].courseFail})` : ''));
  const cs = stats(runs.map((r) => r.cardsSeen));
  const csp = stats(runs.map((r) => r.cardSpend));
  console.log(
    `카드: 중앙 ${cs.med}장/판 (${(cs.med / WEEKS).toFixed(2)}장/주) · 지출 중앙 ${fmt(csp.med)}`,
  );

  // 밸런스 판정 — 여기서 걸리면 숫자를 손봐야 한다
  const issues: string[] = [];
  const grade = stats(runs.map((r) => r.grade));
  if (grade.min >= 5) issues.push('등급이 처음부터 최고 — 만족도 문턱이 너무 낮다');
  if (stats(runs.map((r) => r.exitSat)).p25 > 95) issues.push('퇴장 만족도가 거의 항상 만점');
  if (bankrupt === 0 && stats(runs.map((r) => r.cash)).min > 20_000_000) {
    issues.push('돈이 남기만 한다 — 유지비/건설비가 너무 싸다');
  }
  if (stats(runs.map((r) => r.turnedAwayRatio)).med > 0.8) {
    issues.push('만석 비율이 80% 넘는다 — 동시 손님 상한이 수요에 비해 낮다');
  }
  if (stats(runs.map((r) => r.facilities)).med < 8) issues.push('시설이 거의 안 늘어난다');
  /*
   * 매표소를 못 지나는 손님 (K36-B②). 밸런스가 아니라 **판이 안 도는 것**이라 따로 잡는다 —
   * 만석과 처방이 다르다 (만석은 "시설을 늘려라", 이건 "매표소를 지어라·길을 이어라").
   */
  const noTicketMed = stats(runs.map((r) => r.lastNoTicket)).med;
  if (noTicketMed > 0) {
    issues.push(
      `매표소를 못 지나는 손님이 있다 (마지막 주 중앙 ${noTicketMed}명) — ` +
        '매표소가 없거나 길이 안 닿는다',
    );
  }
  /**
   * 후반 성장 정지 — **같은 계절끼리** 비교한다.
   *
   * ⚠ 정점과 마지막 주를 그냥 비교하면 안 된다. 계절이 순환하므로 마지막이 겨울이면
   * 무조건 "꺾였다"가 나온다 (실측: 33~36주가 겨울이라 37% 하락으로 잡혔는데 실제로는
   * 정상 계절 변동이었다).
   */
  /**
   * ⚠ 계절별 배열을 그냥 반으로 가르면 안 된다. 배열이 **판 순서**라 전반/후반이
   * "시드 0~7 vs 8~15" 를 비교하게 되고, 시간 흐름과 무관한 가짜 경보가 난다
   * (실측: spring 41만→33만 경보가 그것이었다).
   *
   * 주차별로 묶고 **주차 기준**으로 전반/후반을 가른다. 그 계절이 한 번밖에 안 돌아왔으면
   * 비교할 것이 없으므로 건너뛴다 — 없는 비교를 억지로 하면 그게 다시 가짜 경보다.
   */
  const bySeason = new Map<Season, Map<number, number[]>>();
  for (const r of runs) {
    for (let k = 0; k < r.profitByWeek.length; k++) {
      const se = r.seasonByWeek[k] as Season;
      if (!bySeason.has(se)) bySeason.set(se, new Map());
      const byWk = bySeason.get(se) as Map<number, number[]>;
      if (!byWk.has(k)) byWk.set(k, []);
      (byWk.get(k) as number[]).push(r.profitByWeek[k] as number);
    }
  }
  /**
   * ⚠ 경보는 **성수기(여름)만** 본다.
   *
   * 이 경보의 목적은 "시설을 늘려도 수입이 안 늘어 후반에 할 일이 없어진다"를 잡는 것이다.
   * 비수기는 수요가 상한이라 수익이 고정이고, 시설을 늘리면 유지비만 는다 — 그건 결함이
   * 아니라 **"비수기에는 사우나·숙박·식음을 지어라"는 판단을 요구하는 설계**다
   * (`ACTIVE_NEEDS` 가 그 답을 보상한다). 비수기 변화는 경보가 아니라 정보로 찍는다.
   *
   * 이걸 구분하지 않고 겨울 −15% 를 경보로 잡으면, 그 경보를 끄려고 비수기 경제를
   * 계속 주무르게 된다 — 내 문턱을 만족시키려고 게임을 바꾸는 것이다.
   */
  const PEAK: Season = 'summer';
  const declines: string[] = [];
  const offseasonInfo: string[] = [];
  const skippedSeasons: string[] = [];
  for (const [se, byWk] of bySeason) {
    const weeksOf = [...byWk.keys()].sort((a, b) => a - b);
    if (weeksOf.length < 8) {
      skippedSeasons.push(`${se}(${weeksOf.length}주)`);
      continue;
    }
    const half = Math.floor(weeksOf.length / 2);
    const medOf = (ws: number[]): number =>
      stats(ws.flatMap((k) => byWk.get(k) as number[])).med;
    const early = medOf(weeksOf.slice(0, half));
    const late = medOf(weeksOf.slice(half));
    const changed = early > 0 ? Math.round((late / early - 1) * 100) : 0;
    if (se === PEAK) {
      if (early > 0 && late < early * 0.85) declines.push(`${se} ${fmt(early)}→${fmt(late)}`);
    } else {
      offseasonInfo.push(`${se} ${fmt(early)}→${fmt(late)} (${changed > 0 ? '+' : ''}${changed}%)`);
    }
  }
  if (offseasonInfo.length > 0) {
    console.log(`비수기 손익 변화 (경보 아님 — 구성으로 답하는 구간): ${offseasonInfo.join(' · ')}`);
  }
  if (skippedSeasons.length > 0) {
    console.log(
      `(성장 판정에서 뺀 계절: ${skippedSeasons.join(' ')} — 비교할 만큼 안 돌아왔다. ` +
        `--weeks 를 늘리면 판정에 들어온다)`,
    );
  }
  if (declines.length > 0) {
    issues.push(
      `성수기인데 후반 손익이 낮다 — ${declines.join(' · ')}. ` +
        '시설 상한·유지비 곡선을 볼 것 (비수기는 판정에서 뺀다)',
    );
  }

  // 시설 상한의 원인 — 자리를 못 찾는 것인지 돈이 없는 것인지
  const poor = stats(runs.map((r) => r.buildPoor));
  const noSpace = stats(runs.map((r) => r.buildNoSpace));
  if (noSpace.med > WEEKS * 0.3) {
    issues.push(
      `자리가 없어 건설이 막힌다 (중앙 ${noSpace.med}회/판) — 토지 해금으로 격자를 넓혀야 한다`,
    );
  }
  /*
   * ⚠ **상한에 닿는 것 자체는 문제가 아니다.** 확장이 막혀도 개선(§15.9)이라는 다른
   * 돈 쓸 곳이 있으면 후반이 비지 않는다. 문제는 **막혔는데 돈이 쌓이는 것** —
   * 그때가 "할 게 없다"다. 둘을 함께 봐야 경보가 진실을 말한다.
   */
  const capped = stats(runs.map((r) => r.buildCapped));
  const idleCash = stats(runs.map((r) => r.cash));
  if (capped.med > WEEKS * 0.5 && idleCash.med > 15_000_000) {
    issues.push(
      `후반이 빈다 — 절반 넘는 주에 지을 게 없고(중앙 ${capped.med}회/판) ` +
        `현금이 ${fmt(idleCash.med)} 쌓인다. 등급 상한에 막혔는데 쓸 곳이 없다`,
    );
  }
  if (poor.med > WEEKS * 0.4) {
    issues.push(
      `돈이 없어 건설이 막힌다 (중앙 ${poor.med}회/판) — 유지비·인건비가 수익을 앞선다`,
    );
  }
  console.log(issues.length === 0 ? '\n✅ 밸런스 경보 없음' : `\n⚠ 밸런스 경보 ${issues.length}건`);
  for (const s of issues) console.log(`   · ${s}`);
}

main();
