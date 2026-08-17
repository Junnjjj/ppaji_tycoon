/**
 * 카이로 계약 로더 — 스펙 §9.
 *
 * 계약은 **둘로 쪼개져 있다.** 합치지 말 것:
 *
 *   src/data/kairo-facilities.json      시뮬 — 발자국·용량·배치제약
 *   src/assets/kairo-render-contract.json  렌더 — 캔버스·앵커·슬롯·벽·배경
 *
 * `sim/` 은 `assets/` 를 import 할 수 없다 (불변식 1). 그래서 발자국·용량 같은
 * **시뮬이 알아야 하는 값**을 렌더 계약에 두면 불변식이 깨진다. 스펙 v1 이 그 실수를
 * 했고 적대적 리뷰에서 잡혔다. 두 파일은 `sprite` 문자열(`facility/shop`)로 잇는다 —
 * 기존 에셋 추상화가 원래 쓰던 다리다.
 *
 * 이 모듈은 **렌더 쪽**이므로 둘 다 읽어도 된다. 정합 검사도 여기서 한다.
 */

import contract from './kairo-render-contract.json' with { type: 'json' };
import simData from '../data/kairo-facilities.json' with { type: 'json' };
import {
  footprintCanvas,
  canvasAnchor,
  footprintAnchor,
  tileCenter,
  TILE_W,
  TILE_H,
} from '../render/kairo/iso.js';
import { GROUND_KINDS, BRIDGE_KINDS } from '../sim/kairo/terrain.js';
import type { SpriteSpec } from './types.js';

export interface KairoSlot {
  /** 발자국 **안의 타일 인덱스**. 텍셀 좌표가 아니다 — §2.5 참조 */
  tile: readonly [number, number];
  pose: string;
  facing: string;
  /** 한 타일에 둘 이상일 때만 (파라솔 1×1 에 2인) */
  offsetTexel?: readonly [number, number];
}

export interface KairoRide {
  entryTile: readonly [number, number];
  exitTile: readonly [number, number];
  ridePose: string;
}

export interface KairoFacilityRender {
  sprite: string;
  canvas: readonly [number, number];
  anchorTexel: readonly [number, number];
  bodyH: number;
  openTop: boolean;
  slots: readonly KairoSlot[];
  ride?: KairoRide;
}

export interface KairoFacilitySim {
  id: string;
  name: string;
  layer: 'indoor' | 'land' | 'water' | 'pension' | 'season';
  size: readonly [number, number];
  sprite: string;
  capacity: number;
  placement: { requiresWallAdjacent?: boolean };
}

/** 렌더 계약 — 투영·표현·손님·벽·배경 상수 */
export const KAIRO = contract as unknown as {
  version: number;
  projection: {
    yaw_deg: number;
    elev_deg: number;
    tileTexels: readonly [number, number];
    stepScreenTexels: readonly [number, number];
  };
  presentation: { upscaleSteps: readonly number[]; grid: readonly [number, number] };
  guest: {
    cellTexels: readonly [number, number];
    poses: readonly string[];
    emotes: readonly string[];
    facings: number;
    facingNames: readonly string[];
    palettes: number;
    outline: { baked: boolean; color: string; widthTexels: number };
  };
  wall: { masks: number; doors: number; heightTexels: number; canvas: readonly [number, number] };
  ground: {
    canvas: readonly [number, number];
    anchorTexel: readonly [number, number];
    types: readonly { id: string; name: string; alts: number }[];
    bridges: readonly { id: string; name: string; canvas: readonly [number, number] }[];
  };
  deco: {
    items: readonly { id: string; name: string; bodyH: number; kind: 'safety' | 'scenery' }[];
  };
  backdrop: { layers: readonly string[]; tileTexels: number };
  facilities: readonly KairoFacilityRender[];
};

export const KAIRO_SIM = (simData as unknown as { facilities: Record<string, KairoFacilitySim> })
  .facilities;

/** `facility/shop` → 렌더 항목 */
const renderBySprite = new Map(KAIRO.facilities.map((f) => [f.sprite, f]));

