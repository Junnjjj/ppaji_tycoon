import * as THREE from 'three';
import { PARK } from './park.js';

/**
 * 시스템 6·7 — 손님과 움직임. Gauntlet §"사람이 밀도다".
 * 주황 구명조끼 손님 110+ 전원 인스턴싱 (조끼·반바지·머리·머리칼 4개 InstancedMesh).
 * 상태: 줄서기 / 보드워크·잔교·폰툰 둘레길 보행 / 수영(머리+팔) / 인플레이터블 위 / 미끄럼.
 * 바나나보트가 외곽 수역을 타원 주행(항적은 water 셰이더 uBoat), 구조보트 대기, 구름 드리프트.
 */

const VEST = ['#ff8c42', '#ff8c42', '#ff8c42', '#f2b53f'];
const SKIN = ['#edb98a', '#d99e6a', '#f2c9a0'];
const HAIR = ['#4a3826', '#2b2118', '#6b4a2e'];
const SHORT = ['#2e5972', '#3d8fd6', '#1e3348', '#ef4b4b'];

function hash(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type Kind = 'stand' | 'walk' | 'swim' | 'slide' | 'queue';

interface Guest {
  kind: Kind;
  x: number; y: number; z: number;   // 기준 위치 (walk/slide 는 경로가 덮어씀)
  rot: number;
  seed: number;
  path?: { ax: number; az: number; bx: number; bz: number; y: number; speed: number };
}

export interface GuestSystem {
  group: THREE.Group;
  banana: THREE.Group;
  rescue: THREE.Group;
  update: (t: number) => { boatX: number; boatZ: number; boatCos: number; boatSin: number };
}

export function makeGuests(): GuestSystem {
  const guests: Guest[] = [];
  const add = (g: Guest) => guests.push(g);

  // ── 줄서기 — 대여 오두막(월드 x −16) 앞, 남향 줄 ──
  for (let i = 0; i < 6; i++) {
    add({ kind: 'queue', x: -16 + (hash(i, 1) - 0.5) * 1.6, y: 1.0, z: -35 + i * 2.4, rot: Math.PI, seed: i });
  }
  // 매점(월드 x 18) 앞 줄
  for (let i = 0; i < 4; i++) {
    add({ kind: 'queue', x: 18 + (hash(i, 2) - 0.5) * 1.8, y: 1.0, z: -35.5 + i * 2.5, rot: Math.PI, seed: i + 10 });
  }

  // ── 보드워크 보행 ──
  for (let i = 0; i < 9; i++) {
    add({
      kind: 'walk', x: 0, y: 1.0, z: 0, rot: 0, seed: i + 20,
      path: { ax: -38, az: -37.5 - hash(i, 3) * 3, bx: 72, bz: -37.5 - hash(i, 3) * 3, y: 1.0, speed: 2.2 + hash(i, 4) * 1.6 },
    });
  }
  // ── 잔교 보행 ──
  for (let i = 0; i < 4; i++) {
    add({
      kind: 'walk', x: 0, y: 3.0, z: 0, rot: 0, seed: i + 30,
      path: { ax: -58, az: 8 + hash(i, 5) * 4, bx: -18, bz: 8 + hash(i, 5) * 4, y: 3.0, speed: 2.0 + hash(i, 6) },
    });
  }
  // ── 진입 다리 ──
  for (let i = 0; i < 3; i++) {
    add({
      kind: 'walk', x: 0, y: 2.7, z: 0, rot: 0, seed: i + 40,
      path: { ax: -13.5, az: 4, bx: -13.5, bz: 33, y: 2.7, speed: 2.4 + hash(i, 7) },
    });
  }
  // ── 폰툰 둘레길 보행 (북변·남변) ──
  for (let i = 0; i < 6; i++) {
    add({
      kind: 'walk', x: 0, y: 2.7, z: 0, rot: 0, seed: i + 50,
      path: { ax: PARK.x0 + 4, az: PARK.z0, bx: PARK.x1 - 4, bz: PARK.z0, y: 2.7, speed: 1.8 + hash(i, 8) * 1.4 },
    });
  }
  for (let i = 0; i < 5; i++) {
    add({
      kind: 'walk', x: 0, y: 2.7, z: 0, rot: 0, seed: i + 60,
      path: { ax: PARK.x0 + 6, az: PARK.z1, bx: PARK.x1 - 6, bz: PARK.z1, y: 2.7, speed: 1.6 + hash(i, 9) * 1.2 },
    });
  }
  // ── 해변 ──
  for (let i = 0; i < 7; i++) {
    const bx = -30 + hash(i, 10) * 120;
    add({ kind: 'stand', x: bx, y: 0.3, z: -8 - hash(i, 11) * 9, rot: hash(i, 12) * 6.28, seed: i + 70 });
  }
  // ── 본관 테라스 ──
  for (let i = 0; i < 4; i++) {
    add({ kind: 'stand', x: 8 + i * 14 + hash(i, 27) * 5, y: 4.6, z: -84 - hash(i, 28) * 6, rot: hash(i, 29) * 6.28, seed: i + 80 });
  }

  // ── 인플레이터블 위 (패드·런·빙산·슬라이드 플랫폼·롤러 근처) ──
  const ON_PARK: Array<[number, number, number]> = [
    [-40, 62, 14.2],   // 빙산 꼭대기 근처
    [-36, 68, 3.6], [-24, 76, 3.6], [-18, 62, 3.6],
    [4, 66, 22.6],     // 슬라이드 플랫폼
    [-2, 88, 3.6], [14, 95, 3.6], [22, 100, 3.6],
    [34, 106, 4.4],    // 트램폴린 링
    [46, 64, 8.6],     // 롤러 위
    [-44, 88, 3.6], [-40, 104, 3.6], [8, 114, 3.6], [52, 88, 3.6], [27, 70, 3.6],
  ];
  ON_PARK.forEach(([x, z, y], i) => {
    add({ kind: 'stand', x, y, z, rot: hash(i, 13) * 6.28, seed: i + 90 });
  });

  // ── 미끄럼 타는 중 2명 ──
  add({ kind: 'slide', x: -0.6, y: 0, z: 0, rot: Math.PI, seed: 200 });
  add({ kind: 'slide', x: 4.6, y: 0, z: 0, rot: Math.PI, seed: 201 });

  // ── 수영 — 파크 내부 + 외곽 ──
  for (let i = 0; i < 26; i++) {
    const x = PARK.x0 + 10 + hash(i, 14) * (PARK.x1 - PARK.x0 - 20);
    const z = PARK.z0 + 10 + hash(i, 15) * (PARK.z1 - PARK.z0 - 20);
    add({ kind: 'swim', x, y: -0.4, z, rot: hash(i, 16) * 6.28, seed: i + 100 });
  }
  for (let i = 0; i < 9; i++) {
    add({
      kind: 'swim',
      x: 80 + hash(i, 17) * 60, y: -0.4, z: 10 + hash(i, 18) * 40,
      rot: hash(i, 19) * 6.28, seed: i + 130,
    });
  }
  for (let i = 0; i < 5; i++) {
    add({ kind: 'swim', x: -70 + hash(i, 23) * 30, y: -0.4, z: 40 + hash(i, 24) * 50, rot: hash(i, 25) * 6.28, seed: i + 140 });
  }
  // 하단 우측 외곽 수역
  for (let i = 0; i < 6; i++) {
    add({ kind: 'swim', x: -15 + hash(i, 26) * 55, y: -0.4, z: 142 + hash(i, 35) * 46, rot: hash(i, 36) * 6.28, seed: i + 150 });
  }

  const N = guests.length;

  // ── 인스턴스드 메시 4종 ──
  const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const white = () => new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const vests = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 1.5, 1.1), white(), N);
  const shorts = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.0, 1.0), white(), N);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.82, 6, 5), white(), N);
  const hairs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.84, 6, 5), white(), N);
  // 수영 팔 — 수영객만 쓰지만 전체 N 할당 (안 쓰면 스케일 0)
  const armL = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 5, 4), lam('#edb98a'), N);
  const armR = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 5, 4), lam('#edb98a'), N);

  const color = new THREE.Color();
  guests.forEach((g, i) => {
    color.set(VEST[Math.floor(hash(g.seed, 31) * VEST.length)]!);
    vests.setColorAt(i, color);
    color.set(SHORT[Math.floor(hash(g.seed, 32) * SHORT.length)]!);
    shorts.setColorAt(i, color);
    color.set(SKIN[Math.floor(hash(g.seed, 33) * SKIN.length)]!);
    heads.setColorAt(i, color);
    color.set(HAIR[Math.floor(hash(g.seed, 34) * HAIR.length)]!);
    hairs.setColorAt(i, color);
  });

  const group = new THREE.Group();
  group.add(vests, shorts, heads, hairs, armL, armR);

  // ── 바나나보트 — 노랑 3분절 + 탑승객 4 ──
  const banana = new THREE.Group();
  for (let s = -1; s <= 1; s++) {
    const seg = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 4.6, 4, 7), lam('#ffd23f'));
    seg.rotation.z = Math.PI / 2;
    seg.position.set(s * 4.4, 1.2 + Math.abs(s) * 0.5, 0);
    seg.rotation.y = 0;
    seg.rotation.x = s * 0.12;
    banana.add(seg);
  }
  for (let r = 0; r < 4; r++) {
    const rx = -4.8 + r * 3.2;
    const v = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.1), lam(r % 3 === 2 ? '#f2b53f' : '#ff8c42'));
    v.position.set(rx, 2.9, 0);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.75, 6, 5), lam(SKIN[r % 3]!));
    h.position.set(rx, 4.2, 0);
    const hr = new THREE.Mesh(new THREE.SphereGeometry(0.77, 6, 5), lam(HAIR[r % 3]!));
    hr.position.set(rx - 0.15, 4.45, 0);
    hr.scale.set(1, 0.62, 1);
    banana.add(v, h, hr);
  }
  banana.scale.setScalar(1.35);
  group.add(banana);

  // ── 구조보트 — 빨간 헐 + 흰 십자 ──
  const rescue = new THREE.Group();
  const rhull = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 7, 4, 8), lam('#ef4b4b'));
  rhull.rotation.z = Math.PI / 2;
  rhull.scale.set(0.6, 1, 1);
  rhull.position.y = 1.4;
  rescue.add(rhull);
  const rdeck = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.8, 3.0), lam('#f2f4f0'));
  rdeck.position.y = 2.5;
  rescue.add(rdeck);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 2.8), lam('#ef4b4b'));
  crossV.position.y = 3.1;
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 1.0), lam('#ef4b4b'));
  crossH.position.y = 3.1;
  rescue.add(crossV, crossH);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.1), lam('#ef4b4b'));
  guard.position.set(-3.2, 3.6, 0);
  const ghead = new THREE.Mesh(new THREE.SphereGeometry(0.75, 6, 5), lam('#edb98a'));
  ghead.position.set(-3.2, 4.9, 0);
  rescue.add(guard, ghead);
  rescue.position.set(-64, 0, 138);
  rescue.rotation.y = 0.9;
  group.add(rescue);

  // ── 프레임 갱신 ──
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // 슬라이드 레인 월드 근사: 상단 (4+lx, 19, 87) → 하단 (4+lx, 3.2, 105)
  const slideTop = { y: 19, z: 87 };
  const slideBot = { y: 3.2, z: 105 };

  function update(t: number): { boatX: number; boatZ: number; boatCos: number; boatSin: number } {
    guests.forEach((g, i) => {
      let x = g.x, y = g.y, z = g.z, rot = g.rot;
      const ph = g.seed * 1.7;

      if (g.kind === 'walk' && g.path) {
        const P = g.path;
        const len = Math.hypot(P.bx - P.ax, P.bz - P.az);
        const cyc = fract((t * P.speed) / (len * 2) + hash(g.seed, 41));
        const s = cyc < 0.5 ? cyc * 2 : (1 - cyc) * 2; // 왕복
        x = P.ax + (P.bx - P.ax) * s;
        z = P.az + (P.bz - P.az) * s;
        y = P.y + Math.abs(Math.sin(t * 7 + ph)) * 0.25; // 종종걸음 바운스
        const dir = cyc < 0.5 ? 1 : -1;
        rot = Math.atan2((P.bx - P.ax) * dir, (P.bz - P.az) * dir);
      } else if (g.kind === 'swim') {
        y = -0.4 + Math.sin(t * 1.6 + ph) * 0.22;
        x += Math.sin(t * 0.5 + ph) * 0.8;
        z += Math.cos(t * 0.4 + ph * 1.3) * 0.6;
      } else if (g.kind === 'slide') {
        const s = fract(t * 0.22 + hash(g.seed, 42));
        y = slideTop.y + (slideBot.y - slideTop.y) * s;
        z = slideTop.z + (slideBot.z - slideTop.z) * s;
        x = 4 + g.x;
        if (s > 0.93) y = -0.5; // 입수 순간
      } else if (g.kind === 'queue') {
        y = g.y + (hash(g.seed, 43) < 0.3 ? Math.abs(Math.sin(t * 5 + ph)) * 0.15 : 0);
      } else {
        y = g.y + Math.sin(t * 2.2 + ph) * 0.06; // 서 있는 손님 미세 흔들림
      }

      q.setFromAxisAngle(up, rot);

      if (g.kind === 'swim') {
        // 머리+팔만 — 조끼 상단 살짝, 반바지 숨김
        m.compose(new THREE.Vector3(x, y + 0.4, z), q, new THREE.Vector3(1, 0.55, 1));
        vests.setMatrixAt(i, m);
        shorts.setMatrixAt(i, ZERO);
        m.compose(new THREE.Vector3(x, y + 1.55, z), q, new THREE.Vector3(1, 1, 1));
        heads.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(x - 0.12, y + 1.82, z - 0.1), q, new THREE.Vector3(1, 0.62, 1));
        hairs.setMatrixAt(i, m);
        const flail = Math.sin(t * 3 + ph) * 0.5;
        m.compose(new THREE.Vector3(x + 1.25, y + 0.7 + flail * 0.3, z + 0.2), q, new THREE.Vector3(1, 1, 1));
        armL.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(x - 1.25, y + 0.7 - flail * 0.3, z - 0.2), q, new THREE.Vector3(1, 1, 1));
        armR.setMatrixAt(i, m);
      } else {
        m.compose(new THREE.Vector3(x, y + 2.0, z), q, new THREE.Vector3(1, 1, 1));
        vests.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(x, y + 0.85, z), q, new THREE.Vector3(1, 1, 1));
        shorts.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(x, y + 3.35, z), q, new THREE.Vector3(1, 1, 1));
        heads.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(x - 0.12, y + 3.62, z - 0.08), q, new THREE.Vector3(1, 0.62, 1));
        hairs.setMatrixAt(i, m);
        armL.setMatrixAt(i, ZERO);
        armR.setMatrixAt(i, ZERO);
      }
    });
    for (const im of [vests, shorts, heads, hairs, armL, armR]) im.instanceMatrix.needsUpdate = true;

    // 바나나보트 — 외곽 수역 타원 주행
    const bt = t * 0.16;
    const bx = -85 + Math.cos(bt) * 50;
    const bz = 172 + Math.sin(bt) * 24;
    // 진행 방향 (타원 접선)
    const dx = -Math.sin(bt) * 50;
    const dz = Math.cos(bt) * 24;
    const hd = Math.atan2(dx, dz);
    banana.position.set(bx, Math.sin(t * 1.8) * 0.25, bz);
    banana.rotation.y = hd;
    banana.rotation.z = Math.sin(t * 2.6) * 0.05;

    const hlen = Math.hypot(dx, dz);
    return { boatX: bx, boatZ: bz, boatCos: dx / hlen, boatSin: dz / hlen };
  }

  return { group, banana, rescue, update };
}

function fract(v: number): number {
  return v - Math.floor(v);
}
