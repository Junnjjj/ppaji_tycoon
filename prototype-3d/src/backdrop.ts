import * as THREE from 'three';
import { TEXEL_WORLD } from './sprite-facility.js';

/**
 * 배경 스프라이트 배경막 — `?bg=sprite` 로 켠다 (기본은 절차적 하늘·능선).
 *
 * `assets/generated/backdrop/` 의 두 장을 쓴다. 2026-08-14 에 뽑아 두고 한 번도 씬에
 * 안 붙였던 자산이다:
 *   bg-far  197×117 불투명 — 하늘 + 능선 3겹
 *   bg-near 209×110 알파   — 숲 트리라인
 * 둘 다 **가로 타일러블**(랩 크로스페이드 12px)이라 맵 폭만큼 반복해 깔 수 있다.
 *
 * ## 크기가 우연히 맞는다
 * 우리 계약(1텍셀 = 타일의 1/16 = 0.375 월드)으로 환산하면 bg-far 는 74×44 월드다.
 * 텍셀이 화면 도트와 1:1 이 되는 줌(1.93)에서 **화면 폭이 정확히 74 월드** —
 * 즉 이 배경막은 그 줌에서 화면을 딱 한 장으로 채운다. 맵 폭 1020 을 덮으려면 14회 반복.
 * 다른 스프라이트와 도트 크기가 어긋나지 않는다.
 *
 * ⚠ 절차적 하늘·능선을 **대체**하는 것이지 위에 얹는 게 아니다. 둘 다 켜면 겹친다.
 *
 * ## 왜 카메라에 붙이나 (월드 배치는 실패했다)
 * 처음엔 월드 좌표에 평면을 놨다. 두 번 어긋났다:
 * ① 피치 오소 카메라는 z 로 멀수록 화면 **위로** 밀어서(screenY 식은 아래 참고)
 *    y 를 −99 까지 내려야 화면에 들어왔고,
 * ② 그렇게 맞춰도 **카메라를 조금만 움직이면 다시 언덕 뒤로 묻혔다.**
 * 배경막은 월드 오브젝트가 아니라 **화면 레이어**다. 카메라의 자식으로 붙여 화면에
 * 고정하고, 시차(parallax)는 텍스처 오프셋으로 준다 — 2D 게임이 배경을 다루는 방식 그대로.
 *
 * `scene.add(camera)` 가 필요하다 — three.js 는 카메라가 씬 그래프에 없으면
 * 그 자식을 안 그린다.
 */

/** 카메라 로컬 −Z 거리. 다른 오브젝트보다 멀기만 하면 된다 (near/far 안) */
const DEPTH = 900;

interface Spec {
  url: string;
  /** 원본 텍셀 크기 */
  w: number; h: number;
  /** 화면 위에서 이 레이어 상단까지의 간격 (화면 높이 대비 비율) */
  topGap: number;
  /** 시차 계수 — 0 이면 완전 고정, 1 이면 월드와 같이 움직인다. 원경일수록 작게 */
  parallax: number;
  transparent: boolean;
}

/**
 * ⚠ `topGap` 은 넉넉히 줘서 레이어 **밑단이 3D 숲에 가려지게** 한다.
 * 0.02/0.20 으로 뒀더니 배경막 아래 끝과 3D 숲 위 끝 사이에 틈이 생겨
 * 씬 배경색(하늘색)이 가로 띠로 비쳤다 (실측).
 */
const SPECS: Spec[] = [
  { url: '/sprites/bg-far.png', w: 197, h: 117, topGap: 0.16, parallax: 0.06, transparent: false },
  { url: '/sprites/bg-near.png', w: 209, h: 110, topGap: 0.26, parallax: 0.14, transparent: true },
];

/** 배경막 하늘과 같은 색 — 씬 배경색을 이걸로 바꿔야 위쪽 경계가 안 보인다 */
export const BACKDROP_SKY = '#3e94ee'; // bg-far.png 최상단 실측값 (짐작하지 말 것)

/** 기본은 스프라이트 배경막. 절차적 하늘·능선으로 되돌리려면 `?bg=procedural` */
export const BACKDROP_MODE: 'procedural' | 'sprite' =
  new URLSearchParams(location.search).get('bg') === 'procedural' ? 'procedural' : 'sprite';

export interface Backdrop {
  /** 매 프레임 호출. `worldPerPx` = 논리픽셀 1개가 차지하는 월드 크기 (줌 반영) */
  update: (camera: THREE.OrthographicCamera, worldPerPx: number) => void;
}

export function makeBackdrop(camera: THREE.OrthographicCamera): Backdrop {
  const layers = SPECS.map((spec) => {
    const tex = new THREE.TextureLoader().load(spec.url);
    tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 씻겨 나간다
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      // 원경 배경막은 조명을 받으면 안 된다 (하늘이 그늘지면 이상하다) → Basic.
      // 알파는 discard 로 자른다 — 반투명이면 깊이를 안 써서 외곽선이 사각형을 딴다.
      new THREE.MeshBasicMaterial(
        spec.transparent
          ? { map: tex, transparent: false, alphaTest: 0.5 }
          : { map: tex },
      ),
    );
    mesh.position.z = -DEPTH;
    mesh.renderOrder = spec.transparent ? -8 : -9; // 항상 맨 뒤
    camera.add(mesh);
    return { mesh, tex, spec };
  });

  return {
    update: (cam, worldPerPx) => {
      const halfW = (cam.right - cam.left) / (2 * cam.zoom);
      const halfH = (cam.top - cam.bottom) / (2 * cam.zoom);
      for (const { mesh, tex, spec } of layers) {
        // 세로는 원본 텍셀 크기 그대로 (도트가 화면 도트와 1:1),
        // 가로는 화면을 덮고 모자란 만큼 텍스처를 반복한다 — 가로 타일러블이라 가능
        const h = spec.h * worldPerPx;
        const w = halfW * 2 * 1.02;
        mesh.scale.set(w, h, 1);
        tex.repeat.x = w / (spec.w * worldPerPx);
        mesh.position.y = halfH - spec.topGap * halfH * 2 - h / 2;
        // 시차 — 카메라가 움직인 만큼 텍스처를 반대로 민다
        tex.offset.x = (cam.position.x * spec.parallax) / (spec.w * worldPerPx);
      }
    },
  };
}
