import * as THREE from 'three';
import type { Game, Course, SplineSample } from '../../src/sim/index.js';
import { requireEquipmentDef, sampleAtDistance } from '../../src/sim/index.js';
import { shadedBox } from './shade.js';
import { applyToon } from './toon.js';
import { tileToWorld } from './simworld.js';
import { G, VEST, SKIN, HAIR } from './guests.js';

/**
 * 견인 코스 뷰 — 고정 시설과 **다른 시스템**이다.
 * 코스는 발자국이 아니라 "경로 + 차량"이고, 손님은 `using` 이 아니라 `riding` 상태로 배에 탄다.
 *
 * 그리는 것 세 가지:
 *   1. 경로 — 스플라인을 따라 깔린 주황 부표 점 (레퍼런스의 코스 라인)
 *   2. 차량 — 진행도 u 를 좌표로 바꿔 얹은 보트 메시. 진행 방향으로 회전
 *   3. 탑승객 — riders 수만큼 배 위에 앉힌 인형 (정원이 눈에 보여야 처리량이 읽힌다)
 */

const MAX_BUOYS = 400;
const MAX_VEHICLES = 24;
const MAX_RIDERS = 80;

function lam(c: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: c });
}

/** 장비별 보트 메시 — 기존 buildings.ts 의 보트 문법을 따른다 */
function buildVehicle(defId: string): THREE.Group {
  const g = new THREE.Group();
  switch (defId) {
    case 'banana': {
      // 노란 3분절 튜브 + 파란 사이드 플로트
      for (let i = -1; i <= 1; i++) {
        const seg = new THREE.Mesh(new THREE.SphereGeometry(2.0, 8, 6), lam('#f5dc55'));
        seg.scale.set(1.5, 0.8, 1.0);
        seg.position.set(i * 3.4, 1.4, 0);
        g.add(seg);
      }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.4, 7), lam('#e2c23f'));
      nose.rotation.z = -Math.PI / 2;
      nose.position.set(6.4, 1.8, 0);
      g.add(nose);
      for (const sz of [-1, 1]) {
        const float = shadedBox(9, 1.2, 1.2, '#3d8fd6');
        float.position.set(0, 1.0, sz * 2.6);
        g.add(float);
      }
      break;
    }
    case 'jetski': {
      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 5.4, 4, 8), lam('#ef4b4b'));
      hull.rotation.z = Math.PI / 2;
      hull.scale.y = 0.6;
      hull.position.y = 1.5;
      const seat = shadedBox(3.0, 1.2, 2.0, '#2b3a4a');
      seat.position.set(-0.6, 2.6, 0);
      const bar = shadedBox(0.8, 1.2, 2.6, '#2b3a4a');
      bar.position.set(2.0, 3.0, 0);
      g.add(hull, seat, bar);
      break;
    }
    case 'flyfish': {
      const body = shadedBox(9, 1.8, 4.2, '#3d8fd6');
      body.position.y = 1.5;
      g.add(body);
      for (const sz of [-1, 1]) {
        const wing = shadedBox(5.5, 1.4, 3.2, '#f5dc55');
        wing.position.set(-1, 1.8, sz * 3.6);
        g.add(wing);
      }
      break;
    }
    default: {
      // wakeboard — 보드 + 로프 핸들
      const board = shadedBox(5.4, 0.8, 2.2, '#f5dc55');
      board.position.y = 1.1;
      const bind = shadedBox(1.4, 0.9, 1.6, '#ef4b4b');
      bind.position.set(-0.6, 1.7, 0);
      g.add(board, bind);
    }
  }
  return g;
}

export interface CourseView {
  group: THREE.Group;
  sync: () => void;
  update: () => void;
}

