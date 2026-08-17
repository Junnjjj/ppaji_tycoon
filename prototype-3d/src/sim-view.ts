import * as THREE from 'three';
import type { Game, PlacedFacility } from '../../src/sim/index.js';
import { requireFacilityDef, footprint } from '../../src/sim/index.js';
import { shadedBox } from './shade.js';
import { applyToon } from './toon.js';
import { TILE, footprintCenter, tileToWorld, LAND_ROWS, PIER_TOP } from './simworld.js';
import { G, VEST, SKIN, HAIR, SHORT } from './guests.js';
import {
  windowRow, railing, gableRoofDetail, cornice, door, planter, awning, signboard, roofProp,
  plinth, PALETTE, MIN_DETAIL,
} from './detail.js';
import { makeFacilitySprite, TEXEL_WORLD } from './sprite-facility.js';
import { makeGuestSprites, PALETTE_COUNT, type Dir } from './guest-sprite.js';

/**
 * sim 상태를 3D 로 그리는 뷰. sim 은 이 파일을 모른다 (의존 방향 render → sim).
 * - 시설: 배치될 때마다 파라메트릭 메시를 만들어 붙인다 (스프라이트 없음 → 회전·크기 공짜)
 * - 손님: InstancedMesh 4벌에 sim 좌표를 매 프레임 써넣는다
 */

const MAX_GUESTS = 400;

function lam(c: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: c });
}

/** 박공 지붕 프리즘 */
function gable(w: number, h: number, d: number, color: string): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return new THREE.Mesh(geo, lam(color));
}

const CREAM = '#f0e3c6';
const WOOD = '#c49a6a';
const WOOD_DARK = '#8a6a3e';

