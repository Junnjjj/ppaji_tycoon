import * as THREE from 'three';
import { shoreLine } from './water.js';

/**
 * 시스템 3 — 지형. 산 겹(대기 원근), 언덕 숲, 모래사장, 하늘·구름.
 *
 * 구도는 screenY(y,z) = 0.816(y−22) − 0.578(z+6) 로 잡았다 (카메라 고정이므로 상수).
 * 화면 상단 150 기준: 능선 크레스트 118~145, 하늘은 그 위 틈. 이전 버전은 능선이
 * 화면 밖까지 솟아 민짜 띠만 보였다 — 높이·z 를 다시 계산해 배치했다.
 *
 * 원경 산은 민짜 실루엣 금지 (quality-bar): 침엽수 크레스트 요철, 대각 능선 스파인,
 * 수관 명암 대브를 CanvasTexture 로 굽는다. 색은 회록이 아니라 스틸 블루 계열 실측값.
 */

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 모래사장 — 북쪽(-z)은 직선, 남쪽(+z)은 해안 물결선. 마른 모래/젖은 모래/자갈 질감 */
export function makeSand(): THREE.Mesh {
  const N = 128;
  const northZ = -26;
  const pts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = -440 + (1020 * i) / N;
    pts.push(x, 0.15, northZ);                     // 북쪽 변
    uvs.push(i / N, 1);
    pts.push(x, 0.15, shoreLine(x) + 1.0);         // 남쪽 물가 (거품선 밑까지)
    uvs.push(i / N, 0);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  // 질감: 위(마른 모래) 밝고, 물가로 갈수록 살짝 짙게 + 드문 자갈 점
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 48;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#eccf96';
  ctx.fillRect(0, 0, 1024, 48);
  ctx.fillStyle = '#f0dcae'; // 마른 모래 (canvas 상단 = v1 = 북쪽)
  ctx.fillRect(0, 0, 1024, 18);
  ctx.fillStyle = '#e0c188'; // 물가 젖은 띠
  ctx.fillRect(0, 40, 1024, 8);
  // 젖은 모래의 하늘 반사 — 밝은 가로 대시
  for (let i = 0; i < 90; i++) {
    const x = hash(i, 51) * 1024;
    const y = 41 + hash(i, 53) * 6;
    ctx.fillStyle = hash(i, 57) < 0.6 ? '#b8e4f4' : '#f0dcae';
    ctx.fillRect(Math.floor(x), Math.floor(y), 2 + Math.floor(hash(i, 59) * 3), 1);
  }
  for (let i = 0; i < 240; i++) {
    const x = hash(i, 31) * 1024;
    const y = 6 + hash(i, 37) * 40;
    ctx.fillStyle = hash(i, 41) < 0.78 ? '#dcc088' : '#c49a6a';
    ctx.fillRect(Math.floor(x), Math.floor(y), 2, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 sRGB 값이 linear 취급돼 씻겨 나간다
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
}

/** 잔디 평지 — 모래 북쪽 (리조트 부지. 시스템 5에서 건물이 올라온다) */
export function makeGrass(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1020, 52),
    new THREE.MeshLambertMaterial({ color: '#82b258' }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(70, 0.1, -26 - 26 + 2);
  return m;
}

/** 언덕 z→표고 (트리 배치와 공유) */
export function hillHeight(x: number, z: number): number {
  const t = THREE.MathUtils.clamp((-z - 105) / 80, 0, 1);
  const bump = (hash(Math.round(x * 0.1), Math.round(z * 0.1)) - 0.5) * 2.2;
  return t * t * 26 + bump * t;
}

/** 언덕 — 완만한 융기. 위로 갈수록 숲 바닥색 (수관 사이 그늘로 읽히게) */
export function makeHill(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(1020, 120, 128, 24);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i); // plane 좌표계 (회전 전) — y 가 -z 로 감
    const z = -125 - y;
    pos.setZ(i, hillHeight(x, z));
  }
  g.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  const lo = new THREE.Color('#7cab52');
  const hi = new THREE.Color('#3d6657');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) + 20) / 80, 0, 1);
    c.lerpColors(lo, hi, Math.pow(t, 0.7));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(70, 0, -125);
  return m;
}

interface RidgeCfg {
  z: number; h: number; seed: number;
  base: string; dark: string; light: string;
  green?: string;  // 볕 받은 숲 패치 (파란 산체 위 드문 녹색 대브)
  spike: number;   // 크레스트 침엽 요철 크기 (world). 0 = 민짜 (최원경)
  detail: number;  // 내부 수관 대브 밀도 0~1
}

