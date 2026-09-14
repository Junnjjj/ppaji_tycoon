/**
 * 프리렌더 페이지 (G15) — three.js 로 시설을 다이메트릭 오소(요 45° · 피치 30° = 2:1)로 그려
 * 게임의 발자국 캔버스 계약(`footprintCanvas`, 앵커 bottom-center)에 맞춰 잘라 낸 뒤
 * ① 툰 3단 ② 실루엣 외곽선(남색 1텍셀) ③ `--px-*` 팔레트 양자화 를 CPU 로 적용한다.
 * `tools/prerender.ts`(Playwright)가 `window.__pre.render(id, facing)` 를 불러 PNG 를 받아 간다.
 */
import * as THREE from 'three';
import '../../src/ui/style.css';
import facilities from '../../src/data/facilities.json';
import type { FacilityDef } from '../../src/data/schema.js';
import { BODY_H } from '../../src/assets/draw/facility.js';
import { footprintCanvas } from '../../src/render/iso.js';
import { ART, DEFAULT_BY_CLASS, ICONS } from '../../src/assets/draw/fac-sprites.js';
import { pixColor } from '../../src/assets/draw/pix.js';
import { BUILDERS, B, type Slots } from './models.js';
import { palette, hexToRgb } from './palette.js';
import { cssVar } from '../../src/ui/tokens.js';

const DEFS = facilities as unknown as FacilityDef[];
const PX_PER_UNIT = 32 / Math.SQRT2; // 타일 대각선(√2) = 32텍셀

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);

const PAL = palette();
const INK = hexToRgb(cssVar('--px-ink'));

function nearest(r: number, g: number, b: number): [number, number, number] {
  let best = Infinity;
  let out: [number, number, number] = [r, g, b];
  for (const p of PAL) {
    const dr = r - p.rgb[0]; const dg = g - p.rgb[1]; const db = b - p.rgb[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < best) { best = d; out = p.rgb; }
  }
  return out;
}

function buildScene(def: FacilityDef, facing: 0 | 1): { scene: THREE.Scene; w: number; d: number; sign: THREE.Vector3 | null; icon: string | undefined } {
  const art = ART[def.id] ?? DEFAULT_BY_CLASS[def.class] ?? { tpl: 'bush' };
  const builder = BUILDERS[art.tpl] ?? BUILDERS['bush'];
  const scene = new THREE.Scene();
  const b = new B((art.slots ?? {}) as Slots);
  builder!(b, def.w, def.d);
  // facing 1 — 발자국을 90° 돌린다 (w↔d)
  const w = facing === 1 ? def.d : def.w;
  const d = facing === 1 ? def.w : def.d;
  if (facing === 1) {
    // rotation.y = −90°: (x, z) → (−z, x). x' ∈ [−d, 0] 이므로 +d 만큼 밀어 x' ∈ [0, d), z' ∈ [0, w)
    b.g.rotation.y = -Math.PI / 2;
    b.g.position.set(def.d, 0, 0);
  }
  scene.add(b.g);
  const sign = b.sign ? b.sign.clone().applyMatrix4((b.g.updateMatrixWorld(), b.g.matrixWorld)) : null;
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-2, 4, 3); // 화면 좌상단에서
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  return { scene, w, d, sign, icon: art.icon };
}

function makeCamera(w: number, d: number, W: number, H: number): THREE.OrthographicCamera {
  const hw = (W / 2) / PX_PER_UNIT;
  const hh = (H / 2) / PX_PER_UNIT;
  const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 100);
  const T = new THREE.Vector3(w / 2, 0, d / 2);
  const dist = 30;
  const pitch = Math.PI / 6; // 30°
  cam.position.set(T.x + dist * Math.cos(pitch) / Math.SQRT2, T.y + dist * Math.sin(pitch), T.z + dist * Math.cos(pitch) / Math.SQRT2);
  cam.lookAt(T);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  // 발자국의 아래 꼭짓점 (w,0,d) 이 픽셀 (w·16, H) 에 오도록 뷰를 민다
  const p = new THREE.Vector3(w, 0, d).project(cam);
  const px = (p.x + 1) / 2 * W;
  const py = (1 - p.y) / 2 * H;
  cam.setViewOffset(W, H, px - w * 16, py - H, W, H);
  cam.updateProjectionMatrix();
  return cam;
}

