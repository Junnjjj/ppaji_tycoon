/**
 * 승인된 정적 조합 시설 (ppaji-buildable-pair-v2, 2026-09-19 인계) — 빠지 슬라이드 8×6 · 빠지 놀이터 20×12.
 *
 * 저자가 만든 **네 방향 네이티브 렌더 한 장씩**을 `fac/<id>/<facing>` 논리 ID 로 낸다.
 * 다른 공급자(`kairo-atlas` 의 `facility/<id>` 규칙·절차 도형)가 같은 ID 를 들고 있으면
 * **이쪽이 이긴다** — `HybridProvider` 사슬에서 앞에 놓으면 된다 (사용자 결정: 저자 에셋이
 * 시스템 정의를 덮는다). 공급자가 로딩에 실패하면 null 을 내므로 게임은 폴백으로 뜬다.
 *
 * ⚠ 이 모듈은 **씬을 모른다.** 씬이 필요로 하는 것은 셋뿐이고 전부 순수 함수로 내보낸다:
 *   1) `approvedAnchor(id)`      — 캔버스 안 앵커 (ax, ay). 앵커는 **에셋 피벗**이지 발자국 중심이 아니다
 *   2) `approvedPivot(id,facing)`— 놓인 발자국의 (i0, j0) 모서리에서 피벗까지의 **소수 칸** 오프셋
 *   3) `approvedFootprint(id,f)` — 회전한 발자국 (w, d)
 * 그리기: `s = gridToScreen(i0 + di, j0 + dj)` → `drawImage(canvas, s.x - ax, s.y - ay)`.
 *
 * 투영 근거 (원본 `playground/runtime/projection.mjs` 와 바이트 단위로 같은 식):
 *   screenX = n/2 + 16*(X+Y),  screenY = n/2 + 8*(X-Y) − (Z−0.65)*√512*cos30°
 *   게임 좌표는 I = X, J = −Y 이므로 16*(X+Y) = 16*(I−J), 8*(X−Y) = 8*(I+J) — `iso.ts` 와 같다.
 *   그래서 피벗(0,0,0)의 캔버스 자리는 (n/2, n/2 + 0.65*√512*cos30°) 다.
 */
import modules from '../data/ppaji-modules.json';
import type { AssetProvider, SpriteSpec } from './types.js';

export const SELECTED_BUILDING_IDS = ['shop', 'infirmary', 'storage', 'toilet', 'nursing', 'snackbar', 'cafe', 'karaoke', 'info', 'office', 'sauna', 'jjimjilbang', 'bungalow', 'shade_net', 'mongol_tent', 'pavilion', 'glamping', 'caravan', 'authored_parasol', 'authored_bbq_zone', 'authored_sunbed_row', 'authored_pyeongsang_row', 'authored_massage_row', 'authored_footbath', 'authored_locker_row', 'authored_infirmary', 'authored_shower_row', 'authored_changing_row', 'authored_karaoke', 'vending_in', 'arcade', 'rental_tube', 'dry_room', 'watchtower', 'pension_1f', 'pension_2f', 'pension', 'cafe_lv2', 'cafe_lv3', 'icecream', 'sikhye', 'bungeoppang', 'firepit_row', 'chicken', 'playground', 'stage_river_lv1', 'bungee_jump', 'photozone', 'stage_river_lv2', 'stage_river_lv3'] as const;

export const APPROVED_FACILITY_IDS = ['ppaji_slide', 'ppaji_playground', 'boarding_dock', 'float_deck', 'diving', 'rig_bridge', 'rig_stepstone', 'rig_blob', 'rig_iceberg', 'rig_jump_tower', 'rig_bridge_swing', 'rig_bridge_long', 'rig_iceberg_wall', 'rig_blob_big', 'diving_tower', ...modules.map(m => m.id), ...SELECTED_BUILDING_IDS, 'indoor_shop', 'foodcourt_seat', 'compact_ticket', 'compact_locker', 'compact_changing', 'compact_shower'] as const;
export type ApprovedFacilityId = (typeof APPROVED_FACILITY_IDS)[number];

