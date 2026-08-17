import * as THREE from 'three';
import { paletteToVec3, PALETTE_HEX } from './palette.js';

/**
 * 시스템 1 — 픽셀화 파이프라인 (Gauntlet §빌드 순서 1).
 *
 * 씬을 저해상 렌더타깃(논리 폭 LOGICAL_W)에 그리고, 풀스크린 패스에서
 * ① 깊이 불연속 외곽선 ② 제한 팔레트 양자화를 적용한 뒤 NEAREST 로 확대한다.
 * 지오메트리는 3D, 화면은 도트 — 이게 안 되면 나머지는 전부 헛일이다.
 */

export const LOGICAL_W = 240;

const QUANT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform vec3 palette[${PALETTE_HEX.length}];
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;

float linDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  // 오소그래픽: 깊이는 이미 선형
  return d;
}

void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  // 렌더타깃은 리니어 — 팔레트(sRGB 값)와 비교하기 전에 sRGB 로 변환
  c = pow(c, vec3(1.0 / 2.2));

  // 깊이 불연속 외곽선 — 픽셀 단위 1px, 실루엣에만
  float d0 = linDepth(vUv);
  float dx = abs(linDepth(vUv + vec2(texel.x, 0.0)) - d0);
  float dy = abs(linDepth(vUv + vec2(0.0, texel.y)) - d0);
  float edge = step(0.0012, max(dx, dy));

  // 외곽선은 "어두운 같은 색"이 아니라 팔레트의 윤곽색으로 스냅되도록 어둡혀 둔다
  c = mix(c, c * 0.45, edge);

  // 제한 팔레트 양자화 (시각 가중 거리)
  float best = 1e9;
  vec3 bc = c;
  for (int i = 0; i < ${PALETTE_HEX.length}; i++) {
    vec3 p = palette[i];
    vec3 dv = c - p;
    float dist = 2.0 * dv.r * dv.r + 4.0 * dv.g * dv.g + 3.0 * dv.b * dv.b;
    if (dist < best) { best = dist; bc = p; }
  }
  gl_FragColor = vec4(bc, 1.0);
}
`;

const QUANT_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class PixelPipeline {
  readonly target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  logicalW = LOGICAL_W;
  logicalH = 0;

  constructor(aspect: number) {
    this.logicalH = Math.round(LOGICAL_W / aspect);
    const depthTexture = new THREE.DepthTexture(LOGICAL_W, this.logicalH);
    this.target = new THREE.WebGLRenderTarget(LOGICAL_W, this.logicalH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: QUANT_VERT,
      fragmentShader: QUANT_FRAG,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depthTexture },
        texel: { value: new THREE.Vector2(1 / LOGICAL_W, 1 / this.logicalH) },
        palette: { value: paletteToVec3() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  resize(aspect: number): void {
    this.logicalH = Math.round(LOGICAL_W / aspect);
    this.target.setSize(LOGICAL_W, this.logicalH);
    (this.material.uniforms.texel!.value as THREE.Vector2).set(1 / LOGICAL_W, 1 / this.logicalH);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);
  }
}
