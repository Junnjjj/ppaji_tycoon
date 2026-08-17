import * as THREE from 'three';
import { PixelPipeline, DOT, DPR, logicalSize } from './pixelate.js';
import { makeWater, setFoamRings } from './water.js';
import { makeSand, makeGrass, makeHill, makeRidges, makeTrees, makeSky, makeDeco } from './terrain.js';
import { validateCourse, requireEquipmentDef, COURSE_ISSUE_MESSAGES } from '../../src/sim/index.js';
import { createSim } from './simworld.js';
import { makeSimView } from './sim-view.js';
import { makeLodgeSprite } from './lodge-sprite.js';
import { preloadFacilitySprites } from './sprite-facility.js';
import { makePlacement } from './placement.js';
import { makeCameraCtl } from './camera-ctl.js';
import { makeBubbles } from './bubbles.js';
import { makeCourseView } from './course-view.js';
import { makeFarBank, skyOf } from './farbank.js';
import { makePermitFence, permitRectFor } from './permit.js';
import { makePier } from './stage.js';
import { GRID_W, GRID_H, X0, Z0, TILE, LAND_ROWS } from './simworld.js';
import { applyToon } from './toon.js';

/**
 * 가평 빠지 리조트 픽셀화 3D 디오라마 — docs/3d-gauntlet-prompt.md 실행본.
 * 시스템 1 ✅ 픽셀화 · 시스템 2 물 · 시스템 3 지형.
 */

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1); // 버퍼 크기는 우리가 직접 정한다 (정수 배율을 지키려고)
document.body.appendChild(renderer.domElement);

/**
 * 캔버스를 **논리 격자의 정수 배수**로 맞춘다.
 *   버퍼 = 논리 × DOT × DPR   ·   CSS = 논리 × DOT
 * 두 값의 비가 정확히 DPR 이라 브라우저 스케일링도 1:1 이다. 도트가 뭉개질 구석이 없다.
 * 화면보다 최대 DOT-1 px 넘칠 수 있는데 그건 안 보인다 (body overflow:hidden).
 */
function layout(): { lw: number; lh: number } {
  const { w: lw, h: lh } = logicalSize(window.innerWidth, window.innerHeight);
  renderer.setSize(lw * DOT * DPR, lh * DOT * DPR, false);
  const st = renderer.domElement.style;
  st.width = `${lw * DOT}px`;
  st.height = `${lh * DOT}px`;
  return { lw, lh };
}
const view0 = layout();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8ed4ee');

// 고정 3/4 부감 오소 카메라 — 아이소 대각 (yaw ~35°). 남서쪽에서 북동을 본다:
// 해안·잔교가 사선으로 흐르고 건물의 정면+측면 두 면이 보인다 (quality-bar 구도).
// 피치(고도각 ≈35°)와 거리는 정면 시절 그대로.
const aspect = view0.lw / view0.lh;
const VIEW_H = 308;

/**
 * 카메라 각도 — `?yaw=` `?elev=` (도 단위) 로 실험할 수 있다.
 *
 * ⚠ 지금 기본값은 **아이소메트릭이 아니다.** 실측하면 지면 축이 +X 18.3° / +Z 45.3° 로
 * 심하게 비대칭이다 (yaw 30° 의 결과: 기울기 = sinφ·tanθ 와 sinφ/tanθ).
 * 아이소로 그려진 스프라이트는 정의상 좌우 대칭이라 이 카메라에는 절대 안 맞는다.
 *
 * yaw 를 45° 로 두면 두 축이 같아진다:
 *   기울기 = sinφ  ·  정아이소 0.577(30°) ↔ 2:1 아이소 0.500(26.57°)
 * 고도각 기본 35.31° 는 이미 arcsin(1/√3)=35.26°, 즉 **정아이소 고도각**이다 —
 * yaw 하나만 45° 로 바꾸면 정아이소가 된다.
 *
 * 픽셀 게임이면 2:1(26.57°)이 유리하다: 지면 축이 "오른쪽 2 · 아래 1" 로 **정수 픽셀**에
 * 떨어져 계단 현상이 규칙적이다. 0.577 은 격자에 안 떨어진다.
 */
