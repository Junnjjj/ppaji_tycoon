import * as THREE from 'three';
import { shadedBox, shadedBoxGeo } from './shade.js';

/**
 * 시스템 4 — 수상파크 (화면의 주인공). quality-bar 실측 재현:
 * - 폰툰: 개별 큐브가 읽히는 로열블루 둘레길, 위에 주황 부표 점·빨간 깃발
 * - 인플레이터블: 올리브 라임 + 머티드 옐로. 튜브는 "구슬 체인"(짧은 구 나열)으로
 *   세그먼트 골을 표현 — 픽셀화 후 공기 튜브 특유의 울퉁불퉁함이 된다
 * - 다단 미끄럼 산(카메라를 향한 레인 2개+중앙 능선), 흰 클라임 빙산(계단 복셀+컬러 홀드),
 *   트램폴린(초록 링+검정 매트+흰 스티치), 롤러(줄무늬), 아치, 체커 통로 패드
 * - 물결 링: 부유물 좌표를 foam 리스트로 내보내 water 셰이더가 흰 대시 링을 그린다
 */

const LIME = '#98a838';
const LIME_LIGHT = '#b6c74e';
const LIME_DARK = '#6f8c2a';
const YELLOW = '#e2d25b';
const YELLOW_DEEP = '#d4af4c';
const PONTOON = '#315cc8';
const PONTOON_LIGHT = '#4971d4';
const PONTOON_DARK = '#2753a0';
const BUOY = '#d9942e';

export const PARK = { x0: -60, x1: 62, z0: 36, z1: 128 };

export type Foam = [number, number, number]; // x, z, 반지름

function lam(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

function box(w: number, h: number, d: number, color: string): THREE.Mesh {
  return shadedBox(w, h, d, color);
}

/** 구슬 체인 — 인플레이터블 튜브의 세그먼트 골 */
function beadChain(
  group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3,
  r: number, color: string, step = r * 1.5,
): void {
  const dir = to.clone().sub(from);
  const len = dir.length();
  dir.normalize();
  const n = Math.max(2, Math.round(len / step));
  const geo = new THREE.SphereGeometry(r, 7, 6);
  const mat = lam(color);
  for (let i = 0; i <= n; i++) {
    const b = new THREE.Mesh(geo, mat);
    b.position.copy(from).addScaledVector(dir, (len * i) / n);
    group.add(b);
  }
}

/** 폰툰 큐브들 — 둘레길 + 진입 다리를 한 InstancedMesh 로 */
export function makePontoons(): { mesh: THREE.InstancedMesh; buoys: THREE.Group; foam: Foam[] } {
  const size = 5.0;
  const { x0, x1, z0, z1 } = PARK;
  const cells: Array<[number, number]> = [];
  for (let x = x0; x <= x1; x += size) { cells.push([x, z0], [x, z1]); }
  for (let z = z0 + size; z < z1; z += size) { cells.push([x0, z], [x1, z]); }
  for (let z = 2; z < z0; z += size) { cells.push([-16, z], [-16 + size, z]); } // 진입 다리 2열

  const geo = shadedBoxGeo(size * 0.9, 3.0, size * 0.9);
  const mesh = new THREE.InstancedMesh(
    geo, new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }), cells.length,
  );
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  cells.forEach(([x, z], i) => {
    m.setPosition(x, 1.1 + (h(x, z) - 0.5) * 0.5, z);
    mesh.setMatrixAt(i, m);
    const r = h(x + 7, z + 3);
    c.set(r < 0.62 ? PONTOON : r < 0.87 ? PONTOON_DARK : PONTOON_LIGHT);
    if (r > 0.965) c.set(YELLOW);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const buoys = new THREE.Group();
  const bGeo = new THREE.SphereGeometry(1.15, 6, 5);
  const bMat = lam(BUOY);
  cells.forEach(([x, z], i) => {
    if (i % 5 !== 2) return;
    const b = new THREE.Mesh(bGeo, bMat);
    b.position.set(x, 3.4, z);
    buoys.add(b);
  });
  for (const [fx, fz] of [[x0, z0], [x1, z1], [x1, z0], [x0, z1]] as Array<[number, number]>) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 5), lam('#e8f4f8'));
    pole.position.set(fx, 6.5, fz);
    const flag = box(3.6, 2.4, 0.4, '#ef4b4b');
    flag.position.set(fx + 1.9, 9.6, fz);
    buoys.add(pole, flag);
  }

  const foam: Foam[] = [];
  for (let x = x0 + 8; x < x1; x += 24) { foam.push([x, z1 + 4.5, 3.2], [x + 12, z0 - 4.5, 3.2]); }
  return { mesh, buoys, foam };
}

