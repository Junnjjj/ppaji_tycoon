/**
 * 카이로 계약 로더 — 스펙 §9.
 *
 * 계약은 **둘로 쪼개져 있다.** 합치지 말 것:
 *
 *   src/data/kairo-facilities.json      시뮬 — 발자국·용량·배치제약·**슬롯**·ride 입출구
 *   src/assets/kairo-render-contract.json  렌더 — 캔버스·앵커·bodyH·벽·배경
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
import { expandSpec, variantId } from './types.js';
import type { SpriteSpec } from './types.js';

/**
 * 슬롯 타입의 정본은 **sim** 이다 (`src/sim/kairo/placement.ts`).
 *
 * ⚠ 슬롯 데이터가 렌더 계약에서 `src/data/kairo-facilities.json` 으로 이사했다 —
 * 손님이 슬롯 칸 **위에 서게** 되면 그건 렌더 좌표가 아니라 게임플레이다 (`ride` 와 같은
 * 범주). 자세한 이유는 `KairoFacilityDef.slots` 주석. 여기서는 **타입만** 다시 내보내
 * 렌더 쪽 부르는 곳(`slotOffset`)이 이름을 새로 짓지 않게 한다.
 *
 * `import type` 이라 컴파일에서 지워진다 — 값 의존이 아니므로 순환도 없다.
 */
export type { KairoFacilitySlot as KairoSlot } from '../sim/kairo/placement.js';
import type { KairoFacilitySlot } from '../sim/kairo/placement.js';

/**
 * 슬라이드류의 **그림 지시**만 남는다.
 *
 * ⚠ `entryTile`/`exitTile` 은 지웠다 — 시뮬 데이터(`kairo-facilities.json` 의 `ride`)에
 * **똑같은 값이 한 벌 더** 있었고 둘이 같은지 아무도 안 보고 있었다 (우연히 일치 중이었다).
 * 입출구는 손님이 실제로 타는 칸이므로 게임플레이이고, 정본은 sim 하나다
 * (`PlacementGrid.rideTilesOf`). 되돌리지 말 것.
 */
export interface KairoRide {
  ridePose: string;
}

export interface KairoFacilityRender {
  sprite: string;
  canvas: readonly [number, number];
  anchorTexel: readonly [number, number];
  bodyH: number;
  openTop: boolean;
  ride?: KairoRide;
}

export interface KairoFacilitySim {
  id: string;
  name: string;
  layer: 'indoor' | 'land' | 'water' | 'pension' | 'season';
  size: readonly [number, number];
  sprite: string;
  capacity: number;
  /** 손님이 서는 칸 — **시뮬 데이터가 소유한다** (위 `KairoSlot` 주석) */
  slots: readonly KairoFacilitySlot[];
  /** 손님이 밟고 지나가는 구조물 (플로팅덱·선착장) */
  walkOn?: boolean;
  /**
   * 방향 그림 장수 — 없으면 2 (K52-⑤). 정본 뜻은 sim 의 `FacilityFacing` 주석.
   * 여기서는 **몇 장을 구워야 하나**만 쓴다 (`kairoSpriteSpecs` 의 `dir` 축).
   */
  facings?: 2 | 4;
  placement: {
    requiresIndoor?: boolean;
    requiresDeck?: boolean;
    requiresShoreOrDeck?: boolean;
  };
  ride?: {
    entryTile: readonly [number, number];
    exitTile: readonly [number, number];
    traverseTicks: number;
  };
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
  presentation: {
    upscaleSteps: readonly number[];
    grid: readonly [number, number];
    /** 격자 전체의 화면 크기 — `gridExtent()` 와 같아야 한다 (계약 테스트가 지킨다) */
    mapTexels: readonly [number, number];
  };
  guest: {
    cellTexels: readonly [number, number];
    poses: readonly string[];
    emotes: readonly string[];
    facings: number;
    facingNames: readonly string[];
    /** 한 칸에 둘 이상 설 때 좌우로 흩는 간격 (K52-⑦) — `COSLOT_SPREAD_TEXELS` 로 읽는다 */
    coSlotSpreadTexels: number;
    palettes: number;
    outline: { baked: boolean; color: string; widthTexels: number };
  };
  wall: {
    edges: number;
    edgeNames: readonly string[];
    doors: number;
    heightTexels: number;
    thicknessTexels: number;
    canvas: readonly [number, number];
  };
  ground: {
    canvas: readonly [number, number];
    anchorTexel: readonly [number, number];
    types: readonly { id: string; name: string; alts: number }[];
    bridges: readonly { id: string; name: string; canvas: readonly [number, number] }[];
  };
  deco: {
    items: readonly { id: string; name: string; bodyH: number; kind: 'safety' | 'scenery' }[];
  };
  backdrop: {
    layers: readonly string[];
    tileTexels: number;
    /** 띠 높이 */
    bandTexels: number;
    /** 랩 크로스페이드 폭 — 가로 이음새를 지운다 */
    wrapCrossfade: number;
  };
  facilities: readonly KairoFacilityRender[];
  /**
   * HUD 아이콘 — **스프라이트 계약 밖**이다 (절차적 드로어가 없다. 계약 주석 참조).
   * 그래도 **같은 팩으로 굽는다** (Phase G): 그림이 한 장으로 오면 요청도 한 번이다.
   */
  uiIcons: {
    canvas: readonly [number, number];
    icons: readonly { id: string; prompt: string; now: string }[];
  };
};

