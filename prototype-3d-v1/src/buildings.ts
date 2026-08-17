import * as THREE from 'three';
import { shadedBox } from './shade.js';

/**
 * 시스템 5 — 건물·서비스열·잔교·보트. quality-bar 실측 재현:
 * - 본관: 석축 테라스 위 3층. 청록 우진각 지붕(층간 스커트 지붕), 크림 벽,
 *   연속 창문 줄(유리 블루+흰 멀리언), 흰 난간+화분, 계단, 파라솔, 진입로 승합차
 * - 서비스열: 나무 보드워크 위 — 흰 천막, 구명조끼 랙+대여 오두막, 매점(차양),
 *   안전요원 타워(빨간 십자 간판)
 * - 잔교: 플랭크 라인·볼라드·램프·수중 말뚝·핑거 피어, 색색 보트·제트스키 정박
 */

const CREAM = '#e9dbc3';
const CREAM_SHADE = '#d2bc9c';
const RAIL = '#ffffff';
const TEAL = '#2e8676';
const TEAL_DARK = '#1f6b5e';
const GLASS = '#38628d';
const GLASS_LIGHT = '#497292';
const PLANK = '#ad8b5a';
const PLANK_LIGHT = '#c69557';
const PLANK_DARK = '#8a6a3e';
const STONE = '#b2a99a';
const STONE_LIGHT = '#c4b7a7';

function lam(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w: number, h: number, d: number, color: string): THREE.Mesh {
  return shadedBox(w, h, d, color);
}

/** 우진각(hip) 지붕 — 4각 피라미드. 회전·스케일을 지오메트리에 굽는다
 * (메시에서 회전 후 비균일 스케일하면 대각으로 뒤틀린다) */
function hipRoof(w: number, h: number, d: number, color: string): THREE.Mesh {
  const geo = new THREE.ConeGeometry(1, 1, 4);
  geo.rotateY(Math.PI / 4);
  geo.scale(w / 1.414, h, d / 1.414);
  geo.translate(0, h / 2, 0); // 원점 = 처마선
  return new THREE.Mesh(geo, lam(color));
}

/** 지붕 기와 골 — 우진각 사면을 가로지르는 어두운 수평 밴드 2~3줄 */
function roofGrooves(w: number, h: number, d: number, color: string): THREE.Group {
  const g = new THREE.Group();
  for (const f of [0.3, 0.62]) {
    const gw = w * (1 - f) + 1.2;
    const gd = d * (1 - f) + 1.2;
    const band = new THREE.Mesh(new THREE.BoxGeometry(gw, 0.55, gd), lam(color));
    band.position.y = h * f;
    g.add(band);
  }
  return g;
}

/** 흰 난간 — 포스트 + 상단 레일 */
function railing(len: number, axis: 'x' | 'z' = 'x'): THREE.Group {
  const g = new THREE.Group();
  const rail = box(axis === 'x' ? len : 0.8, 0.8, axis === 'x' ? 0.8 : len, RAIL);
  rail.position.y = 2.6;
  g.add(rail);
  const n = Math.max(2, Math.round(len / 4.5));
  for (let i = 0; i <= n; i++) {
    const post = box(0.8, 2.8, 0.8, RAIL);
    const off = -len / 2 + (len * i) / n;
    post.position.set(axis === 'x' ? off : 0, 1.4, axis === 'x' ? 0 : off);
    g.add(post);
  }
  return g;
}

