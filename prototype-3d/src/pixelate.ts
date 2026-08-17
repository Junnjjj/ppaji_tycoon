import * as THREE from 'three';
import { paletteToVec3, PALETTE_HEX } from './palette.js';

/**
 * 시스템 1 — 픽셀화 파이프라인 (Gauntlet §빌드 순서 1).
 *
 * 씬을 저해상 렌더타깃(논리 폭 LOGICAL_W)에 그리고, 풀스크린 패스에서
 * ① 깊이 불연속 외곽선 ② 제한 팔레트 양자화를 적용한 뒤 NEAREST 로 확대한다.
 * 지오메트리는 3D, 화면은 도트 — 이게 안 되면 나머지는 전부 헛일이다.
 */

/**
 * ⚠⚠ 도트감의 전부는 **정수 배율**이다. 논리 해상도를 먼저 정하고 화면을 나눠 담으면
 * 배율이 소수가 된다 (예: 논리 320 → 캔버스 393 = ×1.228). 그러면 논리픽셀 하나가
 * 어떤 곳은 1px, 어떤 곳은 2px 로 찍혀 **격자가 사라지고 그냥 저해상 사진**이 된다.
 * 실제로 216(×1.82) → 320(×1.23) 으로 올렸더니 "도트 느낌이 전혀 안 난다"는 판정을 받았다.
 *
 * 그래서 순서를 뒤집는다: **도트 크기(DOT)를 먼저 고정하고 논리 해상도를 거기서 계산한다.**
 *   논리폭 = ceil(CSS폭 / DOT)  ·  캔버스 버퍼 = 논리폭 × DOT × DPR
 * 이러면 논리픽셀 하나가 항상 정확히 DOT×DPR 개의 디바이스 픽셀이 된다. 예외 없음.
 */

/** 논리픽셀 1개가 차지하는 CSS 픽셀 수 = 눈에 보이는 도트 크기. `?dot=3` 으로 실험 */
export const DOT = (() => {
  const q = Number(new URLSearchParams(location.search).get('dot'));
  return Number.isFinite(q) && q >= 1 && q <= 6 ? Math.round(q) : 2;
})();

/** DPR 은 **정수로 반올림**해야 도트가 정수 개 디바이스픽셀로 떨어진다 (2.75 같은 값 방지) */
export const DPR = Math.max(1, Math.min(3, Math.round(window.devicePixelRatio || 1)));

export function logicalSize(cssW: number, cssH: number): { w: number; h: number } {
  return { w: Math.ceil(cssW / DOT), h: Math.ceil(cssH / DOT) };
}

/** 부팅 시점의 논리폭 — `detail.ts` 의 디테일 하한(MIN_DETAIL) 계산용 */
export const LOGICAL_W = logicalSize(window.innerWidth, window.innerHeight).w;

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

// Bayer 4×4 정렬 디더.
// ⚠ 랜덤 해시 지터를 쓰면 팔레트 경계에서 색이 **무작위로** 갈려 잔디가 지글거리는
// 노이즈가 된다 ("손도트"가 아니라 JPEG 아티팩트로 보인다). 손도트의 얼룩은 언제나
// **규칙적인 격자 패턴**이다 — 그래서 정렬 디더여야 한다.
float bayer2(vec2 p) { return mod(2.0 * p.x + 3.0 * p.y, 4.0); }
float bayer4(vec2 p) {
  return (4.0 * bayer2(floor(p * 0.5)) + bayer2(mod(p, 2.0))) / 16.0;
}

void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  // 렌더타깃은 리니어 — 팔레트(sRGB 값)와 비교하기 전에 sRGB 로 변환
  c = pow(c, vec3(1.0 / 2.2));

  // 깊이 불연속 외곽선 — 실루엣(1차 미분) + 내부 모서리 크리즈(2차 미분)
  float d0 = linDepth(vUv);
  float dxp = linDepth(vUv + vec2(texel.x, 0.0));
  float dxm = linDepth(vUv - vec2(texel.x, 0.0));
  float dyp = linDepth(vUv + vec2(0.0, texel.y));
  float dym = linDepth(vUv - vec2(0.0, texel.y));
  // 실루엣은 "먼 쪽(배경) 픽셀"에만 그린다. 양쪽에 다 그리면 3px 짜리 손님은
  // 자기 몸통을 외곽선에 다 내주고 어두운 점이 된다. 배경에만 그리면
  // 작은 스프라이트가 제 색을 온전히 지키면서도 또렷한 윤곽을 얻는다.
  float sil = step(0.0012, max(max(d0 - dxp, d0 - dxm), max(d0 - dyp, d0 - dym)));
  // 크리즈 — 깊이 기울기의 급변 (오브젝트 내부 모서리·인접 오브젝트 경계)
  float crease = step(0.0007, max(abs(dxp + dxm - 2.0 * d0), abs(dyp + dym - 2.0 * d0)));
  float edge = max(sil, crease * 0.8);

  // 외곽선은 "어두운 같은 색"이 아니라 팔레트의 윤곽색으로 스냅되도록 어둡혀 둔다
  // 외곽선이 배경 쪽에만 찍히므로 다시 깊게 눌러도 손님 색을 먹지 않는다.
  // 얕으면(0.58) 모래 위 윤곽이 흙색으로 스냅돼 손님이 '털 난 점'처럼 보인다.
  c = mix(c, c * 0.45, edge);

  // (f) 여름 채도 — 팔레트 스냅 전에 채도 +8%, 감마 0.97
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(luma), c, 1.08), 0.0, 1.0);
  c = pow(c, vec3(0.97));

  // (c) 정렬 디더 — 양자화 직전에 ±기울기를 주면 팔레트 사이 색이 두 색의
  // 체크무늬로 갈라진다. 손도트의 그라데이션이 바로 이것이다.
  c += (bayer4(gl_FragCoord.xy) - 0.5) * 0.055;

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
  logicalW = 0;
  logicalH = 0;

  constructor(lw: number, lh: number) {
    this.logicalW = lw;
    this.logicalH = lh;
    const depthTexture = new THREE.DepthTexture(lw, lh);
    this.target = new THREE.WebGLRenderTarget(lw, lh, {
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
        texel: { value: new THREE.Vector2(1 / lw, 1 / lh) },
        palette: { value: paletteToVec3() },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
      },
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  resize(lw: number, lh: number): void {
    this.logicalW = lw;
    this.logicalH = lh;
    this.target.setSize(lw, lh);
    (this.material.uniforms.texel!.value as THREE.Vector2).set(1 / lw, 1 / lh);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCam);
  }
}
