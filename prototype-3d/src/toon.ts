import * as THREE from 'three';

/**
 * 셀 셰이딩 — Lambert 연속 그라데이션을 4단으로 포스터라이즈.
 * 런타임에 추가되는 오브젝트(배치된 시설·sim 손님)도 같은 램프를 써야 하므로
 * main.ts 에서 분리해 공용 모듈로 둔다.
 */

// ⚠ 그림자 밴드를 0.62 미만으로 내리지 말 것 — 88(0.345)이었을 때 폰툰이 탁해지고
// 라임이 올리브로 죽었다. quality-bar 는 그림자 면도 색이 살아 있다.
export const GRADIENT = (() => {
  const data = new Uint8Array([162, 206, 242, 255]); // 0.635 / 0.808 / 0.949 / 1.0
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
})();

const toonCache = new Map<THREE.Material, THREE.MeshToonMaterial>();

function toToon(mat: THREE.Material): THREE.Material {
  if (!(mat instanceof THREE.MeshLambertMaterial)) return mat;
  let t = toonCache.get(mat);
  if (!t) {
    t = new THREE.MeshToonMaterial({
      color: mat.color,
      map: mat.map,
      vertexColors: mat.vertexColors,
      transparent: mat.transparent,
      alphaTest: mat.alphaTest,
      gradientMap: GRADIENT,
    });
    toonCache.set(mat, t);
  }
  return t;
}

/** 트리 전체의 Lambert 재질을 툰으로 교체한다. 런타임 추가분에도 그대로 부른다. */
export function applyToon(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(toToon);
    else mesh.material = toToon(mesh.material);
  });
}
