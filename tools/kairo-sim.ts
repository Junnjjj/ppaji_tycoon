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
 *
 * ## ⚠ 봇이 스스로 정한 상한 — **전수 목록** (K49)
 *
 * 이 파일의 숫자가 곧 헤드리스가 재는 세계의 크기다. P3-A 는 "등급이 안 오른다"가
 * 게임이 아니라 봇의 정책 버그였음을 실증했고, `late-game-cap-proposal.md` §1.5.1 은
 * "코스 4개 · 풀 32칸"이 게임이 아니라 **이 파일의 상수**였음을 실증했다. 같은 함정을
 * 세 번째로 밟지 않도록, 남아 있는 상한을 여기 모아 두고 **각각 왜 남는지**를 적는다.
 * 새 상한을 넣으면 이 목록에 줄을 더할 것. 못 적겠으면 그 상한은 넣지 말 것.
 *
 * **걷어낸 것** (K49 — 게임 값으로 옮겼다)
 *   · `courses.count < 4`            → 잔교 수·겹침 판정 (`docksOf`/`validateCourse`)
 *   · `POOL_TARGET_TILES = 32`       → `kairo-combos.json` 의 `areaScale` 포화점
 *   · `growPool` "가장 큰 구역 하나" → 목표 미만인 구역들 + 두 번째 풀
 *   · `ensureTicket` 반경 12         → 해금된 토지 전체
 *   · `POOL_TILE_COST = 40_000`      → `kairo-ground.json`
 *   · 선착장값 `772_800`             → `kairo-facilities.json`
 *   · 코스 문턱 `800_000`            → 가장 싼 탈것 2대 (`MIN_COURSE_SPEND`)
 *
 * **남기는 것과 이유**
 *
 * | 상한 | 값 | 왜 남기나 |
 * |---|---|---|
 * | `BUILD_RESERVE` | 150만 | **사람의 모델.** 없으면 봇이 스스로 파산해 우리가 게임 대신 봇의 무모함을 잰다 (실측 4/16판) |
 * | 주당 건설 | 3채 | **박자.** 한 주에 열 채를 놓는 사람은 없다. 후반엔 어차피 `capped` 가 예산을 0 으로 만든다 |
 * | 주당 코스 | 1개 | 같은 박자. 상한이 아니라 속도다 |
 * | 놀고 있는 잔교 | 2개 | 강이 다 찬 뒤에도 매주 잔교를 사는 최적화기가 되지 않게 (`ensureDock` 참고) |
 * | 주당 개선 | 24회 | `cash/200만` 이 실제 문턱이고 24 는 **폭주 방지**다. 260주 판에서도 안 물린다 (개선 단계가 5.00 로 포화) |
 * | `POOL_GROW_TILES` | 4칸/주 | **사람의 모델** — 풀을 한 번에 32칸 파는 사람은 없고, 예비비 때문에 승인도 안 된다 (실측) |
 * | `COMBO_NUDGE` | 2칸 | 크게 잡으면 봇이 판 전체를 훑는 **최적화기**가 되어 게임이 아니라 탐색 폭을 잰다 |
 * | 배치 시도 | 200회/`buildOne` | **비용.** 후보를 겨냥해서 뽑으므로 200 안에 들거나 아예 없거나다 |
 * | 방 만들기 시도 | 60회 | **비용.** ①② 가 실패한 뒤의 마지막 수단이다 |
 * | 매표소 포장 시도 | 256곳 | **비용** — `ensurePath` 가 후보마다 격자 전체를 BFS 한다 |
 * | 선착장 자리 시도 | 400곳 | **비용** — `p.check` 가 물가·도달을 본다. 가까운 쪽부터 보므로 못 찾으면 근처가 찬 것 |
 */