export function makeCourseView(sim: Game): CourseView {
  const group = new THREE.Group();

  // ── 경로 부표 (인스턴싱) ──
  const buoys = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.95, 6, 5), lam('#ff8c42'), MAX_BUOYS,
  );
  buoys.frustumCulled = false;
  buoys.count = 0;
  group.add(buoys);

  // ── 탑승객 (인스턴싱 3벌: 조끼·머리·머리칼) ──
  const white = (): THREE.MeshLambertMaterial => lam('#ffffff');
  const rVest = new THREE.InstancedMesh(new THREE.BoxGeometry(G.vestW, G.vestH, G.vestD), white(), MAX_RIDERS);
  const rHead = new THREE.InstancedMesh(new THREE.SphereGeometry(G.headR, 6, 5), white(), MAX_RIDERS);
  const rHair = new THREE.InstancedMesh(new THREE.SphereGeometry(G.hairR, 6, 5), white(), MAX_RIDERS);
  for (const m of [rVest, rHead, rHair]) {
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
  }
  applyToon(group);

  // ── 차량 풀 (코스 defId 별로 메시를 만들어 재사용) ──
  const pool: Array<{ mesh: THREE.Group; defId: string }> = [];
  let poolUsed = 0;
  const acquire = (defId: string): THREE.Group => {
    for (let i = poolUsed; i < pool.length; i++) {
      if (pool[i]!.defId !== defId) continue;
      const hit = pool[i]!;
      pool[i] = pool[poolUsed]!;
      pool[poolUsed] = hit;
      poolUsed++;
      hit.mesh.visible = true;
      return hit.mesh;
    }
    const mesh = buildVehicle(defId);
    applyToon(mesh);
    group.add(mesh);
    pool.splice(poolUsed, 0, { mesh, defId });
    poolUsed++;
    return mesh;
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const ONE = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const color = new THREE.Color();
  const HAIR_S = new THREE.Vector3(0.88, 0.34, 0.8);
  const UP = new THREE.Vector3(0, 1, 0);

  /** 경로 부표 재배치 — 코스가 생기거나 사라질 때만 */
  const sync = (): void => {
    let n = 0;
    for (const c of sim.courses.all as Iterable<Course>) {
      const step = Math.max(1, Math.floor(c.samples.length / 26));
      for (let i = 0; i < c.samples.length && n < MAX_BUOYS; i += step) {
        const s = c.samples[i] as SplineSample;
        const w = tileToWorld(s.pos.x - 0.5, s.pos.y - 0.5);
        m4.makeTranslation(w.x, 0.9, w.z);
        buoys.setMatrixAt(n++, m4);
      }
    }
    buoys.count = n;
    buoys.instanceMatrix.needsUpdate = true;
  };

  /** 차량·탑승객 갱신 — 매 프레임 */
  const update = (): void => {
    poolUsed = 0;
    let riderIdx = 0;

    for (const c of sim.courses.all as Iterable<Course>) {
      if (c.length <= 0) continue;
      const def = requireEquipmentDef(c.defId);
      for (const v of c.vehicles) {
        // 승·하선 중이면 코스 시작점(선착장 근처)에 머문다
        const u = v.state === 'running' ? v.u : 0;
        const s = sampleAtDistance(c.samples, c.length, u);
        if (!s) continue;
        const w = tileToWorld(s.pos.x - 0.5, s.pos.y - 0.5);
        // 진행 방향 — SplineSample.heading 은 타일 공간 라디안이다.
        // Y축 θ 회전은 +X 를 (cosθ, 0, −sinθ) 로 보내는데 우리가 원하는 건 (cos h, 0, sin h) →  θ = −h
        const yaw = -s.heading;
        q.setFromAxisAngle(UP, yaw);

        const mesh = acquire(c.defId);
        mesh.position.set(w.x, 0, w.z);
        mesh.quaternion.copy(q);

        // 탑승객 — 정원이 아니라 **실제 탄 수**만큼 (처리량이 눈에 보이게)
        for (let r = 0; r < v.riders && riderIdx < MAX_RIDERS; r++) {
          const along = (r - (def.capacity - 1) / 2) * 3.2;
          const local = new THREE.Vector3(along, 0, 0).applyQuaternion(q);
          const bx = w.x + local.x, bz = w.z + local.z;
          pos.set(bx, G.vestY + 1.6, bz);
          m4.compose(pos, q, ONE); rVest.setMatrixAt(riderIdx, m4);
          pos.set(bx, G.headY + 1.6, bz);
          m4.compose(pos, q, ONE); rHead.setMatrixAt(riderIdx, m4);
          pos.set(bx - 0.2, G.headY + G.hairDY + 1.6, bz + G.hairDZ);
          m4.compose(pos, q, HAIR_S); rHair.setMatrixAt(riderIdx, m4);
          color.set(VEST[riderIdx % VEST.length]!); rVest.setColorAt(riderIdx, color);
          color.set(SKIN[riderIdx % SKIN.length]!); rHead.setColorAt(riderIdx, color);
          color.set(HAIR[riderIdx % HAIR.length]!); rHair.setColorAt(riderIdx, color);
          riderIdx++;
        }
      }
    }

    for (let i = poolUsed; i < pool.length; i++) pool[i]!.mesh.visible = false;
    for (const m of [rVest, rHead, rHair]) {
      m.count = riderIdx;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  };

  return { group, sync, update };
}
