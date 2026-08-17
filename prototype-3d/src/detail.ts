import * as THREE from 'three';
import { shadedBox } from './shade.js';
import { LOGICAL_W } from './pixelate.js';

/**
 * 공용 디테일 부품 — **에셋마다 손으로 다듬지 않기 위한** 라이브러리.
 *
 * 레퍼런스가 통일감 있어 보이는 진짜 이유는 손맛이 아니라 **같은 모티프의 반복**이다:
 * 같은 창, 같은 난간, 같은 기와줄이 건물마다 되풀이된다. 그래서 디테일은 건물별로
 * 그리지 않고 여기 부품을 조합해서 만든다 — 부품 하나를 고치면 전 건물이 같이 좋아진다.
 *
 * 모든 부품은 `shadedBox` 를 쓴다 (페이스 셰이딩 일관성). 재질은 Lambert 로 두고
 * 씬에 붙인 뒤 `applyToon()` 이 툰으로 바꾼다.
 */

/** 화면 가로가 담는 월드 폭 (VIEW_H 308 × aspect 393/852) */
const VIEW_W_WORLD = 142;
/** 논리픽셀 1개 = 월드 몇 단위인가 */
export const WORLD_PER_PX = VIEW_W_WORLD / LOGICAL_W;
/**
 * 읽히는 최소 디테일 크기 — 2 논리픽셀.
 * ⚠ 이보다 작은 것을 넣으면 디테일이 아니라 **노이즈**다. 부품이 알아서 이 값으로 올린다.
 */
export const MIN_DETAIL = WORLD_PER_PX * 2;

const atLeast = (v: number): number => Math.max(v, MIN_DETAIL);

export const PALETTE = {
  glass: '#38628d',
  glassLit: '#4a7ba8',
  frame: '#f4ebda',
  wood: '#c49a6a',
  woodDark: '#8a6a3e',
  cream: '#f0e3c6',
  creamShade: '#d8c6a4',
  stone: '#b2a99a',
  leaf: '#4e7a3c',
  red: '#e0604f',
  yellow: '#f2b53f',
} as const;

/**
 * 창문 줄 — 유리 스트립 + 흰 멀리언 + 창턱.
 * 레퍼런스 건물의 가장 강한 반복 모티프. 벽 하나에 이거 한 줄이면 "건물"로 읽힌다.
 */
export function windowRow(width: number, height: number, count: number, lit = false): THREE.Group {
  const g = new THREE.Group();
  const h = atLeast(height);
  const glass = shadedBox(width, h, atLeast(0.5), lit ? PALETTE.glassLit : PALETTE.glass);
  g.add(glass);
  // 멀리언은 창을 "여러 개"로 읽히게 하는 핵심 — 개수는 폭에서 자동으로 정한다
  const n = Math.max(1, Math.min(count, Math.floor(width / (MIN_DETAIL * 2.2))));
  for (let i = 1; i < n; i++) {
    const mull = shadedBox(atLeast(0.45), h, atLeast(0.6), PALETTE.frame);
    mull.position.x = -width / 2 + (width * i) / n;
    g.add(mull);
  }
  const sill = shadedBox(width + MIN_DETAIL, atLeast(0.5), atLeast(0.7), PALETTE.frame);
  sill.position.y = -h / 2 - MIN_DETAIL * 0.2;
  g.add(sill);
  return g;
}

/** 흰 난간 — 기둥 + 윗레일. 테라스·데크·계단 어디에나 붙는다 */
export function railing(len: number, axis: 'x' | 'z' = 'x', h = 2.4): THREE.Group {
  const g = new THREE.Group();
  const t = atLeast(0.5);
  const rail = shadedBox(axis === 'x' ? len : t, t, axis === 'x' ? t : len, PALETTE.frame);
  rail.position.y = h;
  g.add(rail);
  const n = Math.max(2, Math.round(len / (MIN_DETAIL * 5)));
  for (let i = 0; i <= n; i++) {
    const post = shadedBox(t, h, t, PALETTE.frame);
    const off = -len / 2 + (len * i) / n;
    post.position.set(axis === 'x' ? off : 0, h / 2, axis === 'x' ? 0 : off);
    g.add(post);
  }
  return g;
}

/**
 * 박공지붕 디테일 — 용마루 + 처마 + 기와줄.
 *
 * ⚠ 이 부품은 **지붕 프리즘과 같은 인자**(w, h, d)를 받아야 한다. 처음엔 평면 기와줄을
 * 만들어 지붕 위 고정 높이에 얹었는데, 경사면을 뚫고 나와 "지붕에 얹힌 검은 덩어리"로
 * 읽혔다. 경사면 위에 눕히려면 지붕의 기울기를 알아야 한다.
 *
 * 원점은 지붕 밑변(=벽 윗면) 한가운데. 마루는 +y 쪽, 처마는 ±x 끝.
 */
