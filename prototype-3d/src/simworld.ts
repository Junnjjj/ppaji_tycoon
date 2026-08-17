import { Game, Terrain, type World } from '../../src/sim/index.js';

/**
 * sim ↔ 디오라마 좌표 다리.
 *
 * 게임 로직은 2D 프로토와 **같은 sim** 이다 (`../../src/sim`) — 불변식 1(“sim 은 렌더러를
 * 모른다”)의 배당금. 여기서 하는 일은 두 가지뿐:
 *   1. 디오라마 지오메트리(해안선 함수·잔디 띠·수심)를 그대로 sim 타일맵으로 옮겨 칠하고
 *   2. 타일 좌표 ↔ 월드 좌표를 변환한다.
 */

/** 타일 한 변의 월드 크기. 2×2 시설 = 12×12 월드 — 기존 장식 오두막(14) 과 같은 급 */
export const TILE = 6;
/**
 * 무대(stage) 격자 — **맵 전체가 곧 플레이 영역**이다.
 *
 * 기울어진 해안 실험은 폐기했다. 레퍼런스의 구조는:
 *   위 = 그림 배경(산·숲·본관·모래) · 가운데 = 물 위 잔교(육상 시설 줄) ·
 *   아래 = 폰툰 링으로 두른 수면(수상 시설). 전부 **화면과 나란한 수평 밴드**다.
 * 그래서 지형 판정도 해안 함수가 아니라 **행 번호**로 끝난다.
 */
export const GRID_W = 32;
export const GRID_H = 27;
export const X0 = -96;
/** ⚠ 육상을 넓힐 땐 **뒤(강변 쪽)로** 늘린다. 앞(물 쪽)으로 늘리면 흙바닥이
 *  물 위에 뜬 이상한 그림이 된다. Z0 을 뒤로 밀고 행 수를 더한다. */
export const Z0 = -90;
/** 육상(흙마당) 행 수 — gy 0..6. 그 아래는 전부 물이다 */
export const LAND_ROWS = 7;
/** 흙마당 상판 높이 — 낮은 단. 위에 서는 손님·시설은 이만큼 올라간다 */
export const PIER_TOP = 0.6;

export function tileCenterX(gx: number): number {
  return X0 + (gx + 0.5) * TILE;
}
export function tileCenterZ(gy: number): number {
  return Z0 + (gy + 0.5) * TILE;
}
/** 타일 좌표(실수 허용)를 월드 중심으로 */
export function tileToWorld(tx: number, ty: number): { x: number; z: number } {
  return { x: X0 + (tx + 0.5) * TILE, z: Z0 + (ty + 0.5) * TILE };
}
/** 발자국 w×h 를 (x,y) 에 놓았을 때의 월드 중심 */
export function footprintCenter(x: number, y: number, w: number, h: number): { x: number; z: number } {
  return { x: X0 + (x + w / 2) * TILE, z: Z0 + (y + h / 2) * TILE };
}
export function worldToTile(wx: number, wz: number): { x: number; y: number } {
  return { x: Math.floor((wx - X0) / TILE), y: Math.floor((wz - Z0) / TILE) };
}

/**
 * 디오라마 지형을 타일맵에 칠한다.
 * 밴드 경계는 terrain.ts·water.ts 의 실제 지오메트리와 같은 z 값을 쓴다 —
 * 눈에 보이는 잔디에서만 건물이 놓이고, 보이는 물에서만 수상시설이 놓이게.
 */
function paint(world: World): void {
  for (let gy = 0; gy < world.height; gy++) {
    // 행 밴드 — 잔교 4줄(육상), 그 아래 얕은 물 → 깊은 물.
    // 수심 밴드는 장비 요구치(minDepth)에서 역산: shallow 5줄이면 minDepth 3 장비가
    // deep 밴드(10행~)에 넉넉히 들어간다.
    let t: Terrain;
    if (gy < LAND_ROWS) t = Terrain.Plain;
    else if (gy === LAND_ROWS) t = Terrain.Shore;
    else if (gy < LAND_ROWS + 6) t = Terrain.Shallow;
    else t = Terrain.Deep;
    for (let gx = 0; gx < world.width; gx++) world.set(gx, gy, t);
  }
}

export function createSim(seed = 7, onSpend?: (amount: number) => void): Game {
  const game = new Game({
    seed, width: GRID_W, height: GRID_H,
    ...(onSpend
      ? {
          onSpend: (_g, _f, amount) => onSpend(amount),
          // 코스 탑승료도 같은 지갑으로 — 시설만 연결하면 견인 매출이 샌다 (실측으로 걸림)
          onRideSpend: (_g, _c, amount) => onSpend(amount),
        }
      : {}),
  });
  paint(game.world);
  game.nav.markDirty();
  return game;
}