export interface ApprovedFacilitySpec {
  name: string;
  /** Buildings retain simulation use behavior and have no watercraft depth/ride route. */
  renderOnly?: boolean;
  cameraTargetZTiles?: number;
  /** System upgrades share an approved base until distinct art is authored. */
  visualSource?: string;
  poseMasks?: Record<string, string>;
  depthModes?: string[];
  frontOverlay?: boolean;
  emptyBase?: boolean;
  /** 예약 발자국 (칸) — 열린 수면을 포함한다 */
  size: [number, number];
  /** 실제 그림이 덮는 칸 (참고용) */
  artSize: [number, number];
  footprintOrigin: [number, number];
  footprintCenter: [number, number];
  logicalSize: number;
  anchor: { ax: number; ay: number };
  deckTopZ: number;
  humanOpaquePx: number;
  /** facing 0~3 → 발자국 모서리에서 피벗까지의 소수 칸 오프셋 */
  pivotByFacing: [number, number][];
  footprintByFacing: [number, number][];
  entry: [number, number, number];
  exit: [number, number, number];
  landmarks: Record<string, [number, number, number]> | null;
  floorMode: string;
  reservation: string;
  blueprint: string;
  /** 걸을 수 있는 칸 — 발자국 로컬 정수 칸(facing 0). sim 정본은 `src/data/composites.json` 이고 여기 사본과 검사로 묶여 있다 */
  deckTiles: [number, number][];
  frames: Record<string, { file: string; w: number; h: number; sha256: string }>;
  note?: string;
}

export interface ApprovedFacilityManifest {
  schema: string;
  source: string;
  projection: { tileScreenPx: [number, number]; tileWorld: number; cameraYawDeg: number; cameraElevationDeg: number; cameraTargetZTiles: number; anchorRule: string };
  coordinates: string;
  facilities: Record<string, ApprovedFacilitySpec>;
}

// ── 동작(NPC) 계약 ────────────────────────────────────────────────────────────
/**
 * 저자 동선을 **구간 목록**으로 구웠다 (`routes.json`, schema 2). 20fps 표본을 박아 넣는 대신
 * 원본 모듈과 **같은 보간식**을 들고 다니므로 어떤 프레임레이트로도 정확히 재현된다 —
 * 구워 낼 때 원본 `sample()` 과 0.05s 간격으로 대조했고 최대 오차 0.0005칸(반올림 몫)이다.
 * ⚠ 보간은 모듈마다 다르다 (실측): core 는 smooth + 16u²(1−u)² · traversal/leisure 는
 * smooth + 4u(1−u) · waterplay 는 **선형** + 4u(1−u). 그래서 구간마다 `ease`·`mode` 를 들고 있다.
 * 모든 경로는 청사진 `entry` 칸에서 **시작하고 끝난다** — 손님이 시설 안쪽에 순간이동하지 않는다.
 */
export interface RouteSegment {
  /** 경로 시작부터의 초 */
  t: number;
  dur: number;
  from: [number, number, number];
  to: [number, number, number];
  pose: string;
  phase: string;
  arc: number;
  mode: 'quad' | 'quartic';
  ease: 'linear' | 'smooth';
  /** 라디안, 에셋 로컬 +X 기준 (정지 구간은 직전 이동 구간에서 물려받았다) */
  h: number;
}
export interface RouteTrack { cycle: number; segments: RouteSegment[] }
export interface RouteVisit extends RouteTrack { component: string; footprint: [number, number] | null; position: [number, number, number]; facing: number }
/**
 * v1 호환 뷰 — 구간 시작점을 꿴 꺾은선. 걷기(선형 ease)는 정확하고 부드러운/호 구간은 근사다.
 * 정확한 재현은 `approvedSampleAt(track, t)` 를 쓸 것. 배우 하나 = 구성품 하나의 왕복
 * (입구 → 그 기구 → 입구) 이고, 손님마다 하나를 안정적으로 골라 태우면 된다.
 */
export interface RouteActor { key: string; cycle: number; track: RouteSample[] }
/** 한 시설의 동선 묶음 — `tour` 는 전부 도는 완주, `visits` 는 구성품 하나씩, `actors` 는 v1 호환 꺾은선 */
export interface FacilityRoutes { entry: [number, number, number]; tour: RouteTrack; visits: RouteVisit[]; actors: RouteActor[] }
export interface ApprovedRoutes {
  schema: string;
  units: string;
  sampler: string;
  note: string;
  ppaji_slide: FacilityRoutes;
  ppaji_playground: FacilityRoutes;
}

/** 에셋 로컬 표본 — 자리는 칸, `h` 는 로컬 +X 기준 라디안 */
export interface RouteSample { t: number; p: [number, number, number]; pose: string; h: number; phase: string }