/** 창문 줄 — 개별 창(유리 블루)들이 리듬을 만든다 */
function windowRow(len: number, h: number, color = GLASS): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(2, Math.round(len / 6.4));
  const pitch = len / n;
  for (let i = 0; i < n; i++) {
    const win = box(pitch * 0.62, h, 0.7, i % 3 === 1 ? GLASS_LIGHT : color);
    win.position.x = -len / 2 + pitch * (i + 0.5);
    g.add(win);
    const frame = box(pitch * 0.62 + 0.7, 0.5, 0.75, RAIL);
    frame.position.set(win.position.x, h / 2 + 0.2, 0);
    g.add(frame);
  }
  const sill = box(len + 0.6, 0.6, 0.9, RAIL);
  sill.position.y = -h / 2;
  g.add(sill);
  // 발코니 그림자 — 창 줄 아래 어두운 밴드
  const shadow = box(len + 0.6, 0.8, 0.5, '#a0947e');
  shadow.position.set(0, -h / 2 - 0.7, 0.1);
  g.add(shadow);
  return g;
}

/** 화분 줄 — 초록 덤불 + 꽃 점 */
function flowerBox(g: THREE.Group, x: number, y: number, z: number, seed: number): void {
  const planter = box(3.4, 1.0, 1.6, PLANK_DARK);
  planter.position.set(x, y, z);
  g.add(planter);
  const bush = new THREE.Mesh(new THREE.SphereGeometry(2.0, 6, 5), lam('#4e7a3c'));
  bush.scale.y = 0.7;
  bush.position.set(x, y + 1.3, z);
  g.add(bush);
  const colors = ['#e089b8', '#ef4b4b', '#ff8c42', '#f2b53f'];
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.9, 5, 4), lam(colors[seed % 3]!));
  fl.position.set(x + 0.8, y + 2.3, z + 0.4);
  g.add(fl);
}

function parasol(x: number, y: number, z: number, color = CREAM): THREE.Group {
  const g = new THREE.Group();
  const pole = box(0.6, 5.5, 0.6, PLANK_DARK);
  pole.position.set(x, y + 2.7, z);
  const top = new THREE.Mesh(new THREE.ConeGeometry(5.2, 3.0, 8), lam(color));
  top.position.set(x, y + 6.2, z);
  g.add(pole, top);
  return g;
}

