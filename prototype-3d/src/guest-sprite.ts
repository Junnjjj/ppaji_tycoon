import * as THREE from 'three';
import { TEXEL_WORLD } from './sprite-facility.js';

/**
 * 손님 스프라이트 — 3D 인형 4벌 대신 **픽셀로 그린 빌보드 아틀라스**.
 *
 * ## 왜 AI 생성이 아니라 코드인가
 * design.md §19.3 이 손님을 `procedural`(부품 조합)로 못 박아 뒀다. 이유가 있다:
 * 손님은 12×17px 이라 sprite-gen 의 픽셀 언페이크 캡이 이 크기에서 미검증이고,
 * 8팔레트 × 4방향 × 3프레임 = 96장을 생성으로 뽑으면 96장이 서로 안 맞는다.
 * 조각 몇 개에서 96장을 굽는 게 카이로소프트 수법이고, 여기서도 그게 맞다.
 *
 * ## 왜 인스턴스 UV 셰이더인가
 * 손님 400명을 방향·프레임·팔레트별로 나누면 InstancedMesh 가 96벌이 된다.
 * 대신 아틀라스 하나 + **인스턴스별 UV 사각형**(`aUvRect`)으로 한 벌에 담는다.
 *
 * ## 크기 계약
 * 시설과 같다 — 1텍셀 = 타일의 1/16 (`TEXEL_WORLD`). 손님만 다른 배율을 쓰면
 * 건물 옆에서 크기가 안 맞는다 (본관에서 이미 겪은 실수).
 */

// 논리 픽셀. design.md §19.1 은 12×17 이지만 **윤곽선 1px 여백**이 필요해 세로를 19로 둔다
// (그림 자체는 여전히 12×17, 위아래 한 줄씩이 윤곽 자리).
const W = 12, H = 19;
/** 그림을 셀 안에서 1px 내려 그린다 — 위/아래에 윤곽이 들어갈 자리 */
const INSET_Y = 1;
/** 구운 윤곽색 — 다크 웜 (스타일 계약). 팔레트별로 바꾸지 않는다 (군중이 산만해진다) */
const OUTLINE = '#2b1d12';
/** 'swim' 은 방향이 아니라 포즈다 — 물에 잠긴 상반신만 그린다 (장식 군중의 수영객) */
export const DIRS = ['down', 'up', 'left', 'right', 'swim'] as const;
export type Dir = (typeof DIRS)[number];
const FRAMES = 3;                   // 정지 · 걷기1 · 걷기2

/**
 * 팔레트 8벌.
 *
 * ⚠ **조끼는 주황 계열로 묶는다.** 처음에 빨강·노랑·초록·분홍으로 흩뜨렸더니
 * 화면이 알록달록해지면서 "물놀이장"이라는 정보가 사라졌다 — 레퍼런스에서 주황
 * 구명조끼는 장식이 아니라 **화면을 묶는 시그니처 색**이다.
 * 변화는 반바지·머리칼·피부로 준다 (조끼 2벌만 다른 색으로 악센트).
 */
const PALETTES = [
  { vest: '#ff8c42', short: '#2e5972', skin: '#ffc07a', hair: '#4a3826' },
  { vest: '#ff9d52', short: '#3d8fd6', skin: '#ffbb70', hair: '#3a2a1c' },
  { vest: '#ffa832', short: '#1e3348', skin: '#f5a862', hair: '#5c422a' },
  { vest: '#ff8c42', short: '#ef4b4b', skin: '#ffbb70', hair: '#3a2a1c' },
  { vest: '#ffa832', short: '#3d8fd6', skin: '#ffc07a', hair: '#5c422a' },
  { vest: '#ff9d52', short: '#2e5972', skin: '#f5a862', hair: '#4a3826' },
  { vest: '#ffd23f', short: '#1e3348', skin: '#ffc07a', hair: '#3a2a1c' }, // 노랑 악센트
  { vest: '#ef4b4b', short: '#2e5972', skin: '#ffbb70', hair: '#4a3826' }, // 빨강 악센트(안전요원)
];
export const PALETTE_COUNT = PALETTES.length;