/** 체커 통로 패드 — 라임 2톤 윗면 + 노랑 구슬 림 + 파랑 모서리 큐브 */
function makePad(
  w: number, d: number, x: number, z: number, rot = 0, dark = false,
): { g: THREE.Group; foam: Foam } {
  const g = new THREE.Group();
  const nx = Math.max(2, Math.round(w / 5));
  const nz = Math.max(1, Math.round(d / 5));
  const cw = w / nx, cd = d / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cell = box(
        cw * 0.96, 2.2, cd * 0.96,
        (i + j) % 2 === 0 ? (dark ? LIME_DARK : LIME) : (dark ? '#547021' : LIME_DARK),
      );
      cell.position.set(-w / 2 + cw * (i + 0.5), 1.4, -d / 2 + cd * (j + 0.5));
      g.add(cell);
    }
  }
  const r = 1.15;
  beadChain(g, new THREE.Vector3(-w / 2, 2.5, -d / 2), new THREE.Vector3(w / 2, 2.5, -d / 2), r, YELLOW);
  beadChain(g, new THREE.Vector3(-w / 2, 2.5, d / 2), new THREE.Vector3(w / 2, 2.5, d / 2), r, YELLOW);
  beadChain(g, new THREE.Vector3(-w / 2, 2.5, -d / 2), new THREE.Vector3(-w / 2, 2.5, d / 2), r, YELLOW_DEEP);
  beadChain(g, new THREE.Vector3(w / 2, 2.5, -d / 2), new THREE.Vector3(w / 2, 2.5, d / 2), r, YELLOW_DEEP);
  for (const [sx, sz] of [[-1, -1], [1, 1]] as Array<[number, number]>) {
    const corner = box(3.4, 3.0, 3.4, PONTOON);
    corner.position.set((w / 2 - 1.3) * sx, 1.7, (d / 2 - 1.3) * sz);
    g.add(corner);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return { g, foam: [x, z, Math.min(w, d) / 2 + 2.2] };
}