/** 리조트 본관 — 석축 테라스 2단 + 3층 + 스커트 지붕 */
export function makeLodge(): THREE.Group {
  const g = new THREE.Group();
  const CZ = -108; // 본관 중심 z

  // 석축 테라스 — 아래(넓고 낮게) → 위
  const t1 = box(104, 4.5, 40, STONE_LIGHT); t1.position.set(0, 2.2, CZ + 6);
  const t2 = box(88, 5, 30, STONE); t2.position.set(0, 6.8, CZ + 1);
  g.add(t1, t2);
  // 석축 전면 계단
  for (let s = 0; s < 4; s++) {
    const st = box(12, 1.2, 2.2, STONE_LIGHT);
    st.position.set(10, 3.6 - s * 1.1, CZ + 26 + s * 2.0);
    g.add(st);
  }

  // 1층
  const f1 = box(70, 11, 22, '#fdf3e0'); f1.position.set(0, 14.8, CZ - 2);
  g.add(f1);
  const w1 = windowRow(58, 5.5); w1.position.set(0, 15.5, CZ + 9.5); g.add(w1);
  // 1층 스커트 지붕 (청록)
  const skirt1 = box(74, 1.2, 5.5, TEAL);
  skirt1.rotation.x = 0.42;
  skirt1.position.set(0, 21.2, CZ + 10.2);
  g.add(skirt1);

  // 2층 (셋백) — 1층 지붕 위 테라스
  const f2 = box(56, 10, 18, CREAM); f2.position.set(-2, 25.2, CZ - 4);
  g.add(f2);
  const w2 = windowRow(46, 5); w2.position.set(-2, 26, CZ + 5.6); g.add(w2);
  const skirt2 = box(60, 1.1, 5, TEAL);
  skirt2.rotation.x = 0.42;
  skirt2.position.set(-2, 31.0, CZ + 6.4);
  g.add(skirt2);
  // 2층 앞 테라스 난간 + 화분 (1층 지붕 위)
  const r2 = railing(64); r2.position.set(0, 20.4, CZ + 8.2); g.add(r2);
  flowerBox(g, -22, 21.4, CZ + 7.4, 0);
  flowerBox(g, -6, 21.4, CZ + 7.4, 3);
  flowerBox(g, 12, 21.4, CZ + 7.4, 1);
  flowerBox(g, 26, 21.4, CZ + 7.4, 2);

  // 3층 (더 셋백)
  const f3 = box(38, 9, 15, '#fdf3e0'); f3.position.set(-4, 34.7, CZ - 5);
  g.add(f3);
  const w3 = windowRow(30, 4.6); w3.position.set(-4, 35.2, CZ + 2.6); g.add(w3);
  const r3 = railing(50); r3.position.set(-2, 30.3, CZ + 4.6); g.add(r3);
  flowerBox(g, -18, 31.3, CZ + 3.8, 1);
  flowerBox(g, 10, 31.3, CZ + 3.8, 2);
  flowerBox(g, -2, 31.3, CZ + 3.8, 0);

  // 옥상 우진각 지붕 (청록, 처마 돌출) + 용마루
  const roof = hipRoof(46, 7.5, 21, TEAL);
  roof.position.set(-4, 39.2, CZ - 5);
  g.add(roof);
  const ridge = box(18, 1.0, 1.6, TEAL_DARK);
  ridge.position.set(-4, 46.2, CZ - 5);
  g.add(ridge);
  const rg1 = roofGrooves(46, 7.5, 21, TEAL_DARK);
  rg1.position.set(-4, 39.2, CZ - 5);
  g.add(rg1);
  // 동측 낮은 윙 지붕
  const wing = hipRoof(20, 5, 18, TEAL);
  wing.position.set(28, 20.6, CZ - 3);
  g.add(wing);
  const rg2 = roofGrooves(20, 5, 18, TEAL_DARK);
  rg2.position.set(28, 20.6, CZ - 3);
  g.add(rg2);

  // 지상 테라스 난간 + 파라솔 + 덤불
  const rg = railing(96); rg.position.set(0, 4.4, CZ + 25); g.add(rg);
  g.add(parasol(-30, 4.4, CZ + 18), parasol(30, 4.4, CZ + 16, '#f2b53f'));
  flowerBox(g, -8, 5.2, CZ + 22, 3);
  flowerBox(g, 18, 5.2, CZ + 22, 0);
  for (const [bx, bz] of [[-44, CZ + 18], [46, CZ + 16], [-14, CZ + 20]] as Array<[number, number]>) {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(2.6, 6, 5), lam('#5c8f3f'));
    bush.scale.y = 0.75;
    bush.position.set(bx, 5.6, bz);
    g.add(bush);
  }

  // 진입로 (서측) + 승합차
  const drive = box(26, 0.6, 14, STONE);
  drive.position.set(-62, 0.5, CZ + 22);
  g.add(drive);
  const van = new THREE.Group();
  const vb = box(10, 4.0, 4.8, '#e8f0f4'); vb.position.y = 3.2;
  const vg = box(8.4, 1.3, 4.9, GLASS); vg.position.set(0.6, 4.3, 0);
  const vstripe = box(10.2, 0.7, 4.9, '#3d8fd6'); vstripe.position.y = 2.2;
  van.add(vb, vg, vstripe);
  for (const [wx, wz] of [[-3.2, 2.2], [3.2, 2.2], [-3.2, -2.2], [3.2, -2.2]] as Array<[number, number]>) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.8, 8), lam('#1e2228'));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 1.0, wz);
    van.add(wheel);
  }
  van.position.set(-62, 0.8, CZ + 22);
  van.rotation.y = 0.15;
  g.add(van);

  g.rotation.y = -0.22; // 레퍼런스처럼 비스듬히 — 파사드가 서측 태양을 받는 방향
  g.position.x = 22;
  return g;
}