/** 게임 칸 좌표 + 높이 — 씬이 바로 쓸 수 있는 형태 */
export interface RoutePoint { i: number; j: number; /** 칸 단위 높이 */ z: number; pose: string; /** 라디안, 게임 +I 기준 */ heading: number; phase: string }

/** 구간 목록을 시각 t(초)에서 표본화. 주기를 넘으면 감긴다 */
export function approvedSampleAt(track: RouteTrack, t: number): RouteSample {
  const cycle = track.cycle;
  const time = ((t % cycle) + cycle) % cycle;
  const s = track.segments.find((q) => time < q.t + q.dur) ?? track.segments[track.segments.length - 1] as RouteSegment;
  const u = Math.max(0, Math.min(1, (time - s.t) / s.dur));
  const v = s.ease === 'linear' ? u : u * u * (3 - 2 * u);
  const p: [number, number, number] = [s.from[0] + (s.to[0] - s.from[0]) * v, s.from[1] + (s.to[1] - s.from[1]) * v, s.from[2] + (s.to[2] - s.from[2]) * v];
  p[2] += s.arc * (s.mode === 'quad' ? 4 * u * (1 - u) : 16 * u * u * (1 - u) * (1 - u));
  return { t: time, p, pose: s.pose, h: s.h, phase: s.phase };
}

// ── 회전 ─────────────────────────────────────────────────────────────────────
/** 에셋 로컬 (X, Y) → 게임 (I, J). facing f 는 R:(I,J)→(J,−I) 를 f 번 적용한다 */
export function rotateTile(i: number, j: number, facing: number): [number, number] {
  let a = i, b = j;
  for (let k = 0; k < (((facing % 4) + 4) % 4); k++) { const t = a; a = b; b = -t; }
  return [a, b];
}

/**
 * 에셋 로컬 표본 → 게임 칸. `i0`·`j0` 는 놓인 발자국의 모서리 (`PlacedFacility.i/j`).
 * 방향도 같이 돌린다 — 로컬 heading 은 +X 기준이고 게임 heading 은 +I 기준이다.
 */
export function approvedSampleToTile(id: string, facing: number, s: RouteSample, i0: number, j0: number, manifest: ApprovedFacilityManifest): RoutePoint | null {
  const pivot = approvedPivot(id, facing, manifest);
  if (!pivot) return null;
  const [ri, rj] = rotateTile(s.p[0], -s.p[1], facing);          // 로컬 (X, Y) → 게임 (I, J), 그다음 facing 회전
  const [di, dj] = rotateTile(Math.cos(s.h), -Math.sin(s.h), facing);
  return { i: i0 + pivot[0] + ri, j: j0 + pivot[1] + rj, z: s.p[2], pose: s.pose, heading: Math.atan2(dj, di), phase: s.phase };
}

// ── 조회 헬퍼 (씬 위치 어댑터 계약) ───────────────────────────────────────────
export function approvedAnchor(id: string, manifest: ApprovedFacilityManifest): { ax: number; ay: number } | null {
  return manifest.facilities[id]?.anchor ?? null;
}
export function approvedPivot(id: string, facing: number, manifest: ApprovedFacilityManifest): [number, number] | null {
  return manifest.facilities[id]?.pivotByFacing[(((facing % 4) + 4) % 4)] ?? null;
}
export function approvedFootprint(id: string, facing: number, manifest: ApprovedFacilityManifest): [number, number] | null {
  return manifest.facilities[id]?.footprintByFacing[(((facing % 4) + 4) % 4)] ?? null;
}

/** 스프라이트 논리 ID — `fac/<id>/<facing>`. facing 은 0~3 (시뮬은 0·1 만 쓴다) */
export function approvedFrameId(id: string, facing: number): string {
  return `fac/${id}/${(((facing % 4) + 4) % 4)}`;
}

/**
 * 손님 하나가 탈 **방문 동선** 하나를 고른다 (`visits[abs(uid) % n]` — 안정적이고 결정론적).
 * `useSeconds` 를 주면 그 손님의 이용 시간 안에 동선이 **정확히 한 번 끝나도록** 하는 시간 배율을 같이 낸다:
 *     `approvedSampleAt(visit, tSeconds * timeScale)`
 * 배율이 필요한 이유는 방문마다 길이가 다르기 때문이다 (빠지 놀이터 30.6s ~ 119.5s, 평균 61.6s = def.useTicks 211).
 * 배율을 안 쓰려면 `visit.useTicks <= def.useTicks` 인 방문만 고를 것 — 그러면 12 중 7 만 쓰인다.
 */
