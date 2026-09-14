/**
 * 시설 3D 모델 — 원시 도형(box·cyl·sphere·cone)을 타일 단위로 조합한다. 1 타일 = 1 world, y 가 위.
 * 발자국은 x∈[0,w) z∈[0,d) 위에 놓인다. 색은 `--px-*` 토큰 이름(팔레트 양자화가 그 색으로 스냅한다).
 * 템플릿 이름은 2D 도트의 ART 표(`sprites/*.ts`)와 같다 — 같은 id → 같은 템플릿 → slots 로 주제색.
 */
import * as THREE from 'three';
import { color } from './palette.js';

const GRADIENT = (() => {
  const data = new Uint8Array([150, 205, 255]); // 3단 툰 — 그림자·중간·빛
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const matCache = new Map<string, THREE.MeshToonMaterial>();
export function mat(token: string): THREE.MeshToonMaterial {
  let m = matCache.get(token);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: new THREE.Color(color(token)), gradientMap: GRADIENT });
    matCache.set(token, m);
  }
  return m;
}

export type Slots = Partial<Record<'1' | '2' | '3' | '4', string>>;
/** 문자 → 토큰 (2D 도트 문자표와 같다) */
const CH: Record<string, string> = {
  k: 'ink', w: 'white', W: 'cream', r: 'red', R: 'red-lt', p: 'pink', P: 'pink-lt', o: 'orange', O: 'orange-lt', y: 'yellow', Y: 'yellow-lt',
  g: 'green', G: 'green-lt', d: 'green-dk', b: 'blue', B: 'blue-lt', n: 'blue-dk', c: 'water', C: 'water-lt', u: 'purple', U: 'purple-lt',
  m: 'wood', M: 'wood-lt', e: 'wood-dk', t: 'tan', T: 'tan-lt', s: 'gray', S: 'gray-lt', x: 'gray-dk', h: 'gold', H: 'gold-lt', q: 'black', a: 'aqua',
  '!': 'red-dk', '@': 'pink-dk', '#': 'orange-dk', '$': 'yellow-dk', '%': 'purple-dk', '^': 'water-dk', '&': 'cream-dk', '~': 'aqua-dk', '=': 'gold-dk', '+': 'sky',
};
export function tok(ch: string, slots: Slots): string {
  const map: Record<string, string> = { '1': 'b', '2': 'B', '3': 'n', '4': 'w', ...slots };
  const c = map[ch] ?? ch;
  return CH[c] ?? 'gray';
}

// ── 원시 도형 ───────────────────────────────────────────────────────────
export class B {
  readonly g = new THREE.Group();
  /** 간판 아이콘을 얹을 world 좌표 (빌더가 정한다 — 없으면 아이콘 없음) */
  sign: THREE.Vector3 | null = null;
  constructor(private readonly slots: Slots) {}
  private m(ch: string): THREE.MeshToonMaterial { return mat(tok(ch, this.slots)); }
  /** 상자 — (x,y,z) 는 바닥 중심, 크기 w×h×d */
  box(x: number, y: number, z: number, w: number, h: number, d: number, ch: string): THREE.Mesh {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.m(ch));
    o.position.set(x, y + h / 2, z);
    this.g.add(o);
    return o;
  }
  cyl(x: number, y: number, z: number, r: number, h: number, ch: string, rTop = r, seg = 12): THREE.Mesh {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), this.m(ch));
    o.position.set(x, y + h / 2, z);
    this.g.add(o);
    return o;
  }
  sphere(x: number, y: number, z: number, r: number, ch: string, seg = 10): THREE.Mesh {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), this.m(ch));
    o.position.set(x, y, z);
    this.g.add(o);
    return o;
  }
  cone(x: number, y: number, z: number, r: number, h: number, ch: string, seg = 12): THREE.Mesh {
    const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), this.m(ch));
    o.position.set(x, y + h / 2, z);
    this.g.add(o);
    return o;
  }
  torus(x: number, y: number, z: number, r: number, tube: number, ch: string): THREE.Mesh {
    const o = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 16), this.m(ch));
    o.rotation.x = Math.PI / 2;
    o.position.set(x, y, z);
    this.g.add(o);
    return o;
  }
  /** 얇은 판 (지붕·차양) — y 는 판의 바닥, 기울기 rx 라디안 */
  slab(x: number, y: number, z: number, w: number, d: number, ch: string, th = 0.06, rx = 0, rz = 0): THREE.Mesh {
    const o = this.box(x, y, z, w, th, d, ch);
    o.rotation.x = rx;
    o.rotation.z = rz;
    return o;
  }
  /** 줄무늬 차양 — 두 색 교대 조각 */
  stripes(x: number, y: number, z: number, w: number, d: number, n: number, a: string, b: string, th = 0.06): void {
    const sw = w / n;
    for (let k = 0; k < n; k++) this.box(x - w / 2 + sw * (k + 0.5), y, z, sw, th, d, k % 2 ? b : a);
  }
}

