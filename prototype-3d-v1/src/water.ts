import * as THREE from 'three';

/**
 * 시스템 2 — 물. Gauntlet §"물이 전부다".
 *
 * quality-bar.png 실측 기반: 베이스는 로열 코발트(#2b639e), 잔물결은 균일색이 아니라
 * 가로 방향 짧은 명(#4470d1)·암(#213f71) 획, 드문 하이라이트(#6894f5).
 * 색 띠 경계는 Bayer 오더드 디더링, 해안엔 픽셀 뭉침 거품선.
 * 색상 상수는 sRGB 로 쓰고 출력 직전 linear 로 변환 — 픽셀화 패스의
 * pow(1/2.2) 를 거치면 정확히 팔레트 값으로 복원되어 양자화가 항등이 된다.
 */

export const SHORE_AMP = 4.0;
export const SHORE_FREQ = 0.045;

export function shoreLine(x: number): number {
  return Math.sin(x * SHORE_FREQ) * SHORE_AMP + Math.sin(x * SHORE_FREQ * 2.7 + 1.3) * (SHORE_AMP * 0.4);
}

const MAX_FOAM = 48;

const WATER_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uFoam[${MAX_FOAM}]; // x, z, 반지름 — 부유물 둘레 흰 물결 링
uniform int uFoamN;
uniform vec4 uBoat; // 바나나보트 x, z, 진행방향 cos, sin — V자 항적
varying vec3 vWorld;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 2D 밸류 노이즈 — 띠 경계 흔들림용 저주파
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 4x4 Bayer — gl_FragCoord 는 논리 픽셀(240폭 타깃) 단위라 픽셀 정합 디더가 된다
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

float shore(float x) {
  return sin(x * ${SHORE_FREQ}) * ${SHORE_AMP.toFixed(1)} + sin(x * ${(SHORE_FREQ * 2.7).toFixed(4)} + 1.3) * ${(SHORE_AMP * 0.4).toFixed(1)};
}

// 디더 선택 — f 가 bayer 문턱을 넘으면 b
vec3 sel(vec3 a, vec3 b, float f, float bay) {
  return mix(a, b, step(bay, f));
}

// 가로 획 잔물결 — 행마다 위상·유속이 다른 대시 셀.
// 반환: 0 = 없음, (0,1] = 대시 강도(셀 해시)
float dashes(vec2 p, float t, float cw, float ch, float win, float seed) {
  float row = floor(p.y / ch);
  float rh = hash(vec2(row, seed));
  float dir = rh > 0.5 ? 1.0 : -1.0;
  float xx = p.x + rh * 53.0 + t * (0.35 + rh * 0.5) * dir;
  float col = floor(xx / cw);
  float h = hash(vec2(col, row * 1.7 + seed));
  // 대시 길이(셀의 35~80%)와 세로 창(win: 0.30 ≈ 1px, 0.34+ ≈ 2px)
  float len = 0.35 + hash(vec2(col, row + seed + 9.0)) * 0.45;
  float on = step(fract(xx / cw), len) * step(abs(fract(p.y / ch) - 0.5), win);
  // 느린 명멸 — 패턴이 서서히 자리를 바꾼다
  float blink = step(0.35, fract(h * 7.0 + t * 0.06 * (0.5 + h)));
  return on * blink * h;
}