/** 다단 미끄럼 산 — 뒤 타워에서 카메라 쪽(+z)으로 쏟아지는 레인 2개 */
function makeSlide(x: number, z: number): { g: THREE.Group; foam: Foam[] } {
  const g = new THREE.Group();

  const base = makePad(42, 26, 0, 2, 0, true); // 어두운 체커 — 밝은 레인이 도드라지게
  g.add(base.g);

  // 메인 타워 (북쪽 뒤) — 라임 기둥 + 노랑 플랫폼 + 구슬 난간
  const towerH = 19;
  for (const [tx, tz] of [[-7, -9], [7, -9], [-7, -1], [7, -1]] as Array<[number, number]>) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, towerH, 6), lam(LIME_DARK));
    leg.position.set(tx, towerH / 2 + 1, tz);
    g.add(leg);
  }
  const platform = box(18, 3.0, 13, YELLOW);
  platform.position.set(0, towerH + 2.2, -5);
  g.add(platform);
  beadChain(g, new THREE.Vector3(-9, towerH + 4.6, -11), new THREE.Vector3(9, towerH + 4.6, -11), 1.2, LIME);
  beadChain(g, new THREE.Vector3(-9, towerH + 4.6, -11), new THREE.Vector3(-9, towerH + 4.6, 1), 1.2, LIME);
  beadChain(g, new THREE.Vector3(9, towerH + 4.6, -11), new THREE.Vector3(9, towerH + 4.6, 1), 1.2, LIME);

  // 레인 2개 — 플랫폼 앞(+z)으로 하강. 좁은 노랑 레인 + 두꺼운 라임 레일 + 중앙 능선
  const laneLen = 20;
  const drop = towerH - 2;                 // 램프 상단이 플랫폼보다 낮아 타워가 드러난다
  const ang = Math.atan2(drop, laneLen);
  const slide = new THREE.Group();
  const face = box(13, 1.6, laneLen + 2, YELLOW);
  slide.add(face);
  const ridgeC = box(2.2, 2.0, laneLen + 2, LIME_DARK); // 중앙 능선 (레인 분리)
  ridgeC.position.y = 0.5;
  slide.add(ridgeC);
  for (const rx of [-6.8, 6.8]) {
    beadChain(slide, new THREE.Vector3(rx, 1.6, -(laneLen + 2) / 2), new THREE.Vector3(rx, 1.6, (laneLen + 2) / 2), 1.9, LIME);
  }
  // 가로 세그먼트 바 — 인플레이터블 골의 리듬
  for (let k = 1; k <= 4; k++) {
    const bar = box(12.4, 1.7, 1.0, YELLOW_DEEP);
    bar.position.set(0, 0.1, -(laneLen + 2) / 2 + (k * (laneLen + 2)) / 5);
    slide.add(bar);
  }
  const midLen = Math.cos(ang) * (laneLen / 2);
  slide.position.set(0, (drop + 2) / 2 + 1.4, 2.5 + midLen);
  slide.rotation.x = ang; // +ang: 남쪽(+z, 카메라 쪽) 끝이 내려간다
  g.add(slide);

  // 클라임 면 — 동측 라임 경사 + 컬러 홀드
  const wall = box(12, 1.8, 16, LIME_LIGHT);
  wall.position.set(13.5, towerH / 2 + 1.5, -10.5);
  wall.rotation.x = -0.9;
  wall.rotation.y = 0.25;
  g.add(wall);
  const HOLDS = ['#ef4b4b', '#3d8fd6', '#4fbf72', '#f2b53f'];
  for (let i = 0; i < 8; i++) {
    const hold = new THREE.Mesh(new THREE.SphereGeometry(0.85, 5, 4), lam(HOLDS[i % HOLDS.length]!));
    const t = i / 7;
    hold.position.set(10.5 + (i % 3) * 2.6, 4 + t * (towerH - 5), -3.5 - t * 9);
    g.add(hold);
  }

  // 플랫폼 깃발
  const fpole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 5), lam('#e8f4f8'));
  fpole.position.set(8, towerH + 6.5, -10);
  const fflag = box(3.0, 2.0, 0.4, '#ef4b4b');
  fflag.position.set(9.6, towerH + 8.6, -10);
  g.add(fpole, fflag);

  g.position.set(x, 0, z);
  return { g, foam: [[x - 12, z + 15, 5], [x + 14, z + 14, 4.5], [x - 20, z - 2, 4]] };
}

/** 클라임 빙산 — 흰 계단 복셀 피라미드 + 컬러 홀드 */
function makeIceberg(x: number, z: number): { g: THREE.Group; foam: Foam } {
  const g = new THREE.Group();
  const steps: Array<[number, number, string]> = [
    [24, 4.0, '#e8ecea'], [19, 3.8, '#f2f8f8'], [14.2, 3.8, '#e8ecea'], [9.6, 3.6, '#f2f8f8'], [5, 3.4, '#dcecf0'],
  ];
  let y = 0;
  steps.forEach(([s, sh, col], i) => {
    const b = box(s, sh, s * 0.9, col);
    const jx = (i % 2 === 0 ? 0.8 : -0.6) * (i * 0.4);
    b.position.set(jx, y + sh / 2 + 0.6, i * 0.8);
    g.add(b);
    y += sh * 0.8;
  });
  const HOLDS = ['#ef4b4b', '#3d8fd6', '#4fbf72', '#f2b53f', '#ef4b4b', '#3d8fd6', '#4fbf72'];
  for (let i = 0; i < 7; i++) {
    const hold = new THREE.Mesh(new THREE.SphereGeometry(0.85, 5, 4), lam(HOLDS[i]!));
    const t = i / 6;
    hold.position.set(-6 + (i % 3) * 4.6 + t * 2, 2.5 + t * 12.5, 10.6 - t * 6.4);
    g.add(hold);
  }
  const ipole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5, 5), lam('#e8f4f8'));
  ipole.position.set(0.6, y + 3.2, 3.2);
  const iflag = box(2.6, 1.8, 0.4, '#3d8fd6');
  iflag.position.set(1.9, y + 4.9, 3.2);
  g.add(ipole, iflag);
  g.position.set(x, 0, z);
  return { g, foam: [x, z + 2, 13.5] };
}

