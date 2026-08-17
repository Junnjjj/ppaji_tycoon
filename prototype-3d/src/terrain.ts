import * as THREE from 'three';
import { shoreLine, shoreDist } from './water.js';
import { makeSpriteInstances } from './sprite-instances.js';

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

/**
 * 해안선으로부터의 거리 밴드 (음수 = 뭍). 지형·숲·모래·수심이 **전부 이 표를 따른다.**
 * 해안선이 기울어졌으므로 z 를 직접 쓰면 안 된다 — 숲이 한쪽에만 남는다.
 */
export const BAND = {
  hillFar: -300,   // 이보다 멀면 배경
  hillNear: -38,   // 잔디 끝 = 숲 시작 (yaw20 z 예산표)
  grassNear: -14,  // 흙마당 뒤끝
  sand: 0,         // 모래사장
};

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}


/**
 * 도트 단위 표면 질감 타일.
 *
 * ⚠ 레퍼런스와 우리 화면을 도트 격자로 재보면 결정적 차이가 여기 있다:
 *   레퍼런스 — 도트 경계율 66% · 최장 평탄 런 1도트 (**단색 면이 아예 없다**)
 *   우리(질감 전) — 39.5% · 최장 런 28도트 (잔디 한 색이 화면의 20%)
 * 손도트가 빽빽해 보이는 건 지오메트리가 많아서가 아니라 **모든 도트가 질감을 지녀서**다.
 * 그래서 큰 단색 면에는 반드시 이 타일을 깐다.
 *
 * 화면 지터가 아니라 **월드 공간 텍스처**여야 한다 — 카메라가 움직여도 얼룩이
 * 기어다니지 않는다. `worldPerTexel` 로 도트 1~2개 크기에 맞춘다.
 */