const Q = new URLSearchParams(location.search);
const deg = (k: string, d: number): number => {
  const v = Number(Q.get(k));
  return Number.isFinite(v) && v !== 0 ? (v * Math.PI) / 180 : d;
};
/**
 * ⚠ **얕은 아이소 20°** — 배경과의 이음새 때문에 고른 값이다 (되돌리지 말 것).
 * 격자축이 화면에서 +X 11.9° · +Z 57.8° 로 찍혀, 모든 밴드(배경·뒷강·잔디·마당·앞강)가
 * 12° 로 나란히 흐른다. yaw 45(정아이소)는 격자축이 30° 라 수평 배경 띠와
 * **30° 클래시**를 만들어 상단에 칼자국이 생겼다 (실측).
 * 대가: 화면 up 의 z 성분이 0.408→0.542 로 커져 **z 후퇴 가시 한계가 짧아진다**
 * (줌 1.4 에서 203 월드). 그래서 땅끝·배경 벽을 앞으로 당겨야 한다.
 */
export const CAM_YAW = deg('yaw', (20 * Math.PI) / 180);
const CAM_ELEV = deg('elev', Math.atan2(238, 336)); // 기본 35.31°
const camera = new THREE.OrthographicCamera(
  (-VIEW_H * aspect) / 2, (VIEW_H * aspect) / 2, VIEW_H / 2, -VIEW_H / 2, 0.1, 2000,
);
const TARGET = new THREE.Vector3(0, 4, -34); // 상단 배경 밴드 + 마당 + 링이 함께 담기는 지점
// 카메라까지의 거리는 고정하고 고도각만 바꾼다 (거리가 변하면 오소 뷰가 흔들린다)
const CAM_DIST = Math.hypot(336, 238);
const HORIZ = CAM_DIST * Math.cos(CAM_ELEV), HEIGHT = CAM_DIST * Math.sin(CAM_ELEV);
camera.position.set(
  TARGET.x - Math.sin(CAM_YAW) * HORIZ,
  TARGET.y + HEIGHT,
  TARGET.z + Math.cos(CAM_YAW) * HORIZ,
);
camera.lookAt(TARGET);

// 여름 한낮 광원 — 좌상단
const sun = new THREE.DirectionalLight('#fff4d6', 2.4);
sun.position.set(-90, 160, 80);
scene.add(sun);
scene.add(new THREE.AmbientLight('#cfe4ee', 0.95));

// ── 시스템 2·3: 물 + 지형 ──
const water = makeWater();
scene.add(water.mesh);
scene.add(makeSand());
scene.add(makeGrass());
scene.add(makeHill());
scene.add(makeTrees(camera));

// 배경막 — 절차적 하늘·능선 vs 스프라이트 2겹 (`?bg=sprite`). **둘 중 하나만** 켠다.
const sky = makeSky();
// 강 건너편 — 월드 빌보드 벽 (화면부착 배경막은 폐기: 땅끝과 못 만난다)
// 배경색은 **벽 텍스처 최상단 하늘색**이어야 한다 (맵 타입마다 다르다) — 안 맞추면
// 벽 윗변에서 하늘이 두 색으로 갈라져 가로 선이 보인다.
scene.background = new THREE.Color(skyOf());
scene.add(makeFarBank(camera));

// ── 무대: 잔교 — 육상 시설 줄이 서는 물 위 나무 무대 ──
// (옛 장식 수상파크·잔교·서비스열은 옛 지형 좌표에 붙박이라 제거했다.
//  이제 그 역할은 플레이어가 짓는 sim 시설이 한다)
scene.add(makePier());

// ── 본관 — 배경 밴드의 장식 (경로 판정은 끝났다: 스프라이트 승) ──
const lodgeSlot = new THREE.Group();
scene.add(lodgeSlot);
void makeLodgeSprite(camera).then((lodge) => {
  applyToon(lodge);
  lodgeSlot.add(lodge);
  Object.assign(window, { __lodgeReady: true });
});