/** defId → 파라메트릭 메시. w·h 는 발자국 타일 수 */
function buildFacility(defId: string, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const W = w * TILE * 0.86;
  const D = h * TILE * 0.86;

  /**
   * 기본 건물 껍데기. 기단·벽·코니스·박공지붕·지붕디테일까지 **여기서 다 붙인다**.
   * 개별 case 는 그 위에 창·문·차양 같은 "정체성"만 얹는다.
   */
  const hut = (roof: string, wallH = 7): void => {
    g.add(plinth(W, D));
    const wall = shadedBox(W, wallH, D, CREAM);
    wall.position.y = wallH / 2;
    g.add(wall);
    const co = cornice(W, D);
    co.position.y = wallH;
    g.add(co);
    const rw = W * 1.12, rh = wallH * 0.62, rd = D * 1.06;
    const r = gable(rw, rh, rd, roof);
    r.position.y = wallH;
    g.add(r);
    const detail = gableRoofDetail(rw, rh, rd, roof);
    detail.position.y = wallH;
    g.add(detail);
  };

  switch (defId) {
    case 'gate': {
      // 기둥 두 개 + 들보 + 박공지붕. 지붕이 있어야 "입구 건축물"로 읽힌다 —
      // 들보에 간판만 얹었을 땐 잔디에 세운 판때기로 보였다.
      for (const sx of [-1, 1]) {
        const px = (sx * W) / 2 - sx * W * 0.075;
        const base = plinth(W * 0.2, D * 0.72);
        base.position.x = px; g.add(base);
        const post = shadedBox(W * 0.15, 9, D * 0.66, CREAM);
        post.position.set(px, 4.6, 0); g.add(post);
        const cap = cornice(W * 0.18, D * 0.7);
        cap.position.set(px, 9.2, 0); g.add(cap);
      }
      const beam = shadedBox(W, MIN_DETAIL * 1.4, D * 0.52, PALETTE.creamShade);
      beam.position.y = 9.6; g.add(beam);
      const rw = W * 1.14, rh = 3.4, rd = D * 0.72;
      const roof = gable(rw, rh, rd, '#e0604f');
      roof.position.y = 10.1; g.add(roof);
      const rdet = gableRoofDetail(rw, rh, rd, '#e0604f', 1);
      rdet.position.y = 10.1; g.add(rdet);
      const sign = signboard(W * 0.7, '#f2b53f');
      sign.position.set(0, 8.0, D * 0.4); g.add(sign);
      // 개찰 바 — 사람이 지나가는 곳임을 알린다
      const turn = shadedBox(W * 0.46, MIN_DETAIL * 1.2, MIN_DETAIL, '#8a99a8');
      turn.position.set(0, 2.4, D * 0.28); g.add(turn);
      const pl = planter(1); pl.position.set(-W * 0.5, 0.4, D * 0.5); g.add(pl);
      break;
    }
    case 'shop': {
      // 부품 조합 — 벽/지붕은 hut, 나머지는 전부 공용 부품 (detail.ts)
      hut('#3f9a5e', 7.5);
      const win = windowRow(W * 0.72, 3.0, 3, true);
      win.position.set(0, 4.6, D * 0.5); g.add(win);
      const aw = awning(W * 0.98, D * 0.42);
      aw.position.set(0, 6.6, D * 0.56); g.add(aw);
      const counter = shadedBox(W * 0.78, MIN_DETAIL * 1.6, MIN_DETAIL, WOOD);
      counter.position.set(0, 2.6, D * 0.52); g.add(counter);
      const sign = signboard(W * 0.5, '#e0604f');
      sign.position.set(-W * 0.2, 9.2, D * 0.56); g.add(sign);
      break;
    }
    case 'cafe': {
      hut('#4a90b8', 8.5);
      // 전면 통유리 2단 — 카페의 얼굴
      const w1 = windowRow(W * 0.78, 3.2, 4, true); w1.position.set(0, 5.6, D * 0.5); g.add(w1);
      const w2 = windowRow(W * 0.5, 2.2, 2, false); w2.position.set(-W * 0.2, 2.2, D * 0.5); g.add(w2);
      const rail = railing(W * 0.94, 'x', 1.8);
      rail.position.set(0, 0.2, D * 0.62); g.add(rail);
      for (const [i, px] of [-W * 0.32, 0, W * 0.32].entries()) {
        const pl = planter(i); pl.position.set(px, 0.4, D * 0.66); g.add(pl);
      }
      const ch = roofProp('chimney'); ch.position.set(W * 0.26, 10.2, -D * 0.18); g.add(ch);
      break;
    }
    case 'restroom': {
      hut('#5b9ec4', 7);
      // 쌍문 — 화장실의 실루엣 정체성 (남/녀 색 구분)
      for (const [i, sx] of [-1, 1].entries()) {
        const dr = door(W * 0.24, 3.6, i === 0 ? '#3d8fd6' : '#ef4b4b');
        dr.position.set(sx * W * 0.22, 2.2, D * 0.52); g.add(dr);
      }
      const vent = roofProp('vent'); vent.position.set(-W * 0.22, 8.6, -D * 0.12); g.add(vent);
      break;
    }
    case 'shower': {
      hut('#7fd0e6');
      for (let i = -1; i <= 1; i++) {
        const stall = shadedBox(W * 0.24, 4.4, 0.6, '#b8ecec');
        stall.position.set(i * W * 0.3, 2.4, D * 0.5);
        g.add(stall);
      }
      break;
    }
    case 'changing': {
      hut('#f2b53f');
      for (let i = -1; i <= 1; i++) {
        const curtain = shadedBox(W * 0.24, 4.2, 0.6, i === 0 ? '#e0604f' : '#f5e9cc');
        curtain.position.set(i * W * 0.3, 2.3, D * 0.5);
        g.add(curtain);
      }
      break;
    }
    case 'shade': {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Array<[number, number]>) {
        const post = shadedBox(0.8, 6, 0.8, WOOD_DARK);
        post.position.set((sx * W) / 2.4, 3, (sz * D) / 2.4);
        g.add(post);
      }
      const canopy = gable(W * 1.1, 2.6, D * 1.1, '#f2f4f0');
      canopy.position.y = 6;
      g.add(canopy);
      const deck = shadedBox(W * 0.9, 0.8, D * 0.9, WOOD);
      deck.position.y = 0.4;
      g.add(deck);
      break;
    }
    case 'deck': {
      // 부유 데크 — 파란 폰툰 큐브 + 그 위 판자. 기존 수상파크 폰툰과 같은 문법
      const floatBox = shadedBox(TILE * 0.92, 2.4, TILE * 0.92, '#315cc8');
      floatBox.position.y = 1.2;
      const plank = shadedBox(TILE * 0.86, 0.9, TILE * 0.86, '#c49a6a');
      plank.position.y = 2.7;
      g.add(floatBox, plank);
      break;
    }
    case 'path': {
      const p = shadedBox(TILE, 0.7, TILE, WOOD);
      p.position.y = 0.35;
      g.add(p);
      break;
    }
    case 'dock': {
      const deck = shadedBox(W, 1.2, D, WOOD);
      deck.position.y = 1.6;
      g.add(deck);
      for (let i = 0; i < 4; i++) {
        for (const sx of [-1, 1]) {
          const post = shadedBox(1.1, 4, 1.1, WOOD_DARK);
          post.position.set((sx * W) / 2.6, 0.4, -D / 2 + (D * (i + 0.5)) / 4);
          g.add(post);
        }
      }
      break;
    }
    case 'slide': {
      const base = shadedBox(W * 0.9, 2.4, D * 0.55, '#f2f4f0');
      base.position.set(0, 1.2, -D * 0.2);
      g.add(base);
      const tower = shadedBox(W * 0.42, 11, D * 0.34, '#a8d84a');
      tower.position.set(-W * 0.16, 6.5, -D * 0.24);
      g.add(tower);
      const chute = shadedBox(W * 0.3, 1.4, D * 0.78, '#3d8fd6');
      chute.rotation.x = -0.52;
      chute.position.set(W * 0.2, 5.4, D * 0.1);
      g.add(chute);
      break;
    }
    case 'trampoline': {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.min(W, D) * 0.42, 2.2, 8, 14),
        lam('#a8d84a'),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 2.0;
      g.add(ring);
      const mat = new THREE.Mesh(
        new THREE.CylinderGeometry(Math.min(W, D) * 0.32, Math.min(W, D) * 0.32, 0.8, 14),
        lam('#2b3a4a'),
      );
      mat.position.y = 2.2;
      g.add(mat);
      break;
    }
    case 'pool': {
      const rim = shadedBox(W, 2.6, D, '#f5dc55');
      rim.position.y = 1.3;
      g.add(rim);
      const inner = shadedBox(W * 0.78, 1.0, D * 0.7, '#49c0d8');
      inner.position.y = 2.2;
      g.add(inner);
      break;
    }
    default: {
      hut('#a0947e');
    }
  }
  return g;
}

