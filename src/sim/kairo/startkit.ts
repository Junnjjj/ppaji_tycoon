import { KairoTerrain } from './terrain.js';
import type { WallGrid } from './walls.js';
import { bakeIndoorWalls } from './indoor.js';
import { PlacementGrid, guestWalkable } from './placement.js';
import {
  CourseStore,
  PRESETS,
  COURSE_EQUIPMENT,
  defaultHandles,
  validateCourse,
  fitBlocked,
} from './course.js';
import type { MapType } from './scenario.js';

/**
 * 물려받은 빠지 — **새 판에 미리 놓이는 작은 빠지** (K30).
 *
 * ## 왜 필요했나 (실측)
 *
 * 빈 땅에서 시작하면 1등급에 놓을 수 있는 시설이 24종인데, **위생 시설 9종이 전부
 * `needs-indoor` 로 막힌다.** 그런데 첫 의뢰가 "기본 위생 3개"다. 뚫으려면 건설 시트의
 * 바닥 탭에서 `실내 바닥` 을 여러 칸 칠해야 하는데 **그걸 알려주는 것이 화면 어디에도
 * 없다.** K27 에서 "바닥을 깔면 그게 방"으로 모델을 바꾸면서 생긴 구멍이다.
 *
 * 설계 문서(`docs/design.md` §4.4)는 처음부터 답을 갖고 있었다:
 *
 * > 플레이어는 완전히 빈 땅에서 시작하지 않는다. 손님이 어디서 오는지 모르면 동선
 * > 판단이 안 된다. **설정: 아버지가 하던 작은 빠지를 물려받았다.**
 * > v3 초안은 코스를 25분에 만나게 했다 — 10분 하고 끄는 사람은 시그니처를 아예 못 본다.
 *
 * ## 실내동은 **비워서** 준다
 *
 * 화장실을 같이 넣지 않는다. 설계가 "화장실이 없다 — 어디에 둘 것인가"를 첫 결정으로
 * 두기 때문이다. 없앨 것은 *결정*이 아니라 **보이지 않는 전제조건**이다.
 *
 * ## 결정론
 *
 * RNG 을 쓰지 않는다. 게이트 모서리와 **찾아낸 물가**를 기준으로 고정 오프셋만 쓴다 —
 * 지형은 시드마다 다르지만 물가는 언제나 찾을 수 있다. 같은 맵·같은 지형이면 언제나
 * 같은 배치가 나온다.
 *
 * ## 실패해도 부팅을 막지 않는다
 *
 * 어느 단계든 안 되면 건너뛰고 `skipped` 에 남긴 뒤 계속한다. 시작 배치가 판을 못 뜨게
 * 하는 것이 최악이다. 대신 조용히 빠지지는 않는다 — 뭐가 빠졌는지 남는다.
 */

export interface StartKitResult {
  indoorTiles: number;
  facilities: number;
  course: boolean;
  /** 못 놓은 것. 비어 있어야 정상이다 (테스트가 이걸 본다) */
  skipped: string[];
}

/** 물려받은 것은 공짜다 — 이 값들은 현금에서 안 깎는다 */
export interface StartKitInput {
  terrain: KairoTerrain;
  walls: WallGrid;
  placement: PlacementGrid;
  gate: { i: number; j: number };
  map: MapType;
  /** 코스를 물려줄 때만 필요하다 */
  courses?: CourseStore;
}

/** 마당의 왼쪽 위 모서리 — 게이트 바로 안쪽 */
/**
 * 마당의 왼쪽 위 모서리 — **입구를 중심으로** 잡는다 (K36).
 *
 * ⚠ 예전엔 `(2,2)` 고정이었다. 거긴 이제 차도이고, 입구도 맵 가운데로 옮겨 갔다.
 * 마당이 입구 아래에 오지 않으면 손님이 들어오자마자 옆으로 한참 걸어야 한다.
 */
function yardOrigin(yardW: number): { i: number; j: number } {
  const gate = KairoTerrain.parkGate();
  return {
    i: Math.max(0, gate.i - Math.floor(yardW / 2)),
    j: KairoTerrain.CITY_BAND,
  };
}