setFoamRings(water.material, []);

// 허가 구역 — 수면 플레이 영역을 폰툰 링으로 (`?permit=0` 이면 끈다). 등급 3 = 180타일
const PERMIT_ON = new URLSearchParams(location.search).get('permit') !== '0';
// 링은 잔교 2줄 아래에서 시작해 얕은 물(pool 지형)과 깊은 물(trampoline)을 **둘 다 걸친다**
// — 깊은 물에만 두면 얕은 물 전용 시설이 링 안에 못 들어간다 (실측).
// 중심을 살짝 왼쪽(14)으로 — 레퍼런스 구도.
export const PERMIT = permitRectFor(3, 14, 15);
if (PERMIT_ON) {
  const fence = makePermitFence(PERMIT);
  applyToon(fence);
  scene.add(fence);
}
Object.assign(window, { __STAGE: { X0, Z0, T: TILE, W: GRID_W, H: GRID_H, LAND_ROWS, permit: PERMIT } });

// 구름 드리프트 준비
const clouds: THREE.Object3D[] = [];
sky.traverse((o) => { if (o.name === 'cloud') clouds.push(o); });

// ── (a) 셀 셰이딩 — toon.ts 가 소유 (런타임 추가분도 같은 램프를 쓴다) ──
applyToon(scene);

// ── 시스템 8: sim 결합 — 2D 프로토와 같은 sim 을 그대로 쓴다 (불변식 1) ──
let placementRef: { addIncome: (n: number) => void } | null = null;
const sim = createSim(7, (amount) => placementRef?.addIncome(amount));
sim.clock.speed = 3;
const simView = makeSimView(sim, camera);
scene.add(simView.group);
const camCtl = makeCameraCtl(camera, renderer.domElement, TARGET, VIEW_H);
const courseView = makeCourseView(sim);
scene.add(courseView.group);
const placement = makePlacement(sim, camera, renderer.domElement, camCtl, () => {
  simView.sync();
  courseView.sync();
});
placementRef = placement;
// 시설 스프라이트는 부팅 후 비동기로 온다 — 오면 시설 메시를 갈아끼운다.
// 없으면 조용히 파라메트릭으로 계속 돈다 (fetch 실패를 삼킨다).
void preloadFacilitySprites().then((n) => {
  if (n > 0) simView.rebuild();
  Object.assign(window, { __spritesLoaded: n });
});

const bubbles = makeBubbles(sim);
scene.add(bubbles.group);
scene.add(placement.ghost);

// 개발용 핸들 (검증 스크립트가 sim 상태를 읽는다)
Object.assign(window, {
  __d3: { sim, simView, courseView, camera, validateCourse, requireEquipmentDef, COURSE_ISSUE_MESSAGES },
});

const pipeline = new PixelPipeline(view0.lw, view0.lh);

window.addEventListener('resize', () => {
  const { lw, lh } = layout();
  const a = lw / lh;
  camera.left = (-VIEW_H * a) / 2;
  camera.right = (VIEW_H * a) / 2;
  camera.updateProjectionMatrix();
  pipeline.resize(lw, lh);
});

let t = 0;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(100, now - last);
  last = now;
  t += 1 / 60;

  // sim 진행 — 고정 timestep 10Hz, 배속은 tick 수를 곱한다
  const ticks = sim.clock.pump(dt);
  if (ticks > 0) sim.run(ticks);
  simView.updateGuests();
  courseView.update();
  bubbles.update(t);
  camCtl.update(); // 줌 스냅·elastic 복귀 애니메이션
  placement.onFrame();

  water.material.uniforms.uTime!.value = t;
  // 구름 드리프트 — 아주 느리게 동쪽으로, 화면 밖에서 되돌아온다
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i]!;
    c.position.x += (0.010 + i * 0.004);
    if (c.position.x > 130) c.position.x = -120;
  }
  pipeline.render(renderer, scene, camera);
});