export type Builder = (b: B, w: number, d: number) => void;

// ── 템플릿 ──────────────────────────────────────────────────────────────
const stall: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2, w * 0.86, 0.42, d * 0.86, 'm');            // 카운터
  b.box(w / 2, 0.42, d / 2, w * 0.9, 0.05, d * 0.9, 'M');            // 상판
  b.box(w / 2, 0.47, d / 2 - d * 0.1, w * 0.7, 0.5, 0.06, 'W'); // 뒤판 (간판)
  b.sign = new THREE.Vector3(w / 2, 0.72, d / 2 - d * 0.1 + 0.04);
  b.cyl(w * 0.12, 0, d * 0.12, 0.04, 1.1, 'k'); b.cyl(w * 0.88, 0, d * 0.12, 0.04, 1.1, 'k');
  b.cyl(w * 0.12, 0, d * 0.88, 0.04, 1.1, 'k'); b.cyl(w * 0.88, 0, d * 0.88, 0.04, 1.1, 'k');
  b.stripes(w / 2, 1.1, d / 2, w * 0.96, d * 0.96, 6, '1', '4', 0.1);
  b.box(w / 2, 1.2, d / 2, w * 0.7, 0.16, d * 0.7, '2');             // 지붕 위 턱
};
const shop: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2, w * 0.92, 0.95, d * 0.92, 'W');
  b.box(w / 2, 0.95, d / 2, w * 0.96, 0.12, d * 0.96, '3');
  b.box(w / 2, 1.07, d / 2, w * 0.8, 0.22, d * 0.8, '1');             // 낮은 지붕 상자
  b.box(w / 2, 1.29, d / 2, w * 0.5, 0.1, d * 0.5, '2');
  b.stripes(w * 0.5, 0.78, d * 0.98, w * 0.7, 0.28, 4, '1', '4', 0.05); // 앞 차양
  b.box(w * 0.3, 0.0, d * 0.94, 0.22, 0.5, 0.05, '3');                // 문
  b.box(w * 0.7, 0.4, d * 0.94, 0.28, 0.28, 0.05, 'B');               // 창
  b.box(w * 0.94, 0.45, d * 0.5, 0.05, 0.3, 0.3, 'B');                // 옆 창
  b.box(w * 0.5, 1.0, d * 0.99, 0.5, 0.34, 0.04, 'W');                // 간판
  b.sign = new THREE.Vector3(w * 0.5, 1.17, d * 1.01);
};
const kiosk: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2, 0.6, 1.1, 0.5, '1');
  b.box(w / 2, 0.5, d / 2 + 0.24, 0.5, 0.5, 0.05, 'B');
  b.box(w / 2, 0.15, d / 2 + 0.24, 0.3, 0.12, 0.05, 'k');
  b.box(w / 2, 1.1, d / 2, 0.64, 0.06, 0.54, '3');
  b.sign = new THREE.Vector3(w / 2, 0.75, d / 2 + 0.26);
};
const van: Builder = (b, w, d) => {
  b.box(w * 0.55, 0.18, d / 2, 0.8, 0.62, 0.62, 'w');
  b.box(w * 0.14, 0.18, d / 2, 0.34, 0.44, 0.58, '1');
  b.box(w * 0.55, 0.8, d / 2, 0.7, 0.16, 0.5, '1');
  b.box(w * 0.55, 0.45, d / 2 + 0.31, 0.5, 0.26, 0.04, 'B');
  b.sign = new THREE.Vector3(w * 0.55, 0.58, d / 2 + 0.34);
  b.cyl(w * 0.2, 0.06, d * 0.2, 0.1, 0.12, 'q').rotation.x = Math.PI / 2;
  b.cyl(w * 0.8, 0.06, d * 0.2, 0.1, 0.12, 'q').rotation.x = Math.PI / 2;
  b.cyl(w * 0.2, 0.06, d * 0.8, 0.1, 0.12, 'q').rotation.x = Math.PI / 2;
  b.cyl(w * 0.8, 0.06, d * 0.8, 0.1, 0.12, 'q').rotation.x = Math.PI / 2;
};
const toilet: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2, w * 0.86, 0.85, d * 0.86, 'S');
  b.box(w / 2, 0.85, d / 2, w * 0.98, 0.14, d * 0.98, '1');
  b.box(w / 2, 0.99, d / 2, w * 0.6, 0.12, d * 0.6, '2');
  b.box(w * 0.3, 0, d * 0.94, 0.2, 0.5, 0.04, 'x'); b.box(w * 0.7, 0, d * 0.94, 0.2, 0.5, 0.04, 'x');
  b.box(w * 0.3, 0.6, d * 0.94, 0.12, 0.12, 0.04, 'b'); b.box(w * 0.7, 0.6, d * 0.94, 0.12, 0.12, 0.04, 'p');
};
const shower: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.42, 0.08, 'S', 0.42, 16);
  b.cyl(w / 2, 0.08, d / 2, 0.05, 1.2, 'x');
  b.cyl(w / 2, 1.2, d / 2, 0.16, 0.08, 'S', 0.1);
  b.box(w / 2, 1.28, d / 2, 0.3, 0.06, 0.3, 'x');
  for (let k = 0; k < 4; k++) b.box(w / 2 - 0.15 + k * 0.1, 0.4 + (k % 2) * 0.3, d / 2 + 0.05, 0.03, 0.25, 0.03, 'C');
};
const fountainBasin: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.45, 0.32, 'S', 0.45, 16);
  b.cyl(w / 2, 0.32, d / 2, 0.36, 0.05, 'C', 0.36, 16);
  b.cyl(w / 2, 0.3, d / 2, 0.06, 0.4, 'x');
  b.sphere(w / 2, 0.78, d / 2, 0.1, 'C');
};
const deckChair: Builder = (b, w, d) => {
  const g = b.g;
  const seat = b.box(w / 2, 0.22, d / 2, 0.42, 0.06, 0.9, '4');
  seat.rotation.set(0, 0, 0);
  b.box(w / 2, 0.22, d / 2 + 0.05, 0.36, 0.02, 0.6, '1');
  const back = b.box(w / 2, 0.25, d / 2 - 0.42, 0.42, 0.42, 0.06, '4');
  back.rotation.x = -0.5;
  b.box(w / 2 - 0.18, 0, d / 2 - 0.35, 0.05, 0.22, 0.05, 'm'); b.box(w / 2 + 0.18, 0, d / 2 - 0.35, 0.05, 0.22, 0.05, 'm');
  b.box(w / 2 - 0.18, 0, d / 2 + 0.35, 0.05, 0.22, 0.05, 'm'); b.box(w / 2 + 0.18, 0, d / 2 + 0.35, 0.05, 0.22, 0.05, 'm');
  g.rotation.y = 0;
};
const parasol: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.03, 1.5, 'x');
  b.cone(w / 2, 1.2, d / 2, 0.85, 0.36, '1', 8);
  b.cyl(w / 2, 1.18, d / 2, 0.86, 0.04, '4', 0.86, 8);
  b.sphere(w / 2, 1.6, d / 2, 0.05, 'k');
};
const parasolSet: Builder = (b, w, d) => { parasol(b, w, d); deckChair(b, w, d); };
const table4: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.04, 0.55, 'x');
  b.cyl(w / 2, 0.55, d / 2, 0.42, 0.06, 'M', 0.42, 16);
  for (const [dx, dz] of [[-0.42, 0], [0.42, 0], [0, -0.42], [0, 0.42]] as const) { b.cyl(w / 2 + dx, 0, d / 2 + dz, 0.03, 0.3, 'x'); b.cyl(w / 2 + dx, 0.3, d / 2 + dz, 0.13, 0.05, '1'); }
};
const comfyChair: Builder = (b, w, d) => {
  b.box(w / 2, 0.15, d / 2, 0.7, 0.28, 0.7, '1');
  b.box(w / 2, 0.15, d / 2 - 0.28, 0.7, 0.62, 0.14, '1');
  b.box(w / 2, 0.25, d / 2 + 0.02, 0.5, 0.24, 0.5, '2');
  b.box(w / 2 - 0.32, 0.15, d / 2, 0.06, 0.45, 0.7, '3'); b.box(w / 2 + 0.32, 0.15, d / 2, 0.06, 0.45, 0.7, '3');
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as const) b.box(w / 2 + dx, 0, d / 2 + dz, 0.06, 0.15, 0.06, 'm');
};
const rattanChair: Builder = comfyChair;
const sofa: Builder = (b, w, d) => {
  b.box(w / 2, 0.12, d / 2, 0.96, 0.3, 0.55, '1');
  b.box(w / 2, 0.12, d / 2 - 0.22, 0.96, 0.6, 0.12, '1');
  b.box(w / 2, 0.42, d / 2 + 0.04, 0.8, 0.12, 0.4, '2');
  b.box(w / 2 - 0.45, 0.12, d / 2, 0.08, 0.45, 0.55, '3'); b.box(w / 2 + 0.45, 0.12, d / 2, 0.08, 0.45, 0.55, '3');
};
const roundSofa: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.48, 0.3, '1', 0.48, 16);
  b.cyl(w / 2, 0.3, d / 2, 0.36, 0.14, '2', 0.36, 16);
  b.torus(w / 2, 0.42, d / 2, 0.42, 0.08, '3');
};
const cabana: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2, w * 0.9, 0.12, d * 0.9, 'M');                // 데크
  b.box(w / 2, 0.12, d / 2, w * 0.7, 0.35, d * 0.7, '2');             // 침대
  b.box(w / 2, 0.47, d / 2, w * 0.5, 0.12, d * 0.4, 'w');
  for (const [x, z] of [[0.2, 0.2], [w - 0.2, 0.2], [0.2, d - 0.2], [w - 0.2, d - 0.2]] as const) b.cyl(x, 0.12, z, 0.05, 1.4, 'W');
  b.box(0.22, 0.12, d / 2, 0.06, 1.3, d * 0.75, '4');                 // 뒤 커튼 둘
  b.box(w / 2, 0.12, 0.22, w * 0.75, 1.3, 0.06, '4');
  b.box(w / 2, 1.5, d / 2, w * 0.96, 0.1, d * 0.96, '1');
  b.cone(w / 2, 1.6, d / 2, w * 0.72, 0.5, '1', 4).rotation.y = Math.PI / 4;
};
const tub: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.47, 0.42, '1', 0.47, 16);
  b.cyl(w / 2, 0.42, d / 2, 0.36, 0.03, 'C', 0.36, 16);
  b.torus(w / 2, 0.42, d / 2, 0.42, 0.06, '2');
  for (let k = 0; k < 5; k++) b.sphere(w / 2 - 0.2 + k * 0.1, 0.47, d / 2 + ((k % 2) - 0.5) * 0.2, 0.04, 'w');
};
const archShower: Builder = (b, w, d) => {
  b.cyl(w * 0.15, 0, d / 2, 0.05, 1.3, '1'); b.cyl(w * 0.85, 0, d / 2, 0.05, 1.3, '1');
  b.box(w / 2, 1.3, d / 2, 0.8, 0.1, 0.12, '1');
  for (let k = 0; k < 5; k++) b.box(w * 0.25 + k * 0.125, 0.5 + (k % 2) * 0.25, d / 2, 0.03, 0.4, 0.03, 'C');
  b.box(w / 2, 0, d / 2, 0.8, 0.05, 0.4, 'S');
};
const statueFountain: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.48, 0.25, 'S', 0.48, 16);
  b.cyl(w / 2, 0.25, d / 2, 0.4, 0.03, 'C', 0.4, 16);
  b.cyl(w / 2, 0.25, d / 2, 0.1, 0.35, 'S');
  b.sphere(w / 2, 0.75, d / 2, 0.2, '1');
  b.cone(w / 2 + 0.15, 0.8, d / 2, 0.08, 0.3, '1', 6).rotation.z = -0.8;
  b.sphere(w / 2, 1.05, d / 2, 0.06, 'C');
};
const merlion: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, w * 0.48, 0.22, 'S', w * 0.48, 20);
  b.cyl(w / 2, 0.22, d / 2, w * 0.4, 0.04, 'C', w * 0.4, 20);
  b.box(w / 2, 0.22, d / 2, 0.6, 0.3, 0.6, 'S');
  const body = b.cyl(w / 2, 0.5, d / 2 + 0.1, 0.22, 0.9, 'w', 0.3, 12);
  body.rotation.x = -0.25;
  b.sphere(w / 2, 1.45, d / 2 + 0.2, 0.3, 'w', 12);
  b.torus(w / 2, 1.45, d / 2 + 0.2, 0.34, 0.09, 'H');
  b.box(w / 2, 1.3, d / 2 + 0.52, 0.2, 0.14, 0.12, 'w');
  b.box(w / 2, 1.28, d / 2 + 0.7, 0.06, 0.06, 0.3, 'C');
  b.box(w / 2, 0.9, d / 2 + 0.95, 0.06, 0.4, 0.06, 'C');
  b.cone(w / 2, 0.24, d / 2 - 0.25, 0.22, 0.4, 'w', 4).rotation.x = 0.6;
};
const cabin: Builder = (b, w, d) => {
  for (let k = 0; k < 5; k++) b.box(w / 2, k * 0.18, d / 2, w * 0.9, 0.16, d * 0.9, k % 2 ? 'm' : 'M');
  b.cone(w / 2, 0.9, d / 2, w * 0.75, 0.5, '1', 4).rotation.y = Math.PI / 4;
  b.box(w * 0.5, 0, d * 0.94, 0.3, 0.55, 0.05, 'e');
  b.box(w * 0.22, 0.4, d * 0.94, 0.25, 0.25, 0.05, 'O'); b.box(w * 0.78, 0.4, d * 0.94, 0.25, 0.25, 0.05, 'O');
};
const igloo: Builder = (b, w, d) => {
  b.sphere(w / 2, 0.05, d / 2, w * 0.48, 'w', 12);
  b.box(w / 2, 0, d * 0.85, 0.5, 0.45, 0.4, 'w');
  b.box(w / 2, 0, d * 1.0, 0.3, 0.32, 0.05, 'C');
};
const soaker: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.42, 0.08, 'S', 0.42, 16);
  b.cyl(w / 2, 0.08, d / 2, 0.05, 1.3, 'x');
  const bucket = b.cyl(w / 2, 1.3, d / 2, 0.22, 0.3, '1', 0.28);
  bucket.rotation.z = 0.4;
  b.cyl(w / 2, 1.58, d / 2, 0.24, 0.03, 'C', 0.24);
};
const robot: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2, 0.62, 0.55, 0.5, '1');
  b.box(w / 2, 0.58, d / 2, 0.56, 0.46, 0.5, '1');
  b.box(w / 2 - 0.14, 0.78, d / 2 + 0.26, 0.12, 0.12, 0.02, '2'); b.box(w / 2 + 0.14, 0.78, d / 2 + 0.26, 0.12, 0.12, 0.02, '2');
  b.box(w / 2, 0.62, d / 2 + 0.26, 0.28, 0.08, 0.02, 'k');
  b.box(w / 2, 0.25, d / 2 + 0.26, 0.3, 0.16, 0.02, '2');
  b.box(w / 2 - 0.4, 0.15, d / 2, 0.14, 0.4, 0.16, '3'); b.box(w / 2 + 0.4, 0.15, d / 2, 0.14, 0.4, 0.16, '3');
  b.cyl(w / 2, 1.04, d / 2, 0.02, 0.15, 'k'); b.sphere(w / 2, 1.22, d / 2, 0.07, 'r');
};
const smallSlide: Builder = (b) => {
  // 탑은 첫 칸, 활강로는 +z(두 번째 칸)로 내려온다
  b.box(0.5, 0, 0.5, 0.7, 0.9, 0.7, '1');
  b.box(0.5, 0.9, 0.5, 0.8, 0.08, 0.8, '2');
  for (let k = 0; k < 4; k++) b.box(0.5 - 0.35, k * 0.22, 0.5 + 0.25 - k * 0.12, 0.2, 0.05, 0.12, 'M');
  const tube = b.box(0.5, 0.45, 1.3, 0.42, 0.1, 1.1, 'C');
  tube.rotation.x = 0.55;
  b.box(0.5 - 0.2, 0.5, 1.3, 0.04, 0.16, 1.05, 'c').rotation.x = 0.55;
  b.box(0.5 + 0.2, 0.5, 1.3, 0.04, 0.16, 1.05, 'c').rotation.x = 0.55;
};
const bigSlide: Builder = (b) => {
  // 탑 (첫 2×2 의 뒤쪽 칸) + 계단 + 정상 정자 + 활강로 시작 스텁 (+x 로 내려간다 — 나머지는 씬이 잇는다)
  b.box(0.7, 0, 0.7, 0.9, 1.6, 0.9, '1');
  for (let k = 0; k < 4; k++) b.box(0.7, 0.2 + k * 0.38, 0.7, 0.98, 0.06, 0.98, '2');
  for (let k = 0; k < 7; k++) b.box(0.7, k * 0.22, 1.55 - k * 0.12, 0.5, 0.06, 0.2, 'M');
  b.box(0.7, 1.6, 0.7, 1.1, 0.08, 1.1, '2');
  for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) b.cyl(0.7 + dx, 1.68, 0.7 + dz, 0.04, 0.5, '4');
  b.cone(0.7, 2.18, 0.7, 0.8, 0.45, '1', 4).rotation.y = Math.PI / 4;
  // 활강로는 씬(`drawLanes`)이 탑 출구에서 착수 칸까지 잇는다 — 여기선 출구 난간만
  b.box(1.2, 1.6, 0.7, 0.3, 0.3, 0.6, 'C');
};
const pottedPlant: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.2, 0.3, '2', 0.24);
  b.sphere(w / 2, 0.55, d / 2, 0.28, '1', 8);
  b.sphere(w / 2 - 0.18, 0.7, d / 2, 0.16, '1', 8); b.sphere(w / 2 + 0.16, 0.75, d / 2 + 0.1, 0.15, '1', 8);
};
const flowerPot: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.2, 0.3, 'M', 0.24);
  b.sphere(w / 2, 0.45, d / 2, 0.24, 'g', 8);
  for (const [dx, dz] of [[-0.12, 0.1], [0.14, 0.05], [0, -0.12], [0.05, 0.16]] as const) b.sphere(w / 2 + dx, 0.62, d / 2 + dz, 0.08, '1', 6);
};
const bush: Builder = (b, w, d) => {
  b.sphere(w / 2, 0.25, d / 2, 0.38, 'G', 9);
  b.sphere(w / 2 - 0.25, 0.2, d / 2 + 0.1, 0.25, 'g', 8); b.sphere(w / 2 + 0.25, 0.22, d / 2 - 0.05, 0.26, 'G', 8);
  for (const [dx, dz] of [[-0.1, 0.25], [0.2, 0.2], [0.05, -0.2], [-0.25, -0.1]] as const) b.sphere(w / 2 + dx, 0.5, d / 2 + dz, 0.07, '1', 6);
};
const palm: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.06, 1.3, 'm', 0.05);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const leaf = b.box(w / 2 + Math.cos(a) * 0.3, 1.25, d / 2 + Math.sin(a) * 0.3, 0.6, 0.05, 0.16, 'g');
    leaf.rotation.y = -a; leaf.rotation.z = -0.35;
  }
  b.sphere(w / 2, 1.3, d / 2, 0.1, 'm');
};
const roundTree: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.08, 0.5, 'm');
  b.sphere(w / 2, 0.85, d / 2, 0.42, 'G', 10);
  b.sphere(w / 2 - 0.2, 0.7, d / 2 + 0.15, 0.25, 'g', 8);
  for (const [dx, dz] of [[-0.15, 0.3], [0.25, 0.2], [0.1, -0.3]] as const) b.sphere(w / 2 + dx, 0.95, d / 2 + dz, 0.07, '1', 6);
};
const conifer: Builder = (b, w, d) => {
  b.cyl(w / 2, 0, d / 2, 0.06, 0.3, 'm');
  b.cone(w / 2, 0.25, d / 2, 0.42, 0.55, 'd', 8);
  b.cone(w / 2, 0.6, d / 2, 0.34, 0.5, 'g', 8);
  b.cone(w / 2, 0.95, d / 2, 0.24, 0.45, 'G', 8);
};
const sunflower: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2, 0.6, 0.15, 0.6, 'M');
  for (const [dx, dz, h] of [[-0.12, 0.05, 0.9], [0.14, -0.05, 1.1], [0.02, 0.15, 0.75]] as const) {
    b.cyl(w / 2 + dx, 0.15, d / 2 + dz, 0.025, h, 'g');
    b.cyl(w / 2 + dx, 0.15 + h - 0.05, d / 2 + dz + 0.05, 0.16, 0.05, '1', 0.16, 10).rotation.x = Math.PI / 2 - 0.4;
    b.cyl(w / 2 + dx, 0.15 + h - 0.03, d / 2 + dz + 0.08, 0.08, 0.04, 'e', 0.08, 8).rotation.x = Math.PI / 2 - 0.4;
  }
};
const floatyTower: Builder = (b, w, d) => {
  b.torus(w / 2, 0.1, d / 2, 0.36, 0.1, 'b');
  b.torus(w / 2, 0.3, d / 2, 0.32, 0.1, 'y');
  b.torus(w / 2, 0.5, d / 2, 0.28, 0.1, 'r');
  b.torus(w / 2, 0.68, d / 2, 0.24, 0.09, '1');
};
const pillar: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2, 0.5, 0.1, 0.5, 'T');
  b.cyl(w / 2, 0.1, d / 2, 0.16, 1.1, 'T', 0.16, 12);
  b.box(w / 2, 1.2, d / 2, 0.5, 0.1, 0.5, 'T');
};
const waterfall: Builder = (b, w, d) => {
  b.box(w / 2, 0, d / 2 - 0.15, 0.8, 0.9, 0.5, 'x');
  b.box(w / 2 - 0.3, 0.3, d / 2 - 0.1, 0.25, 0.8, 0.4, 's');
  b.box(w / 2, 0.15, d / 2 + 0.12, 0.34, 0.8, 0.06, 'C');
  b.cyl(w / 2, 0, d / 2 + 0.2, 0.42, 0.12, 'c', 0.42, 16);
};

export const BUILDERS: Record<string, Builder> = {
  stall, shop, kiosk, van, toilet, shower, fountainBasin, deckChair, parasol, parasolSet, table4, comfyChair, rattanChair, sofa, roundSofa, cabana,
  tub, archShower, statueFountain, merlion, cabin, igloo, soaker, robot, smallSlide, bigSlide,
  pottedPlant, flowerPot, bush, palm, roundTree, conifer, sunflower, floatyTower, pillar, waterfall,
};
