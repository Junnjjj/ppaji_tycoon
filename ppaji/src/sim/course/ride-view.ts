/**
 * 운항의 **표시 전용** 상태 (P61-a). 렌더러는 이것만 읽는다 — 요금·뽑기·손님 생성은 전부 sim 이 소유한다.
 *
 * ⚠ 좌표는 게임 타일 공간의 **실수**다 (i = +I, j = +J). 렌더러가 보간하지 않아도 되도록
 *   sim 이 매 tick 실제 위치를 낸다. `height` 는 수면 위 타일 단위 높이(0 = 수면).
 * ⚠ `heading` 은 게임 공간 라디안이고 `atan2(dj, di)` 다. 에셋의 16방향 색인(h0 = +J · h4 = +I)으로는
 *   **`h = round((π/2 − heading) / (π/8)) mod 16`** — `round(heading × 16 / 2π)` 가 아니다 (축이 다르다).
 *   좌석 접점도 같은 양자화 `a = h × π/8` 로 회전한다: `di = x·cos a − y·sin a` · `dj = −(x·sin a + y·cos a)`.
 * ⚠ `height`·`bounce` 는 **타일 단위**다 (정규화 진폭이 아니다).
 * ⚠ 매 호출마다 새로 만든다. 한 프레임만 들고 있을 것 (보관·수정 금지).
 */

export interface Vec2f {
  i: number;
  j: number;
}

export type RidePassengerPose = 'board' | 'ride' | 'fall' | 'swim' | 'climb' | 'stand';

export interface RidePassengerView {
  /** `GuestStore` 의 손님 uid 와 **같은 값** */
  guestUid: number;
  /** 기구 좌석 번호 (0-based) — 에셋 spec 의 접점 순서 */
  seat: number;
  pose: RidePassengerPose;
  /** 지금 자세 — 탑승 중이면 **좌석 접점**(기구 중심이 아니다), 낙수면 물 위 */
  pos: Vec2f;
  /** 승선을 시작한 칸 (선착장 뭍). 렌더러가 `origin → pos` 를 `boardProgress` 로 보간한다 */
  origin: Vec2f;
  height: number;
  heading: number;
  fallen: boolean;
  injured: boolean;
}

export interface RideVehicleView {
  vehicle: number;
  /** 견인 기구(타는 것)의 자세 */
  pos: Vec2f;
  heading: number;
  /** 반동 6종의 수직 반동량 (타일). 프로파일이 없는 기구는 0 */
  bounce: number;
  /** 견인선. 자체동력 기구는 null */
  boat: { pos: Vec2f; heading: number } | null;
  /** 보트 → 기구 줄 길이 (타일). 보트가 없으면 0 */
  ropeLength: number;
  /** 타일/tick */
  speed: number;
  passengers: readonly RidePassengerView[];
}

export type RidePhase = 'boarding' | 'towing' | 'unboarding' | 'done';

export interface RideView {
  /** 저장·복원에도 살아남는 운항 id — `IncidentLedger` 의 열쇠와 같다 */
  rideId: string;
  courseHandle: number;
  equipId: string;
  towBoatId: string | null;
  dockUid: number;
  phase: RidePhase;
  /** 0..1 — 코스 루프의 호 길이 진행률 */
  progress: number;
  /** 0..1 — 승선 진행 (주행이 시작되면 1) */
  boardProgress: number;
  /** 0..1 — 하선 진행 (주행 중이면 0) */
  unboardProgress: number;
  speed: number;
  peakSpeed: number;
  /** 0..100 — 출항 시점에 고정된 값 */
  thrill: number;
  safety: number;
  riskLevel: 0 | 1 | 2 | 3;
  /** 실제로 낙수가 일어난 뒤에만 채워진다 */
  fallEventId: string | null;
  vehicles: readonly RideVehicleView[];
}

export interface RideSwimmerView {
  guestUid: number;
  pos: Vec2f;
  height: number;
  heading: number;
  status: 'air' | 'splash' | 'swim' | 'traffic-wait' | 'rescue-wait' | 'climb' | 'done';
  /** core 의 포즈 낱말 — 'jump' | 'swim' | 'walk' | 'idle' */
  pose: string;
  injured: boolean;
  targetDockUid: number | null;
  /** 남은 물길 (타일). 없으면 빈 배열 */
  path: readonly Vec2f[];
}

export interface RideScene {
  /** 세계·코스·선착장이 바뀌면 오른다 — 렌더러는 이 값이 바뀌면 경로 캐시를 버린다 */
  revision: number;
  /** sim 시간(초). 물보라·반동은 벽시계가 아니라 이 값으로 — 일시정지·배속이 그대로 따라간다 */
  timeSec: number;
  rides: readonly RideView[];
  swimmers: readonly RideSwimmerView[];
  /** 살아 있는 코스의 실제 스플라인 표본 (handle → 타일 좌표, 루프) */
  paths: ReadonlyMap<number, readonly Vec2f[]>;
}