function ridgeCrest(x: number, h: number, seed: number): number {
  // 큰 봉우리 2~3개가 지배 — 수평 지층이 아니라 산으로 읽히게 저주파 위주
  const t = ((x + 550) / 1100) * Math.PI * 2;
  const y =
    h * 0.42 +
    Math.sin(t * 1.7 + seed * 1.3) * h * 0.34 +
    Math.sin(t * 3.9 + seed * 2.1) * h * 0.14 +
    Math.sin(t * 8.3 + seed * 3.0) * h * 0.06;
  return Math.max(h * 0.12, y);
}

/** 능선 한 겹 — 실루엣 + 숲 질감을 캔버스에 구워 알파 평면으로 세운다 */
function makeRidgeLayer(cfg: RidgeCfg): THREE.Mesh {
  const W = 1100, SCALE = 2;
  const maxH = cfg.h + cfg.spike + 4;
  const cw = W * SCALE, ch = Math.ceil(maxH * SCALE);
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d')!;
  const toCX = (x: number) => (x + 550) * SCALE;
  const toCY = (y: number) => ch - y * SCALE; // canvas 위 = 높은 곳

  // ① 실루엣 (크레스트 침엽 요철 포함) — 픽셀 계단으로
  ctx.fillStyle = cfg.base;
  ctx.beginPath();
  ctx.moveTo(0, ch);
  for (let x = -550; x <= 550; x += 0.75) {
    let y = ridgeCrest(x, cfg.h, cfg.seed);
    if (cfg.spike > 0) {
      const k = Math.floor((x + 360) / 2.2);
      y += (hash(k, cfg.seed) - 0.3) * cfg.spike;      // 나무 꼭대기 요철
      y += hash(k, cfg.seed + 5) < 0.14 ? cfg.spike * 0.9 : 0; // 드문 우뚝한 침엽
    }
    ctx.lineTo(toCX(x), toCY(y));
  }
  ctx.lineTo(cw, ch);
  ctx.closePath();
  ctx.fill();

  // ② 대각 능선 스파인 — 봉우리에서 아래로 흘러내리는 밝은 등줄기
  ctx.strokeStyle = cfg.light;
  ctx.lineWidth = SCALE;
  const spines = cfg.spike > 0 ? 7 : 0; // 최원경은 스파인 없음 — 서리 스펙클 방지
  for (let s = 0; s < spines; s++) {
    const px = -540 + hash(s, cfg.seed + 11) * 1080;
    const py = ridgeCrest(px, cfg.h, cfg.seed) - 1;
    const dir = hash(s, cfg.seed + 13) < 0.5 ? -1 : 1;
    const slope = 0.9 + hash(s, cfg.seed + 17) * 0.8;
    ctx.beginPath();
    ctx.moveTo(toCX(px), toCY(py));
    let yy = py;
    let xx = px;
    while (yy > 3) {
      xx += dir * 2.0;
      yy -= slope * 2.0 * (0.7 + hash(Math.round(xx), cfg.seed + 19) * 0.6);
      ctx.lineTo(toCX(xx), toCY(yy));
    }
    ctx.stroke();
  }

  // ③ 수관 대브 — 작은 v 삼각형. 아래로 갈수록 짙고 조밀 (계곡 그늘). 어두운 쪽이 주역
  const dabs = Math.floor(3900 * cfg.detail);
  for (let i = 0; i < dabs; i++) {
    const x = -548 + hash(i, cfg.seed + 23) * 1096;
    const crest = ridgeCrest(x, cfg.h, cfg.seed);
    const depth = Math.pow(hash(i, cfg.seed + 29), 0.7); // 0=크레스트 1=바닥
    const y = crest * (1 - depth) + 2 * depth;
    const dark = hash(i, cfg.seed + 31) < 0.62 + depth * 0.3;
    ctx.fillStyle = dark ? cfg.dark : cfg.light;
    if (cfg.green && hash(i, cfg.seed + 43) < 0.16) ctx.fillStyle = cfg.green;
    const s = (1.2 + hash(i, cfg.seed + 37) * 1.6) * SCALE;
    const cx = toCX(x), cy = toCY(y);
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s * 0.7, cy + s * 0.6);
    ctx.lineTo(cx - s * 0.7, cy + s * 0.6);
    ctx.closePath();
    ctx.fill();
  }

  // ④ 바닥 그늘 띠 — 요철 있는 어두운 하단
  ctx.fillStyle = cfg.dark;
  ctx.beginPath();
  ctx.moveTo(0, ch);
  for (let x = -550; x <= 550; x += 3) {
    const y = 2.5 + hash(Math.round(x * 0.5), cfg.seed + 41) * 2.5;
    ctx.lineTo(toCX(x), toCY(y));
  }
  ctx.lineTo(cw, ch);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 sRGB 값이 linear 취급돼 씻겨 나간다
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  // transparent:false + alphaTest — AA 반투명 픽셀이 하늘과 블렌딩돼 밝은 헤일로가
  // 생기는 것을 막는다 (알파 컷만 수행, 블렌딩 없음)
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(W, maxH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5 }),
  );
  mesh.position.set(60, maxH / 2, cfg.z);
  return mesh;
}

