import type { KairoHandle } from '../render/kairo/boot.js';
import {
  facingsOf,
  type FacilityFacing,
  type KairoFacilityDef,
  type PlacedFacility,
} from '../sim/kairo/placement.js';

export const ASSET_REVIEW_QUERY = 'assetReview';
export const EXPECTED_REVIEW_FACILITIES = 20;

export interface AssetReviewPlacement {
  defId: string;
  name: string;
  size: readonly [number, number];
  facing: FacilityFacing;
  i: number;
  j: number;
}

export interface AssetReviewGroup {
  defId: string;
  name: string;
  size: readonly [number, number];
  center: { i: number; j: number };
  placements: readonly AssetReviewPlacement[];
}

/**
 * 네 방향이 화면에서 시계 방향으로 읽히는 다이아몬드 배치.
 *
 * 아이소 화면은 `x=16(i-j)`, `y=8(i+j)` 이므로 아래 오프셋은
 * d0=위, d1=오른쪽, d2=아래, d3=왼쪽이 된다. 방향 이름을 보기 좋게
 * 다시 붙이지 않고 실제 `facing` 값을 그대로 배치한다.
 */
const DIRECTION_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-3, -3],
  [3, -3],
  [3, 3],
  [-3, 3],
];

export function fourDirectionReviewLayout(
  definitions: readonly KairoFacilityDef[],
): AssetReviewGroup[] {
  const approved = definitions.filter((def) => facingsOf(def) === 4);
  if (approved.length !== EXPECTED_REVIEW_FACILITIES) {
    throw new Error(
      `4방향 리뷰 시설 수가 ${approved.length}종입니다 ` +
        `(기대 ${EXPECTED_REVIEW_FACILITIES}종)`,
    );
  }

  return approved.map((def, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const center = { i: 12 + column * 24, j: 12 + row * 13 };
    return {
      defId: def.id,
      name: def.name,
      size: def.size,
      center,
      placements: DIRECTION_OFFSETS.map(([di, dj], facing) => ({
        defId: def.id,
        name: def.name,
        size: def.size,
        facing: facing as FacilityFacing,
        i: center.i + di,
        j: center.j + dj,
      })),
    };
  });
}

export interface ReviewRuntimeHandle extends KairoHandle {
  setGradeForTest(grade: number): void;
  land(): { i0: number; j0: number; w: number; h: number };
}

export interface AssetReviewController {
  readonly groups: readonly AssetReviewGroup[];
  ready: boolean;
  error: string | null;
  selectedIndex: number;
  placed: readonly PlacedFacility[];
  select(indexOrId: number | string): boolean;
  overview(): void;
  toggleZoom(): 1 | 2;
}

function makeButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