/** 서비스열 — 보드워크 위 천막·대여 오두막·매점·안전요원 타워 */
export function makeServiceRow(): THREE.Group {
  const g = new THREE.Group();
  const ZROW = -44;
  g.position.x = 14;

  // 보드워크 산책로 (플랭크 라인)
  const walk = box(132, 0.9, 18, PLANK);
  walk.position.set(0, 0.5, ZROW);
  g.add(walk);
  for (let x = -64; x <= 64; x += 2.6) {
    const line = box(0.35, 1.0, 17.4, PLANK_DARK);
    line.position.set(x, 0.52, ZROW);
    g.add(line);
  }

  // 흰 천막 2 (양끝)
  for (const tx of [-54, 56]) {
    const tent = new THREE.Group();
    for (const [dx, dz] of [[-5.5, -4], [5.5, -4], [-5.5, 4], [5.5, 4]] as Array<[number, number]>) {
      const pole = box(0.5, 6, 0.5, '#d8d0c0');
      pole.position.set(dx, 3, dz);
      tent.add(pole);
    }
    const canopy = hipRoof(15, 3.6, 12, '#f2f4f0');
    canopy.position.y = 6.0;
    tent.add(canopy);
    tent.position.set(tx, 0.9, ZROW);
    g.add(tent);
  }

  // 대여 오두막 + 구명조끼 랙 (주황 조끼 줄줄이)
  const hut2 = new THREE.Group();
  const w2 = box(13, 8, 9, CREAM_SHADE); w2.position.y = 4.0;
  const roof2 = hipRoof(14, 4.5, 9.6, '#3d8fd6'); roof2.position.y = 8.0;
  const rg2h = roofGrooves(14, 4.5, 9.6, '#2e5972'); rg2h.position.y = 8.0; hut2.add(rg2h);
  hut2.add(w2, roof2);
  hut2.position.set(-30, 0.9, ZROW - 2);
  g.add(hut2);
  for (let r = 0; r < 2; r++) {
    const rack = box(17, 0.6, 0.6, PLANK_DARK);
    rack.position.set(-30, 4.6 - r * 2.3, ZROW + 5.2 + r * 1.4);
    g.add(rack);
    for (let i = 0; i < 7; i++) {
      const vest = box(1.7, 2.1, 0.9, i % 4 === 3 ? '#f2b53f' : '#ff8c42');
      vest.position.set(-37.5 + i * 2.5, 3.4 - r * 2.3, ZROW + 5.2 + r * 1.4);
      g.add(vest);
    }
  }

  // 매점 오두막 (청록 지붕 + 빨간 차양 + 카운터)
  const shop = new THREE.Group();
  const sw = box(15, 8.5, 10, CREAM); sw.position.y = 4.3;
  const sroof = hipRoof(15.6, 5, 10.4, TEAL); sroof.position.y = 8.6;
  const sg = roofGrooves(15.6, 5, 10.4, TEAL_DARK); sg.position.y = 8.6; shop.add(sg);
  const awning = box(14, 0.9, 4.5, '#e0604f');
  awning.rotation.x = 0.4;
  awning.position.set(0, 6.6, 6.6);
  const counter = box(13, 2.6, 1.4, PLANK_LIGHT);
  counter.position.set(0, 1.4, 5.4);
  const sign = box(4.5, 3, 0.5, '#3d8fd6');
  sign.position.set(0, 6.6, 5.2);
  shop.add(sw, sroof, awning, counter, sign);
  shop.position.set(4, 0.9, ZROW - 1);
  g.add(shop);

  // 안전요원 타워 — 다리 4 + 캡 + 빨간 지붕 + 십자 간판 + 사다리
  const tower = new THREE.Group();
  for (const [dx, dz] of [[-2.8, -2.4], [2.8, -2.4], [-2.8, 2.4], [2.8, 2.4]] as Array<[number, number]>) {
    const leg = box(0.9, 9.5, 0.9, PLANK_DARK);
    leg.position.set(dx, 4.7, dz);
    tower.add(leg);
  }
  const cab = box(8, 5.5, 7, CREAM); cab.position.y = 12.2;
  const cwin = box(6.6, 2.4, 0.7, GLASS); cwin.position.set(0, 12.8, 3.6);
  const troof = hipRoof(10, 3.8, 9, TEAL_DARK); troof.position.y = 15.0;
  const tg = roofGrooves(10, 3.8, 9, '#1f6b5e'); tg.position.y = 15.0; tower.add(tg);
  const board = box(4.2, 3.4, 0.5, '#f2f4f0'); board.position.set(0, 8.0, 3.8);
  const crV = box(0.9, 2.6, 0.6, '#ef4b4b'); crV.position.set(0, 8.0, 3.9);
  const crH = box(2.6, 0.9, 0.6, '#ef4b4b'); crH.position.set(0, 8.0, 3.9);
  tower.add(cab, cwin, troof, board, crV, crH);
  // 사다리
  for (let s = 0; s < 5; s++) {
    const rung = box(2.2, 0.4, 0.4, PLANK_LIGHT);
    rung.position.set(4.6, 1.6 + s * 1.9, 2.8);
    tower.add(rung);
  }
  tower.position.set(34, 0.9, ZROW - 1);
  g.add(tower);

  return g;
}