export function approvedVisitForGuest(routes: FacilityRoutes | null, uid: number, useSeconds?: number): { visit: RouteVisit; timeScale: number } | null {
  const list = routes?.visits ?? [];
  if (list.length === 0) return null;
  const visit = list[Math.abs(Math.trunc(uid)) % list.length] as RouteVisit;
  const timeScale = useSeconds !== undefined && useSeconds > 0 ? visit.cycle / useSeconds : 1;
  return { visit, timeScale };
}

/** `useTicks`(분 눈금 데이터) → 실제 초. `TICK_SCALE × TICK_MS` 는 `sim/clock.ts` 의 값이고 여기선 상수로 적는다 (assets 는 sim 을 import 하지 않는다) */
export const USE_TICK_SECONDS = (140 / 60) * 0.125;
export function useTicksToSeconds(useTicks: number): number { return useTicks * USE_TICK_SECONDS; }

export class ApprovedFacilityProvider implements AssetProvider {
  private readonly frames = new Map<string, HTMLCanvasElement>();
  constructor(readonly manifest: ApprovedFacilityManifest, readonly routes: ApprovedRoutes | null = null) {}

  /** 이 시설의 동선 묶음 (없으면 null) */
  routesOf(id: string): FacilityRoutes | null {
    const r = this.routes as unknown as Record<string, FacilityRoutes> | null;
    return r?.[id] ?? null;
  }

  ids(): readonly string[] { return [...this.frames.keys()]; }

  spec(id: string): SpriteSpec | null {
    if (id === 'tile/deck') {
      const s = this.spec('fac/float_deck/0');
      // Ground anchor is at the back corner, eight pixels above the tile centre.
      return s ? { ...s, id, ay: s.ay - 8 } : null;
    }
    const m = /^fac\/([a-z0-9_]+)\/([0-3])$/.exec(id);
    const f = m ? this.manifest.facilities[m[1] as string] : undefined;
    if (!f) return null;
    return { id, w: f.logicalSize, h: f.logicalSize, ax: f.anchor.ax, ay: f.anchor.ay, source: 'art' };
  }

  canvas(id: string): HTMLCanvasElement | null { return this.frames.get(id === 'tile/deck' ? 'fac/float_deck/0' : id) ?? null; }

  /** 시뮬 facing 은 0·1 뿐이라 그림 4장 중 둘만 쓰이지만 넷 다 싣는다 (씬이 장식·미리보기에 쓴다) */
  async load(base: string): Promise<void> {
    await Promise.all(Object.entries(this.manifest.facilities).map(async ([fid, spec]) =>
      Promise.all([0, 1, 2, 3].map(async (d) => {
        const frame = spec.frames[`d${d}`];
        if (!frame) throw new Error(`Approved facility frame missing: ${fid}/d${d}`);
        const image = new Image();
        image.src = `${base}/${frame.file}`;
        await image.decode();
        if (image.width !== frame.w || image.height !== frame.h) throw new Error(`Approved facility size: ${fid}/d${d} ${image.width}x${image.height}`);
        const c = document.createElement('canvas');
        c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('Approved facility canvas unavailable');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0);
        this.frames.set(approvedFrameId(fid, d), c);
      }))));
  }
}

/**
 * 공급자를 읽는다. `?approved=0` 이면 안 읽는다 (음성 대조군 — 절차 도형으로 뜬다).
 * 실패하면 **null** 이지 예외가 아니다 — 에셋 하나 때문에 부팅이 죽으면 안 된다.
 */
export async function loadApprovedFacilities(base = './assets/approved-facilities'): Promise<ApprovedFacilityProvider | null> {
  if (new URLSearchParams(location.search).get('approved') === '0') return null;
  try {
    const mres = await fetch(`${base}/manifest.json`, { cache: 'no-store' });
    if (!mres.ok) return null;
    const manifest = await mres.json() as ApprovedFacilityManifest;
    let routes: ApprovedRoutes | null = null;
    try { const r = await fetch(`${base}/routes.json`, { cache: 'no-store' }); if (r.ok) routes = await r.json() as ApprovedRoutes; } catch { routes = null; }
    const provider = new ApprovedFacilityProvider(manifest, routes);
    await provider.load(base);
    return provider;
  } catch { return null; }
}
