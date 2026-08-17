import * as THREE from 'three';
import { TEXEL_WORLD } from './sprite-facility.js';


/**
 * 경로 D — 본관을 **2D 픽셀 스프라이트 빌보드**로 세운다.
 *
 * three.js 를 버리는 게 아니다. 지형·물·손님·항적은 그대로 3D 고, 건물만 미리 그린
 * 이미지로 바꾼다. 진짜 갈림길은 "3D vs 2D" 가 아니라 **모델링 vs 미리 렌더**다.
 *
 * ⚠ 이 파일의 상수는 전부 이유가 있다. 하나라도 어기면 스프라이트가 3D 씬에 안 붙는다:
 *
 * 1. `transparent: false` + `alphaTest` — 반드시 이 조합.
 *    `transparent: true` 로 두면 버려진 프래그먼트도 깊이를 안 쓰는 게 아니라 **정렬
 *    대상**이 되고, 깊이 실루엣 외곽선이 스프라이트 모양이 아니라 **쿼드 사각형**을
 *    딴다 (사각 테두리 + 헤일로). `terrain.ts` 능선 레이어가 같은 이유로 같은 조합이다.
 * 2. `SRGBColorSpace` — 렌더타깃이 리니어라 픽셀화 패스가 직접 sRGB 로 되돌린다.
 *    안 주면 씻겨 나간다 (지형에서 세 번 겪은 함정).
 * 3. `NearestFilter` — 당연하지만 빠뜨리면 도트가 뭉갠다.
 * 4. 텍셀 1개 = `TEXEL_WORLD` (= 타일의 1/16). 화면이 아니라 **타일에 묶어야**
 *    다른 시설 스프라이트와 같은 세트로 보인다 (Stage 2 실측).
 * 5. **쿼드는 카메라를 정면으로 봐야 한다** (`quaternion.copy(camera.quaternion)`).
 *    처음엔 월드 수직 쿼드에 `rotation.y = CAM_YAW` 만 주고 세로를 `1/cos(pitch)` 로
 *    보정했는데, 화면이 통째로 기울어 찌그러졌다 — Y 만 돌린 쿼드는 **피치가 있는
 *    카메라에 여전히 비스듬**하다. 스프라이트는 이미 3/4 투영이 그려진 그림이라
 *    3D 로 다시 눕히면 이중 투영이 된다. 카메라를 정면으로 보게 하면 보정도 필요 없다:
 *    오소 카메라에서 쿼드 월드 크기 = 화면 크기 × WORLD_PER_PX 로 1:1 이다.
 * 6. 접지 — 카메라의 up 방향으로 h/2 만큼 올려 **밑변이 접지점을 지나게** 한다.
 *    ⚠ 여기에 3D 기단을 깔면 **건물 밑단이 잘린다** (상자 앞면이 스프라이트를 덮는다).
 *    쿼드는 전체가 같은 깊이라 기단 없이도 뜨지 않는다.
 * 6. 밑동 `plinth()` — 평면은 접지부에서 깊이차가 0이라 외곽선이 사라진다. 떠 보인다.
 */

export const LODGE_SPRITE_URL = '/sprites/lodge.png';

/**
 * ⚠ **비동기여야 한다.** 처음엔 콜백 안에서 쿼드를 붙였는데, 촬영 도구가 바운딩박스를
 * 잴 때 그룹이 아직 비어 있어 프레이밍이 통째로 깨졌다 (size null).
 */
export async function makeLodgeSprite(
  camera: THREE.Camera,
  url = LODGE_SPRITE_URL,
): Promise<THREE.Group> {
  const g = new THREE.Group();

  const tex = await new THREE.TextureLoader().loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;

  // ⚠ 크기 기준은 **화면(WORLD_PER_PX)이 아니라 타일(TEXEL_WORLD)** 이다.
  // 처음엔 화면 기준으로 잡았는데, Stage 2 에서 시설 스프라이트들과 나란히 놓으니
  // 본관만 1.9배 커서 세트로 안 보였다. 모든 스프라이트는 같은 계약(1텍셀 = 타일 1/16)을 쓴다.
  const w = tex.image.width * TEXEL_WORLD;
  const h = tex.image.height * TEXEL_WORLD;
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5 }),
  );
  quad.quaternion.copy(camera.quaternion);
  // 밑변이 접지점을 지나도록 카메라 up 방향으로 절반 올린다
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  quad.position.copy(up).multiplyScalar(h / 2);
  g.add(quad);

  // 배경 밴드(잔디)의 장식 — 무대 뒤 그림의 일부다. 플레이 영역이 아니다
  // 화면 x = (x+z)·cos45 — 뒤(z−)로 보낸 만큼 x 를 보상해야 화면 중앙-왼쪽에 온다
  g.position.set(36, 0.2, -102);
  return g;
}