export function speckleTexture(
  base: string,
  dots: Array<[string, number]>,
  tile = 32,
  salt = 0,
): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = tile; cv.height = tile;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, tile, tile);
  for (const [color, ratio] of dots) {
    ctx.fillStyle = color;
    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        if (hash(x + salt * 97, y + salt * 131 + color.length * 13) < ratio) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 씻겨 나간다 (실측 함정)
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** 월드 크기 w×d 면에 도트 크기에 맞춰 타일을 깐다 (텍셀이 월드에서 정사각이 되게) */
export function tileRepeat(tex: THREE.CanvasTexture, w: number, d: number, worldPerTexel = 1.1, tile = 32): void {
  tex.repeat.set(w / (tile * worldPerTexel), d / (tile * worldPerTexel));
}

/** 모래사장 — 북쪽(-z)은 직선, 남쪽(+z)은 해안 물결선. 마른 모래/젖은 모래/자갈 질감 */
export function makeSand(): THREE.Mesh {
  const N = 128;
  // 북쪽 경계도 해안선을 따라 기울어야 한다 (고정 z 면 모래 폭이 들쭉날쭉해진다)
  const pts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = -1800 + (3600 * i) / N;
    pts.push(x, 0.15, shoreLine(x) + BAND.grassNear); // 북쪽 변 (해안 평행)
    uvs.push(i / N, 1);
    // 물쪽 끝을 +13 까지 — 흙마당(앞선 d +12)이 **뻘 위에** 앉아야 판때기로 안 보인다
    pts.push(x, 0.15, shoreLine(x) + 13.0);
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

  // 질감: 한국 강변 — 모래사장이 아니다. 잔디가 흙길로 바래고, 물가는 젖은 흙+자갈.
  // (모래사장은 열대 리조트로 읽혀 "전혀 한국같지 않다"의 두 번째 주범이었다)
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 48;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#7faa55';                     // 기본: 잔디 연장
  ctx.fillRect(0, 0, 1024, 48);
  ctx.fillStyle = '#c49a6a';                     // 물가 쪽 흙 띠
  ctx.fillRect(0, 26, 1024, 22);
  ctx.fillStyle = '#8a6a3e';                     // 젖은 흙 (수면 접선)
  ctx.fillRect(0, 42, 1024, 6);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 1024; x++) {
      const h = hash(x * 1.7 + 11, y * 2.3 + 7);
      if (y < 22) {                              // 잔디 결 + 맨흙 패치
        if (h < 0.18) ctx.fillStyle = '#6b9a46';
        else if (h < 0.28) ctx.fillStyle = '#8fbc62';
        else if (h < 0.31 && y > 12) ctx.fillStyle = '#b5844a';
        else continue;
      } else if (y < 42) {                       // 흙길 — 자갈 점점이
        if (h < 0.16) ctx.fillStyle = '#b2a99a';
        else if (h < 0.24) ctx.fillStyle = '#c4b7a7';
        else if (h < 0.38) ctx.fillStyle = '#b5844a';
        else continue;
      } else {                                   // 젖은 띠 — 어두운 자갈
        if (h < 0.3) ctx.fillStyle = '#70522e';
        else if (h < 0.4) ctx.fillStyle = '#b2a99a';
        else continue;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 sRGB 값이 linear 취급돼 씻겨 나간다
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
}

/** 잔디 평지 — 모래 북쪽 (리조트 부지. 시스템 5에서 건물이 올라온다) */
export function makeGrass(): THREE.Mesh {
  // ⚠ 예전엔 고정 z 의 평면 하나였다. 해안선을 기울이자 잔디만 수평으로 남아
  //   모래·물과 어긋났다. 해안선을 따라가는 **띠**로 만든다 (모래와 같은 방식).
  const tex = speckleTexture('#82b258', [
    ['#76a44e', 0.32],  // 그늘 결
    ['#8fbc62', 0.22],  // 밝은 결
    ['#6b9a46', 0.10],  // 짙은 덤불 점
    ['#9fc973', 0.06],  // 마른 풀 하이라이트
    ['#5c8a40', 0.04],  // 흙 비침
  ], 32, 3);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;

  const N = 128;
  const pts: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = -1800 + (3600 * i) / N;
    const s = shoreLine(x);
    pts.push(x, 0.1, s + BAND.hillNear - 100); // 땅끝 −138 까지 (숲 아래 지면)
    uvs.push((x / 1.1) / 32, 0);
    pts.push(x, 0.1, s + BAND.grassNear);
    uvs.push((x / 1.1) / 32, (BAND.grassNear - BAND.hillNear) / 1.1 / 32);
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
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
}

/** 언덕 z→표고 (트리 배치와 공유) */
export function hillHeight(x: number, z: number): number {
  // ⚠ 높이 26 은 화면 상단을 통째로 덮어 **강 건너편 배경막(펜션·다리)을 가렸다**.
  //   낮은 강변 둔덕(8)으로 낮추면 능선 위로 건너편이 보인다 — "호수가 아니라 강".
  const t = THREE.MathUtils.clamp((-shoreDist(x, z) - 105) / 80, 0, 1);
  // ⚠ 융기 2.2 는 깊이 2차미분을 크리즈 임계 너머로 밀어서 잔디에 **검은 대시
  //   아티팩트**를 흩뿌렸다 (외곽선 패스가 지형 요철을 모서리로 오인). 0.7 이 상한.
  const bump = (hash(Math.round(x * 0.1), Math.round(z * 0.1)) - 0.5) * 0.7;
  return t * t * 8 + bump * t;
}

/** 언덕 — 완만한 융기. 위로 갈수록 숲 바닥색 (수관 사이 그늘로 읽히게) */
export function makeHill(): THREE.Mesh {
  // ⚠ 예전엔 1020×120 축 정렬 평면이었다. 해안선을 기울인 뒤 이 띠 **너머로 물 평면이
  //   비쳐서** 가로 화면 오른쪽 위가 통째로 물이 됐다. 뭍 쪽으로 크게 잡는다 (d −84 ~ −1400).
  // ⚠ 뒤끝이 핵심이다. 언덕을 낮춰도 땅 평면이 뒤로 길게 이어지면 화면 상단을
  //   어차피 덮는다 (실측). 땅은 −260 에서 **끝나야** 그 너머로 배경막(강 건너편)이 보인다.
  /**
   * ⚠ yaw20 은 z 예산이 빡빡하다 (줌 1.4 에서 화면 위 한계 = 타깃 z − 203).
   * 물가0 → 잔디 −38 → 숲 −88 → **땅끝 −138** → 뒷강 −164 → 마을벽 −172 → 산벽 −184.
   * 숲을 넓히면 배경이 화면 밖으로 밀린다 (실측 1회) — 예산표를 지킬 것.
   */
  const HILL_CENTER_D = -63; // 스팬 −38..−88 (깊이 50)
  const g = new THREE.PlaneGeometry(3600, 50, 220, 10);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const lo = new THREE.Color('#82b258'); // 잔디 띠(makeGrass) 기본색과 동일해야 경계 밴드가 안 생긴다
  const hi = new THREE.Color('#3d6657');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y0 = pos.getY(i); // 회전 전 평면 좌표 — 회전 후 world z = position.z − y
    // 발자국도 해안선을 따라 기울인다 (높이만 기울이면 축 정렬 초록 사각형이 남는다)
    const y = y0 - shoreLine(x);
    pos.setY(i, y);
    pos.setZ(i, hillHeight(x, HILL_CENTER_D - y));

    // ⚠ 색 램프는 **원래 y0** 로 계산해야 한다. 기울인 뒤의 y 는 shoreLine(x) 가 섞여
    //   있어서(x ±1800 이면 ±2700) 램프가 통째로 망가진다 — 언덕이 단색이 됐던 이유.
    //   해안 거리 d = HILL_CENTER_D − y0 이므로 y0 하나로 결정된다.
    const d = HILL_CENTER_D - y0;
    const t = THREE.MathUtils.clamp((-d - 100) / 150, 0, 1);
    c.lerpColors(lo, hi, Math.pow(t, 0.7));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // ⚠ 버텍스 램프만 있으면 넓은 그라데이션 밴드가 그대로 보인다 ("질감이 밋밋하다" 판정).
  //   흰색 기반 명암 결 텍스처를 **곱해서** 램프 색상은 유지하고 결만 얹는다.
  // ⚠ 진폭 주의: ×0.82 급 회색 점은 초록과 곱해져 **채도가 빠진 색**을 만들고,
  //   양자화가 그걸 회색(석재·산 계열)으로 스냅해 잔디에 회색 얼룩이 번졌다 (이분 탐색으로
  //   언덕 재질 확정). ×0.94 이내라야 같은 초록 버킷에 머문다.
  const grain = speckleTexture('#ffffff', [
    ['#f4f4f4', 0.28],
    ['#ececec', 0.14],
    ['#e2e2e2', 0.04],
  ], 32, 7);
  grain.repeat.set(3600 / (32 * 1.1), 1316 / (32 * 1.1));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: grain }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0, HILL_CENTER_D);
  m.frustumCulled = false; // 기울여서 바운딩박스가 커졌다
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
/**
 * 숲 — 픽셀 나무 빌보드 2천 그루.
 *
 * 예전엔 원뿔·구 InstancedMesh 였다. 건물·손님이 스프라이트가 되자 숲만 매끈한
 * 덩어리로 남아 화면 위쪽 절반이 통째로 이질적이었다 (Stage 2 실측).
 * 배치 로직(먼 쪽 편중·본관 부지 회피)은 그대로 두고 **그리는 것만** 바꾼다.
 *
 * 나무 아틀라스가 없으면 조용히 빈 그룹을 돌려준다 — 스프라이트는 선택 자산이다.
 */
export function makeTrees(camera: THREE.Camera): THREE.Group {
  const group = new THREE.Group();

  interface Spot { x: number; y: number; z: number; s: number; v: number }
  const spots: Spot[] = [];

  // 언덕 사면 (조밀 — 수관이 서로 겹쳐 숲 덩어리로 읽히게. 먼 쪽일수록 촘촘히)
  for (let i = 0; i < 3000; i++) {
    const x = (hash(i, 1) - 0.5) * 3400;
    const far = Math.pow(hash(i, 2), 0.62); // 0=평지 쪽, 1=능선 쪽 — 먼 쪽 편중
    const d = BAND.hillNear - 2 - far * 46;    // 숲 밴드 −40..−86 안쪽
    const z = shoreLine(x) + d;
    if (Math.abs(x) < 56 && d > -150) continue; // 본관·진입로 부지 — 숲은 뒤·옆만
    const y = hillHeight(x, z) * 0.95;
    spots.push({ x, y, z, s: 0.8 + hash(i, 9) * 0.6, v: Math.floor(hash(i, 3) * 3) });
  }
  // 평지 가장자리 (드문)
  for (let i = 0; i < 420; i++) {
    if (hash(i, 7) < 0.35) continue;
    const x = (hash(i, 5) - 0.5) * 3400;
    if (x > -80 && x < 92) continue; // 서비스열 부지
    const z = shoreLine(x) + BAND.grassNear - 10 - hash(i, 6) * 40;
    spots.push({ x, y: 0, z, s: 0.85 + hash(i, 8) * 0.45, v: Math.floor(hash(i, 21) * 3) });
  }

  // 뒤에서 앞으로 정렬 — 알파 컷이라 깊이는 맞지만 그리기 순서가 안정적이어야
  // 같은 z 에서 깜빡이지 않는다
  spots.sort((a, b) => a.z - b.z);

  const TREE_CELL_W = 22, TREE_CELL_H = 20, TREE_VARIANTS = 3;
  const tex = new THREE.TextureLoader().load('/sprites/tree-atlas.png');
  const inst = makeSpriteInstances(
    tex, TREE_CELL_W, TREE_CELL_H, TREE_VARIANTS, 1, spots.length, camera,
  );
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  spots.forEach((t, i) => {
    pos.set(t.x, t.y, t.z).addScaledVector(inst.groundLift, t.s);
    scl.set(t.s, t.s, t.s);
    m.compose(pos, inst.billboard, scl);
    inst.mesh.setMatrixAt(i, m);
    const r = inst.rectAt(t.v % TREE_VARIANTS, 0);
    inst.uv.setXYZW(i, r[0], r[1], r[2], r[3]);
  });
  inst.setCount(spots.length);
  inst.mesh.instanceMatrix.needsUpdate = true;
  inst.uv.needsUpdate = true;
  group.add(inst.mesh);
  return group;
}

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
    const x = -900 + hash(i, 61) * 1800;
    const d = -6 - hash(i, 62) * 44;
    const z = shoreLine(x) + d;
    if (x > -52 && x < 94 && d < -10 && d > -30) continue; // 보드워크 부지
    if (hash(i, 63) < 0.55) continue;
    const f = new THREE.Mesh(geo, mats[Math.floor(hash(i, 64) * mats.length)]!);
    f.position.set(x, 0.5, z);
    g.add(f);
    placed++;
  }
  // 해변 수건 3 + 파라솔 1
  const TOWELS: Array<[number, number, number, string]> = [
    // 물가선이 −60 으로 옮겨져 모래 밴드는 z −84..−60 이다 (옛 좌표는 물 위에 떴다)
    [-8, -72, 0.3, '#ef4b4b'], [26, -68, -0.2, '#3d8fd6'], [58, -76, 0.5, '#f2b53f'],
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
