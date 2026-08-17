import * as THREE from 'three';
import type { Game } from '../../src/sim/index.js';
import { NEEDS } from '../../src/sim/index.js';
import { tileToWorld } from './simworld.js';
import { applyToon } from './toon.js';

/**
 * 손님 욕구 말풍선 — 카이로소프트 문법. "배고파", "화장실" 같은 상태가 머리 위에 뜬다.
 *
 * 이게 게임을 읽히게 만든다: 손님이 왜 저기로 가는지, 무엇이 부족한지가 화면에 보인다.
 * 216 논리폭에서 3~4px 라 색이 곧 정보다 — 욕구별 색을 팔레트 안에서 뚜렷이 갈랐다.
 */

const MAX = 160;
/** NEEDS 순서: hunger, thirst, toilet, heat, rest, fun */
const NEED_COLOR = ['#ef4b4b', '#3d8fd6', '#f5dc55', '#ff8c42', '#b48ad8', '#4fbf72'];
/**
 * 이 값을 넘은 욕구만 띄운다 — 전원이 항상 말풍선을 달면 정보가 아니라 노이즈다.
 * ⚠ sim 의 needs 는 **0~1 스케일**이다 (0~100 아님). 62 로 잡았더니 하나도 안 떴다.
 * 손님이 해소하러 출발하는 문턱(tunables.needThreshold = 0.45) 바로 아래로 둬서,
 * "지금 저 손님이 무엇을 원해서 저기로 가는가" 가 화면에 보이게 한다.
 */
const SHOW_AT = 0.38;

export interface Bubbles {
  group: THREE.Group;
  update: (t: number) => void;
}

export function makeBubbles(sim: Game): Bubbles {
  const group = new THREE.Group();
  const white = (): THREE.MeshLambertMaterial =>
    new THREE.MeshLambertMaterial({ color: '#ffffff' });

  // ⚠ 처음엔 "흰 판 + 색 알갱이" 였는데 3~4px 에서는 흰 판만 보이고 색이 사라졌다.
  // 3px 에서 정보를 나르는 건 색이다 → **판 자체를 욕구 색**으로, 흰 점은 하이라이트로.
  const plate = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 1.9, 0.7), white(), MAX);
  const pip = new THREE.InstancedMesh(new THREE.BoxGeometry(0.75, 0.7, 0.5), white(), MAX);
  for (const m of [plate, pip]) {
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
  }
  applyToon(group);

  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const ONE = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const color = new THREE.Color();
  const WHITE = new THREE.Color('#f7f2e4');

  const update = (t: number): void => {
    let i = 0;
    for (const g of sim.guests.all) {
      if (i >= MAX) break;
      if (g.state === 'using' || g.state === 'riding' || g.state === 'done') continue;
      // 가장 급한 욕구 하나만
      let worst = -1;
      let worstV = SHOW_AT;
      for (let n = 0; n < NEEDS.length; n++) {
        const v = g.needs[n] ?? 0;
        if (v > worstV) { worstV = v; worst = n; }
      }
      if (worst < 0) continue;

      const tx = g.cx + (g.nx - g.cx) * g.p;
      const ty = g.cy + (g.ny - g.cy) * g.p;
      const w = tileToWorld(tx, ty);
      // 머리 위에서 아주 살짝 위아래로 — 급할수록 빠르게
      const y = 7.4 + Math.sin(t * (2.2 + worstV * 1.6) + g.id) * 0.35;

      pos.set(w.x, y, w.z);
      mat.compose(pos, q, ONE);
      plate.setMatrixAt(i, mat);
      color.set(NEED_COLOR[worst] ?? '#ffffff');
      plate.setColorAt(i, color);
      // 흰 하이라이트는 카메라 쪽(−x, +z)으로 살짝 내밀어야 판에 먹히지 않는다
      pos.set(w.x - 0.55, y + 0.45, w.z + 0.5);
      mat.compose(pos, q, ONE);
      pip.setMatrixAt(i, mat);
      pip.setColorAt(i, WHITE);
      i++;
    }
    for (const m of [plate, pip]) {
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  };

  return { group, update };
}