function readPixels(W: number, H: number): Uint8Array {
  const gl = renderer.getContext();
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf; // 아래→위 순서
}

export function render(id: string, facing: 0 | 1): { w: number; h: number; png: string } | null {
  const def = DEFS.find((x) => x.id === id);
  if (!def) return null;
  const { scene, w, d, sign, icon } = buildScene(def, facing);
  const size = footprintCanvas(w, d, BODY_H[def.class]);
  const W = size.x; const H = size.y;
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  const cam = makeCamera(w, d, W, H);
  renderer.render(scene, cam);
  const rgba = readPixels(W, H);
  // 깊이 — 실루엣·크리즈 판정용 (오소라 선형)
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  scene.overrideMaterial = depthMat;
  renderer.render(scene, cam);
  const dep = readPixels(W, H);
  scene.overrideMaterial = null;
  const depthAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 1;
    const i = ((H - 1 - y) * W + x) * 4;
    if (rgba[i + 3]! < 8) return 1;
    return (dep[i]! * 256 * 256 * 256 + dep[i + 1]! * 256 * 256 + dep[i + 2]! * 256 + dep[i + 3]!) / (256 * 256 * 256 * 256);
  };
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d')!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = ((H - 1 - y) * W + x) * 4;
      const o = (y * W + x) * 4;
      const a = rgba[i + 3]!;
      if (a < 8) continue;
      const d0 = depthAt(x, y);
      const n = [depthAt(x - 1, y), depthAt(x + 1, y), depthAt(x, y - 1), depthAt(x, y + 1)];
      // 실루엣: 이웃이 배경(깊이 1) 이거나 나보다 훨씬 뒤 → 외곽선. 크리즈: 2차 미분
      const sil = n.some((v) => v >= 1 || v - d0 > 0.02);
      const crease = Math.abs(n[0]! + n[1]! - 2 * d0) > 0.004 || Math.abs(n[2]! + n[3]! - 2 * d0) > 0.004;
      let r = rgba[i]!; let gg = rgba[i + 1]!; let bb = rgba[i + 2]!;
      if (sil) { r = INK[0]; gg = INK[1]; bb = INK[2]; }
      else if (crease) { r *= 0.62; gg *= 0.62; bb *= 0.62; }
      const q = sil ? [r, gg, bb] : nearest(r, gg, bb);
      img.data[o] = q[0]!; img.data[o + 1] = q[1]!; img.data[o + 2] = q[2]!; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // 간판 아이콘 — 2D 도트 6×6 을 간판 world 좌표의 화면 자리에 합성 (3D 로는 못 그리는 「무엇을 파는 집인가」)
  if (sign && icon && ICONS[icon]) {
    const p = sign.clone().project(cam);
    const sx = Math.round((p.x + 1) / 2 * W) - 3;
    const sy = Math.round((1 - p.y) / 2 * H) - 3;
    ICONS[icon]!.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '.') return; const col = pixColor(ch); if (!col) return; g.fillStyle = col; g.fillRect(sx + i, sy + j, 1, 1); }));
  }
  const holder = document.getElementById('out');
  if (holder) { out.style.imageRendering = 'pixelated'; out.style.width = `${W * 3}px`; out.style.margin = '4px'; holder.append(out); }
  return { w: W, h: H, png: out.toDataURL('image/png') };
}

(window as unknown as { __pre: unknown }).__pre = {
  ids: () => DEFS.map((x) => x.id),
  render,
  ready: true,
};
// 눈으로 보기: ?id=cafe 이면 그 하나를 크게
const q = new URLSearchParams(location.search);
if (q.get('id')) render(q.get('id') as string, (Number(q.get('f') ?? 0) as 0 | 1));
if (q.get('all') === '1') for (const d of DEFS) render(d.id, 0);