/** 색을 f 배 밝게 (255 클램프) */
function lighten(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.min(255, Math.round(v * f)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 색을 f 배 어둡게 — 그늘면·윤곽용 (팔레트를 늘리지 않는다) */
function dark(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 한 칸 그리기. 원점은 칸 좌상단.
 *
 * ⚠ 조끼 폭은 4px 이상을 유지할 것. 3px 이하면 픽셀화 패스의 실루엣 외곽선이
 * 양옆 컬럼을 먹어 손님이 어두운 점이 된다 (3D 인형 시절 실측한 그 함정).
 */
function drawGuest(ctx: CanvasRenderingContext2D, ox: number, oy: number,
                   p: typeof PALETTES[number], dir: Dir, frame: number): void {
  const px = (x: number, y: number, w: number, h: number, c: string): void => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y + INSET_Y, w, h);
  };
  const back = dir === 'up';
  const side = dir === 'left' || dir === 'right';

  if (dir === 'swim') {
    // 수면 위로 머리 + 조끼 어깨 + 첨벙거리는 팔만. 하반신은 물 아래
    px(3, 8, 6, 3, p.vest);
    px(3, 10, 6, 1, dark(p.vest, 0.82));
    px(1 + (frame === 1 ? 1 : 0), 8, 2, 2, dark(p.skin, 0.9));
    px(9 - (frame === 2 ? 1 : 0), 8, 2, 2, dark(p.skin, 0.9));
    px(3, 3, 6, 5, p.skin);
    px(3, 2, 6, 2, p.hair);
    px(4, 5, 1, 1, dark(p.hair, 0.7));
    px(7, 5, 1, 1, dark(p.hair, 0.7));
    // 물보라 — 손님이 '헤엄친다'고 읽히게
    px(2, 11, 8, 1, '#e8f6ff');
    return;
  }
  // 걷기 프레임 — 다리를 번갈아 반 픽셀씩. 3프레임이면 정지/왼발/오른발
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;

  // 다리
  px(4, 14, 2, 3, dark(p.skin, 0.86));
  px(6, 14, 2, 3, dark(p.skin, 0.86));
  if (step > 0) px(4, 16, 2, 1, p.short);
  if (step < 0) px(6, 16, 2, 1, p.short);
  // 반바지
  px(3, 11, 6, 3, p.short);
  px(3, 13, 6, 1, dark(p.short, 0.8));
  // 구명조끼 — 이 게임의 시그니처. 폭 6px 로 넉넉히
  px(3, 6, 6, 5, p.vest);
  px(3, 10, 6, 1, dark(p.vest, 0.82));
  px(8, 6, 1, 5, dark(p.vest, 0.88));          // 우측 그늘면
  if (!back) px(5, 7, 2, 3, dark(p.vest, 0.9)); // 앞섬 (뒤통수 방향엔 없다)
  // 팔
  px(2, 7, 1, 4, dark(p.skin, 0.9));
  px(9, 7, 1, 4, dark(p.skin, 0.9));
  // 머리
  px(3, 1, 6, 5, p.skin);
  px(8, 2, 1, 4, dark(p.skin, 0.9));
  // 머리칼 — 정수리 캡. 뒤통수는 통째로 덮는다
  px(3, 0, 6, 2, p.hair);
  if (back) {
    // 뒤통수 — 통짜로 칠하면 갈색 슬랩이 된다 (확대 실측). 정수리 하이라이트 + 목덜미로 쪼갠다
    px(3, 2, 6, 3, p.hair);
    px(4, 0, 4, 1, lighten(p.hair, 1.35));
    px(4, 5, 4, 1, dark(p.skin, 0.82));
  }
  else if (side) px(dir === 'left' ? 3 : 6, 2, 3, 2, p.hair);
  // 눈 — 정면·측면만. 1px 두 점이면 '사람'으로 읽힌다
  if (!back) {
    const eye = dark(p.hair, 0.7);
    if (side) px(dir === 'left' ? 4 : 7, 3, 1, 1, eye);
    else { px(4, 3, 1, 1, eye); px(7, 3, 1, 1, eye); }
  }
}

/**
 * 윤곽을 굽는다 — **손님끼리 겹칠 때 서로 뭉개지는 걸 막는 유일한 수단**.
 *
 * 픽셀화 패스의 실루엣 외곽선은 깊이 불연속에만 그려진다. 대기줄처럼 손님이 촘촘히
 * 겹치면 앞뒤 깊이차가 거의 없어 선이 안 생기고, 확대해 보면 주황·갈색 덩어리가 된다
 * (실측). 그래서 스프라이트 자체에 1px 윤곽을 구워 넣는다.
 *
 * ⚠ 셀 경계를 넘어가면 안 된다 — 이웃 칸의 그림에 윤곽이 새어 UV 가 어긋난 것처럼 보인다.
 */
function bakeOutline(
  ctx: CanvasRenderingContext2D, w: number, h: number, cols: number, rows: number,
): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d); // 원본 알파를 보고 판정 (윤곽이 번지지 않게)
  const cellW = w / cols, cellH = h / rows;
  const on = (x: number, y: number): boolean => src[(y * w + x) * 4 + 3]! > 128;
  const rgb = [parseInt(OUTLINE.slice(1, 3), 16), parseInt(OUTLINE.slice(3, 5), 16),
               parseInt(OUTLINE.slice(5, 7), 16)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (on(x, y)) continue;
      const cx = Math.floor(x / cellW), cy = Math.floor(y / cellH);
      let touch = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (Math.floor(nx / cellW) !== cx || Math.floor(ny / cellH) !== cy) continue; // 셀 밖
        if (on(nx, ny)) { touch = true; break; }
      }
      if (!touch) continue;
      const i = (y * w + x) * 4;
      d[i] = rgb[0]!; d[i + 1] = rgb[1]!; d[i + 2] = rgb[2]!; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export interface GuestSprites {
  mesh: THREE.InstancedMesh;
  /** (팔레트, 방향, 프레임) → 아틀라스 UV 사각형 인덱스 */
  rectIndex: (pal: number, dir: Dir, frame: number) => number;
  rects: Float32Array;
  setCount: (n: number) => void;
}