export const KAIRO_SIM = (simData as unknown as { facilities: Record<string, KairoFacilitySim> })
  .facilities;

/** `facility/shop` → 렌더 항목 */
const renderBySprite = new Map(KAIRO.facilities.map((f) => [f.sprite, f]));
/** `facility/shop` → 시뮬 항목. 스프라이트 명세가 `facings` 를 물을 때만 쓴다 */
const simBySprite = new Map(allSimFacilities().map((f) => [f.sprite, f]));

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
 * 방향 변형의 **이름**. `facility/shop:d2` 처럼 붙는다 (`variantId` 의 `dir` 축).
 *
 * 색인은 sim 의 `FacilityFacing` 과 **같은 순서**여야 한다 (0·1 = 앞면이 카메라 쪽,
 * 2·3 = 뒷면). 파일명은 `facility__shop__d2.png` 가 되고 `assetFileToId` 가 그대로 되돌린다.
 */
export const FACILITY_DIR_NAMES = ['d0', 'd1', 'd2', 'd3'] as const;

/** 이 시설이 몇 방향 그림을 갖나 — 데이터가 정한다 (불변식 3). 안 적었으면 2 */
export function facilityFacings(defId: string): 2 | 4 {
  return KAIRO_SIM[defId]?.facings === 4 ? 4 : 2;
}

/**
 * 놓인 시설의 **텍스처 ID** — `facings: 4` 면 방향 변형, 아니면 base 그대로.
 *
 * ⚠ 씬·고스트·아틀라스가 **이 함수 하나**를 쓴다. `facility/${id}` 를 손으로 조립하면
 * 4방향 시설에서 고스트만 d0 을 쓰고 실물은 d2 를 쓰는 상태가 만들어진다.
 * 2방향 시설에서는 오늘과 **완전히 같은 문자열**을 돌려준다 (동작 0).
 */
export function facilitySpriteId(defId: string, facing = 0): string {
  const sim = KAIRO_SIM[defId];
  const sprite = sim?.sprite ?? `facility/${defId}`;
  if (facilityFacings(defId) !== 4) return sprite;
  return variantId(sprite, { dir: FACILITY_DIR_NAMES[facing & 3] ?? FACILITY_DIR_NAMES[0] });
}

/**
 * 슬롯의 화면 텍셀 오프셋 — **앵커 기준**.
 *
 * 데이터가 타일 인덱스만 갖고 있으므로 여기서 투영으로 계산한다. 데이터에 텍셀 좌표를
 * 박아 두면 앵커나 투영이 바뀔 때 185개가 전부 틀어진다 (스펙 §2.5).
 */
export function slotOffset(
  slot: KairoFacilitySlot,
  footprint: readonly [number, number],
): { x: number; y: number } {
  const [w, d] = footprint;
  const [i, j] = slot.tile;
  // 타일 (i,j) 의 중심. (i+0.5, j+0.5) 를 넣으면 x 의 0.5 가 상쇄돼 16(i−j) 가 된다
  const center = tileCenter(i, j);
  const anchor = footprintAnchor(0, 0, w, d);
  return { x: center.x - anchor.x, y: center.y - anchor.y };
}