export function renderSpec(sprite: string): KairoFacilityRender | undefined {
  return renderBySprite.get(sprite);
}

export function simSpec(id: string): KairoFacilitySim | undefined {
  return KAIRO_SIM[id];
}

export function allSimFacilities(): KairoFacilitySim[] {
  return Object.values(KAIRO_SIM);
}

/**
 * 슬롯의 화면 텍셀 오프셋 — **앵커 기준**.
 *
 * 계약이 타일 인덱스만 갖고 있으므로 여기서 투영으로 계산한다. 계약에 텍셀 좌표를
 * 박아 두면 앵커나 투영이 바뀔 때 185개가 전부 틀어진다 (스펙 §2.5).
 */
export function slotOffset(
  slot: KairoSlot,
  footprint: readonly [number, number],
): { x: number; y: number } {
  const [w, d] = footprint;
  const [i, j] = slot.tile;
  // 타일 (i,j) 의 중심. (i+0.5, j+0.5) 를 넣으면 x 의 0.5 가 상쇄돼 16(i−j) 가 된다
  const center = tileCenter(i, j);
  const anchor = footprintAnchor(0, 0, w, d);
  const off = { x: center.x - anchor.x, y: center.y - anchor.y };
  if (slot.offsetTexel) {
    off.x += slot.offsetTexel[0];
    off.y += slot.offsetTexel[1];
  }
  return off;
}

/**
 * 렌더 계약을 기존 에셋 레이어의 `SpriteSpec[]` 로 펼친다.
 *
 * 이렇게 하면 `ProceduralProvider` / `AtlasProvider` 교체점이 그대로 쓰인다 —
 * 카이로 전용 프로바이더를 새로 만들지 않는다.
 * 카이로 스프라이트의 앵커는 **전부 `bottom-center`** 다 (§4.1 에서 확인).
 */
export function kairoSpriteSpecs(): SpriteSpec[] {
  const out: SpriteSpec[] = [];

  for (const f of KAIRO.facilities) {
    out.push({
      id: f.sprite,
      size: [f.canvas[0], f.canvas[1]] as const,
      anchor: 'bottom-center',
      category: 'facility',
      source: 'ai',
    });
  }

  // 벽 — 4방 비트마스크 16 + 문 2. 전부 스티플 유리 (§3.2)
  // 마스크는 `alt` 변형으로 표현한다 (`wall/glass:a5`). ID 에 `:` 를 직접 쓰면
  // 기존 변형 구분자와 충돌한다.
  out.push({
    id: 'wall/glass',
    size: [KAIRO.wall.canvas[0], KAIRO.wall.canvas[1]] as const,
    anchor: 'bottom-center',
    category: 'prop',
    variants: { alt: KAIRO.wall.masks },
    source: 'ai',
  });
  for (const run of ['x', 'z']) {
    out.push({
      id: `wall/door-${run}`,
      size: [KAIRO.wall.canvas[0], KAIRO.wall.canvas[1]] as const,
      anchor: 'bottom-center',
      category: 'prop',
      source: 'ai',
    });
  }

  // 지면·경로 (§5) — 캔버스가 다이아몬드 정확히 32×16
  for (const t of KAIRO.ground.types) {
    out.push({
      id: `ground/${t.id}`,
      size: [KAIRO.ground.canvas[0], KAIRO.ground.canvas[1]] as const,
      anchor: 'bottom-center',
      category: 'terrain',
      variants: { alt: t.alts },
      source: 'ai',
    });
  }
  for (const b of KAIRO.ground.bridges) {
    out.push({
      id: `ground/${b.id}`,
      size: [b.canvas[0], b.canvas[1]] as const,
      anchor: 'bottom-center',
      category: 'terrain',
      source: 'ai',
    });
  }

  // 콤보 데코 (§6) — 전부 1×1
  for (const d of KAIRO.deco.items) {
    out.push({
      id: `deco/${d.id}`,
      size: [TILE_W, TILE_H + d.bodyH] as const,
      anchor: 'bottom-center',
      category: 'prop',
      source: 'ai',
    });
  }

  return out;
}