/** 트램폴린 — 라임 튜브 링 + 검정 매트 + 흰 스티치 + 악센트 세그먼트 */
function makeTrampoline(x: number, z: number): { g: THREE.Group; foam: Foam } {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10.5, 3.2, 8, 16), lam(LIME));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 2.4;
  g.add(ring);
  for (const [ang, col] of [[0.4, YELLOW], [2.1, PONTOON], [3.9, YELLOW], [5.5, PONTOON]] as Array<[number, string]>) {
    const seg = box(4.2, 2.0, 3.2, col);
    seg.position.set(Math.cos(ang) * 10.5, 4.0, Math.sin(ang) * 10.5);
    seg.rotation.y = -ang;
    g.add(seg);
  }
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 1.0, 16), lam('#3a3f4a'));
  mat.position.y = 3.2;
  g.add(mat);
  const stitch = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.35, 5, 18), lam('#ffffff'));
  stitch.rotation.x = -Math.PI / 2;
  stitch.position.y = 3.85;
  g.add(stitch);
  g.position.set(x, 0, z);
  return { g, foam: [x, z, 13.2] };
}

/** 롤러 — 라임·노랑 줄무늬 원통 */
function makeRoller(x: number, z: number, yaw = 0): { g: THREE.Group; foam: Foam } {
  const g = new THREE.Group();
  const seg = 5, segLen = 4.4, r = 5.6;
  for (let i = 0; i < seg; i++) {
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, segLen * 0.94, 10),
      lam(i % 2 === 0 ? LIME : YELLOW),
    );
    cyl.rotation.z = Math.PI / 2;
    cyl.position.set(-((seg - 1) / 2) * segLen + i * segLen, 3.2, 0);
    g.add(cyl);
  }
  // 엔드캡 — 양끝 짙은 라임 원판
  for (const ex of [-(seg / 2) * segLen - 0.2, (seg / 2) * segLen + 0.2]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.9, 10), lam(LIME_DARK));
    cap.rotation.z = Math.PI / 2;
    cap.position.set(ex, 3.2, 0);
    g.add(cap);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return { g, foam: [x, z, 11.5] };
}

/** 아치 — 노랑 반원 튜브 + 라임 발판 */
function makeArch(x: number, z: number, yaw = 0): { g: THREE.Group; foam: Foam } {
  const g = new THREE.Group();
  const arch = new THREE.Mesh(new THREE.TorusGeometry(10.5, 1.8, 7, 14, Math.PI), lam(YELLOW));
  arch.position.y = 2.0;
  g.add(arch);
  // 접합부 링 — 튜브 분절이 읽히게 45°/135° 지점에 라임 밴드
  for (const a of [Math.PI * 0.25, Math.PI * 0.75]) {
    const band = box(2.4, 2.4, 2.7, LIME);
    band.position.set(Math.cos(a) * 10.5, 2.0 + Math.sin(a) * 10.5, 0);
    band.rotation.z = a;
    g.add(band);
  }
  for (const sx of [-10.5, 10.5]) {
    const foot = box(6.5, 3.0, 6.5, LIME_DARK);
    foot.position.set(sx, 1.7, 0);
    g.add(foot);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return { g, foam: [x, z, 11.5] };
}

/** 통로 런 — 두 지점을 잇는 긴 체커 워크웨이 (코스를 회로로 연결) */
function makeRun(ax: number, az: number, bx: number, bz: number, w = 6.5): { g: THREE.Group; foam: Foam } {
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(-(bz - az), bx - ax);
  const p = makePad(len, w, (ax + bx) / 2, (az + bz) / 2, yaw);
  return { g: p.g, foam: [(ax + bx) / 2, (az + bz) / 2, w / 2 + 2] };
}

/** 노랑 피라미드 범퍼 */
function makeBumper(x: number, z: number): THREE.Mesh {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5, 4), lam(YELLOW));
  cone.position.set(x, 3.2, z);
  cone.rotation.y = Math.PI / 4;
  return cone;
}

