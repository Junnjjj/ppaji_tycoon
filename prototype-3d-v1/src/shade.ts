import * as THREE from 'three';

/**
 * 페이스 셰이딩 박스 — 픽셀아트식 2톤 입체감.
 * 버텍스 컬러로 상면을 밝히고 측면을 어둡혀, Lambert 음영과 곱해진 뒤
 * 팔레트 양자화에서 면들이 서로 다른 톤으로 스냅되게 한다 (quality-bar 의
 * 폰툰 큐브·인플레이터블이 정확히 이 구조: 밝은 상면 + 2톤 측면).
 */

const FACE_SHADE: Record<string, number> = {
  py: 1.22,  // 상면 — 하이라이트
  ny: 0.50,
  px: 0.80,  // 동측
  nx: 0.88,  // 서측 (태양 방향)
  pz: 1.00,  // 남측 (카메라 쪽)
  nz: 0.66,  // 북측
};

export function shadedBoxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const normal = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
    let s = 1.0;
    if (ny > 0.5) s = FACE_SHADE.py!;
    else if (ny < -0.5) s = FACE_SHADE.ny!;
    else if (nx > 0.5) s = FACE_SHADE.px!;
    else if (nx < -0.5) s = FACE_SHADE.nx!;
    else if (nz > 0.5) s = FACE_SHADE.pz!;
    else s = FACE_SHADE.nz!;
    colors[i * 3] = s; colors[i * 3 + 1] = s; colors[i * 3 + 2] = s;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function shadedBox(w: number, h: number, d: number, color: string): THREE.Mesh {
  return new THREE.Mesh(
    shadedBoxGeo(w, h, d),
    new THREE.MeshLambertMaterial({ color, vertexColors: true }),
  );
}