import { Rng } from '../src/sim/rng.js';
import { KairoTerrain } from '../src/sim/kairo/terrain.js';
import { WallGrid, reachable } from '../src/sim/kairo/walls.js';
import { bakeIndoorWalls } from '../src/sim/kairo/indoor.js';
import { applyStartKit } from '../src/sim/kairo/startkit.js';
import { GROUND_KINDS } from '../src/sim/kairo/terrain.js';
import {
  PlacementGrid,
  allFacilityDefs,
  facilityDef,
  FACILITY_MAX_LEVEL,
  guestWalkable,
  type FacilitySpecialty,
} from '../src/sim/kairo/placement.js';
import { GuestStore, GUEST_DEFAULTS, TICKET_DEF_ID } from '../src/sim/kairo/guests.js';
import { WeekRunner, type NeedKind, type Season, type WeekReport } from '../src/sim/kairo/week.js';
import { evaluateCombos, comboEffect, previewCombos } from '../src/sim/kairo/combos.js';
import { CardStore, CARD_RNG_SALT, optionCash, triggerCard } from '../src/sim/kairo/cards.js';
import { assessRisk, accidentChance } from '../src/sim/kairo/risk.js';
import { mapType, shiftedShares, MAP_TYPES } from '../src/sim/kairo/scenario.js';
import { seasonShares } from '../src/sim/kairo/groups.js';
import { StaffStore, STAFF_ROLES, neededFor } from '../src/sim/kairo/staff.js';
import {
  CourseStore,
  PRESETS,
  COURSE_EQUIPMENT,
  suggestCourse,
  validateCourse,
  fitOf,
  dockCandidates,
  firstFreeDock,
} from '../src/sim/kairo/course.js';
import {
  questStatuses,
  evaluateCondition,
  ProgressStore,
  gradeFor,
  nextGrade,
  admissionLimit,
  Reputation,
  landRect,
  GRADES,
  supplyOf,
} from '../src/sim/kairo/progress.js';
import { poolZones, POOL_KIND, POOL_MIN_TILES } from '../src/sim/kairo/swim.js';
import { UnlockStore } from '../src/sim/kairo/unlocks.js';
import {
  ExamStore,
  nextGradeDef,
  EXAM_POINTS_PER_REQ,
  EXAM_PASS_RATIO,
} from '../src/sim/kairo/exam.js';
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
  /**
   * 심사 계측 — **"응시를 못 하나 / 응시했는데 떨어지나"를 가른다.**
   *
   * `examGrade` 중앙값만 보면 원인을 모른다. 자격이 안 열려서 못 오르는 것과, 열리는데
   * 커트라인에 못 미치는 것과, 수수료가 없어 못 내는 것은 처방이 완전히 다르다.
   * 조건별 점수(`examReqScores`)까지 봐야 "어느 조건이 낮은가"에 답할 수 있다.
   */
  examApplied: number;
  examPassed: number;
  examFailed: number;
  /** 자격은 되는데 수수료가 모자라 못 낸 주 */
  examBlockedByFee: number;
  /** 자격은 되는데 조건 점수가 커트에 못 미쳐 안 낸 주 — 여기가 크면 "조건"이 병목이다 */
  examNotReady: number;
  /** 자격조차 안 열린 주 (평판 < 다음 등급 문턱) — 대기 중인 주는 안 센다 */
  examNoEligibleWeeks: number;
  /** 자동 강등 횟수 — 올라갔다 내려오면 심사 등급 중앙값이 내려앉는다 */
  examDemotions: number;
  /** 탈락한 심사의 조건별 점수 합/횟수 — `목표등급:조건종류` 키 */
  examReqScores: [string, number, number][];
  /** 마지막 주 기준 need 별 시설 수 — 심사·의뢰 조건이 재는 바로 그 값 */
  supply: Record<string, number>;
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
  /**
   * 고른 특화 (P2-B) — 갈래별 횟수와 합계. **0 이면 P1.5 축이 안 재진 것**이다.
   * 셋 중 하나가 0 이면 그 갈래는 밸런싱에 안 실려 있다 (`onSlope` 와 같은 자리의 계측).
   */
  specialties: Record<FacilitySpecialty, number>;
  specialtyTotal: number;
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
  /**
   * 잔교 수 (K49) — **코스 개수의 진짜 상한**이다. 코스 수만 보면 "봇이 안 지은 것"과
   * "게임이 안 열어 준 것"을 못 가른다. 잔교 = 4-연결 데크 무리 중 선착장이 붙은 것
   * (`dockCandidates`, UI 와 같은 함수). `dockCount == courseCount` 면 잔교가 상한이고,
   * 크면 겹침(`overlap`)·돈이 상한이다.
   */
  dockCount: number;
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

  /**
   * 이 칸에 실내 바닥을 깔아도 되나 — 실외 시설을 삼키지 않는 게 핵심이다.
   *
   * ⚠ **경계는 `i0 + w` 다** (K43 의 교훈, K48 에서 여기도 발견). `i < land.w` 로
   * 재고 있었다. 입구가 맵 가운데로 간 K36 부터 1등급 토지는 i∈[35,61) 인데 이 식은
   * i<26 만 통과시켜, **토지 안에서는 방을 한 칸도 못 넓히고 토지 밖에는 아무 데나
   * 깔 수 있었다** — 시설이 못 들어가는 방에 바닥값만 치른 셈이다.
   */
  const paintable = (i: number, j: number): boolean =>
    t.inside(i, j) &&
    i >= land.i0 &&
    j >= land.j0 &&
    i < land.i0 + land.w &&
    j < land.j0 + land.h &&
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
    /*
     * 벽이 **입구 길을 끊지 않았는지**도 본다 (K48). `bakeIndoorWalls` 는 방이 성립하는지만
     * 보므로, 게이트 옆에 방을 붙이면 새 벽이 손님 길을 막아도 통과한다 — 그러면 입장이
     * 0 이 되고 판이 통째로 얼어붙는다 (실측: 24판 중 2~6판).
     */
    if (bakeIndoorWalls(t, w, GATE, stand).ok && ticketsReachable(t, w, p))
      return before.length * floorCost;
    for (const [i, j, k] of before) t.paint(i, j, k);
    bakeIndoorWalls(t, w, GATE, stand);
    return 0;
  };

  /*
   * ① **기존 방 옆에 이어 깐다.** 카이로에서 방을 넓히는 건 옆 칸에 바닥을 한 줄 더
   * 까는 것뿐이다 — 사각형을 다시 그리는 절차가 없다.
   */
  const strip = Math.max(2, need.h + 1);
  for (let j = land.j0; j < land.j0 + land.h; j++) {
    for (let i = land.i0; i < land.i0 + land.w; i++) {
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
  for (let j = land.j0; j < land.j0 + land.h; j++) {
    for (let i = land.i0; i < land.i0 + land.w; i++) {
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
  // 시도 60회는 **비용**이다 (K49 전수 목록) — ①② 가 다 실패한 뒤의 마지막 수단이다
  for (let attempt = 0; attempt < 60; attempt++) {
    const pw = need.w + 2;
    const ph = Math.max(3, need.h + 2);
    const spent = tryPatch(
      land.i0 + rng.int(Math.max(1, land.w - pw)),
      land.j0 + rng.int(Math.max(1, land.h - ph)),
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
/**
 * 매표소가 아직 **정류장에서 닿는가** (K48).
 *
 * ⚠ 배치 검사는 **놓는 시설**만 본다 — 새 시설이 이미 있던 매표소를 가둬도 아무도
 * 막지 않는다 (`ensureTicket` 주석과 같은 구멍의 다른 쪽). 봇이 부유해져 게이트
 * 둘레를 꽉 채우기 시작하자 실측으로 **24판 중 6판이 17~39주차에 입장 0 으로
 * 얼어붙었다** (매표소는 갇혔고, 반경 12 안이 다 차서 새로 지을 자리도 없었다).
 *
 * 사람은 자기 입구를 막지 않는다 — 막았으면 헐고 다시 놓는다. 봇은 헐 줄 모르니
 * **놓기 전에 막히는지 보고, 막히면 되돌린다.**
 *
 * 거리장(`GuestStore.distanceTo`)이 아니라 BFS 한 번으로 잰다 — 거리장은 시설마다
 * 한 장씩 굽는 거라 시설 하나 놓을 때마다 부르면 판이 몇 배로 느려진다.
 * 판정은 손님과 같은 `guestWalkable` 을 쓴다 (K26 ②).
 */
function ticketsReachable(t: KairoTerrain, w: WallGrid, p: PlacementGrid): boolean {
  const tix = p.all().filter((it) => it.defId === TICKET_DEF_ID);
  if (tix.length === 0) return true; // 아직 없으면 `ensureTicket` 소관이다
  const stop = KairoTerrain.busStop();
  const seen = reachable(t, w, stop, guestWalkable(t, p));
  for (const it of tix) {
    const def = facilityDef(it.defId);
    if (!def) continue;
    for (const [ti, tj] of PlacementGrid.footprintTiles(def, it.i, it.j, it.facing ?? 0)) {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = ti + di;
        const nj = tj + dj;
        if (t.inside(ni, nj) && seen[nj * t.width + ni] === 1) return true;
      }
    }
  }
  return false;
}

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
  /*
   * 후보는 **해금된 토지 전체**다 (K49). 예전엔 게이트에서 반경 12 였다 — 봇이 정한 값이고,
   * 이 함수의 주석이 이미 그 대가를 실측으로 적어 두고 있었다: *"반경 12 안이 다 차서
   * 새로 지을 자리도 없었다"* (24판 중 6판이 입장 0 으로 얼어붙음). 매표소를 못 세우면
   * 판이 통째로 죽으므로, 여기서 상한을 두는 것은 밸런스가 아니라 **판을 죽이는 값**이다.
   * 사람은 입구가 막히면 반경을 세지 않고 놓을 수 있는 데를 찾는다.
   *
   * 게이트에서 가까운 순 — 결정론 (불변식 2).
   */
  const spots: { i: number; j: number; d: number }[] = [];
  for (let j = land.j0; j < land.j0 + land.h; j++) {
    for (let i = land.i0; i < land.i0 + land.w; i++) {
      if (i === GATE.i && j === GATE.j) continue;
      spots.push({ i, j, d: Math.abs(i - GATE.i) + Math.abs(j - GATE.j) });
    }
  }
  spots.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  // ① 그냥 되는 자리 — 판정만 하므로 토지 전체를 훑어도 싸다
  for (const sp of spots) {
    if (!p.check(t, w, GATE, TICKET_DEF_ID, sp.i, sp.j, opts).ok) continue;
    p.place(t, w, GATE, TICKET_DEF_ID, sp.i, sp.j, opts);
    return (def as unknown as { cost: number }).cost;
  }
  /*
   * ② 길만 없는 자리 — 깔고 다시 본다 (다른 시설과 같은 정책).
   *
   * ⚠ 여기는 **가까운 곳만** 본다. `ensurePath` 는 후보 하나마다 격자 전체를 0-1 BFS 로
   * 훑으므로 6천 칸을 다 돌면 한 주가 몇 초가 된다 — 남기는 상한이지만 이유는 밸런스가
   * 아니라 **비용**이고, 매표소가 게이트에서 32칸 넘게 떨어질 이유도 없다 (정류장에서
   * 다섯 칸 걸어 들어온다).
   */
  const PAVE_TRIES = 256;
  for (const sp of spots.slice(0, PAVE_TRIES)) {
    const paved = ensurePath(t, w, p, land, {
      i: sp.i,
      j: sp.j,
      w: def.size[0] as number,
      h: def.size[1] as number,
    });
    if (paved === 0) continue;
    if (!p.check(t, w, GATE, TICKET_DEF_ID, sp.i, sp.j, opts).ok) continue;
    p.place(t, w, GATE, TICKET_DEF_ID, sp.i, sp.j, opts);
    return (def as unknown as { cost: number }).cost + paved;
  }
  return 0;
}

/**
 * 수영장 붓값 — **칸당**. 값을 여기 적지 않고 `kairo-ground.json` 에서 읽는다 (K49).
 *
 * ⚠ 예전엔 `40_000` 을 적어 두고 주석으로 "데이터와 같아야 한다"고만 했다. 그런 상수는
 * 데이터가 움직이는 날 조용히 갈라진다 — 봇이 실제보다 싸게(또는 비싸게) 파는 세계를
 * 재고, `npm run verify` 는 그대로 통과한다. 길값·실내 바닥값은 이미 이렇게 읽고 있었다.
 */
const POOL_TILE_COST = GROUND_KINDS.find((k) => k.id === 'pool_water')?.cost ?? 0;

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
 * 봇이 목표하는 **한 구역의** 면적 — 값을 적지 않고 `kairo-combos.json` 에서 유도한다 (K49).
 *
 * zone 콤보의 면적 배율은 `clamp(sqrt(area / base), 1, cap)` 이므로 보상이 멈추는 지점은
 * `base × cap²` 다. 게임이 면적에 주는 보상이 거기서 끝나므로, 사람이 **한 구역**을 그보다
 * 더 파지 않는 지점도 거기다 (그 위는 칸당 4만원을 내고 아무것도 안 받는다).
 *
 * ⚠ 예전엔 `32` 를 적어 두고 주석으로만 "medium_pool_party 에서 왔다"고 했다. 두 가지가
 * 잘못이었다:
 *   · 데이터가 움직이면 조용히 갈라진다 (`POOL_TILE_COST` 와 같은 형태)
 *   · 더 나쁘게, 그 32 가 **면적 축의 천장**이자 곧 "수영 구역 1개"의 천장이었다 —
 *     `growPool` 이 가장 큰 구역 하나만 키웠으므로, 목표에 닿는 순간 수영 축 전체가
 *     멈췄다. 상한 진단이 "허가 500칸 중 32칸만 쓴다"고 읽은 것이 바로 이 줄이다
 *     (`docs/research/late-game-cap-proposal.md` §1.5.1).
 *
 * 지금 이 값은 **상한이 아니라 한 구역의 목표**다. 더 필요하면 사람은 잔디를 통째로 물로
 * 칠하는 대신 **두 번째 풀을 판다** — zone 콤보도 구역마다 따로 발동한다 (`comboHits`).
 */
const POOL_TARGET_TILES = (() => {
  let best = POOL_MIN_TILES;
  for (const c of COMBOS) {
    if (c.zone !== 'pool' || c.areaScale === undefined) continue;
    best = Math.max(best, Math.ceil(c.areaScale.base * c.areaScale.cap ** 2));
  }
  return best;
})();

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
  walls: WallGrid,
  p: PlacementGrid,
  land: ReturnType<typeof landRect>,
  budget: number,
  /**
   * **놀거리가 병목인가** (K49). 있는 풀이 전부 목표 면적에 닿았을 때 두 번째 풀을
   * 팔지 말지의 근거다.
   *
   * ⚠ 새 상수를 안 만든다 — 수영 구역의 수요 축은 `play` 이고(`guests.ts` `pickTarget`),
   * `play` 가 병목인지는 결산이 이미 화면에 말해 준다. 봇이 짓는 종류를 고를 때 쓰는
   * 신호와 **같은 신호**다. 이게 없으면 두 가지 중 하나가 된다: 목표 면적에서 수영 축이
   * 영원히 멈추거나(예전 동작), 병목과 무관하게 잔디를 계속 물로 칠하는 최적화기가 되거나.
   */
  wantMore: boolean,
): number {
  const stand = (i: number, j: number): boolean => t.isGuestWalkable(i, j);
  const afford = Math.floor(Math.max(0, budget) / POOL_TILE_COST);
  if (afford <= 0) return 0;
  const zones = poolZones(t, stand);
  if (zones.length > 0) {
    const grown = growPool(t, walls, p, land, zones, Math.min(afford, POOL_GROW_TILES));
    if (grown > 0) return grown;
    // 있는 것이 전부 목표 면적이다 — 놀거리가 병목일 때만 하나 더 판다
    if (!wantMore) return 0;
  }
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
          /*
           * 있는 풀에 **안 붙인다** (K49). 붙이면 한 구역으로 합쳐져 목표 면적을 넘고,
           * "두 번째 풀"이 아니라 "첫 풀을 더 판 것"이 된다 — zone 콤보도 하나로 센다.
           */
          if (t.kindAt(i + di, j + dj) === POOL_KIND) return false;
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
    // 물이 입구 길을 끊었으면 되돌리고 다음 자리를 본다 (K48)
    if (!ticketsReachable(t, walls, p)) {
      for (let j = sp.j; j < sp.j + 2; j++) {
        for (let i = sp.i; i < sp.i + 2; i++) t.paint(i, j, 'lawn');
      }
      continue;
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
  walls: WallGrid,
  p: PlacementGrid,
  land: ReturnType<typeof landRect>,
  zones: ReturnType<typeof poolZones>,
  maxTiles: number,
): number {
  /*
   * **목표에 못 미친 구역 중 가장 큰 것**을 키운다. 여러 개를 조금씩 키우면 어느 것도
   * 면적 상한에 못 닿는다 — 그 이유로 예전엔 "가장 큰 구역 하나"만 봤다.
   *
   * ⚠ 그런데 그러면 그 하나가 목표에 닿는 순간 **수영 축 전체가 영원히 멈춘다** (K49).
   * 둘째 풀을 파도 4칸에서 안 자라니 파는 의미가 없었고, 그래서 봇의 수영 구역은
   * 26주에도 260주에도 "1개 · 32칸" 이었다. 목표 미만인 것 중 가장 큰 것을 고르면
   * 원래 의도(하나씩 상한까지)는 지키면서 구역이 여럿일 때도 순서대로 자란다.
   */
  let zone: (typeof zones)[number] | null = null;
  for (const z of zones) {
    if (z.area >= POOL_TARGET_TILES) continue;
    if (zone === null || z.area > zone.area) zone = z;
  }
  if (zone === null) return 0;
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

  const done: { i: number; j: number }[] = [];
  for (const c of cand) {
    if (done.length >= Math.min(maxTiles, room)) break;
    t.paint(c.i, c.j, POOL_KIND);
    done.push(c);
  }
  // 물이 입구 길을 끊었으면 되돌린다 (K48) — 왜는 `ticketsReachable` 참고
  if (done.length > 0 && !ticketsReachable(t, walls, p)) {
    for (const c of done) t.paint(c.i, c.j, 'lawn');
    return 0;
  }
  return done.length * POOL_TILE_COST;
}

/** 선착장 시설의 값 — **데이터가 갖는다**. 예전엔 `772_800` 이 러너에 박혀 있었다 */
const DOCK_DEF_ID = 'dock';

/**
 * 코스 하나에 드는 최소 지출 — 가장 싼 탈것 2대. 예전 문턱 `800_000` 을 대신한다
 * (그 값은 어디서 왔는지 아무도 안 적어 두었고, 장비값이 움직이면 갈라진다).
 * 선착장값은 **빈 잔교가 없을 때만** 드므로 여기 안 넣는다 — `ensureDock` 이 따로 본다.
 */
const MIN_COURSE_SPEND = Math.min(...COURSE_EQUIPMENT.map((e) => e.vehicleCost)) * 2;

/**
 * 코스가 시작할 **잔교 목록** — 게임(`main.ts`)과 **같은 물음**이다 (K49).
 *
 * `dockCandidates` 의 규칙은 딱 하나다: 물 위/밟고 지나가는 시설의 **앵커 칸**을 4-연결로
 * 묶어 무리(=잔교)를 만들고, 그 무리에 `dock` 시설이 붙어 있으면 후보가 된다.
 * **무리 하나가 후보 하나**이므로 같은 잔교에 선착장을 열 개 놓아도 코스는 하나뿐이다.
 *
 * ⚠ 부르는 쪽의 필터를 `main.ts:1884` 와 **글자 그대로** 맞춘다 (앵커 칸 하나만 넘긴다 —
 * 발자국 전체를 넘기면 봇이 UI 와 다른 후보를 보게 되고, 그게 이 파일이 격자·토지·해금에서
 * 이미 세 번 겪은 divergence 다).
 */
function docksOf(p: PlacementGrid): ReturnType<typeof dockCandidates> {
  return dockCandidates(
    p
      .all()
      .filter((it) => {
        const def = facilityDef(it.defId);
        return def?.layer === 'water' || def?.walkOn === true;
      })
      .map((it) => ({ x: it.i, y: it.j })),
    { x: GATE.i, y: GATE.j },
    p.all().filter((it) => it.defId === DOCK_DEF_ID).map((it) => ({ x: it.i, y: it.j })),
  );
}

/**
 * 코스를 하나 더 놓으려면 **잔교를 하나 더 짓는다** (K49).
 *
 * ⚠ 예전 봇은 잔교를 **안 지었다.** 물 타일을 성큼성큼 훑어 "여기가 선착장이다" 하고
 * 값만 냈다 (러너의 옛 주석: *"물자리를 추상화하므로 배치는 생략하고 값만 낸다"*).
 * 그래서 코스 개수의 진짜 상한 — 게임 규칙 — 이 **한 번도 안 재졌고**, 그 자리를
 * `courses.count < 4` 라는 봇의 천장이 대신했다 (`late-game-cap-proposal.md` §1.5.1).
 *
 * 새 후보를 만들려면 **기존 데크 무리에 안 붙은** 물칸이어야 한다 — 붙이면 같은 무리가
 * 되어 후보 수가 그대로다. 그것이 이 축의 실제 상한이다: 물가 길이 · 토지 · 코스끼리의
 * 겹침(`validateCourse` 의 `overlap`) · 돈.
 *
 * ⚠ **코스가 들어가는 자리에만 놓는다** (`plan`). 게이트에서 가까운 순으로 아무 물칸에나
 * 놓으면 잔교가 입구 앞에 뭉치고, 거기서 뻗는 코스는 전부 앞 코스와 겹쳐 거절된다 —
 * 그러면 "코스가 2개에서 안 는다"가 게임의 답이 아니라 **봇의 스캔 순서**의 답이 된다
 * (걷어낸 `courses.count < 4` 와 정확히 같은 형태다). 사람은 코스가 들어가는 데를 보고
 * 잔교를 놓는다.
 *
 * 게이트에서 가까운 순 결정적 스캔 (불변식 2). rng 를 안 쓴다.
 */
function ensureDock(
  t: KairoTerrain,
  w: WallGrid,
  p: PlacementGrid,
  land: ReturnType<typeof landRect>,
  cash: number,
  permitArea: number,
  /** 이 잔교 끝에서 코스가 성립하나 — 성립하면 그 핸들 (안 되면 null) */
  plan: (tip: { x: number; y: number }, dir: { x: number; y: number }) => { x: number; y: number }[] | null,
): { spent: number; tip: { x: number; y: number }; handles: { x: number; y: number }[] } | null {
  const def = allFacilityDefs().find((d) => d.id === DOCK_DEF_ID);
  if (!def || def.cost > cash) return null;
  const opts = { land, permitArea };
  /** 이미 잔교인 칸 — 여기에 4-이웃으로 붙으면 같은 무리가 된다 */
  const deck = new Set<number>();
  for (const it of p.all()) {
    const d = facilityDef(it.defId);
    if (d?.layer === 'water' || d?.walkOn === true) deck.add(it.j * 4096 + it.i);
  }
  const spots: { i: number; j: number; d: number }[] = [];
  for (let j = land.j0; j < land.j0 + land.h; j++) {
    for (let i = land.i0; i < land.i0 + land.w; i++) {
      if (!t.isWater(i, j)) continue;
      let touchesDeck = false;
      for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (deck.has((j + dj) * 4096 + (i + di))) touchesDeck = true;
      }
      if (touchesDeck) continue; // 붙이면 후보가 안 는다
      spots.push({ i, j, d: Math.abs(i - GATE.i) + Math.abs(j - GATE.j) });
    }
  }
  spots.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  /*
   * ⚠ 시도 수에 상한을 둔다 — **밸런스가 아니라 비용**이다. `p.check` 가 물가 판정과
   * 도달 검사를 하므로 물칸 수천 개를 매주 다 두드리면 판이 몇 배로 느려진다.
   * 가까운 쪽부터 보므로 여기서 못 찾으면 게이트 근처 물가가 다 찬 것이고,
   * 그때는 다음 주에 (토지가 넓어진 뒤에) 다시 본다.
   */
  const TRIES = 400;
  for (const sp of spots.slice(0, TRIES)) {
    if (!p.check(t, w, GATE, DOCK_DEF_ID, sp.i, sp.j, opts).ok) continue;
    /*
     * 한 칸짜리 잔교의 방향은 **게이트 반대쪽**이다 — `dockCandidates` 가 그렇게 낸다
     * ("한 칸짜리 잔교는 방향을 알 수 없어 게이트 반대쪽을 쓴다"). 여기서 같은 규칙을
     * 쓰지 않으면 놓고 나서 후보로 잡힐 때 방향이 달라져 판정이 갈린다.
     */
    const tip = { x: sp.i, y: sp.j };
    const raw = { x: tip.x - GATE.i, y: tip.y - GATE.j };
    const dir = raw.x === 0 && raw.y === 0 ? { x: 0, y: 1 } : raw;
    const handles = plan(tip, dir);
    if (handles === null) continue;
    const done = p.place(t, w, GATE, DOCK_DEF_ID, sp.i, sp.j, opts);
    if (!done.ok || !done.placed) continue;
    if (!ticketsReachable(t, w, p)) {
      p.remove(done.placed.handle);
      continue;
    }
    return { spent: (def as unknown as { cost: number }).cost, tip, handles };
  }
  return null;
}

/**
 * 특화를 고른다 (P1.5 의 축을 헤드리스가 **실제로 재게** — P2-B).
 *
 * P1.5 가 갈림길을 만들었는데 봇이 `chooseSpecialty` 를 한 번도 안 불렀다. 즉
 * 밸런싱이 "아무도 안 고른 세계"를 재고 있었다 — 봇과 골든은 실제 규칙으로 돈다(K36)를
 * 어긴 상태다. 실측으로도 확인했다: 정원의 정본을 `capacityOf` 로 통일한 뒤
 * 26주·52주 숫자가 **한 글자도 안 움직였다.** 고칠 것이 없어서가 아니라 특화가
 * 하나도 없어서였다.
 *
 * ## 정책 — 결산이 말하는 부족을 그대로 읽는다 (3분기)
 *
 * 특화 셋이 **서로 다른 자원**에 꽂히므로(동시 이용·현금·평판) 규칙도 자원 이름 그대로다.
 * 셋 다 **결산에 이미 있는 신호**이고 새 상수를 하나도 안 만든다:
 *   · 이 시설이 **병목 수요**를 채운다 → **회전.** 결산의 `bottleneck` 은 봇이 무엇을
 *     지을지 고를 때 이미 쓰는 신호다 (`want`). 자리가 모자란 종류의 정원을 늘리면
 *     슬롯·공급·입장 상한(`min(등급, 공급×1.5)`)이 함께 오른다
 *   · 아니고 **다음 등급 문턱에 만족도가 못 미친다** → **평판.** 승급은 심사이고
 *     심사는 만족도로 연다 (K42) — 문턱은 `GRADES` 에서 읽는다
 *   · 둘 다 아니면 → **수익.** 급한 데가 없으면 돈으로 바꾼다
 *
 * ⚠ **최적화기를 만들지 않는다.** 시설별 기대이득을 재는 규칙으로 키우면 밸런싱이
 * 게임이 아니라 **봇의 영리함**을 재게 된다 — 카드·직원 정책에서 이미 경계한 형태다
 * ("정책이 정교할수록 밸런스가 좋아 보이는 착시").
 *
 * ⚠ **"현금이 마르면 수익"은 뺐다** — 구조적으로 안 밟히는 분기다 (실측). 특화는 개선
 * 직후에만 열리고 개선은 `cost <= cash - 예비비` 를 요구하므로, 고르는 순간의 현금은
 * 언제나 예비비 위다. 죽은 분기를 남기면 "세 갈래를 본다"고 적어 두고 실제로는 둘만
 * 도는 상태가 되고, 그게 이 페이즈가 고치려던 바로 그 형태다.
 *
 * ⚠ **rng 를 안 쓴다.** 여기서 뽑으면 날씨·손님 스트림이 밀려 특화 도입 전후를
 * 비교할 수 없다 (불변식 2). 판단은 전부 지난주 결산에서 온다.
 *
 * 데이터가 그 특화를 안 주면(매표소는 회전뿐) **허용 목록의 첫 번째**로 물러난다 —
 * 건너뛰면 그 시설만 영영 특화가 없어 축이 반쪽으로 측정된다.
 */
function chooseSpecialties(
  p: PlacementGrid,
  last: WeekReport | null,
  /** 평판 이동평균 — 심사가 보는 값과 같다 */
  reputation: number,
  /** 다음 등급이 요구하는 퇴장 만족도. 최고 등급이면 더 오를 곳이 없으므로 0 */
  nextReq: number,
  tally: Map<FacilitySpecialty, number>,
): void {
  const bottleneck = last?.bottleneck?.need ?? null;
  for (const it of p.all()) {
    if (!p.canChooseSpecialty(it.handle)) continue;
    const need = (facilityDef(it.defId) as { need?: NeedKind } | undefined)?.need;
    const want: FacilitySpecialty =
      bottleneck !== null && need === bottleneck
        ? 'capacity'
        : reputation < nextReq
          ? 'reputation'
          : 'revenue';
    const allowed = PlacementGrid.specialtiesFor(it.defId);
    const pick = allowed.includes(want) ? want : allowed[0];
    if (!pick) continue;
    if (p.chooseSpecialty(it.handle, pick)) tally.set(pick, (tally.get(pick) ?? 0) + 1);
  }
}

/**
 * 뽑힌 자리에서 **얼마나 멀리까지 붙여 보나** (P2-B). 맨해튼 거리 칸.
 *
 * 콤보 반경이 2~4 이므로 2 면 "옆에 붙인다"가 성립한다. ⚠ 크게 잡으면 봇이 뽑기를
 * 무시하고 판 전체를 훑는 **최적화기**가 된다 — 그러면 밸런싱이 게임이 아니라 봇의
 * 탐색 폭을 잰다. 0 으로 두면 예전 동작과 완전히 같아지므로 음성 대조군이기도 하다.
 */
const COMBO_NUDGE = 2;

/**
 * 뽑힌 자리를 **콤보가 터지는 쪽으로 한두 칸 붙인다** (P2-B).
 *
 * ## 왜 필요한가
 *
 * P2-A 가 콤보를 경제에 배선했지만 봇은 콤보를 **모른다.** 그래서 발동 증가(20→23)는
 * 시설이 늘어 **우연히** 겹친 결과였고, 헤드리스는 이 축의 **하한만** 재고 있었다
 * (상한 +7.9점/+13.2% 는 단위 검사로만 확인). 밸런스를 "콤보가 있는 상태"로 말하려면
 * 봇이 조금이라도 노려야 한다.
 *
 * ## 왜 "자리를 여러 개 뽑아 비교"가 아니라 **붙이기**인가
 *
 * 처음엔 뽑기를 4번 해서 그중 콤보가 가장 많이 터지는 자리를 골랐다. 그런데 뽑기 횟수가
 * 달라지면 **그 뒤의 rng 스트림이 통째로 밀린다** — 콤보 선호를 끈 대조군에서도 돈 부족이
 * 판당 12 → 23회로 똑같이 뛰었다 (실측). 즉 그 설계로는 "콤보를 노린 효과"를 잴 수 없다.
 * 붙이기는 뽑기를 **한 번만** 하므로 스트림이 그대로고, 바뀌는 것은 그 시설이 놓인
 * 자리뿐이다 — 그래야 밸런스 변화가 콤보 때문이라고 말할 수 있다.
 *
 * 모델로도 이쪽이 맞다. 사람은 지도를 스캔하지 않는다 — 놓으려던 자리 **옆**을 보고
 * "여기 붙이면 콤보가 뜨네" 한다.
 *
 * ## 얼마나 노리나 — **가산점**이지 목적함수가 아니다
 *
 * 새로 터지는 콤보 **개수**만 세고, 동점이면 원래 자리다 (원점 우선 = 안 붙이는 쪽이 기본).
 * 만족 몇 점·매출 몇 % 인지 가중치를 안 매기는 이유는 그것이 곧 최적화기이기 때문이다.
 *
 * ⚠ **rng 를 안 쓴다** (불변식 2). 후보는 원점에서 파생된 고정 오프셋이다.
 */
function nudgeForCombo(
  t: KairoTerrain,
  w: WallGrid,
  p: PlacementGrid,
  defId: string,
  i: number,
  j: number,
  opts: { land: ReturnType<typeof landRect>; permitArea?: number },
): { i: number; j: number } {
  let best = { i, j };
  let bestGain = previewCombos(p, defId, i, j).gained.length;
  for (let d = 1; d <= COMBO_NUDGE; d++) {
    for (const [di, dj] of [
      [d, 0],
      [-d, 0],
      [0, d],
      [0, -d],
    ] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (!p.check(t, w, GATE, defId, ni, nj, opts).ok) continue;
      const gain = previewCombos(p, defId, ni, nj).gained.length;
      if (gain > bestGain) {
        bestGain = gain;
        best = { i: ni, j: nj };
      }
    }
  }
  return best;
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
  /**
   * 수면 사용 허가 면적 (S1) — **게임과 같은 제약**. 봇이 안 넘기면 헤드리스가
   * 허가 없이 강을 밀폐하는 세계를 잰다 (K36 의 토지 해금과 같은 종류의 divergence).
   */
  permitArea?: number,
): number {
  const opts = permitArea === undefined ? { land } : { land, permitArea };
  const cands = allFacilityDefs()
    .filter((d) => {
      const x = d as unknown as { need?: NeedKind; cost: number };
      if (!isUnlocked(d.id)) return false;
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
  const place = (pick as unknown as {
    layer: string;
    placement?: { requiresIndoor?: boolean; requiresDeck?: boolean };
  });
  const needsIndoor = place.placement?.requiresIndoor === true;
  /**
   * 물 위 시설인가 (K48). **빠지의 스릴 시설 11종 중 10종이 물 위다** — 봇이 이걸
   * 안 지으면 `needSupply(thrill)` 이 영구히 0 이고, 3등급 심사(스릴 3개)가 산수로
   * 불가능해진다 (실측: 24판×52주에서 3등급 응시 214회 · 스릴 점수 0.0/10 · 통과 0).
   * 그 상태로 "등급이 안 오른다"를 게임 탓으로 읽으면 안 된다.
   */
  const needsWater = place.layer === 'water';
  for (let round = 0; round < 2; round++) {
    /*
     * 실내 시설은 **방을 겨냥한다** (K48).
     *
     * 균일 난수로 뽑으면 방(시작 킷 9×5 = 45칸)이 토지(26×48) 안의 바늘이라 200번을
     * 뽑아도 거의 안 맞는다. 실측으로 26주 판의 위생 시설이 평균 2.3개에 머물러
     * **2등급 심사가 통째로 막혀 있었다** (위생 3개가 조건인데 점수 0.7/10).
     * 사람은 방 안을 겨냥해서 놓는다 — 그게 봇의 모델이어야 한다.
     *
     * 방은 라운드마다 다시 모은다 — 아래에서 방을 넓히면 후보가 늘어난다.
     */
    const aim: [number, number][] = [];
    if (needsIndoor) {
      for (let j = land.j0; j < land.j0 + land.h; j++)
        for (let i = land.i0; i < land.i0 + land.w; i++)
          if (t.isIndoor(i, j) && p.handleAt(i, j) === 0) aim.push([i, j]);
      // 결정적 셔플 — 늘 왼쪽 위부터 채우면 방 한쪽만 쓰고 4칸짜리가 안 들어간다
      for (let x = aim.length - 1; x > 0; x--) {
        const y = rng.int(x + 1);
        const tmp = aim[x] as [number, number];
        aim[x] = aim[y] as [number, number];
        aim[y] = tmp;
      }
    }
    /*
     * 물 위 시설도 **물가를 겨냥한다** (K48). 같은 이유다 — 균일 난수는 물에 떨어지는
     * 족족 `wrong-terrain` 이었고, 그래서 예전 봇은 아예 안 지었다.
     *
     * 후보는 토지 안의 물칸 중 **기반이 닿는 곳**이다:
     *   · 덱 전용(`requiresDeck`)  — 5근방에 이미 놓인 덱이 있는 칸
     *   · 덱/물가(`requiresShoreOrDeck`) — 4근방에 뭍이나 덱이 있는 칸
     * 게이트에서 가까운 순으로 훑는다 (`ensurePool` 과 같은 결정적 스캔) — 무작위면
     * 강 건너에 덱이 하나씩 흩어져 아무것도 이어지지 않는다.
     */
    if (needsWater) {
      const deckOnly = place.placement?.requiresDeck === true;
      const spots: { i: number; j: number; d: number }[] = [];
      for (let j = land.j0; j <= land.j0 + land.h - (pick.size[1] as number); j++) {
        for (let i = land.i0; i <= land.i0 + land.w - (pick.size[0] as number); i++) {
          if (!t.isWater(i, j)) continue;
          const near = deckOnly
            ? ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([di, dj]) =>
                p.isWalkOn(i + di, j + dj),
              )
            : ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(
                ([di, dj]) => t.isWalkable(i + di, j + dj) || p.isWalkOn(i + di, j + dj),
              );
          if (!near) continue;
          spots.push({ i, j, d: Math.abs(i - GATE.i) + Math.abs(j - GATE.j) });
        }
      }
      spots.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
      for (const sp of spots) aim.push([sp.i, sp.j]);
    }
    // 시도 200회는 **비용**이다 (K49 전수 목록) — 실내·물 위는 후보를 겨냥해서 뽑으므로
    // 200 안에 들거나 아예 자리가 없거나다 (`aim.length` 로 미리 끊는다)
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
      let i = lo + rng.int(Math.max(1, hi - lo + 1));
      let j = land.j0 + rng.int(Math.max(1, jHi - land.j0 + 1));
      if (needsIndoor || needsWater) {
        // 겨냥할 칸이 없으면 더 뽑아 봐야 헛일이다 (실내는 아래에서 방을 넓힌다)
        if (aim.length === 0) {
          lastFail = needsWater ? 'needs-deck' : 'needs-indoor';
          break;
        }
        if (needsWater && attempt >= aim.length) break;
        const a = aim[attempt % aim.length] as [number, number];
        i = a[0];
        j = a[1];
      }
      /*
       * 물 칸은 시도 전에 거른다 — 토지 사각형의 아래쪽은 강이라, 반경이 자라면
       * 표본의 절반이 물에 떨어져 wrong-terrain 으로 시도 예산을 태운다
       * (실측 72회/판 — 봇이 부유해진 K41 뒤 no-space 경보의 진범이었다).
       */
      if (!needsWater && t.isWater(i, j)) continue;
      const c = p.check(t, w, GATE, pick.id, i, j, opts);
      if (c.ok) {
        // 콤보가 뜨는 쪽으로 한두 칸 붙여 본다 (P2-B) — 왜는 `nudgeForCombo` 참고
        const at = nudgeForCombo(t, w, p, pick.id, i, j, opts);
        const done = p.place(t, w, GATE, pick.id, at.i, at.j, opts);
        // 내 입구를 막았으면 되돌린다 (K48) — 왜는 `ticketsReachable` 참고
        if (done.ok && done.placed && !ticketsReachable(t, w, p)) {
          p.remove(done.placed.handle);
          lastFail = 'seals-gate';
          continue;
        }
        return (pick as unknown as { cost: number }).cost + roomSpend;
      }
      /*
       * 길만 없는 자리면 깔고 다시 본다 (K32-B). 다른 이유(점유·지형)면 그냥 다음 자리로 —
       * 아무 데나 포장하면 봇이 판 전체를 깔아 값이 왜곡된다.
       *
       * ⚠ 후보를 모으게 된 뒤에도 이 가지는 **예전 그대로** 둔다 (P2-B). "이미 되는 자리가
       * 있으면 포장하지 말자"로 바꿔 봤더니, 길이 안 깔려 길망이 자라지 않았고 그 여파로
       * 돈 부족이 판당 12 → 23회로 뛰어 52주 경보에 걸렸다 (실측, 콤보 선호를 끈 대조군
       * 에서도 같은 23회 — 즉 원인은 콤보가 아니라 **포장을 줄인 것**이었다).
       * 길은 이 봇의 자산이다. 콤보 선호는 "그냥 되는 자리들" 사이에서만 고른다.
       */
      // 물 위 시설은 길을 깔아 봐야 소용없다 — 덱이 기반이다
      if (c.fail === 'unreachable' && !needsWater) {
        const pathSpend = ensurePath(t, w, p, land, {
          i,
          j,
          w: pick.size[0] as number,
          h: pick.size[1] as number,
        });
        if (pathSpend > 0) {
          roomSpend += pathSpend;
          if (p.check(t, w, GATE, pick.id, i, j, opts).ok) {
            /*
             * ⚠ 여기서는 **붙여 보지 않는다.** 길을 그 자리에 깔아 놓고 옆으로 옮기면
             * 방금 산 길이 헛돈이 된다. 콤보 선호는 "그냥 되는 자리"에서만 쓴다.
             */
            const done2 = p.place(t, w, GATE, pick.id, i, j, opts);
            if (done2.ok && done2.placed && !ticketsReachable(t, w, p)) {
              p.remove(done2.placed.handle);
              lastFail = 'seals-gate';
              continue;
            }
            return (pick as unknown as { cost: number }).cost + roomSpend;
          }
        }
      }
      lastFail = c.fail ?? 'unknown';
    }
    // 실내 시설인데 자리가 없으면 **방이 모자란 것**이다 — 새로 짓고 다시 본다
    if (!needsIndoor || round === 1) break;
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
  /* 심사 계측 (진단) — 위 RunResult 주석 참고 */
  let examApplied = 0;
  let examPassed = 0;
  let examFailed = 0;
  let examBlockedByFee = 0;
  let examNotReady = 0;
  let examNoEligibleWeeks = 0;
  let examDemotions = 0;
  const examReqScores = new Map<string, [number, number]>();
  /**
   * 고른 특화의 갈래별 횟수 (P2-B). **0 이면 축이 안 재진 것**이다 — 산 위 시설
   * (`onSlope`)을 세는 것과 같은 이유로 보고에 올린다. 셋 중 하나만 0 이어도
   * 그 갈래는 밸런싱에 안 실려 있다.
   */
  const specialtyTally = new Map<FacilitySpecialty, number>();
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
    // 빈 실내 칸이 8 미만이면 미리 넓힌다 — 8 은 실내 시설 최대 발자국(2×2=4)의 두 배다
    if (freeIndoor < 8) {
      const grade0 = GRADES[gradeNo - 1] ?? GRADES[0]!;
      cash -= ensureRoom(t, w, p, landRect(grade0), rng, { w: 4, h: 1 });
    }

    /*
     * 무엇을 지을까 — **심사 시트가 먼저, 그 다음이 결산 병목** (K48).
     *
     * ⚠ 예전 봇은 병목만 봤다. 그런데 결산 병목(`week.ts` 의 `supply` 키 순회)은
     * **하나도 없는 종류를 아예 후보로 안 올린다** — 공급이 0 이면 키가 없다.
     * 그래서 스릴 0개인 판에서 병목이 영원히 스릴을 안 가리켰고, 봇은 "싼 쪽 절반"
     * 무작위에만 기대야 했다. 스릴 시설은 전부 비싼 쪽이라(최저 436,800) 한 번도
     * 안 뽑혔고, 3등급 심사(스릴 3개)가 **26·52주 통틀어 0회 통과**였다.
     *
     * 사람은 심사 시트에 뜬 조건 세 줄을 보고 그걸 짓는다. 봇도 다음 등급이 요구하는
     * `needSupply` 중 **가장 모자란 것**을 먼저 짓는다 — 게임이 이미 화면에 알려 주는
     * 정보라 봇을 부당하게 똑똑하게 만드는 것이 아니다.
     */
    let want: NeedKind | null = null;
    {
      const nd = nextGradeDef(gradeNo);
      const sup = supplyOf(p);
      let worst = 1;
      for (const c of nd?.examReqs ?? []) {
        if (c.kind !== 'needSupply' || c.need === undefined) continue;
        const prog = Math.min(1, (sup[c.need] ?? 0) / Math.max(1, c.value));
        if (prog < worst) {
          worst = prog;
          want = c.need;
        }
      }
    }
    if (want === null) want = last?.bottleneck?.need ?? null;
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
        w,
        p,
        landRect(GRADES[gradeNo - 1] ?? GRADES[0]!),
        cash - BUILD_RESERVE,
        // 놀거리가 병목이면 두 번째 풀까지 (K49) — 결산이 이미 화면에 말하는 신호다
        last?.bottleneck?.need === 'play',
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
    /*
     * `1.5` 는 게임의 값이다 (`admissionLimit` 의 `공급 × 1.5`). `1.3` 은 **여유**로,
     * 상한에 닿자마자 끊지 않고 조금 넘겨서 짓게 한다 — 정확히 상한에서 끊으면 개선으로
     * 정원이 조금만 늘어도 매주 짓다 말다를 반복한다 (히스테리시스). 봇의 값이지만
     * 천장이 아니라 **떨림 방지**다.
     */
    const capped = p.totalCapacity() * 1.5 > gradeNow.maxGuests * 1.3;
    if (capped) weekBudget = 0;

    /**
     * 이번 주에 한 채라도 지었나 — **개선의 방아쇠**다 (아래 § 참고).
     */
    let builtAny = false;
    /*
     * 한 주에 **3채까지** — 천장이 아니라 **박자**다 (K49 전수 목록). 한 주에 열 채를
     * 놓는 사람은 없다. 후반에는 어차피 `capped` 가 `weekBudget` 을 0 으로 만들므로
     * 이 숫자가 "지을 게 없다"의 원인이 되는 구간은 없다 (실측: 상한 도달 주에 건설 0원).
     */
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
        (GRADES[gradeNo - 1] ?? GRADES[0]!).permitArea,
      );
      cash -= spent;
      buildSpend += spent;
      weekBudget -= spent;
      if (spent === 0) {
        /*
         * ⚠ **한 종류가 막힌 것과 지을 게 없는 것은 다르다** (K48).
         *
         * 첫 바퀴는 `want`(심사 조건·병목) 한 종류로 후보를 좁힌다. 그 종류가 자리
         * 문제로 막혔다고 그 주의 건설을 통째로 끊으면, 밸런싱이 "자리가 없다"를
         * 판당 10회로 보고한다 — 실제로는 **다른 것은 지을 수 있는 주**였다.
         * 종류를 풀고 한 번 더 본다.
         */
        if (b === 0 && want !== null) continue;
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
      builtAny = true;
    }

    /*
     * 지을 게 없으면 **있는 것을 고친다** (§15.9).
     *
     * ⚠ 방아쇠가 `capped` 하나였고, 자리는 **건설 뒤로** 옮겼다 (P2-B). 둘 다 실측에서 왔다:
     *   · `capped` 만 보면 26주 판에서 개선이 **판당 한 주**밖에 안 돈다 (상한 도달 중앙 1회).
     *     그런데 그 판들도 돈·자리로 건설이 막히는 주가 열 번쯤 있다 — 사람이라면 그 주에
     *     있는 것을 고친다. 상한 도달이든 자리 부족이든 **"이번 주에 지을 게 없다"는 같다.**
     *   · 개선이 건설보다 **먼저** 돌면 확장 자금을 개선이 가로챈다. 사람은 먼저 짓고
     *     남는 돈으로 고친다. `capped` 인 주는 `weekBudget = 0` 이라 건설이 어차피 0 원이므로
     *     예전 동작이 그대로 보존된다 — 새로 도는 것은 **못 지은 주**뿐이다.
     *
     * 이게 없으면 평균 개선 단계가 1.10/5 에 머물러(실측) "확장이 막히면 개선한다"는
     * 후반 대책이 계측에 없는 것과 같고, 3단계 뒤의 **P1.5 특화 축도 함께 죽는다.**
     */
    if (capped || !builtAny) {
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
      /*
       * ⚠ `24` 는 폭주 방지이지 후반의 천장이 아니다 (K49 전수 목록). 실제 문턱은
       * `현금/200만` 과 `upBudget` 이고, 260주 판에서도 개선 단계가 5.00 로 포화하므로
       * 이 상한에 물린 적이 없다. 물리기 시작하면(= 개선이 후반의 유일한 배수구가 아니게
       * 되면) 그건 이 숫자가 아니라 게임 쪽을 봐야 한다는 신호다.
       */
      const rounds = Math.max(3, Math.min(24, Math.floor((cash - BUILD_RESERVE) / 2_000_000)));
      /*
       * ⚠ **못 지은 주의 개선은 건설과 같은 절제를 받는다** (P2-B).
       *
       * 상한에 막힌 주(`capped`)는 예전처럼 예비비 위 전부를 쓴다 — 그때는 개선이 유일한
       * 돈 쓸 곳이고, 그 동작을 바꾸면 K36-B② 의 실측이 무효가 된다.
       *
       * 반면 **자리·신중으로 못 지은 주**는 다르다. 건설은 예비비 위 현금을 한 주에
       * **1/4** 만 쓰는데(위 `weekBudget`), 개선만 100% 를 쓰면 매주 현금이 예비비까지
       * 훑여 다음 주가 "돈이 없다"가 된다 — 실측으로 돈 부족이 판당 12 → 21회까지 올랐고
       * 52주 경보에 걸렸다. 같은 1/4 을 쓰면 절제가 한 벌이 된다.
       */
      let upBudget = Math.max(0, cash - BUILD_RESERVE);
      if (!capped) upBudget = Math.floor(upBudget * 0.25);
      for (let k = 0; k < rounds; k++) {
        /*
         * ⚠ **낼 수 있는 것부터 고친다** (P2-B). 예전에는 `단계 오름차순` 으로 골랐는데,
         * 단계가 낮은 것이 곧 싼 것은 아니다 — 1단계 파도풀(개선비 132만)이 맨 앞에 서면
         * 11만짜리 탁구대가 뒤에 있어도 `break` 가 그 주의 개선을 **통째로** 끊었다.
         *
         * K42 로 경제가 소비형이 되면서 현금이 예비비 언저리에 붙어 살자 이 `break` 가
         * 거의 매주 첫 바퀴에서 걸렸다 (실측: 52주 평균 개선 단계 **1.10/5** — 판당
         * 개선이 다섯 번 남짓이다).
         *
         * 개선비는 단계와 함께 가팔라지므로(`upgradeCost`) 싼 것부터 사도 한 시설만
         * 독주하지 않는다 — 올라간 만큼 뒤로 밀린다. 사람도 예산 안에서 살 수 있는 것을 산다.
         */
        const targets = p
          .all()
          .filter((it) => p.levelOf(it.handle) < FACILITY_MAX_LEVEL)
          .sort((a, b) => p.upgradeCost(a.handle) - p.upgradeCost(b.handle) || a.handle - b.handle);
        const t0 = targets[0];
        if (!t0) break;
        const cost = p.upgradeCost(t0.handle);
        if (cost <= 0 || cost > upBudget) break;
        p.upgrade(t0.handle);
        cash -= cost;
        upBudget -= cost;
        upgradeSpend += cost;
      }
    }
    /*
     * 개선 **직후**에 특화를 고른다 (P2-B). 3단계에 닿는 것은 위 개선 루프뿐이라,
     * 여기서 안 고르면 한 주가 통째로 "정원은 늘 수 있었는데 안 늘린" 주가 된다.
     * 게임에서도 3단계 개선이 그 자리에서 갈림길을 묻는다.
     */
    chooseSpecialties(
      p,
      last,
      reputation.value,
      GRADES[gradeNo]?.reqExitSatisfaction ?? 0, // 다음 등급 (없으면 최고 등급이라 0)
      specialtyTally,
    );
    g.invalidate();

    /*
     * 등급 (K42) — 강등만 자동, 승급은 심사로.
     *
     * ⚠ 예전 봇은 **자격이 되면 무조건 신청**했다. 자격은 평판 문턱 하나뿐이라
     * 조건(위생 3개 등)이 0 이어도 매주 수수료를 냈고, 실측으로 24판×52주에서
     * **응시 811 · 통과 10** 이었다 — 판당 ₩10.8M(총 이익의 절반)을 "떨어질 걸 아는
     * 시험"에 태웠다. 그래서 밸런싱의 "돈 부족 19회"가 게임의 빡빡함이 아니라
     * 봇의 낭비를 재고 있었다.
     *
     * 사람은 심사 시트에서 조건 3줄을 보고 신청한다. 봇도 **붙을 점수일 때만** 낸다 —
     * 판정과 **같은 평가기**(`evaluateCondition`)로 미리 재고, 주간 조건은 지난주
     * 결산으로 본다 (플레이어가 보는 것과 같은 값이다).
     */
    const downTo = nextGrade(gradeNo, reputation.value).grade;
    if (downTo < gradeNo) {
      examDemotions += gradeNo - downTo;
      gradeNo = downTo;
    }
    const elig = exam.eligible(gradeNo, reputation.value);
    if (elig) {
      const fee = elig.examFee ?? 0;
      const reqs = elig.examReqs ?? [];
      const supplyNow = supplyOf(p);
      const combosNow = evaluateCombos(p, undefined, g.swimZones());
      const foreseen = reqs.reduce(
        (a, c) =>
          a +
          Math.round(
            evaluateCondition(c, p, last, supplyNow, combosNow).progress * EXAM_POINTS_PER_REQ,
          ),
        0,
      );
      const cut = Math.ceil(reqs.length * EXAM_POINTS_PER_REQ * EXAM_PASS_RATIO);
      if (foreseen < cut) {
        examNotReady++;
        for (const c of reqs) {
          const key = `미달 ${elig.grade}등급 ${c.kind}${c.need ? `(${c.need})` : ''}`;
          const cur = examReqScores.get(key) ?? [0, 0];
          examReqScores.set(key, [
            cur[0] +
              Math.round(
                evaluateCondition(c, p, last, supplyNow, combosNow).progress * EXAM_POINTS_PER_REQ,
              ),
            cur[1] + 1,
          ]);
        }
      }
      else if (cash < fee) examBlockedByFee++;
      else {
        cash -= fee;
        exam.apply(elig.grade, k + 1, 0); // 주 시작에 신청 — 이번 주말 판정
        examApplied++;
      }
    } else if (!exam.pending && nextGradeDef(gradeNo)) examNoEligibleWeeks++;
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
     * 코스 정책: **빈 잔교가 있으면 한 주에 하나까지.** 형태는 그 장비에 ◎ 인 것을 고른다
     * (§7.8 이 요구하는 학습을 봇도 흉내낸다 — 아무 형태나 고르면 적합도가 경제에
     * 반영되지 않아 "적합도가 있어도 없어도 같다"는 잘못된 결론이 나온다).
     *
     * ⚠ **개수 상한을 봇이 정하지 않는다** (K49). 예전엔 `courses.count < 4` 였고,
     * 그래서 "프리셋 6 × 장비 19 = 114 조합 중 4를 본다"는 게임에 대한 진술이 아니라
     * **이 줄에 대한 진술**이었다 (`late-game-cap-proposal.md` §1.5.1). 지금은 게임이
     * 정한다:
     *   · **잔교 하나에 코스 하나** (`dock-taken`) — 잔교는 4-연결 데크 무리다
     *   · 코스끼리 3칸 이상 (`overlap`)
     *   · 새 잔교는 기존 데크에 안 붙은 물칸에만 (`ensureDock`) — 물가 길이가 상한이다
     *   · 돈 (선착장값 + 탈것 2대)
     * "한 주에 하나"만 봇의 값인데, 그건 천장이 아니라 **박자**다 — 건설이 주 3채인 것과
     * 같은 종류의 절제이고, 한 주에 열 개를 놓는 사람은 없다.
     */
    if (cash - BUILD_RESERVE > MIN_COURSE_SPEND) {
      const land = landRect(gr);
      const affordable = COURSE_EQUIPMENT.filter(
        (e) => e.vehicleCost * 2 <= cash - BUILD_RESERVE,
      );
      if (affordable.length > 0) {
        const eq = affordable[Math.floor(courseRng.next() * affordable.length)] as
          (typeof COURSE_EQUIPMENT)[number];
        /*
         * ⚠ 대안에서 **못 타는 조합을 뺀다** (`fitOf === 'no'` → `blocked-combo`).
         * 예전 봇은 ◎ 가 없으면 등급만 보고 첫 프리셋을 골랐고, 그게 그 장비로는 못 타는
         * 형태이면 판정이 통째로 거절했다. 옛 봇에서는 잔교 판정(`dock-taken`)이 먼저
         * 걸려 이 실패가 안 보였을 뿐이다 — 사람은 시트에서 ✕ 를 보고 안 고른다.
         */
        const rideable = PRESETS.filter(
          (pr) => pr.grade <= gr.grade && fitOf(eq.id, pr.id) !== 'no',
        );
        const best = rideable.filter((pr) => fitOf(eq.id, pr.id) === 'best');
        const pick = (best.length > 0 ? best : rideable)[0];
        if (pick) {
          /**
           * 이 잔교 끝에서 코스가 성립하나 — **UI 와 같은 제안기**로 잰다
           * (`suggestCourse`, span 8 — `ui/kairo-course.ts:300`).
           *
           * ⚠ 옛 봇은 `defaultHandles` 를 직접 불러 기본 자리 **하나**만 봤다. 그런데
           * 겹침(`overlap`)을 푸는 장치가 바로 이 함수의 **옆으로 밀기**다 —
           * 플레이어에게는 있고 봇에는 없었으니, 헤드리스가 잰 코스 상한은 게임의 상한이
           * 아니라 "밀기를 안 쓴 봇"의 상한이었다.
           */
          const plan = (
            tip: { x: number; y: number },
            dir: { x: number; y: number },
          ): { x: number; y: number }[] | null => {
            const sug = suggestCourse(pick, [{ tip, dir, tiles: 1 }], courses.all, {
              span: 8,
              dockIndex: 0,
              pinned: true,
            });
            const v = validateCourse(t, sug.handles, tip, pick, eq.id, gr.grade, courses.all);
            if (v.ok) return sug.handles;
            if (courseFail === '') courseFail = v.issues.join(',') + ' @' + tip.x + ',' + tip.y;
            return null;
          };

          const docks = docksOf(p);
          let at: { tip: { x: number; y: number }; handles: { x: number; y: number }[] } | null =
            null;
          // ① 이미 있는 **빈 잔교** 부터 (게이트에서 가까운 순)
          for (const d of docks) {
            if (firstFreeDock([d], courses.all) < 0) continue; // 이미 쓰는 잔교
            const hs = plan(d.tip, d.dir);
            if (hs === null) continue;
            at = { tip: d.tip, handles: hs };
            break;
          }
          /*
           * ② 없으면 **코스가 들어가는 자리에 잔교를 새로 놓는다.**
           *
           * ⚠ 문턱은 "놀고 있는 잔교가 2개 미만"이다. `plan` 이 이미 걸러 주므로 놀고 있는
           * 잔교가 쌓이지는 않지만, 값을 치른 뒤 탈것을 못 사는 주가 있을 수 있다.
           * 상한이 아예 없으면 강이 다 찬 뒤에도 매주 잔교를 사는 최적화기가 된다 —
           * 사람은 두 번 놔 보고 안 되면 그만한다. 이것이 이 절에 남은 유일한 봇의 값이다.
           */
          if (
            at === null &&
            docks.filter((d) => firstFreeDock([d], courses.all) >= 0).length < 2
          ) {
            const made = ensureDock(
              t,
              w,
              p,
              land,
              cash - BUILD_RESERVE - eq.vehicleCost * 2,
              gr.permitArea,
              plan,
            );
            if (made !== null) {
              cash -= made.spent;
              /*
               * 선착장은 **격자에 놓는 시설**이다 — 매표소와 같은 줄에 센다 (K49).
               * 안 세면 "건설 0원인 주"가 실제보다 많아진다: 옛 봇은 잔교를 아예 안 지어서
               * 이 구멍이 안 보였는데, 후반 진단의 핵심 지표가 바로 그 줄이다.
               * (탈것값은 안 센다 — 그건 장비 구입이지 건설이 아니다.)
               */
              buildSpend += made.spent;
              g.invalidate();
              at = { tip: made.tip, handles: made.handles };
            }
          }
          if (at !== null) {
            cash -= eq.vehicleCost * 2;
            courses.add({
              presetId: pick.id,
              equipId: eq.id,
              // 대수는 2 로 고정 — 대수까지 봇이 고르면 밸런싱이 봇의 최적화를 잰다
              vehicles: 2,
              dock: at.tip,
              handles: at.handles,
            });
          }
        }
      }
    }
    const courseWeek = courses.weekly();

    const staffSeasonMult = season === 'summer' ? 1 : season === 'winter' ? 0.5 : 0.75;
    for (const role of STAFF_ROLES) {
      const need = Math.ceil(neededFor(role, p) * staffSeasonMult);
      // 8주치 인건비를 낼 수 있을 만큼만 뽑는다 — 사람의 "두 달은 버틸 만큼" (봇의 값)
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
      /*
       * 지금 지을 수 있는 것 — 결산 병목이 **막다른 길**을 안 가리키게 (P3-B).
       *
       * ⚠ 봇이 짓는 판정(`buildOne` 의 `isUnlocked`)과 **같은 물음**이어야 한다.
       * 갈라지면 결산이 "스릴이 없다"고 말하고 봇은 스릴을 못 지어, 헤드리스가
       * 영원히 같은 조언을 받는 판을 잰다.
       */
      buildable: allFacilityDefs()
        .filter((d) => unlocks.isUnlocked(d.id, gradeNo))
        .map((d) => d.id),
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
    if (verdict) {
      if (verdict.passed) {
        examPassed++;
        gradeNo = verdict.target;
        cash += verdict.grant; // 통과 지원금 — UI 와 같은 규칙
      } else {
        examFailed++;
        const reqs = GRADES.find((x) => x.grade === verdict.target)?.examReqs ?? [];
        verdict.perReq.forEach((r, i) => {
          const key = `${verdict.target}등급 ${reqs[i]?.kind ?? '?'}${reqs[i]?.need ? `(${reqs[i]!.need})` : ''}`;
          const cur = examReqScores.get(key) ?? [0, 0];
          examReqScores.set(key, [cur[0] + r.score, cur[1] + 1]);
        });
      }
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
    examApplied,
    examPassed,
    examFailed,
    examBlockedByFee,
    examNotReady,
    examNoEligibleWeeks,
    examDemotions,
    examReqScores: [...examReqScores.entries()].map(([k2, v]) => [k2, v[0], v[1]]),
    supply: supplyOf(p),
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
    specialties: {
      capacity: specialtyTally.get('capacity') ?? 0,
      revenue: specialtyTally.get('revenue') ?? 0,
      reputation: specialtyTally.get('reputation') ?? 0,
    },
    specialtyTotal: [...specialtyTally.values()].reduce((a, b) => a + b, 0),
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
    dockCount: docksOf(p).length,
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
    /*
     * 평균 개선 단계 — 표에 없어서 **개선 축이 죽은 것을 몇 페이즈 동안 못 봤다**
     * (P2-B 실측: 52주에 1.10/5). `--each` 에만 있던 값이라 중앙값 요약을 보는
     * 눈에는 안 잡혔다. 특화(3단계)가 이 값 뒤에 있으므로 같이 본다.
     */
    ['평균 개선 단계', runs.map((r) => r.avgLevel), (n) => n.toFixed(2)],
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
    const needTot = new Map<string, number>();
    for (const r of runs)
      for (const [k, v] of Object.entries(r.supply)) needTot.set(k, (needTot.get(k) ?? 0) + v);
    console.log(
      `need 별 시설 (판당 평균): ` +
        [...needTot]
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${(v / SEEDS).toFixed(1)}`)
          .join(' · '),
    );
  }
  {
    /*
     * 심사 — **"응시를 못 하나 / 떨어지나"** 를 가른다 (K48 진단).
     *
     * 등급 중앙값만 보면 처방을 못 낸다. 응시 0 이면 자격(평판 문턱)이나 수수료가
     * 막고 있는 것이고, 응시는 하는데 통과가 없으면 커트라인(75%)이나 조건이 막는
     * 것이다 — 조건별 평균 점수까지 봐야 "어느 조건"에 답할 수 있다.
     */
    const sumOf = (f: (r: RunResult) => number): number => runs.reduce((a, r) => a + f(r), 0);
    console.log(
      `심사: 응시 ${sumOf((r) => r.examApplied)} · 통과 ${sumOf((r) => r.examPassed)} · ` +
        `탈락 ${sumOf((r) => r.examFailed)} · 조건 미달 ${sumOf((r) => r.examNotReady)}주 · ` +
        `수수료 부족 ${sumOf((r) => r.examBlockedByFee)}주 · ` +
        `자격 미달 ${sumOf((r) => r.examNoEligibleWeeks)}주 · 강등 ${sumOf((r) => r.examDemotions)}회 ` +
        `(전체 ${SEEDS * WEEKS}주)`,
    );
    const agg = new Map<string, [number, number]>();
    for (const r of runs)
      for (const [k, s, n] of r.examReqScores) {
        const cur = agg.get(k) ?? [0, 0];
        agg.set(k, [cur[0] + s, cur[1] + n]);
      }
    if (agg.size > 0)
      console.log(
        `  탈락 심사의 조건별 평균 점수(10점 만점): ` +
          [...agg]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([k, [s, n]]) => `${k} ${(s / n).toFixed(1)}(${n}회)`)
            .join(' · '),
      );
  }
  {
    /*
     * 특화 (P2-B) — **셋 중 하나라도 0 이면 그 갈래가 밸런싱에 안 실려 있다.**
     * 합계가 0 이면 P1.5 축 자체가 안 재진 것이라 산 위 시설과 같은 문구로 경고한다.
     */
    const tot = stats(runs.map((r) => r.specialtyTotal));
    /*
     * ⚠ 중앙값이 아니라 **몇 판에서 골랐나**로 센다. 3단계에 닿는 판이 소수라
     * 중앙값은 0 에 붙어 있는데, 그 0 은 "축이 죽었다"가 아니라 "판이 갈렸다"다 —
     * 갈래별 합계도 마찬가지 이유로 판 전체를 더한다 (중앙값이면 전부 0 으로 읽힌다).
     */
    const ran = runs.filter((r) => r.specialtyTotal > 0).length;
    const sum = (k: FacilitySpecialty): number =>
      runs.reduce((a, r) => a + r.specialties[k], 0);
    console.log(
      `특화 선택: ${ran}/${SEEDS}판에서 골랐다 · 합계 회전 ${sum('capacity')} · ` +
        `수익 ${sum('revenue')} · 평판 ${sum('reputation')} (판당 최대 ${tot.max}개)` +
        (tot.max === 0 ? '  ⚠ 특화가 헤드리스에서 안 쓰인다 — 실제 판과 갈라진다' : ''),
    );
  }
  {
    const slope = stats(runs.map((r) => r.onSlope));
    const total = stats(runs.map((r) => r.builtTotal));
    console.log(
      `산 위 시설: 중앙 ${slope.med}개 / 전체 ${total.med}개 · 최대 ${slope.max}개` +
        (slope.max === 0 ? '  ⚠ 높이가 헤드리스에서 안 쓰인다 — 실제 판과 갈라진다' : ''),
    );
  }
  /*
   * 코스는 **잔교와 함께** 찍는다 (K49). 코스 수만 보면 "봇이 천장을 갖고 있다"와
   * "게임이 안 열어 준다"가 같은 숫자로 보인다 — 옛 러너가 `courses.count < 4` 로
   * 4를 찍는 동안 이 표는 그것을 게임의 값으로 보이게 했다.
   */
  console.log(
    `코스 수 중앙값: ${stats(runs.map((r) => r.courseCount)).med}개 / 잔교 ` +
      `${stats(runs.map((r) => r.dockCount)).med}개 (최대 ${stats(runs.map((r) => r.courseCount)).max}/` +
      `${stats(runs.map((r) => r.dockCount)).max})` +
      (runs[0]?.courseFail ? ` (막힌 사유: ${runs[0].courseFail})` : ''),
  );
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