/** 라임 웨지 장애물 (레퍼런스 좌하단의 큰 덩어리) */
function makeWedge(x: number, z: number, yaw = 0): { g: THREE.Group; foam: Foam } {
  const g = new THREE.Group();
  const body = box(16, 6, 10, LIME);
  body.position.y = 3.4;
  g.add(body);
  const top = box(16.4, 1.6, 3.4, YELLOW);
  top.position.set(0, 6.6, 0);
  g.add(top);
  beadChain(g, new THREE.Vector3(-8, 1.6, 5.2), new THREE.Vector3(8, 1.6, 5.2), 1.4, LIME_DARK);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return { g, foam: [x, z, 11] };
}

/** 수상파크 전체 + 물결 링 좌표 */
export function makePark(): { group: THREE.Group; foam: Foam[] } {
  const group = new THREE.Group();
  const foam: Foam[] = [];

  const pontoons = makePontoons();
  group.add(pontoons.mesh, pontoons.buoys);
  foam.push(...pontoons.foam);

  const slide = makeSlide(4, 84);
  group.add(slide.g);
  foam.push(...slide.foam);

  const parts = [
    makeIceberg(-40, 60),
    makeTrampoline(34, 106),
    makeRoller(-36, 108, 0.25),
    makeRoller(48, 62, -0.2),
    makeArch(-46, 86, 0.35),
    makeArch(26, 48, 0),
    makeWedge(-20, 118, 0.15),
    // 통로 런 — 코스가 하나의 회로로 이어진다 (레퍼런스의 연결 구조)
    makeRun(-36, 66, -18, 80),        // 빙산 → 슬라이드 서변
    makeRun(14, 94, 28, 102),         // 슬라이드 남동 → 트램폴린
    makeRun(-10, 112, 22, 114),       // 남측 가로 런
    makeRun(-42, 74, -38, 104),       // 서측 세로 런 (빙산 → 롤러)
    makeRun(50, 64, 53, 90),          // 동측 세로 런 (롤러 → 패드)
    makeRun(-14, 46, -34, 54),        // 다리 어귀 → 빙산 북측
    makePad(12, 9, 27, 70, -0.15),
    makePad(11, 8, 54, 92, 0.3),
    makePad(10, 9, 8, 116, 0.1),
  ];
  for (const p of parts) {
    group.add(p.g);
    foam.push(p.foam);
  }
  // 노랑 피라미드 범퍼 — 런 위 리듬
  group.add(makeBumper(-27, 73), makeBumper(6, 112), makeBumper(51, 78));

  // 외곽 부표 체인
  const chain: Array<[number, number]> = [];
  const off = 12;
  const { x0, x1, z0, z1 } = PARK;
  for (let x = x0 - off; x <= x1 + off; x += 7) chain.push([x, z1 + off]);
  for (let z = z0; z <= z1 + off; z += 7) { chain.push([x0 - off, z], [x1 + off, z]); }
  const chainMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1.0, 6, 5), lam(BUOY), chain.length,
  );
  const m = new THREE.Matrix4();
  chain.forEach(([x, z], i) => { m.setPosition(x, 0.7, z); chainMesh.setMatrixAt(i, m); });
  chainMesh.instanceMatrix.needsUpdate = true;
  group.add(chainMesh);

  return { group, foam };
}
