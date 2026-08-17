import * as THREE from 'three';
import { shadedBox } from './shade.js';
import { TILE, GRID_W, X0, Z0, LAND_ROWS, PIER_TOP } from './simworld.js';

/**
 * 흙마당 — 격자 위쪽 LAND_ROWS 줄, 시설이 서는 **다져진 흙 부지**.
 *
 * 인조잔디+드럼통(부유 데크)안은 기각됐다 — 사용자 판정 "흙바닥 느낌으로".
 * 실물 빠지의 육상부는 다져진 흙+자갈 마당이다. 낮은 석축 한 단 위에 흙바닥.
 */

export function makePier(): THREE.Group {
  const g = new THREE.Group();
  const w = GRID_W * TILE + 8;
  const d = LAND_ROWS * TILE + 4;
  const cx = X0 + (GRID_W * TILE) / 2;
  const cz = Z0 + (LAND_ROWS * TILE) / 2 - 1;

  // 다져진 흙 — 단색이면 판때기다. 흙 결 + 자갈 점.
  // ⚠ 가장자리가 직선이면 "떠 있는 판"으로 읽힌다 (실측 지적 2회).
  //   단일 캔버스에 **경계 디더**를 굽는다: 뒤·옆은 잔디로, 앞은 젖은 흙으로 번져 들어가게.
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = Math.round(640 * d / w);
  const ctx = cv.getContext('2d')!;
  const hash = (a: number, b: number): number => {
    const t = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return t - Math.floor(t);
  };
  const DIRT = ['#c49a6a', '#b5844a', '#d4a878', '#b2a99a', '#8a6a3e'];
  const GRASS = ['#82b258', '#76a44e', '#6b9a46'];
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const h = hash(x * 1.3 + 7, y * 1.7 + 3);
      // 경계까지의 거리 (0~1): 뒤(y=0)·좌우는 잔디 전이, 앞(y=max)은 젖은 전이
      const backT = y / (cv.height * 0.22);
      const sideT = Math.min(x, cv.width - 1 - x) / (cv.width * 0.06);
      const grassMix = Math.min(1, Math.min(backT, sideT));
      if (h > grassMix) {
        ctx.fillStyle = GRASS[Math.floor(hash(x, y + 99) * GRASS.length)]!;
      } else {
        const wetT = (cv.height - 1 - y) / (cv.height * 0.10);
        const r = hash(x + 31, y + 17);
        if (wetT < 1 && r > wetT) ctx.fillStyle = '#8a6a3e';
        else if (r < 0.30) ctx.fillStyle = DIRT[1 + Math.floor(hash(x + 3, y) * 4)]!;
        else ctx.fillStyle = DIRT[0]!;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 씻겨 나간다
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w, 1.2, d),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  slab.position.set(cx, PIER_TOP - 0.6, cz);
  g.add(slab);

  // 물쪽 가장자리 — 낮은 석축 (흙이 물에 바로 닿으면 어색하다)
  const edge = shadedBox(w, 1.6, 1.4, '#b2a99a');
  edge.position.set(cx, PIER_TOP - 0.7, cz + d / 2);
  g.add(edge);
  const edgeShade = shadedBox(w, 0.6, 1.0, '#8a8072');
  edgeShade.position.set(cx, PIER_TOP - 1.4, cz + d / 2 + 0.4);
  g.add(edgeShade);
  return g;
}