void main() {
  float t = uTime;
  vec2 p = vWorld.xz;
  float d = p.y - shore(p.x); // 해안에서의 거리 (물 쪽 +)
  float bay = bayer4(gl_FragCoord.xy) + 0.03;

  // ── 색 띠 — 경계를 저주파 노이즈로 흔들고 Bayer 디더로 섞는다 ──
  float wob = (vnoise(p * 0.018 + vec2(0.0, t * 0.008)) - 0.5) * 2.0;
  float db = d + wob * 8.0 * smoothstep(3.0, 24.0, d);

  vec3 emerald   = vec3(0.286, 0.753, 0.847); // #49c0d8
  vec3 turquoise = vec3(0.165, 0.659, 0.784); // #2aa8c8
  vec3 midblue   = vec3(0.169, 0.486, 0.690); // #2b7cb0
  vec3 cobalt    = vec3(0.169, 0.388, 0.620); // #2b639e
  vec3 deep      = vec3(0.137, 0.306, 0.510); // #234e82

  vec3 c = emerald;
  c = sel(c, turquoise, smoothstep(3.0, 6.0, db), bay);
  c = sel(c, midblue, smoothstep(10.0, 15.0, db), bay);
  c = sel(c, cobalt, smoothstep(26.0, 32.0, db), bay);
  c = sel(c, deep, smoothstep(200.0, 212.0, db), bay);

  // 띠 인덱스 (잔물결 색 선택용, 디더 없이 연속값)
  float band = smoothstep(3.0, 6.0, db) + smoothstep(10.0, 15.0, db)
             + smoothstep(24.0, 34.0, db) + smoothstep(200.0, 212.0, db);

  // 코발트 수역의 저주파 2톤 얼룩 — 레퍼런스의 미묘한 명암 패치
  // ── 잔물결 획 — 레퍼런스의 명·암 짧은 가로 획. 화면의 ~70%는 평평한 베이스 ──
  // 논리 픽셀 ≈ 가로 0.58 / 세로(z) 1.0 월드단위 — 대시 셀을 그 배수로
  // 획은 저주파 클러스터 마스크로 뭉쳐 나타난다 — 균일 코듀로이 방지
  // 카메라 yaw(≈30°)에 정렬한 좌표 — 획이 화면 가로 방향으로 흐르게
  vec2 pc = vec2(0.868 * p.x + 0.497 * p.y, -0.497 * p.x + 0.868 * p.y);
  float clusterL = step(0.38, vnoise(pc * 0.035 + vec2(t * 0.015, 0.0)));
  float clusterD = step(0.30, vnoise(pc * 0.031 + vec2(50.0 - t * 0.012, 25.0)));
  float lightR = dashes(pc, t, 7.0, 3.2, 0.30, 3.0) * clusterL;
  // 어두운 획이 주역 — 두 겹: 두툼한 2px 획 + 가는 획
  float darkR  = dashes(pc + vec2(31.7, 13.3), t * 0.8, 8.0, 3.6, 0.34, 17.0) * clusterD;
  float darkR2 = dashes(pc + vec2(11.3, 41.9), t * 0.6, 6.0, 2.8, 0.30, 29.0) * clusterD;
  darkR = max(darkR, darkR2 * 0.92);

  vec3 lightC = band < 0.5 ? vec3(0.722, 0.925, 0.925)  // #b8ecec
              : band < 1.5 ? vec3(0.498, 0.816, 0.902)  // #7fd0e6
              : vec3(0.267, 0.439, 0.820);              // #4470d1
  vec3 darkC  = band < 0.5 ? vec3(0.165, 0.659, 0.784)  // #2aa8c8
              : band < 1.5 ? vec3(0.102, 0.482, 0.659)  // #1a7ba8
              : band < 2.5 ? vec3(0.082, 0.384, 0.561)  // #15628f
              : band < 3.5 ? vec3(0.129, 0.247, 0.443)  // #213f71
              : vec3(0.102, 0.188, 0.333);              // #1a3055
  c = mix(c, lightC, step(0.68, lightR));
  c = mix(c, darkC, step(0.58, darkR));

  // ── 간헐적 파문 링 — 레퍼런스의 수영객·부표 주변 타원 잔결의 앰비언트판 ──
  vec2 rcell = vec2(38.0, 30.0);
  vec2 rc = floor(p / rcell);
  float rh2 = hash(rc + vec2(3.7, 8.1));
  vec2 rcenter = (rc + 0.5 + (vec2(hash(rc + vec2(1.1, 0.0)), hash(rc + vec2(0.0, 2.2))) - 0.5) * 0.55) * rcell;
  float rph = fract(t * 0.09 * (0.6 + rh2 * 0.8) + rh2 * 11.0);
  float rrad = 2.5 + rph * 8.5;
  vec2 rdv = (p - rcenter) * vec2(1.0, 1.85); // 부감 타원 (z 압축)
  float rlen = length(rdv);
  float ring = step(abs(rlen - rrad), 0.6) * step(rph, 0.72);
  // 대시 갭 — 링이 끊어진 호로 그려진다
  ring *= step(0.30, hash(floor(vec2(atan(rdv.y, rdv.x) * 5.0 + 8.0, rrad * 0.8)) + rc));
  ring *= step(0.35, rh2) * step(0.5, band);
  c = mix(c, lightC, ring);

  // ── 부유물 물결 링 — 인플레이터블·폰툰·보트 주위 얇은 흰 대시 링 ──
  float obj = 0.0;
  for (int i = 0; i < ${MAX_FOAM}; i++) {
    if (i >= uFoamN) break;
    vec3 f = uFoam[i];
    vec2 dv2 = p - f.xy;
    float L = length(dv2);
    float rr = f.z + sin(t * 0.6 + float(i) * 1.9) * 0.5;
    float bandw = step(abs(L - rr), 0.45);
    bandw *= step(0.45, hash(floor(vec2(atan(dv2.y, dv2.x) * (3.0 + f.z * 0.35), rr)) + vec2(float(i), 0.0)));
    obj = max(obj, bandw);
  }
  c = mix(c, vec3(0.910, 0.957, 0.973), obj * step(0.0, d)); // #e8f4f8

  // ── 바나나보트 V자 항적 — 뒤로 벌어지는 두 갈래 흰 대시 + 선수 거품 ──
  {
    vec2 bl = p - uBoat.xy;
    vec2 fwd = vec2(uBoat.z, uBoat.w);
    float along = dot(bl, -fwd);                       // 배 뒤쪽 +
    float side = dot(bl, vec2(-fwd.y, fwd.x));
    float half_ = 2.0 + along * 0.30;                  // V 벌어짐
    float onV = step(0.0, along) * step(along, 42.0) * step(abs(abs(side) - half_), 1.0);
    // 대시 + 거리 감쇠 (멀수록 성김)
    float wh = hash(floor(vec2(along * 0.7, side * 1.1)));
    onV *= step(0.25 + along * 0.014, wh);
    // 선수·선미 거품 덩어리
    float bow = step(length(bl + fwd * 6.0), 4.2) * step(0.4, hash(floor(p * 1.4) + floor(t * 3.0)));
    c = mix(c, vec3(0.910, 0.957, 0.973), max(onV, bow));
  }

  // 드문 밝은 하이라이트 — 깊은 물에서만
  c = mix(c, vec3(0.408, 0.580, 0.961), step(0.975, lightR) * step(1.5, band)); // #6894f5

  // ── 해안 거품선 — 픽셀 뭉침 + 숨쉬기 + 흩어지는 거품 점 ──
  float breathe = sin(t * 0.55 + p.x * 0.11) * 0.6 + sin(t * 0.33 + p.x * 0.031 + 2.0) * 0.4;
  float foamEdge = 1.6 + breathe;
  // 셀(≈1px) 단위 톱니 — 경계를 픽셀 덩어리로 만든다
  vec2 fc = floor(p * vec2(1.7, 1.0));
  float rag = hash(fc) * 1.2;
  float foamBand = step(d, foamEdge - rag * 0.8) * step(0.0, d);
  // 거품 안쪽은 흰색, 경계 셀 일부는 옅게 부서진다
  float inner = step(d, foamEdge - 1.0);
  vec3 foamC = mix(vec3(0.910, 0.957, 0.973), vec3(1.0), inner); // #e8f4f8 → #ffffff
  c = mix(c, foamC, foamBand);
  // 거품선 밖으로 흩어지는 점 — 밀도는 거리 감쇠
  float scatter = step(0.93 + smoothstep(foamEdge, foamEdge + 2.5, d) * 0.065,
                       hash(fc + vec2(7.0, floor(t * 0.8))));
  c = mix(c, vec3(0.910, 0.957, 0.973), scatter * step(d, foamEdge + 2.5) * step(foamEdge, d));

  // 두 번째 잔물결 호 — 대시로 끊어진 옅은 선
  float arcD = 7.5 + sin(t * 0.45 + p.x * 0.13) * 1.4;
  float arc = step(abs(d - arcD), 0.7) * step(0.45, hash(vec2(floor(p.x / 3.5), floor(arcD))));
  c = mix(c, vec3(0.722, 0.925, 0.925), arc * 0.85);

  // ── 햇빛 스파클 — 화면 1px 명멸점 (240폭 타깃이라 fragcoord = 논리픽셀) ──
  vec2 sc = floor(gl_FragCoord.xy / vec2(5.0, 4.0));
  float sh = hash(sc);
  float tw = step(fract(t * 0.22 + sh * 19.0), 0.07) * step(0.72, sh);
  vec2 inCell = floor(mod(gl_FragCoord.xy, vec2(5.0, 4.0)));
  float center = step(abs(inCell.x - 2.0), 0.5) * step(abs(inCell.y - 2.0), 0.5);
  float szone = smoothstep(4.0, 9.0, d);
  c = mix(c, vec3(1.0), tw * center * szone);

  // 출력은 linear — 픽셀화 패스가 sRGB 로 되돌린 뒤 팔레트에 스냅한다
  gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0);
}
`;

const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export function makeWater(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uFoam: { value: Array.from({ length: MAX_FOAM }, () => new THREE.Vector3()) },
      uFoamN: { value: 0 },
      uBoat: { value: new THREE.Vector4(0, 9999, 0, 1) },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1100, 460), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(60, 0, 220); // z 0(해안)~ 남쪽으로 넓게
  return { mesh, material };
}

/** 부유물 물결 링 좌표 주입 — park 등이 부른다 */
export function setFoamRings(
  material: THREE.ShaderMaterial, rings: Array<[number, number, number]>,
): void {
  const arr = material.uniforms.uFoam!.value as THREE.Vector3[];
  const n = Math.min(rings.length, arr.length);
  for (let i = 0; i < n; i++) {
    const [x, z, r] = rings[i]!;
    arr[i]!.set(x, z, r);
  }
  material.uniforms.uFoamN!.value = n;
}