/**
 * 정합 검사 — 계약 두 개와 투영이 서로 어긋나지 않는지.
 * 위반 목록을 돌려준다 (빈 배열이면 통과). 테스트와 `tools/kairo-gate.ts` 가 쓴다.
 */
export function validateContracts(): string[] {
  const bad: string[] = [];
  const sims = allSimFacilities();

  if (sims.length !== KAIRO.facilities.length) {
    bad.push(`항목 수 불일치: 시뮬 ${sims.length} vs 렌더 ${KAIRO.facilities.length}`);
  }

  for (const s of sims) {
    const r = renderBySprite.get(s.sprite);
    if (!r) {
      bad.push(`${s.id}: 렌더 계약에 ${s.sprite} 없음`);
      continue;
    }
    const [w, d] = s.size;

    const c = footprintCanvas(w, d, r.bodyH);
    if (r.canvas[0] !== c.x || r.canvas[1] !== c.y) {
      bad.push(`${s.id}: 캔버스 ${r.canvas} ≠ 파생 (${c.x},${c.y})`);
    }

    const a = canvasAnchor(w, d, r.bodyH);
    if (r.anchorTexel[0] !== a.x || r.anchorTexel[1] !== a.y) {
      bad.push(`${s.id}: 앵커 ${r.anchorTexel} ≠ bottom-center (${a.x},${a.y})`);
    }

    if (r.slots.length !== s.capacity) {
      bad.push(`${s.id}: 슬롯 ${r.slots.length} ≠ 용량 ${s.capacity}`);
    }
    for (const sl of r.slots) {
      const [i, j] = sl.tile;
      if (i < 0 || j < 0 || i >= w || j >= d) {
        bad.push(`${s.id}: 슬롯 타일 [${i},${j}] 이 발자국 ${w}×${d} 밖`);
      }
      if (!KAIRO.guest.poses.includes(sl.pose)) {
        bad.push(`${s.id}: 알 수 없는 포즈 ${sl.pose}`);
      }
      if (!KAIRO.guest.facingNames.includes(sl.facing)) {
        bad.push(`${s.id}: 알 수 없는 방향 ${sl.facing}`);
      }
    }

    // 오픈탑 규칙 — 실내는 벽(24)보다 낮아야 벽 뒤로 숨지 않는다 (§3.2)
    if (s.layer === 'indoor' && r.bodyH > KAIRO.wall.heightTexels - 4) {
      bad.push(`${s.id}: 실내 bodyH ${r.bodyH} > 20`);
    }
    if (s.layer === 'indoor' && !r.openTop) {
      bad.push(`${s.id}: 실내인데 openTop 아님`);
    }

    if (r.ride) {
      for (const t of [r.ride.entryTile, r.ride.exitTile]) {
        if (t[0] < 0 || t[1] < 0 || t[0] >= w || t[1] >= d) {
          bad.push(`${s.id}: ride 타일 [${t}] 이 발자국 밖`);
        }
      }
    }
  }

  // 지면 — 렌더 계약(그림)과 시뮬 데이터(통행)가 같은 목록이어야 한다.
  // 한쪽만 늘리면 "칠할 수는 있는데 그림이 없는" 종류가 생긴다.
  const renderKinds = KAIRO.ground.types.map((t) => t.id).sort();
  const simKinds = GROUND_KINDS.map((k) => k.id).sort();
  if (renderKinds.join(',') !== simKinds.join(',')) {
    bad.push(`지면 목록 불일치: 렌더 [${renderKinds.join(',')}] vs 시뮬 [${simKinds.join(',')}]`);
  }
  const renderBridges = KAIRO.ground.bridges.map((b) => b.id).sort();
  const simBridges = BRIDGE_KINDS.map((b) => b.id).sort();
  if (renderBridges.join(',') !== simBridges.join(',')) {
    bad.push(`다리 목록 불일치: 렌더 [${renderBridges.join(',')}] vs 시뮬 [${simBridges.join(',')}]`);
  }

  return bad;
}