export function makeGuestSprites(camera: THREE.Camera, max: number): GuestSprites {
  // ── 아틀라스: 가로 = 방향×프레임(12칸), 세로 = 팔레트(8줄) ──
  const cols = DIRS.length * FRAMES, rows = PALETTES.length;
  const cv = document.createElement('canvas');
  cv.width = cols * W;
  cv.height = rows * H;
  const ctx = cv.getContext('2d')!;
  for (let r = 0; r < rows; r++) {
    for (let d = 0; d < DIRS.length; d++) {
      for (let f = 0; f < FRAMES; f++) {
        drawGuest(ctx, (d * FRAMES + f) * W, r * H, PALETTES[r]!, DIRS[d]!, f);
      }
    }
  }
  bakeOutline(ctx, cv.width, cv.height, cols, rows);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 씻겨 나간다
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;

  // UV 사각형 테이블 (한 번만 계산)
  const rects = new Float32Array(rows * cols * 4);
  const rectIndex = (pal: number, dir: Dir, frame: number): number =>
    (pal % rows) * cols + DIRS.indexOf(dir) * FRAMES + (frame % FRAMES);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      rects[i] = (c * W) / cv.width;
      rects[i + 1] = 1 - ((r + 1) * H) / cv.height; // 캔버스 y 는 아래로, UV 는 위로
      rects[i + 2] = W / cv.width;
      rects[i + 3] = H / cv.height;
    }
  }

  const geo = new THREE.PlaneGeometry(W * TEXEL_WORLD, H * TEXEL_WORLD);
  const aUvRect = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  aUvRect.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aUvRect', aUvRect);

  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex } },
    vertexShader: /* glsl */ `
      attribute vec4 aUvRect;
      varying vec2 vUv;
      void main() {
        vUv = aUvRect.xy + uv * aUvRect.zw;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        // alphaTest 상당 — 버려진 프래그먼트는 깊이를 안 써서 외곽선이
        // 쿼드가 아니라 **손님 모양**을 딴다 (시설 빌보드와 같은 이유)
        if (c.a < 0.5) discard;
        gl_FragColor = c;
      }`,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.count = 0;
  // 카메라 yaw·pitch 는 런타임에 안 변하므로 방향을 한 번만 굽는다
  mesh.quaternion.copy(camera.quaternion);
  // ⚠ 하지만 InstancedMesh 자체를 돌리면 인스턴스 위치까지 같이 돌아간다.
  //   위치는 월드 좌표로 넣어야 하므로 회전은 **인스턴스 행렬**에 넣는다.
  mesh.quaternion.identity();

  return { mesh, rectIndex, rects, setCount: (n) => { mesh.count = n; } };
}