/**
 * 한 **칸**에 손님이 둘 이상 설 때 좌우로 흩는 간격 (K52-⑦).
 *
 * ⚠ 예전에는 슬롯마다 `offsetTexel` 을 데이터에 적었다 (파라솔·선착장의 4개, 전부 `±5,0`).
 * 그 규칙은 **절반만 돌았다**: 정원이 슬롯보다 많아지는 경우(회전 특화 P1.5, 최대 2명)에는
 * 넘친 손님이 `k % n` 으로 남의 슬롯 칸에 겹쳐 서는데 그에게 줄 `offsetTexel` 은 데이터에
 * 있을 수가 없다. 그래서 데이터에서 지우고 **화면이 같은 칸에 선 손님 수에서 파생**한다 —
 * 규칙 하나가 두 경우를 다 덮는다.
 *
 * 텍셀이라 시뮬은 알면 안 되는 값이고(손님은 여전히 **같은 칸**에 선다), 그래서 정본이
 * 렌더 계약에 있다.
 */
export const COSLOT_SPREAD_TEXELS = KAIRO.guest.coSlotSpreadTexels;

/**
 * 렌더 계약을 기존 에셋 레이어의 `SpriteSpec[]` 로 펼친다.
 *
 * 이렇게 하면 `ProceduralProvider` / `AtlasProvider` 교체점이 그대로 쓰인다 —
 * 카이로 전용 프로바이더를 새로 만들지 않는다.
 * 카이로 스프라이트의 앵커는 **전부 `bottom-center`** 다 (§4.1 에서 확인).
 */
