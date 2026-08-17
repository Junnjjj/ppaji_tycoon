import * as THREE from 'three';
import { shadedBox } from './shade.js';
import { TILE, X0, Z0 } from './simworld.js';

/**
 * 허가 구역 — **수면 플레이 영역을 폰툰 링으로 두른다** (레퍼런스의 파란 사각 띠).
 *
 * 해안 거리 좌표계 실험은 폐기했다. 무대 격자는 화면과 나란하므로 구역도
 * 그냥 **타일 사각형**이다. 등급이 오르면 사각형이 커진다 — 설계서
 * §수면 사용 허가의 등급별 면적(40/90/180/320/500타일)을 넓이로 쓴다.
 */

export interface PermitRect { tx: number; ty: number; tw: number; th: number }

export const PERMIT_AREA = [40, 90, 180, 320, 500];

/** 등급 → 격자 중앙의 타일 사각형 (가로:세로 ≈ 3:2 — 물가를 따라 넓게) */
export function permitRectFor(grade: number, cx: number, cy: number): PermitRect {
  const area = PERMIT_AREA[Math.max(0, Math.min(PERMIT_AREA.length - 1, grade - 1))]!;
  const th = Math.max(4, Math.round(Math.sqrt(area / 1.5)));
  const tw = Math.round(area / th);
  return { tx: cx - Math.floor(tw / 2), ty: cy - Math.floor(th / 2), tw, th };
}

export function inPermit(r: PermitRect, tx: number, ty: number): boolean {
  return tx >= r.tx && tx < r.tx + r.tw && ty >= r.ty && ty < r.ty + r.th;
}

const PONTOON = '#2f5fb0';
const PONTOON_TOP = '#3d78d6';
const BUOY = '#ff8c42';

/** 폰툰 링 — 파란 워크웨이 + 주황 부표. 지금은 표식이다 (통행은 데크가 담당) */
export function makePermitFence(r: PermitRect): THREE.Group {
  const g = new THREE.Group();
  const th = TILE * 0.6, top = 1.1;
  const wx0 = X0 + r.tx * TILE, wz0 = Z0 + r.ty * TILE;
  const wx1 = wx0 + r.tw * TILE, wz1 = wz0 + r.th * TILE;
  const seg = (cx: number, cz: number, w: number, d: number): void => {
    const base = shadedBox(w, top, d, PONTOON);
    base.position.set(cx, top / 2, cz);
    const cap = shadedBox(w * 0.97, top * 0.34, d * 0.9, PONTOON_TOP);
    cap.position.set(cx, top * 1.05, cz);
    g.add(base, cap);
  };
  seg((wx0 + wx1) / 2, wz0, wx1 - wx0 + th, th);
  seg((wx0 + wx1) / 2, wz1, wx1 - wx0 + th, th);
  seg(wx0, (wz0 + wz1) / 2, th, wz1 - wz0);
  seg(wx1, (wz0 + wz1) / 2, th, wz1 - wz0);

  const buoys = new THREE.InstancedMesh(
    new THREE.SphereGeometry(TILE * 0.22, 6, 5),
    new THREE.MeshLambertMaterial({ color: BUOY }), 200,
  );
  let n = 0;
  const m = new THREE.Matrix4();
  const put = (x: number, z: number): void => { m.makeTranslation(x, 1.5, z); buoys.setMatrixAt(n++, m); };
  for (let x = wx0; x <= wx1; x += 18) { put(x, wz0); put(x, wz1); }
  for (let z = wz0 + 18; z < wz1; z += 18) { put(wx0, z); put(wx1, z); }
  buoys.count = n;
  buoys.frustumCulled = false;
  g.add(buoys);
  return g;
}