export function gableRoofDetail(w: number, h: number, d: number, color: string, rows = 2): THREE.Group {
  const g = new THREE.Group();
  const slope = Math.atan2(h, w / 2); // 경사각
  // ⚠ 색차를 세게 주면 320 논리폭에서 기와가 아니라 **얼룩**으로 양자화된다 (실측).
  // 0.86 은 초록 지붕에서 노이즈로 보였다 → 0.92.
  const shade = darken(color, 0.92);

  // 용마루 — 실루엣의 윗선을 또렷하게 만든다
  const ridge = shadedBox(atLeast(1.0), atLeast(0.7), d + MIN_DETAIL, darken(color, 0.82));
  ridge.position.y = h;
  g.add(ridge);

  // 처마 — 벽보다 튀어나온 밑선. 건물이 "덮여 있다"고 읽히는 핵심
  for (const sx of [-1, 1]) {
    const eave = shadedBox(atLeast(1.2), atLeast(0.6), d + MIN_DETAIL * 1.6, PALETTE.creamShade);
    eave.position.set((sx * w) / 2, atLeast(0.2), 0);
    g.add(eave);
  }

  // 기와줄 — 경사면 위에 눕힌다. 면과 같은 높이면 z-fighting 처럼 지글거려서
  // 법선 방향으로 반 두께만큼 **밖으로 밀어** 확실히 튀어나오게 한다.
  const n = Math.max(1, Math.min(rows, Math.floor(w / (MIN_DETAIL * 6))));
  const th = atLeast(0.45);
  for (const sx of [-1, 1]) {
    const nx = sx * Math.sin(slope), ny = Math.cos(slope); // 경사면 바깥 법선
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const band = shadedBox(atLeast(0.6), th, d, shade);
      band.position.set(sx * (w / 2) * (1 - t) + nx * th * 0.5, h * t + ny * th * 0.5, 0);
      band.rotation.z = sx > 0 ? -slope : slope;
      g.add(band);
    }
  }
  return g;
}

/** 색을 f 배로 어둡게 — 부품 안에서 "같은 색의 그늘"을 만들 때 (팔레트가 늘지 않는다) */
function darken(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 기단 — 건물 밑에 까는 살짝 넓은 어두운 판.
 * 3/4 부감에서 건물이 잔디에 "떠 있어" 보이는 걸 이거 하나가 해결한다.
 */
export function plinth(width: number, depth: number): THREE.Mesh {
  const m = shadedBox(width + MIN_DETAIL * 2, atLeast(0.7), depth + MIN_DETAIL * 2, PALETTE.stone);
  m.position.y = atLeast(0.35);
  return m;
}

/** 코니스 — 벽과 지붕 사이 띠. 이거 하나로 건물이 "지어진" 느낌이 난다 */
export function cornice(width: number, depth: number, color: string = PALETTE.creamShade): THREE.Mesh {
  return shadedBox(width + MIN_DETAIL, atLeast(0.6), depth + MIN_DETAIL, color);
}

/** 문 — 문짝 + 프레임 + 계단 한 칸 */
export function door(width: number, height: number, color: string = PALETTE.woodDark): THREE.Group {
  const g = new THREE.Group();
  const w = atLeast(width), h = atLeast(height);
  const frame = shadedBox(w + MIN_DETAIL * 0.6, h + MIN_DETAIL * 0.4, atLeast(0.4), PALETTE.frame);
  const leaf = shadedBox(w, h, atLeast(0.6), color);
  leaf.position.z = MIN_DETAIL * 0.15;
  const step = shadedBox(w + MIN_DETAIL, atLeast(0.4), atLeast(0.8), PALETTE.stone);
  step.position.y = -h / 2 - MIN_DETAIL * 0.2;
  step.position.z = MIN_DETAIL * 0.4;
  g.add(frame, leaf, step);
  return g;
}

/** 화분 — 나무통 + 덤불 + 꽃점. 레퍼런스 테라스에 줄줄이 있다 */
export function planter(seed = 0): THREE.Group {
  const g = new THREE.Group();
  const box = shadedBox(atLeast(1.6), atLeast(0.9), atLeast(1.2), PALETTE.woodDark);
  const bush = new THREE.Mesh(
    new THREE.SphereGeometry(atLeast(0.9), 6, 5),
    new THREE.MeshLambertMaterial({ color: PALETTE.leaf }),
  );
  bush.scale.y = 0.7;
  bush.position.y = atLeast(0.8);
  g.add(box, bush);
  const flowerColors = ['#ef4b4b', '#ff8c42', '#e089b8'];
  const fl = new THREE.Mesh(
    new THREE.SphereGeometry(atLeast(0.35), 5, 4),
    new THREE.MeshLambertMaterial({ color: flowerColors[seed % 3]! }),
  );
  fl.position.set(atLeast(0.3), atLeast(1.2), atLeast(0.2));
  g.add(fl);
  return g;
}

/** 줄무늬 차양 — 매점·카페의 얼굴 */
export function awning(width: number, depth: number, a: string = PALETTE.red, b = '#f7f0dd'): THREE.Group {
  const g = new THREE.Group();
  const stripes = Math.max(2, Math.floor(width / (MIN_DETAIL * 1.6)));
  const sw = width / stripes;
  for (let i = 0; i < stripes; i++) {
    const s = shadedBox(sw * 0.98, atLeast(0.5), depth, i % 2 ? b : a);
    s.position.x = -width / 2 + sw * (i + 0.5);
    g.add(s);
  }
  g.rotation.x = 0.34;
  return g;
}

/** 계단 — n 칸 */
export function steps(width: number, count = 4, rise = 0.9, run = 1.1): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const st = shadedBox(width, atLeast(rise), atLeast(run), PALETTE.stone);
    st.position.set(0, atLeast(rise) * (i + 0.5), atLeast(run) * (count - i));
    g.add(st);
  }
  return g;
}

