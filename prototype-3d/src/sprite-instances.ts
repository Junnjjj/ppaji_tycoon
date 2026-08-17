import * as THREE from 'three';
import { TEXEL_WORLD } from './sprite-facility.js';

/**
 * 격자 아틀라스 하나를 **인스턴스별 UV 사각형**으로 나눠 쓰는 빌보드 메시.
 *
 * 손님(8팔레트 × 5포즈 × 3프레임 = 120칸)과 나무(3변형)가 같은 문제를 갖는다:
 * 칸마다 InstancedMesh 를 따로 만들면 메시가 수십 벌이 된다. 대신 아틀라스 한 장 +
 * `aUvRect` 인스턴스 속성으로 한 벌에 담는다.
 *
 * ⚠ 두 가지가 고정 계약이다:
 * 1. **크기는 타일 기준** (`TEXEL_WORLD` = 타일의 1/16). 화면 기준으로 잡으면
 *    다른 스프라이트와 크기가 안 맞는다 (본관에서 실측한 실수).
 * 2. **`discard` 로 알파를 자른다.** 반투명 블렌딩이면 깊이를 안 써서 픽셀화 패스의
 *    실루엣 외곽선이 스프라이트 모양이 아니라 **쿼드 사각형**을 딴다.
 */

export interface SpriteInstances {
  mesh: THREE.InstancedMesh;
  uv: THREE.InstancedBufferAttribute;
  /** (열, 행) → `uv` 에 써넣을 사각형. 행/열은 아틀라스 격자 좌표 */
  rectAt: (col: number, row: number) => [number, number, number, number];
  /** 빌보드 방향 (인스턴스 행렬에 구워 넣을 것) */
  billboard: THREE.Quaternion;
  /** 밑변이 접지점을 지나게 하는 오프셋 벡터 (월드) */
  groundLift: THREE.Vector3;
  setCount: (n: number) => void;
}

export function makeSpriteInstances(
  tex: THREE.Texture,
  cellW: number, cellH: number,
  cols: number, rows: number,
  max: number,
  camera: THREE.Camera,
): SpriteInstances {
  tex.colorSpace = THREE.SRGBColorSpace; // 안 주면 씻겨 나간다
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;

  const atlasW = cols * cellW, atlasH = rows * cellH;
  const rectAt = (col: number, row: number): [number, number, number, number] => [
    (col * cellW) / atlasW,
    1 - ((row + 1) * cellH) / atlasH, // 캔버스 y 는 아래로, UV 는 위로
    cellW / atlasW,
    cellH / atlasH,
  ];

  const geo = new THREE.PlaneGeometry(cellW * TEXEL_WORLD, cellH * TEXEL_WORLD);
  const uv = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
  uv.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aUvRect', uv);

  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex } },
    vertexShader: /* glsl */ `
      attribute vec4 aUvRect;
      varying vec2 vUv;
      void main() {
        vUv = aUvRect.xy + uv * aUvRect.zw;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        gl_FragColor = c;
      }`,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.count = 0;

  // 카메라 yaw·pitch 는 런타임에 안 변하므로 방향을 한 번만 굽는다.
  // ⚠ 메시 자체를 돌리면 인스턴스 **위치까지** 같이 돌아간다 — 위치는 월드 좌표로
  //   넣어야 하므로 회전은 반드시 인스턴스 행렬 쪽에 넣는다.
  const billboard = camera.quaternion.clone();
  const groundLift = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(billboard)
    .multiplyScalar((cellH * TEXEL_WORLD) / 2);

  return { mesh, uv, rectAt, billboard, groundLift, setCount: (n) => { mesh.count = n; } };
}
