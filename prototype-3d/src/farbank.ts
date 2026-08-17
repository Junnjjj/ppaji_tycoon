import * as THREE from 'three';
import { TEXEL_WORLD } from './sprite-facility.js';
import { SHORE_BASE } from './water.js';

/**
 * 강 건너편 — **월드 지오메트리**다. 화면 부착 배경막이 아니다.
 *
 * 화면 고정(수평) 배경막은 월드 대각(30°) 땅끝과 구조적으로 못 만난다 —
 * 칼로 자른 실루엣 + 이중 하늘 띠가 그 증상이었다 (실측). 대신:
 *   우리 땅 (d −138 에서 끝) → **뒷물 띠** (water.ts) → 건너편 벽
 * 전부 월드 좌표라 경계가 같은 아이소 기하로 이어지고, 팬하면 깊이 차로
 * 시차가 실제로 생긴다.
 *
 * 벽은 수직 쿼드 (시설 빌보드와 같은 계약): 높이 ×1/cos(pitch) 보상, 가로 타일 반복.
 *
 * ## 왜 두 장이 아니라 한 장인가 (2026-08-17)
 * 예전엔 마을 벽 + 산 벽 두 장을 세웠다. 두 장은 한 원본을 잘라 만든 것이라 아래쪽에
 * 순수 검정 패딩 6줄이 남아 있었고(farbank-village.png 실측), 그게 화면 상단의
 * **가로 검은 선**이었다. 벽이 하나면 그 경계 자체가 없다.
 *
 * ## 위쪽은 하늘로 무한히 늘린다
 * 텍스처 맨 위 10줄은 굽는 단계에서 **하늘 단색**으로 눌러 뒀다
 * (`tools/make-backdrop-map.py`). wrapT 는 기본값 ClampToEdge 이므로
 * `repeat.y > 1` 로 두면 v>1 구간이 그 단색 줄로 채워진다 — 즉 쿼드를 이미지보다
 * 훨씬 높게 만들어도 위쪽은 통째로 하늘이다. 어떤 줌·팬에서도 벽 윗변이 안 보인다.
 * 씬 배경색도 이 하늘색으로 맞춘다 (`skyOf`) — 안 맞추면 거기서 또 선이 보인다.
 */

/** 맵 타입 — 배경 세트를 가른다. `?map=river|mountain|lake` */
export type MapType = 'river' | 'mountain' | 'lake';

export const MAP_TYPE: MapType = (() => {
  const v = new URLSearchParams(location.search).get('map');
  return v === 'mountain' || v === 'lake' ? v : 'river';
})();

interface Spec {
  /** 텍스처 크기 (전 타입 공통 197×117, 가로 타일러블) */
  w: number;
  h: number;
  /** 해안 거리 — 월드 z = SHORE_BASE + d. 땅끝(−138)·뒷강(−164) 보다 뒤 */
  d: number;
  /** 1텍셀 = TEXEL_WORLD × scale. 원경이라 시설(1.0)보다 굵게 찍는다 */
  scale: number;
  /** 텍스처 최상단 줄의 실측 하늘색 — 씬 배경색이 이 값이어야 윗변이 안 보인다 */
  sky: string;
}

/**
 * ⚠ 거리는 **화면 up 의 z 성분**에서 역산한다 (yaw20: 0.542). 줌 1.4 반높이 110 →
 * z 후퇴 가시 한계 203. 땅끝·뒷강과 이 한계 사이에 벽이 들어와야 한다.
 * z = SHORE_BASE(−60) + d(−116) = **−176** — 옛 마을 벽(−172)·산 벽(−184) 사이다.
 */
const SPECS: Record<MapType, Spec> = {
  river: { w: 197, h: 117, d: -116, scale: 1.0, sky: '#209ffd' },
  mountain: { w: 197, h: 117, d: -116, scale: 1.0, sky: '#1e93ef' },
  lake: { w: 197, h: 117, d: -116, scale: 1.0, sky: '#348df4' },
};

/**
 * 쿼드 높이 = 이미지 높이 × 이 값. 넘치는 위쪽은 ClampToEdge 로 하늘 단색이 된다.
 * 최소 줌(0.96×0.85)에서 화면 상단이 up 210 근처까지 올라가고 팬으로 더 올라갈 수 있다 —
 * 3 이면 벽 윗변이 up 227 이라 여유가 얇다. 5 로 두면 up 300 넘어 어떤 조작에도 안 보인다.
 * 쿼드 한 장이라 비용은 0 이다.
 */
const SKY_EXTEND = 5;

/** 씬 배경색 — 벽 텍스처 최상단 하늘색과 같아야 한다 */
export function skyOf(type: MapType = MAP_TYPE): string {
  return SPECS[type].sky;
}

function wall(type: MapType, camera: THREE.Camera): THREE.Mesh {
  const spec = SPECS[type];
  const tex = new THREE.TextureLoader().load(`/sprites/bg-${type}.png`);
  tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 씻겨 나간다
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping; // 가로는 타일러블 (wrapT 는 ClampToEdge 유지 — 위 참고)

  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const pitch = Math.asin(-fwd.y);
  const texel = TEXEL_WORLD * spec.scale;
  const W = 4200;
  const imgH = (spec.h * texel) / Math.cos(pitch);
  const H = imgH * SKY_EXTEND;
  tex.repeat.set(W / (spec.w * texel), SKY_EXTEND);

  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ map: tex }), // 원경은 조명을 받으면 안 된다
  );
  m.rotation.y = Math.atan2(-fwd.x, -fwd.z);
  // 밑변은 y −0.5 고정 — 늘어난 하늘은 전부 위로만 자란다
  m.position.set(0, H / 2 - 0.5, SHORE_BASE + spec.d);
  return m;
}

export function makeFarBank(camera: THREE.Camera, type: MapType = MAP_TYPE): THREE.Group {
  const g = new THREE.Group();
  g.add(wall(type, camera));
  return g;
}