/** 원경 산 겹 — 3장. 뒤로 갈수록 밝고 푸르게 (대기 원근), 질감은 옅어진다 */
export function makeRidges(): THREE.Group {
  const group = new THREE.Group();
  const layers: RidgeCfg[] = [
    { z: -234, h: 34, seed: 11, base: '#7fa8c8', dark: '#6b96ba', light: '#95c2e3', spike: 0,   detail: 0.05 },
    { z: -212, h: 38, seed: 7,  base: '#4f7a9b', dark: '#3c678f', light: '#6b96ba', green: '#53684e', spike: 1.6, detail: 0.55 },
    { z: -190, h: 40, seed: 3,  base: '#3d6657', dark: '#2e4f43', light: '#53684e', spike: 3.0, detail: 1.0 },
  ];
  for (const L of layers) group.add(makeRidgeLayer(L));
  return group;
}

/** 언덕 사면 숲 — 침엽(원뿔) + 활엽(구) 혼합 인스턴싱. 민둥 언덕 금지 */
export function makeTrees(): THREE.Group {
  const group = new THREE.Group();

  interface Spot { x: number; y: number; z: number; s: number }
  const conifers: Spot[] = [];
  const broads: Spot[] = [];

  // 언덕 사면 (조밀 — 수관이 서로 겹쳐 숲 덩어리로 읽히게. 먼 쪽일수록 촘촘히)
  for (let i = 0; i < 1900; i++) {
    const x = 70 + (hash(i, 1) - 0.5) * 1000;
    const far = Math.pow(hash(i, 2), 0.62); // 0=평지 쪽, 1=능선 쪽 — 먼 쪽 편중
    const z = -74 - far * 108; // -74 ~ -182
    if (Math.abs(x) < 56 && z > -140) continue; // 본관·진입로 부지 — 숲은 뒤·옆만
    const y = hillHeight(x, z) * 0.95;
    const s = 0.75 + hash(i, 9) * 0.75;
    if (hash(i, 3) < 0.58) conifers.push({ x, y, z, s });
    else {
      broads.push({ x, y, z, s });
      // 40%는 곁블롭을 붙여 뭉친 수관으로
      if (hash(i, 4) < 0.4) broads.push({ x: x + 2.6, y: y - 0.4, z: z + 0.8, s: s * 0.7 });
    }
  }
  // 평지 가장자리 (드문)
  for (let i = 0; i < 130; i++) {
    if (hash(i, 7) < 0.35) continue;
    const x = 70 + (hash(i, 5) - 0.5) * 980;
    if (x > -80 && x < 92) continue; // 서비스열 부지
    const z = -34 - hash(i, 6) * 40;
    broads.push({ x, y: 0, z, s: 0.8 + hash(i, 8) * 0.5 });
    if (hash(i, 21) < 0.5) conifers.push({ x: x + 6, y: 0, z: z - 4, s: 0.7 + hash(i, 22) * 0.5 });
  }

  const trunkMat = new THREE.MeshLambertMaterial({ color: '#70522e' });
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  const CONIF = ['#2e4f43', '#3d6657', '#4e7a3c', '#3d6657'];
  const BROAD = ['#4e7a3c', '#5c8f3f', '#6fa04b', '#7faa55'];

  // 침엽 — 뾰족한 원뿔 (픽셀화 후 quality-bar 의 스파이크 숲 질감)
  const coneGeo = new THREE.ConeGeometry(2.3, 7.5, 6);
  const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), conifers.length);
  conifers.forEach((t, i) => {
    const sy = t.s * (0.95 + hash(i, 12) * 0.5);
    m.compose(
      new THREE.Vector3(t.x, t.y + 3.75 * sy, t.z),
      q.identity(),
      new THREE.Vector3(t.s, sy, t.s),
    );
    cones.setMatrixAt(i, m);
    color.set(CONIF[Math.floor(hash(i, 14) * CONIF.length)]!);
    if (hash(i, 15) < 0.18) color.set('#7faa55'); // 볕 받은 나무
    cones.setColorAt(i, color);
  });

  // 활엽 — 둥근 수관 + 줄기
  const canopyGeo = new THREE.SphereGeometry(3.2, 8, 6);
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 2.6, 5);
  const canopy = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), broads.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, broads.length);
  broads.forEach((t, i) => {
    // 비균일 스케일 + 요 회전 — 균일 원형 "버블랩" 실루엣을 깬다
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, 11) * Math.PI);
    m.compose(
      new THREE.Vector3(t.x, t.y + 4.1 * t.s, t.z),
      q,
      new THREE.Vector3(
        t.s * (0.85 + hash(i, 17) * 0.5),
        t.s * (0.8 + hash(i, 10) * 0.45),
        t.s * (0.85 + hash(i, 18) * 0.5),
      ),
    );
    canopy.setMatrixAt(i, m);
    color.set(BROAD[Math.floor(hash(i, 16) * BROAD.length)]!);
    canopy.setColorAt(i, color);
    m.compose(
      new THREE.Vector3(t.x, t.y + 1.3 * t.s, t.z),
      q.identity(),
      new THREE.Vector3(t.s, t.s, t.s),
    );
    trunks.setMatrixAt(i, m);
  });

  for (const im of [cones, canopy, trunks]) im.instanceMatrix.needsUpdate = true;
  if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  group.add(cones, canopy, trunks);
  return group;
}