export type Foam = [number, number, number];

function makeBoat(color: string, deck: string): THREE.Group {
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 8, 4, 8), lam(color));
  hull.rotation.z = Math.PI / 2;
  hull.scale.set(0.62, 1, 1);
  hull.position.y = 1.7;
  boat.add(hull);
  // 얇은 흰 워터라인
  const stripe = box(10.8, 0.7, 4.7, '#f2f4f0');
  stripe.position.y = 1.1;
  boat.add(stripe);
  // 갑판 (헐 색 유지 — 위에서 봐도 색이 읽히게)
  const deckTop = box(9.6, 0.8, 4.1, color);
  deckTop.position.y = 2.7;
  boat.add(deckTop);
  // 콕핏(검정 시트) + 윈드실드
  const cockpit = box(3.6, 0.9, 2.8, '#1e2228');
  cockpit.position.set(-1.8, 3.5, 0);
  boat.add(cockpit);
  const console = box(1.6, 1.0, 2.6, deck);
  console.position.set(1.6, 3.5, 0);
  boat.add(console);
  const shield = box(0.8, 1.2, 2.6, GLASS_LIGHT);
  shield.position.set(2.8, 3.8, 0);
  boat.add(shield);
  // 윈드실드 반사 — 상단 흰 하이라이트
  const glint = box(0.5, 0.45, 1.6, '#ffffff');
  glint.position.set(2.9, 4.5, -0.4);
  boat.add(glint);
  // 헐 데칼 스트라이프 (액센트)
  const decal = box(9.9, 0.5, 4.75, deck === '#f2f4f0' ? '#1e3348' : '#ef4b4b');
  decal.position.y = 1.7;
  boat.add(decal);
  return boat;
}

function makeJetski(color: string): THREE.Group {
  const j = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 3.8, 4, 7), lam(color));
  body.rotation.z = Math.PI / 2;
  body.scale.set(0.62, 1, 1);
  body.position.y = 0.9;
  j.add(body);
  const seat = box(2.0, 0.9, 1.1, '#1e2228');
  seat.position.set(-0.5, 2.0, 0);
  j.add(seat);
  const handle = box(0.5, 1.2, 1.6, '#3a3f4a');
  handle.position.set(1.6, 2.0, 0);
  j.add(handle);
  const nose = box(1.2, 0.5, 1.4, '#f2f4f0');
  nose.position.set(2.4, 1.5, 0);
  j.add(nose);
  return j;
}