export interface SimView {
  group: THREE.Group;
  sync: () => void;
  /** 스프라이트 로드 후 시설 메시를 통째로 다시 만든다 */
  rebuild: () => void;
  updateGuests: () => void;
}

export function makeSimView(sim: Game, camera: THREE.Camera): SimView {
  const group = new THREE.Group();

  // ── 시설 ──
  const facilityMeshes = new Map<number, THREE.Group>();
  const sync = (): void => {
    const seen = new Set<number>();
    for (const f of sim.facilities.all as Iterable<PlacedFacility>) {
      seen.add(f.iid);
      if (facilityMeshes.has(f.iid)) continue;
      const def = requireFacilityDef(f.defId);
      const [fw, fh] = footprint(def, f.rot);
      // 스프라이트가 있으면 빌보드, 없으면 파라메트릭 — 섞여 돌아간다.
      // (게이트·선착장·길·데크는 지면 구조물이라 계속 3D 다)
      const mesh = makeFacilitySprite(f.defId, camera, fw, fh) ?? buildFacility(f.defId, fw, fh);
      const c = footprintCenter(f.x, f.y, fw, fh);
      // 잔교(육상 행) 위 시설은 상판 높이만큼 올라선다
      mesh.position.set(c.x, f.y < LAND_ROWS ? PIER_TOP : 0, c.z);
      applyToon(mesh);
      group.add(mesh);
      facilityMeshes.set(f.iid, mesh);
    }
    for (const [iid, mesh] of facilityMeshes) {
      if (seen.has(iid)) continue;
      group.remove(mesh);
      facilityMeshes.delete(iid);
    }
  };

  /** 스프라이트가 늦게 로드됐을 때 — 이미 세운 시설 메시를 버리고 다시 만든다 */
  const rebuild = (): void => {
    for (const [, mesh] of facilityMeshes) group.remove(mesh);
    facilityMeshes.clear();
    sync();
  };

  // ── 손님 (스프라이트 인스턴스 한 벌) ──
  // 예전엔 조끼·반바지·머리·머리칼 3D 인형 4벌이었다. 건물이 픽셀 스프라이트가 되니
  // 손님만 매끈한 덩어리로 남아 화면에서 가장 눈에 띄는 이음새가 됐다 (Stage 2 실측).
  const guests = makeGuestSprites(camera, MAX_GUESTS);
  group.add(guests.mesh);
  applyToon(group);

  const tmp = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const ONE = new THREE.Vector3(1, 1, 1);
  // 빌보드 방향은 카메라 고정 — 인스턴스 행렬에 한 번 구워 넣는다
  const BILLBOARD = camera.quaternion.clone();
  const UP = new THREE.Vector3(0, 1, 0).applyQuaternion(BILLBOARD);
  const HALF_H = (19 * TEXEL_WORLD) / 2; // guest-sprite.ts H 와 일치할 것 // 밑변이 접지점을 지나게

  const updateGuests = (): void => {
    const attr = guests.mesh.geometry.getAttribute('aUvRect') as THREE.InstancedBufferAttribute;
    let i = 0;
    for (const g of sim.guests.all) {
      if (i >= MAX_GUESTS) break;
      // 타일 보간 — sim 이 p(0..1) 로 현재→다음 진행도를 준다
      const tx = g.cx + (g.nx - g.cx) * g.p;
      const ty = g.cy + (g.ny - g.cy) * g.p;
      const w = tileToWorld(tx, ty);
      // 데크 위를 걸으면 판자 높이만큼 올라선다 (물에 잠긴 것처럼 보이지 않게)
      const under = sim.facilities.facilityAt(Math.round(tx), Math.round(ty));
      const lift = under && under.defId === 'deck' ? 3.1 : ty < LAND_ROWS ? PIER_TOP : 0;

      pos.set(w.x, lift, w.z).addScaledVector(UP, HALF_H);
      tmp.compose(pos, BILLBOARD, ONE);
      guests.mesh.setMatrixAt(i, tmp);

      // 걷는 중일 때만 프레임이 돈다. 서 있으면 0 (정지 포즈)
      const moving = g.cx !== g.nx || g.cy !== g.ny;
      const frame = moving ? 1 + (Math.floor(g.anim * 3) % 2) : 0;
      const r = guests.rectIndex(g.id % PALETTE_COUNT, (g.facing as Dir) ?? 'down', frame) * 4;
      attr.setXYZW(i, guests.rects[r]!, guests.rects[r + 1]!, guests.rects[r + 2]!, guests.rects[r + 3]!);
      i++;
    }
    guests.setCount(i);
    guests.mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  };

  return { group, sync, rebuild, updateGuests };
}
