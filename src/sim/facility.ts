import rawData from '../data/facilities.json' with { type: 'json' };
import { Terrain, terrainFromKey } from './terrain.js';

/**
 * 시설 정의 — 아키텍처 불변식 3.
 *
 * 시설은 코드가 아니라 data/facilities.json 에 정의된다.
 * 시설 추가 = JSON 항목 하나 + 스프라이트 ID. 이 파일은 그것을 읽고 검증할 뿐이다.
 */

export type FacilityLayer = 'land' | 'waterfront' | 'water' | 'path' | 'deco';

/** 시설이 해소하는 손님 욕구 */
export type NeedKind = 'hunger' | 'thirst' | 'toilet' | 'heat' | 'rest' | 'fun';

export interface PlacementRule {
  /** 설치 가능한 지형 */
  terrain: readonly Terrain[];
  /** 육지에 인접해야 하는가 (선착장·슬라이드처럼 수변에 걸치는 시설) */
  requiresLandAdjacent: boolean;
}

export interface FacilityDef {
  id: string;
  name: string;
  layer: FacilityLayer;
  /** 회전 0 기준 [가로, 세로] 타일 */
  size: readonly [number, number];
  sprite: string;
  cost: number;
  /** 하루 유지비 */
  upkeep: number;
  /** 동시 수용 인원 */
  capacity: number;
  /** 1회 이용에 걸리는 tick */
  serviceTicks: number;
  /** 기본 이용료 (플레이어가 조정 가능) */
  fee: number;
  thrill: number;
  satisfaction: number;
  /** 가동에 필요한 직원 수 */
  staff: number;
  needs: readonly NeedKind[];
  placement: PlacementRule;
  /** 인접 지형 보너스: 지형 → 처리량 배수 가산 */
  terrainBonus: Readonly<Partial<Record<Terrain, number>>>;
  /** 빠지당 하나만 (입장 게이트 등) */
  unique: boolean;
  /** 드래그로 이어 그리는가 (길) */
  drawable: boolean;
  desc: string;
}

const NEED_KINDS: ReadonlySet<string> = new Set([
  'hunger',
  'thirst',
  'toilet',
  'heat',
  'rest',
  'fun',
]);
const LAYERS: ReadonlySet<string> = new Set(['land', 'waterfront', 'water', 'path', 'deco']);

interface RawFacility {
  id: string;
  name: string;
  layer: string;
  size: [number, number];
  sprite: string;
  cost: number;
  upkeep: number;
  capacity: number;
  serviceTicks: number;
  fee: number;
  thrill: number;
  satisfaction: number;
  staff: number;
  needs?: string[];
  placement: { terrain: string[]; requiresLandAdjacent?: boolean };
  terrainBonus?: Record<string, number>;
  unique?: boolean;
  drawable?: boolean;
  desc?: string;
}

function parseDef(r: RawFacility): FacilityDef {
  const where = `시설 '${r.id}'`;

  if (!LAYERS.has(r.layer)) throw new Error(`${where}: 알 수 없는 layer '${r.layer}'`);
  if (!Array.isArray(r.size) || r.size.length !== 2 || r.size[0] < 1 || r.size[1] < 1) {
    throw new Error(`${where}: size 가 올바르지 않습니다`);
  }

  const terrain = r.placement.terrain.map((k) => {
    const t = terrainFromKey(k);
    if (t === undefined) throw new Error(`${where}: 알 수 없는 지형 '${k}'`);
    return t;
  });
  if (terrain.length === 0) throw new Error(`${where}: 설치 가능 지형이 비었습니다`);

  const needs = (r.needs ?? []).map((n) => {
    if (!NEED_KINDS.has(n)) throw new Error(`${where}: 알 수 없는 욕구 '${n}'`);
    return n as NeedKind;
  });

  const terrainBonus: Partial<Record<Terrain, number>> = {};
  for (const [k, v] of Object.entries(r.terrainBonus ?? {})) {
    const t = terrainFromKey(k);
    if (t === undefined) throw new Error(`${where}: terrainBonus 의 알 수 없는 지형 '${k}'`);
    terrainBonus[t] = v;
  }

  return {
    id: r.id,
    name: r.name,
    layer: r.layer as FacilityLayer,
    size: [r.size[0], r.size[1]],
    sprite: r.sprite,
    cost: r.cost,
    upkeep: r.upkeep,
    capacity: r.capacity,
    serviceTicks: r.serviceTicks,
    fee: r.fee,
    thrill: r.thrill,
    satisfaction: r.satisfaction,
    staff: r.staff,
    needs,
    placement: {
      terrain,
      requiresLandAdjacent: r.placement.requiresLandAdjacent ?? false,
    },
    terrainBonus,
    unique: r.unique ?? false,
    drawable: r.drawable ?? false,
    desc: r.desc ?? '',
  };
}

const parsed = (rawData as unknown as { facilities: RawFacility[] }).facilities.map(parseDef);

const byId = new Map<string, FacilityDef>();
for (const d of parsed) {
  if (byId.has(d.id)) throw new Error(`시설 ID 중복: '${d.id}'`);
  byId.set(d.id, d);
}

export const FACILITY_DEFS: readonly FacilityDef[] = parsed;

export function facilityDef(id: string): FacilityDef | undefined {
  return byId.get(id);
}

export function requireFacilityDef(id: string): FacilityDef {
  const d = byId.get(id);
  if (!d) throw new Error(`알 수 없는 시설 ID: '${id}'`);
  return d;
}

/** 회전(90° 단위)을 반영한 실제 점유 크기 */
export function footprint(def: FacilityDef, rot: number): readonly [number, number] {
  return rot % 2 === 0 ? def.size : [def.size[1], def.size[0]];
}