export function applyStartKit(input: StartKitInput): StartKitResult {
  const { terrain, walls, placement, gate, map, courses } = input;
  const st = map.start;
  const skipped: string[] = [];

  // ── 1. 마당 — 입구 바로 아래. 포장. 잔디 위에 시설이 덩그러니 뜨지 않게 ──
  const origin = yardOrigin(st.yard[0]);
  const yard = { i: origin.i, j: origin.j, w: st.yard[0], h: st.yard[1] };
  for (let j = yard.j; j < yard.j + yard.h; j++) {
    for (let i = yard.i; i < yard.i + yard.w; i++) paintIfLand(terrain, i, j, 'path_stone');
  }

  // ── 2. 실내동 — ★ 이 킷의 핵심. 빈 방을 준다 ──
  const room = { i: yard.i + 1, j: yard.j + 1, w: st.indoor[0], h: st.indoor[1] };
  let indoorTiles = 0;
  for (let j = room.j; j < room.j + room.h; j++) {
    for (let i = room.i; i < room.i + room.w; i++) {
      if (paintIfLand(terrain, i, j, 'floor_indoor')) indoorTiles++;
    }
  }
  const baked = bakeIndoorWalls(terrain, walls, gate, guestWalkable(terrain, placement));
  if (!baked.ok) {
    // 방을 못 만들면 위생 시설이 다시 막힌다 — 되돌리고 기록한다
    for (let j = room.j; j < room.j + room.h; j++) {
      for (let i = room.i; i < room.i + room.w; i++) paintIfLand(terrain, i, j, 'path_stone');
    }
    bakeIndoorWalls(terrain, walls, gate, guestWalkable(terrain, placement));
    indoorTiles = 0;
    skipped.push(`실내동(${baked.fail ?? '?'})`);
  }

  /*
   * ── 4. 매표소 — 최소한의 영업이 이미 돌아간다 ──
   *
   * ⚠ 매표소는 마당 **밖**에 있다. K32-B 부터 잔디는 손님이 못 지나가므로 마당에서
   * 내려가는 길을 먼저 깐다. 안 깔면 `unreachable` 로 조용히 빠진다 — 물려받은 빠지에
   * 매표소가 없는 판이 나온다.
   */
  let facilities = 0;
  const ticketAt = { i: yard.i + 1, j: yard.j + room.h + 2 };
  for (let j = yard.j + yard.h; j < ticketAt.j; j++) paintIfLand(terrain, ticketAt.i, j, 'path_stone');
  if (place(placement, terrain, walls, gate, 'ticket', ticketAt.i, ticketAt.j)) facilities++;
  else skipped.push('매표소');

  // ── 4. 데크 + 선착장 — 시그니처(코스)를 5분 안에 만나게 하려고 ──
  const shore = findShore(terrain, yard.i, yard.i + yard.w);
  let dockAt: { x: number; y: number } | null = null;
  if (!shore) {
    skipped.push('물가를 못 찾음');
  } else {
    /*
     * 마당에서 물가까지 길을 깐다 — 데크를 밟으려면 물가 칸에 **걸어서** 닿아야 한다.
     * `findShore` 가 마당 가로 범위 안에서만 찾으므로 세로 한 줄이면 이어진다.
     */
    for (let j = yard.j; j < shore.j; j++) paintIfLand(terrain, shore.i, j, 'path_stone');
    let laid = 0;
    for (let k = 0; k < st.deck; k++) {
      if (place(placement, terrain, walls, gate, 'float_deck', shore.i, shore.j + k)) laid++;
      else break;
    }
    facilities += laid;
    if (laid < st.deck) skipped.push(`데크 ${laid}/${st.deck}`);
    if (laid > 0) dockAt = { x: shore.i, y: shore.j + laid - 1 };
    /*
     * ── 4¾. 선착장 시설 (K45) — 코스의 관문 ──
     *
     * 코스는 선착장이 붙은 잔교에서만 시작한다 (dock 시설 note 의 원래 의도).
     * 물려받은 빠지에 선착장이 없으면 새 판에서 코스 편집이 후보 0 으로 시작한다 —
     * 매표소를 1등급으로 내린 것과 같은 관문 문제라, 킷이 하나 물려준다.
     */
    if (laid > 0) {
      let dockPlaced = false;
      // 2×4 발자국이라 물이 좁은 시드가 있다 (lake/42 실측) — 좌우·상하로 넓게 훑는다
      outer: for (const di of [1, -2, 2, -3, 3, -4, 4, -5]) {
        for (let dj = -3; dj <= laid + 2; dj++) {
          if (place(placement, terrain, walls, gate, 'dock', shore.i + di, shore.j + dj)) {
            facilities++;
            dockPlaced = true;
            break outer;
          }
        }
      }
      if (!dockPlaced) skipped.push('선착장');
    }
  }

  /*
   * ── 4½. 놀 것 하나 · 쉴 것 하나 (K40) ──
   *
   * 매표소+데크뿐이면 **이용할 시설이 0** 이라 첫 주 퇴장 만족도가 0 이다 — UX 검수
   * 실측으로 8주를 그냥 둬도 0 이었다 (docs/design-ux-audit.md §2·3). 첫 화면이 실패로
   * 읽히면 온보딩이 끝난다. 탁구대와 평상을 물려준다 — 아버지의 빠지에 있었을 법한
   * 것들이고, **먹거리·위생은 일부러 비워 둔다**: 그게 첫 의뢰(다음 목표)다.
   *
   * 길(포장) 옆이어야 놓인다 (K32-B — 잔디는 unreachable). 마당~물가 길 주변을 훑는다.
   */
  /*
   * **마당→물가 길의 바로 옆, 동선 위**에 놓는다 (K40).
   *
   * 자리 선정을 세 번 실측했다:
   * · 길에서 2~4칸 떨어진 곳 — 도달 검사(앵커 칸의 이웃이 걷기 가능해야)에 24건 걸림
   * · 마당 옆 포장 앞마당(막다른 곁길) — 놓이긴 하는데 **가는 길이 왕복 우회**라
   *   걷기 감점이 만족을 무너뜨렸다 (1주 41 → 5. 하향 압력은 설계 불변식이다)
   * · 물가 길 **옆 열**(shore.i+1) — 앵커의 서쪽 이웃이 곧 길이라 도달이 구조적으로
   *   보장되고, 매표소→데크 동선 위라 걷기 낭비가 없다. 이것이 답이었다
   * 배치가 결과를 바꾼다는 이 게임의 명제가 시작 킷에서도 그대로 성립한 셈이다.
   */
  const tryBesidePath = (defId: string): boolean => {
    if (!shore) return false;
    for (let j = yard.j + yard.h + 1; j < shore.j - 1; j++) {
      if (place(placement, terrain, walls, gate, defId, shore.i + 1, j)) return true;
    }
    return false;
  };
  if (tryBesidePath('pingpong')) facilities++;
  else skipped.push('탁구대');
  if (tryBesidePath('pyeongsang_row')) facilities++;
  else skipped.push('평상');

  // ── 5. 코스 — 물려받은 왕복(shuttle) 코스 하나 ──
  let course = false;
  if (st.course && courses && dockAt) {
    const preset = PRESETS.find((x) => x.id === 'shuttle') ?? PRESETS[0];
    // 가장 싼 견인 장비 — 물려받은 낡은 것이라는 설정과 맞다
    const equip = [...COURSE_EQUIPMENT]
      .filter((e) => preset !== undefined && !fitBlocked(e.id, preset.id))
      .sort((a, b) => a.vehicleCost - b.vehicleCost)[0];
    if (preset && equip) {
      const handles = defaultHandles(preset, dockAt, { x: 0, y: 1 });
      // 물려받은 코스는 첫 코스지만, 겹침 판정에 같은 목록을 넘긴다 (K37 — 규칙이 하나다)
      const v = validateCourse(terrain, handles, dockAt, preset, equip.id, 1, courses.all);
      if (v.ok) {
        courses.add({ presetId: preset.id, equipId: equip.id, vehicles: 1, dock: dockAt, handles });
        course = true;
      } else {
        skipped.push(`코스(${v.issues.join(',')})`);
      }
    } else {
      skipped.push('코스 장비 없음');
    }
  }

  return { indoorTiles, facilities, course, skipped };
}

/** 육지일 때만 칠한다 — 물을 덮으면 지형이 통째로 달라진다 */
function paintIfLand(t: KairoTerrain, i: number, j: number, kind: string): boolean {
  // ⚠ 도시 띠(도로·보도·가로수)는 덮지 않는다 — 플레이어가 못 짓는 곳을 킷도 못 짓는다
  if (!t.inside(i, j) || t.isWater(i, j) || !t.isBuildable(i, j)) return false;
  return t.paint(i, j, kind);
}

function place(
  p: PlacementGrid,
  t: KairoTerrain,
  w: WallGrid,
  gate: { i: number; j: number },
  defId: string,
  i: number,
  j: number,
): boolean {
  return p.place(t, w, gate, defId, i, j).ok;
}

/** 마당 앞쪽에서 육지가 끝나는 첫 칸 (물의 첫 줄) */
function findShore(
  t: KairoTerrain,
  i0: number,
  i1: number,
): { i: number; j: number } | null {
  for (let i = i0; i < Math.min(i1, t.width); i++) {
    for (let j = 1; j < t.height - 1; j++) {
      if (t.isWalkable(i, j) && !t.isWalkable(i, j + 1)) return { i, j: j + 1 };
    }
  }
  return null;
}