/** 잔교 + 핑거 피어 + 정박 보트·제트스키 */
export function makeDock(): { group: THREE.Group; foam: Foam[] } {
  const g = new THREE.Group();
  const foam: Foam[] = [];

  // 메인 잔교 — 해변 서측에서 물 위로
  const deckY = 2.2;
  const main = box(50, 1.5, 11, PLANK);
  main.position.set(-38, deckY, 10);
  g.add(main);
  // 플랭크 라인 (가로)
  for (let x = -61; x <= -15; x += 2.6) {
    const line = box(0.35, 1.6, 10.4, PLANK_DARK);
    line.position.set(x, deckY + 0.02, 10);
    g.add(line);
  }
  // 볼라드 + 수중 말뚝
  for (let x = -60; x <= -16; x += 8.5) {
    for (const dz of [-4.6, 4.6]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 5.5, 6), lam(PLANK_DARK));
      pile.position.set(x, 0.2, 10 + dz);
      g.add(pile);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.6, 6), lam(PLANK_LIGHT));
      cap.position.set(x, deckY + 1.4, 10 + dz);
      g.add(cap);
    }
  }
  // 볼라드 로프 — 남측 가장자리 캡 사이 처진 줄
  {
    const caps: number[] = [];
    for (let x = -60; x <= -16; x += 8.5) caps.push(x);
    for (let i = 0; i < caps.length - 1; i++) {
      const ax = caps[i]!, bx = caps[i + 1]!;
      const rope = box((bx - ax) - 1.2, 0.5, 0.5, '#4a3826');
      rope.position.set((ax + bx) / 2, deckY + 1.5, 10 + 4.6);
      rope.rotation.z = 0.06 * (i % 2 === 0 ? 1 : -1);
      g.add(rope);
    }
  }
  // 램프 2
  for (const lx of [-54, -24]) {
    const pole = box(0.5, 7, 0.5, '#3a3f4a');
    pole.position.set(lx, deckY + 4, 6.5);
    const lampTop = new THREE.Mesh(new THREE.SphereGeometry(1.0, 6, 5), lam('#f2f4f0'));
    lampTop.position.set(lx, deckY + 7.6, 6.5);
    g.add(pole, lampTop);
  }

  // 핑거 피어 3 — 남쪽으로
  for (const fx of [-56, -42, -28]) {
    const finger = box(3.2, 1.2, 15, PLANK_LIGHT);
    finger.position.set(fx, deckY - 0.3, 22);
    g.add(finger);
    foam.push([fx, 30.5, 2.6]);
  }

  // 보트 정박 — 핑거 사이 + 동측
  const BOATS: Array<[number, number, number, string, string]> = [
    [-49, 22, 0.12, '#ef4b4b', '#f2f4f0'],
    [-35, 23, -0.1, '#3d8fd6', '#f2f4f0'],
    [-21, 21, 0.18, '#2e3f6e', '#e8f0f4'],
    [-63, 21, -0.15, '#4fbf72', '#e8f0f4'],
  ];
  for (const [bx, bz, yaw, hull, deck] of BOATS) {
    const b = makeBoat(hull, deck);
    b.position.set(bx, 0, bz);
    b.rotation.y = Math.PI / 2 + yaw; // 뱃머리 남향
    g.add(b);
    foam.push([bx, bz, 6.2]);
  }

  // 제트스키 4 — 동측 해변 앞 (파크 동편 여백)
  const JETS: Array<[number, number, number, string]> = [
    [38, 14, 0.3, '#ef4b4b'],
    [46, 18, -0.2, '#f2b53f'],
    [54, 13, 0.5, '#3d8fd6'],
    [61, 19, 0.1, '#4fbf72'],
  ];
  for (const [jx, jz, yaw, col] of JETS) {
    const j = makeJetski(col);
    j.position.set(jx, 0, jz);
    j.rotation.y = yaw;
    g.add(j);
    foam.push([jx, jz, 3.6]);
  }
  // 제트스키 계류 부표
  for (const [jx, jz] of [[46, 16], [62, 16]] as Array<[number, number]>) {
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), lam('#d9942e'));
    buoy.position.set(jx, 0.7, jz);
    g.add(buoy);
  }

  return { group: g, foam };
}