/** 하늘 배경판 + 뭉게구름. 가시 하늘 띠는 z=-300 기준 y −64~0 근방 (구도 상수 참조) */
export function makeSky(): THREE.Group {
  const group = new THREE.Group();
  const g = new THREE.PlaneGeometry(1500, 130, 1, 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const lo = new THREE.Color('#a8dcf0'); // 능선 근처 (지평선 광)
  const hi = new THREE.Color('#6aa2dd'); // 상단 — 여름 한낮 블루
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) + 65) / 100, 0, 1);
    c.lerpColors(lo, hi, Math.pow(t, 1.25));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }));
  sky.position.set(60, -10, -300);
  group.add(sky);

  // 뭉게구름 — 윗면 둥글고 밑면 평평 (블롭 + 하단 슬래브)
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const underMat = new THREE.MeshBasicMaterial({ color: '#e8f4f8' });
  const defs: Array<[number, number, number]> = [[-44, -16, 1.25], [8, -10, 0.85], [50, -19, 1.5]];
  for (const [cx, cy, cs] of defs) {
    const cloud = new THREE.Group();
    const blobs: Array<[number, number]> = [[0, 6.5], [5.5, 5.0], [-5.5, 4.6], [10.5, 3.4], [-10, 3.2]];
    for (const [bx, br] of blobs) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(br, 10, 7), cloudMat);
      b.scale.set(1, 0.62, 0.8);
      b.position.set(bx, br * 0.28, 0);
      cloud.add(b);
    }
    const under = new THREE.Mesh(new THREE.BoxGeometry(26, 1.6, 4), underMat);
    under.position.set(0, -0.8, 0);
    cloud.add(under);
    cloud.scale.setScalar(cs);
    cloud.position.set(cx, cy, -295);
    cloud.name = 'cloud';
    group.add(cloud);
  }
  return group;
}


/** 잔디 꽃 점 + 해변 수건·파라솔 — 픽셀 1~2개짜리 색 점들이 잔디를 살린다 */
export function makeDeco(): THREE.Group {
  const g = new THREE.Group();
  const COLORS = ['#e089b8', '#f2b53f', '#ffffff', '#ef4b4b'];
  const mats = COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const geo = new THREE.SphereGeometry(0.55, 5, 4);
  let placed = 0;
  for (let i = 0; i < 220 && placed < 70; i++) {
    const x = -100 + hash(i, 61) * 560;
    const z = -30 - hash(i, 62) * 44;
    if (x > -52 && x < 94 && z < -34 && z > -54) continue; // 보드워크 부지
    if (hash(i, 63) < 0.55) continue;
    const f = new THREE.Mesh(geo, mats[Math.floor(hash(i, 64) * mats.length)]!);
    f.position.set(x, 0.5, z);
    g.add(f);
    placed++;
  }
  // 해변 수건 3 + 파라솔 1
  const TOWELS: Array<[number, number, number, string]> = [
    [-8, -14, 0.3, '#ef4b4b'], [26, -10, -0.2, '#3d8fd6'], [58, -16, 0.5, '#f2b53f'],
  ];
  for (const [tx, tz, rot, col] of TOWELS) {
    const towel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 2.6), new THREE.MeshLambertMaterial({ color: col }));
    towel.position.set(tx, 0.35, tz);
    towel.rotation.y = rot;
    g.add(towel);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5.5, 5), new THREE.MeshLambertMaterial({ color: '#9a744a' }));
  pole.position.set(40, 2.8, -13);
  const top = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.6, 8), new THREE.MeshLambertMaterial({ color: '#ef4b4b' }));
  top.position.set(40, 6.0, -13);
  const top2 = new THREE.Mesh(new THREE.ConeGeometry(4.65, 1.2, 8), new THREE.MeshLambertMaterial({ color: '#f2f4f0' }));
  top2.position.set(40, 5.35, -13);
  g.add(pole, top, top2);
  return g;
}