/** 간판 — 벽에 붙는 색 판 (글자는 논리폭에서 못 읽으니 색면으로) */
export function signboard(width: number, color: string = PALETTE.red): THREE.Group {
  const g = new THREE.Group();
  const board = shadedBox(atLeast(width), atLeast(1.4), atLeast(0.5), color);
  const trim = shadedBox(atLeast(width) + MIN_DETAIL * 0.5, atLeast(0.35), atLeast(0.6), PALETTE.frame);
  trim.position.y = -atLeast(0.85);
  g.add(board, trim);
  return g;
}

/** 지붕 위 잡물 — 굴뚝·환기구. 실루엣에 변화를 준다 */
export function roofProp(kind: 'chimney' | 'vent' = 'chimney'): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'chimney') {
    const body = shadedBox(atLeast(1.2), atLeast(3.0), atLeast(1.2), PALETTE.stone);
    const cap = shadedBox(atLeast(1.6), atLeast(0.5), atLeast(1.6), PALETTE.creamShade);
    cap.position.y = atLeast(1.7);
    g.add(body, cap);
  } else {
    const box = shadedBox(atLeast(1.6), atLeast(1.0), atLeast(1.2), '#a0947e');
    g.add(box);
  }
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
// 테라스 건축 부품 — 레퍼런스 본관 크롭(shots/ref/lodge.png)에서 역설계한 것들.
//
// 크롭을 보고 안 것: 레퍼런스 본관은 "디테일 많은 오두막"이 아니라 **적층 테라스**다.
// 아래층 지붕이 곧 위층 데크가 되고, 그 가장자리마다 흰 난간과 화분이 둘리고,
// 외부 계단이 층을 잇는다. 이 구조가 없으면 부품을 아무리 붙여도 안 닮는다.
// ─────────────────────────────────────────────────────────────────────────────

export interface TerraceLevel {
  /** 폭·깊이·벽 높이 */
  w: number; d: number; h: number;
  /** 이 층이 아래층보다 +z 쪽으로 얼마나 물러나는가 (노출된 띠가 데크가 된다) */
  setback: number;
  wall?: string;
  /** 데크 난간에 화분을 몇 개 놓을지 (0 = 안 놓음) */
  planters?: number;
}

/**
 * 적층 테라스 — 층을 쌓고, **아래층 지붕 중 노출된 띠를 데크로 마감한다**.
 * 반환 그룹의 원점은 1층 바닥 한가운데(y=0).
 */