export function kairoSpriteSpecs(): SpriteSpec[] {
  const out: SpriteSpec[] = [];

  /*
   * 시설 — `facings: 4` 인 것만 `dir` 축으로 네 장이 된다 (K52-⑤).
   *
   * ⚠ 축은 `types.ts` 의 `SpriteVariants.dir` 를 **그대로 쓴다.** 새 축을 만들지 말 것 —
   * `variantId`/`expandSpec`/`parseId` 가 이미 전부 지원하고, 카이로 경로만 `alt` 를
   * 손으로 펴고 있었을 뿐이다. 손님(`guest/body:3/up/1`)이 쓰는 그 축이다.
   * ⚠ `facings: 2` 면 `variants` 자체를 **안 붙인다** — 붙이면 ID 가 `:d0` 로 바뀌어
   * 아틀라스·게이트·생성물 144장이 전부 이름이 달라진다.
   */
  for (const f of KAIRO.facilities) {
    const sim = simBySprite.get(f.sprite);
    const four = (sim?.facings ?? 2) === 4;
    out.push({
      id: f.sprite,
      size: [f.canvas[0], f.canvas[1]] as const,
      anchor: 'bottom-center',
      category: 'facility',
      ...(four ? { variants: { dir: [...FACILITY_DIR_NAMES] } } : {}),
      source: 'ai',
    });
  }

  /*
   * 벽 — **경계 4방 × (벽·문)** = 8장 (K25). 전부 스티플 유리 (§3.2).
   *
   * 예전에는 4방 비트마스크 16 + 문 2 = 18장이었다. 벽이 칸을 통째로 먹었기 때문에
   * "이 칸에서 어느 이웃과 이어지나"를 그림이 표현해야 했다. 이제 벽은 경계 하나에
   * 하나씩 서므로 **방향 4가지면 끝난다** — 이어짐은 이웃 경계의 그림이 알아서 만든다.
   * 덤으로 AI 로 뽑을 장수가 18 → 8 로 줄었다.
   */
  out.push({
    id: 'wall/edge',
    size: [KAIRO.wall.canvas[0], KAIRO.wall.canvas[1]] as const,
    anchor: 'bottom-center',
    category: 'prop',
    variants: { alt: KAIRO.wall.edges },
    source: 'ai',
  });
  out.push({
    id: 'wall/door',
    size: [KAIRO.wall.canvas[0], KAIRO.wall.canvas[1]] as const,
    anchor: 'bottom-center',
    category: 'prop',
    variants: { alt: KAIRO.wall.doors },
    source: 'ai',
  });

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

  /*
   * 배경 2겹 (§7 배경). 가로로 타일링하는 띠 — 능선과 먼 강둑.
   *
   * **하늘과 물은 안 넣는다** (`sky:false`, `water:false`) — 하늘은 배경색, 물은
   * 절차적 지면이 그린다. 배경에 넣으면 색이 두 곳에서 정해져 안 맞는다.
   */
  for (const layer of KAIRO.backdrop.layers) {
    out.push({
      id: `backdrop/${layer}`,
      size: [KAIRO.backdrop.tileTexels, KAIRO.backdrop.bandTexels] as const,
      anchor: 'bottom-center',
      category: 'backdrop',
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
 * **최종 ID → 명세** 표. `alt` 변형까지 펼친다 (129개).
 *
 * ⚠ 이것이 크기·앵커의 **정본**이다. 아틀라스가 아니다. 아틀라스는 픽셀만 준다 —
 * 크기를 아틀라스에서 읽으면 계약과 두 벌이 되고, 그러면 그림이 조용히 어긋난 채로
 * 배치만 맞는 상태가 된다 (이 저장소가 `guestWalkable`·`capacityOf`·`admissionLimit`
 * 에서 세 번 겪은 실패다).
 */
export function kairoSpriteIndex(): Map<string, SpriteSpec> {
  const out = new Map<string, SpriteSpec>();
  /*
   * ⚠ **`expandSpec` 로 편다** (K52-⑤). 예전엔 여기가 `alt` 축 하나만 손으로 폈고,
   * 그래서 `dir` 를 선언하는 순간 그 변형이 **조용히 색인에서 빠졌다** — 아틀라스가
   * 안 굽고 게이트가 "계약에 없는 산출물"이라 부르는 상태가 된다.
   * `alt` 만 있는 명세에 대해서는 옛 코드와 **글자 그대로 같은 ID·같은 순서**를 낸다.
   */
  for (const s of kairoSpriteSpecs()) for (const id of expandSpec(s)) out.set(id, s);
  return out;
}

/** HUD 아이콘 ID (15). 스프라이트가 아니라 DOM `<img>` 용이지만 같은 팩으로 굽는다 */
export function kairoUiIconIds(): string[] {
  return KAIRO.uiIcons.icons.map((i) => i.id);
}

/**
 * **한 팩이 담아야 하는 모든 ID → 캔버스 크기** (129 스프라이트 + 15 UI = 144).
 *
 * 굽기 도구(`tools/bake-kairo-atlas.ts`)와 에셋 게이트(`tools/kairo-gate.ts`)가
 * **이 하나**를 본다. 규격표가 둘이면 한쪽만 고쳐 놓고 통과한다.
 */
export function kairoAssetSizes(): Map<string, readonly [number, number]> {
  const out = new Map<string, readonly [number, number]>();
  for (const [id, spec] of kairoSpriteIndex()) out.set(id, spec.size);
  for (const id of kairoUiIconIds()) out.set(id, KAIRO.uiIcons.canvas);
  return out;
}

/**
 * 생성물 파일명 ↔ 논리 ID. `docs/asset-prompts.md` 가 정한 규칙이 정본이고
 * **여기가 그 규칙의 유일한 구현**이다.
 *
 *   `facility/shop`     ↔ `facility__shop.png`
 *   `ground/lawn:a0`    ↔ `ground__lawn__a0.png`
 *   `ui/icon-coin`      ↔ `ui__icon-coin.png`
 *
 * ⚠ 규칙을 두 벌 적지 말 것. 게이트가 폴더 이름으로 ID 를 추측하던 시절이 있었는데,
 * 파일이 평면으로 바뀌자 144장이 통째로 "계약에 없는 산출물"로 잡혔다 (실측).
 */
export function assetIdToFile(id: string): string {
  return `${id.replace(':', '__').replace('/', '__')}.png`;
}

/**
 * 파일명 → 논리 ID. 규칙에 안 맞으면 `null` (부르는 쪽이 위반으로 처리한다).
 *
 * ⚠ **변형 축을 하나까지만 견딘다** (`parts.length > 3` 이면 `null`). 지금은 어떤
 * 카이로 스프라이트도 축을 둘 이상 안 쓰므로 (`ground/*` 는 `alt` 하나, 4방향 시설은
 * `dir` 하나) 문제가 없지만, **`frames` 를 얹는 순간 여기서 막힌다** —
 * `facility/fountain:d0/1` 은 `facility__fountain__d0__1.png` 가 되어 4토막이다.
 * 계획서 6단계(애니메이션)가 이 자리를 먼저 넓혀야 한다. `assetIdToFile` 의
 * `.replace(':' …)`/`.replace('/' …)` 도 **첫 한 번만** 바꾸므로 같이 봐야 한다.
 */
export function assetFileToId(fileName: string): string | null {
  const stem = fileName.replace(/\.png$/, '');
  const parts = stem.split('__');
  if (parts.length < 2 || parts.length > 3) return null;
  const [cat, name, variant] = parts as [string, string, string | undefined];
  if (!cat || !name) return null;
  return variant ? `${cat}/${name}:${variant}` : `${cat}/${name}`;
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

    /*
     * 방향 장수는 **2 아니면 4** 다 (K52-⑤). 3 이나 8 을 적으면 `dir` 축이 그 수만큼
     * 펴져 아틀라스가 굽지도 못하는 ID 를 요구하게 된다. 캔버스는 회전에 불변이므로
     * (`(w+d)` 가 교환에 불변) 크기 검사는 위 한 벌로 네 장을 다 덮는다.
     */
    if (s.facings !== undefined && s.facings !== 2 && s.facings !== 4) {
      bad.push(`${s.id}: facings ${String(s.facings)} — 2 또는 4 여야 한다`);
    }

    /*
     * 슬롯 — **데이터는 sim 이 갖고 이름표는 렌더 계약이 갖는다.** 그래서 이 검사가
     * 두 파일을 잇는 유일한 다리다 (슬롯이 이사한 뒤에도 그대로 유지한다).
     * 포즈·방향 이름을 sim 이 자기 목록으로 검사하기 시작하면 목록이 두 벌이 된다.
     */
    const slots = s.slots ?? [];
    if (slots.length !== s.capacity) {
      bad.push(`${s.id}: 슬롯 ${slots.length} ≠ 용량 ${s.capacity}`);
    }
    /*
     * ⚠ 정원이 있는데 슬롯이 없으면 손님이 **설 자리 없이 이용**한다 — 위 등호가
     * `capacity 0` 인 14종을 덮어 주긴 하지만, 새 시설을 `slots` 없이 추가했을 때
     * 무엇이 틀렸는지 말해 주는 것은 이 줄이다.
     */
    if (s.capacity > 0 && slots.length === 0) {
      bad.push(`${s.id}: 정원 ${s.capacity} 인데 슬롯이 없다 (kairo-facilities.json 의 slots)`);
    }
    for (const sl of slots) {
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

    /*
     * ⚠ **이사한 필드가 렌더 계약에 되돌아오지 않게 한다.** 두 파일에 나눠 두는 것이
     * 이 저장소의 반복 실패이므로, "옮겼다"가 아니라 "저쪽에 없다"를 검사가 지킨다.
     * `entryTile`/`exitTile` 은 실제로 두 벌이었고 아무도 대조하지 않고 있었다.
     */
    const rr = r as unknown as Record<string, unknown>;
    if ('slots' in rr) bad.push(`${s.id}: 렌더 계약에 slots 가 있다 — 정본은 시뮬 데이터다`);
    const rideRaw = rr['ride'] as Record<string, unknown> | undefined;
    if (rideRaw && ('entryTile' in rideRaw || 'exitTile' in rideRaw)) {
      bad.push(`${s.id}: 렌더 계약에 ride.entryTile/exitTile 이 있다 — 정본은 시뮬 데이터다`);
    }

    /*
     * ⚠ 이 규칙은 한때 **거꾸로**였다: "실내 시설은 벽보다 낮아야 한다".
     * 벽이 24텍셀이던 시절의 규칙인데, 그러면 앞쪽 벽이 시설을 **완전히 가린다** —
     * 지키려던 것과 정반대다. (벽을 유리로 만든 것도 이 가림 때문이었다.)
     *
     * K27 에서 벽을 10텍셀로 낮췄다. 이제 실내 시설이 벽 위로 솟는 것이 정상이고,
     * 지켜야 할 것은 **벽이 손님보다 낮다**는 쪽이다 (`벽 높이 계약` 참고).
     * 오픈탑 표시만 남긴다.
     */
    if (s.layer === 'indoor' && !r.openTop) {
      bad.push(`${s.id}: 실내인데 openTop 아님`);
    }

    // ride 입출구는 이제 시뮬 데이터 한 벌뿐이다 — 발자국 검사도 그쪽을 읽는다
    if (s.ride) {
      for (const t of [s.ride.entryTile, s.ride.exitTile]) {
        if (t[0] < 0 || t[1] < 0 || t[0] >= w || t[1] >= d) {
          bad.push(`${s.id}: ride 타일 [${t}] 이 발자국 밖`);
        }
      }
    }
    // 그림 지시(`ridePose`)와 게임플레이(`ride`)는 같은 시설에 있어야 한다
    if (!!s.ride !== !!r.ride) {
      bad.push(`${s.id}: ride 선언 불일치 — 시뮬 ${!!s.ride} vs 렌더 ${!!r.ride}`);
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
