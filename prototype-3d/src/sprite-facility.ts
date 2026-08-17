import * as THREE from 'three';
import { TILE } from './simworld.js';

/**
 * 시설을 **미리 그린 픽셀 스프라이트 빌보드**로 세운다 (경로 D 의 일반화).
 *
 * three.js 를 버리는 게 아니다 — 지형·물·손님·데크·항적은 그대로 3D 고, 건물만 그림이다.
 *
 * ## 크기 규약: 스프라이트 1텍셀 = 타일의 1/16
 *
 * 기존 스프라이트 123장은 전부 2D 트랙의 **16px 타일 격자**로 그려졌다 (design.md §19.1).
 * 그래서 크기를 화면이 아니라 **타일에 묶는다** — `TEXEL_WORLD = TILE / 16`.
 * 이러면 줌을 바꿔도 건물과 지면의 비율이 안 변하고, 카메라 각도를 나중에 바꿔도
 * 이 규약은 그대로다 (스프라이트만 다시 뽑으면 된다).
 *
 * 화면 도트와 텍셀이 1:1 이 되는 줌은 `TILE / 16 / WORLD_PER_PX` ≈ 1.93 이다.
 * 다른 줌에서는 텍셀이 화면 도트와 어긋난다 — 빌보드 방식의 알려진 한계.
 *
 * ## 각도는 아직 확정 안 했다
 *
 * 스프라이트의 투영각은 생성 시점에 구워진다. 카메라를 바꾸면 **다시 뽑아야 한다.**
 * 그래서 투영 규격을 `public/sprites/index.json` 에 같이 적어 둔다 —
 * 각도 변경이 코드 수정이 아니라 재생성 파라미터가 되도록.
 */

/** 스프라이트 1텍셀이 차지하는 월드 크기 (2D 트랙의 16px 타일 계약) */
export const TEXEL_WORLD = TILE / 16;

const loaded = new Map<string, THREE.Texture>();

/** 부팅 시 한 번 — `index.json` 에 등록된 시설 스프라이트를 전부 읽어 둔다 */
export async function preloadFacilitySprites(): Promise<number> {
  let index: Record<string, unknown>;
  try {
    const res = await fetch('/sprites/index.json');
    if (!res.ok) return 0;
    index = (await res.json()) as Record<string, unknown>;
  } catch {
    return 0; // 스프라이트가 없으면 조용히 파라메트릭으로 돈다
  }
  const loader = new THREE.TextureLoader();
  await Promise.all(
    Object.keys(index).map(async (id) => {
      try {
        const tex = await loader.loadAsync(`/sprites/${id}.png`);
        tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 씻겨 나간다
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        loaded.set(id, tex);
      } catch {
        /* 개별 실패는 그 시설만 파라메트릭으로 */
      }
    }),
  );
  return loaded.size;
}

export function hasFacilitySprite(defId: string): boolean {
  return loaded.has(defId);
}

/**
 * 시설 빌보드 — **수직 쿼드** (요(yaw)만 카메라를 향하고, 세로는 월드 수직).
 *
 * ## 왜 카메라 정면 쿼드가 아닌가 (두 번 실패하고 정착)
 * 카메라 정면 쿼드는 화면상 아래로 내리면 **지면 아래로 기울어 들어간다** —
 * 발자국 앞모서리에 앵커를 맞추자 건물 밑동이 잔교 슬래브에 파묻혔다 (실측).
 * 수직 쿼드는 밑변이 정확히 바닥 평면에 붙고, 깊이도 세워 둔 자리를 따른다.
 *
 * 피치 35.26° 카메라는 수직면을 세로로 cos(pitch)=0.816 배 눌러 보이므로,
 * 쿼드 높이를 1/cos(pitch) 로 미리 늘려 **화면에서 텍셀이 원본 비율**이 되게 한다.
 * (예전에 이 방식이 "찌그러졌"던 건 회전 부호 실수였다 — 보상 자체는 정확하다)
 *
 * ## 앵커
 * 그림은 발자국의 화면 바운딩박스에 맞춰 구워진다. 따라서 맞춰야 할 것은 두 가지다:
 *   ① 그림의 **가로 중심** = 발자국 중심의 화면 x
 *   ② 그림의 **밑변**       = 발자국의 화면 최하단 꼭짓점 (= 타일 (−X,+Z) 모서리)
 *
 * ⚠ 이 둘은 같은 지면점이 아니다. yaw45 에서만 최하단 꼭짓점이 중심과 같은 화면 x 에
 *   있어서 "(−w/2, +h/2) 모서리"로 퉁칠 수 있었다. yaw20 에서는 최하단 꼭짓점이 중심보다
 *   화면 왼쪽으로 (a·cosθ − b·sinθ) 만큼 치우쳐 있어(2×2 = 9.6텍셀 ≈ 0.6타일) 그대로 두면
 *   건물이 제 타일에서 왼쪽으로 밀린다.
 *
 * 그래서 screen_x = 0 · screen_y = −(바운딩박스 반높이) 를 만족하는 지면점을 역산해 쓴다.
 * 지면점 투영(main.ts 카메라에서 유도):
 *     screen_x = X·cosθ + Z·sinθ,   screen_y↑ = (X·sinθ − Z·cosθ)·sinφ
 * 를 풀면
 *     X = −(a·sin²θ + b·sinθcosθ),  Z = +(a·sinθcosθ + b·cos²θ)     (a,b = 발자국 반범위)
 * yaw45·정사각이면 (−a, +a) 로 떨어져 예전 식과 정확히 일치한다.
 */
export function makeFacilitySprite(
  defId: string, camera: THREE.Camera, fw = 2, fh = 2,
): THREE.Group | null {
  const tex = loaded.get(defId);
  if (!tex) return null;

  const g = new THREE.Group();
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const pitch = Math.asin(-fwd.y);
  const w = tex.image.width * TEXEL_WORLD;
  const h = (tex.image.height * TEXEL_WORLD) / Math.cos(pitch);

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    // transparent:false + alphaTest 라야 깊이 실루엣 외곽선이 쿼드 사각형이 아니라
    // **스프라이트 알파 모양**을 딴다. transparent:true 로 두면 사각 테두리 + 헤일로.
    new THREE.MeshBasicMaterial({ map: tex, transparent: false, alphaTest: 0.5 }),
  );
  // 법선이 카메라 쪽(−fwd)의 수평 성분을 향하게 — 부호를 틀리면 비스듬해진다
  quad.rotation.y = Math.atan2(-fwd.x, -fwd.z);
  // 밑변-중심을 "발자국 중심의 화면 x · 발자국 최하단 꼭짓점의 화면 y" 지면점에
  // 쿼드 회전각은 −θ 다 (카메라를 마주보게 도는 방향). 지면점 역산에는 θ 를 쓴다
  const yawQuad = Math.atan2(-fwd.x, -fwd.z);
  const sy = -Math.sin(yawQuad), cy = Math.cos(yawQuad);
  const a = (fw * TILE) / 2, b = (fh * TILE) / 2;
  quad.position.set(-(a * sy * sy + b * sy * cy), h / 2, a * sy * cy + b * cy * cy);
  g.add(quad);
  return g;
}