export function terraceStack(levels: TerraceLevel[]): THREE.Group {
  const g = new THREE.Group();
  let y = 0;
  let prev: TerraceLevel | null = null;

  for (const lv of levels) {
    // 앞층에서 물러난 만큼 중심도 -z 로 밀린다 (전면을 기준으로 후퇴)
    const cz = prev ? -lv.setback / 2 : 0;

    const wall = shadedBox(lv.w, lv.h, lv.d, lv.wall ?? PALETTE.cream);
    wall.position.set(0, y + lv.h / 2, cz);
    g.add(wall);

    const co = cornice(lv.w, lv.d);
    co.position.set(0, y + lv.h, cz);
    g.add(co);

    // 노출된 아래층 지붕 = 데크. 난간 + 화분으로 마감해야 "테라스"로 읽힌다
    if (prev) {
      const deckZ = lv.d / 2 + cz + lv.setback / 2;
      const rail = railing(prev.w * 0.96, 'x', atLeast(1.8));
      rail.position.set(0, y, deckZ);
      g.add(rail);
      const n = lv.planters ?? 0;
      for (let i = 0; i < n; i++) {
        const pl = planter(i);
        pl.position.set(prev.w * (-0.4 + (0.8 * i) / Math.max(1, n - 1)), y + MIN_DETAIL * 0.4, deckZ - MIN_DETAIL);
        g.add(pl);
      }
    }

    y += lv.h;
    prev = lv;
  }
  return g;
}

/**
 * 외부 계단 — 층과 층을 잇는다. 원점은 아래쪽 발치.
 * `steps()` 는 칸 수만 받아서 높이를 못 맞춘다. 여기선 **올라야 할 높이에서 칸 수를 역산**한다.
 */
export function exteriorStair(width: number, rise: number, run = 1.4): THREE.Group {
  const g = new THREE.Group();
  const stepH = atLeast(0.9);
  const count = Math.max(2, Math.round(rise / stepH));
  const stepR = atLeast(run);
  for (let i = 0; i < count; i++) {
    const st = shadedBox(width, stepH, stepR, PALETTE.stone);
    st.position.set(0, stepH * (i + 0.5), stepR * (count - i - 0.5));
    g.add(st);
  }
  // 양옆 난간 — 계단은 난간이 있어야 계단으로 읽힌다 (없으면 그냥 층계 덩어리)
  for (const sx of [-1, 1]) {
    const side = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const post = shadedBox(atLeast(0.5), atLeast(1.6), atLeast(0.5), PALETTE.frame);
      post.position.set((sx * width) / 2, stepH * (i + 1) + atLeast(0.8), stepR * (count - i - 0.5));
      side.add(post);
    }
    g.add(side);
  }
  return g;
}

/** 파라솔 — 테라스에 놓는 8각 차양. 레퍼런스 테라스마다 한두 개씩 있다 */
export function parasol(color = '#f0dcae'): THREE.Group {
  const g = new THREE.Group();
  const h = atLeast(4.4);
  const pole = shadedBox(atLeast(0.45), h, atLeast(0.45), PALETTE.woodDark);
  pole.position.y = h / 2;
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(atLeast(3.0), atLeast(1.3), 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  canopy.position.y = h + atLeast(0.5);
  g.add(pole, canopy);
  return g;
}

/**
 * 1층 아케이드 — 기둥 사이가 어두운 개방부.
 * 레퍼런스 본관 1층은 벽이 아니라 **그늘진 상가**다. 이 어두운 띠가 위층 크림색 벽과
 * 대비를 만들어 건물에 무게를 준다. 단색 벽으로 두면 3층이 통째로 붕 뜬다.
 */
export function arcade(width: number, height: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  const recess = shadedBox(width, height, depth, '#4a3826');
  recess.position.y = height / 2;
  g.add(recess);
  const bays = Math.max(2, Math.floor(width / (MIN_DETAIL * 6)));
  for (let i = 0; i <= bays; i++) {
    const col = shadedBox(atLeast(0.9), height, depth + MIN_DETAIL, PALETTE.creamShade);
    col.position.set(-width / 2 + (width * i) / bays, height / 2, MIN_DETAIL * 0.4);
    g.add(col);
  }
  return g;
}

/** 옥탑 소탑 — 실루엣 꼭대기에 변화를 준다 (레퍼런스 본관의 정체성 요소) */
export function turret(size: number, height: number, roof: string): THREE.Group {
  const g = new THREE.Group();
  const body = shadedBox(size, height, size, PALETTE.cream);
  body.position.y = height / 2;
  g.add(body);
  const win = windowRow(size * 0.7, height * 0.5, 2, true);
  win.position.set(0, height * 0.55, size / 2);
  g.add(win);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.86, atLeast(2.6), 4),
    new THREE.MeshLambertMaterial({ color: roof }),
  );
  cap.rotation.y = Math.PI / 4;
  cap.position.y = height + atLeast(1.3);
  g.add(cap);
  return g;
}