/** 실제 Phaser 맵 위에 20종×4방향을 놓는 리뷰 전용 모드. */
export function installFourDirectionAssetReview(
  h: ReviewRuntimeHandle,
  definitions: readonly KairoFacilityDef[],
): AssetReviewController {
  const groups = fourDirectionReviewLayout(definitions);
  const panel = document.createElement('section');
  panel.id = 'kairo-asset-review';
  panel.setAttribute('aria-label', '4방향 시설 검토');

  const heading = document.createElement('strong');
  heading.className = 'kasset-review-heading';
  const detail = document.createElement('span');
  detail.className = 'kasset-review-detail';
  const directions = document.createElement('span');
  directions.className = 'kasset-review-directions';
  directions.textContent = '위 d0  ·  오른쪽 d1  ·  아래 d2  ·  왼쪽 d3';

  const select = document.createElement('select');
  select.className = 'kasset-review-select';
  select.setAttribute('aria-label', '검토할 시설');
  groups.forEach((group, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${String(index + 1).padStart(2, '0')}  ${group.name}`;
    select.append(option);
  });

  const controls = document.createElement('div');
  controls.className = 'kasset-review-controls';
  // 개별 검토는 픽셀과 입구면을 보는 일이므로 2×로 시작한다.
  let zoom: 1 | 2 = 2;
  let placed: PlacedFacility[] = [];

  const controller: AssetReviewController = {
    groups,
    ready: false,
    error: null,
    selectedIndex: 0,
    get placed() {
      return placed;
    },
    select(indexOrId) {
      const index =
        typeof indexOrId === 'number'
          ? indexOrId
          : groups.findIndex((group) => group.defId === indexOrId);
      if (!controller.ready || index < 0 || index >= groups.length) return false;
      controller.selectedIndex = index;
      select.value = String(index);
      const group = groups[index]!;
      heading.textContent = `4방향 실제 맵 검토  ${index + 1}/${groups.length}`;
      detail.textContent = `${group.name}  ·  ${group.size[0]}×${group.size[1]} 타일`;
      h.scene.setUpscale(zoom);
      h.scene.focusTile(group.center.i, group.center.j);
      return true;
    },
    overview() {
      if (!controller.ready) return;
      zoom = 1;
      zoomButton.textContent = '2× 확대';
      h.scene.setUpscale(1);
      h.scene.focusTile(48, 39);
    },
    toggleZoom() {
      zoom = zoom === 1 ? 2 : 1;
      zoomButton.textContent = zoom === 1 ? '2× 확대' : '1× 전체';
      controller.select(controller.selectedIndex);
      return zoom;
    },
  };

  const previous = makeButton('‹ 이전', () => {
    controller.select((controller.selectedIndex - 1 + groups.length) % groups.length);
  });
  const zoomButton = makeButton('1× 전체', () => {
    controller.toggleZoom();
  });
  const overview = makeButton('전체 맵', () => {
    controller.overview();
  });
  const next = makeButton('다음 ›', () => {
    controller.select((controller.selectedIndex + 1) % groups.length);
  });
  controls.append(previous, zoomButton, overview, next);
  select.addEventListener('change', () => controller.select(Number(select.value)));
  panel.append(heading, detail, directions, select, controls);
  document.body.classList.add('kairo-asset-review-mode');
  document.body.append(panel);

  const prepare = (): void => {
    // Phaser create 전에 refresh를 부르면 `this.add`가 없다. 신호가 올 때까지 짧게 대기한다.
    if (!h.scene.sys.isActive()) {
      window.setTimeout(prepare, 32);
      return;
    }

    try {
      h.scene.setAutoTick(false);
      h.setGradeForTest(5);

      for (const old of h.placement.all()) h.placement.remove(old.handle);
      h.walls.clear();

      const land = h.land();
      for (let j = land.j0; j < land.j0 + land.h; j++) {
        for (let i = land.i0; i < land.i0 + land.w; i++) {
          h.terrain.paint(i, j, 'floor_indoor');
          h.terrain.setLevel(i, j, 0);
          h.scene.refreshTile(i, j);
        }
      }
      h.scene.refreshAllWalls();

      const results: PlacedFacility[] = [];
      for (const request of groups.flatMap((group) => group.placements)) {
        const result = h.placement.place(
          h.terrain,
          h.walls,
          h.gate,
          request.defId,
          request.i,
          request.j,
          { land, facing: request.facing },
        );
        if (!result.ok || !result.placed) {
          throw new Error(
            `${request.defId} d${request.facing} 배치 실패: ${String(result.fail)}`,
          );
        }
        results.push(result.placed);
      }
      placed = results;
      h.scene.rebuildFacilities();
      h.guests.invalidate();
      controller.ready = true;
      panel.dataset['ready'] = 'true';
      controller.select(0);
    } catch (error) {
      controller.error = error instanceof Error ? error.message : String(error);
      panel.dataset['ready'] = 'false';
      heading.textContent = '4방향 전시 맵 구성 실패';
      detail.textContent = controller.error;
      console.error('[카이로] 4방향 에셋 리뷰 실패', error);
    }
  };
  prepare();
  return controller;
}
