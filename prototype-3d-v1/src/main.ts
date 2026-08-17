import * as THREE from 'three';
import { PixelPipeline } from './pixelate.js';
import { makeWater, setFoamRings } from './water.js';
import { makeSand, makeGrass, makeHill, makeRidges, makeTrees, makeSky, makeDeco } from './terrain.js';
import { makePark } from './park.js';
import { makeLodge, makeServiceRow, makeDock } from './buildings.js';
import { makeGuests } from './guests.js';

/**
 * 가평 빠지 리조트 픽셀화 3D 디오라마 — docs/3d-gauntlet-prompt.md 실행본.
 * 시스템 1 ✅ 픽셀화 · 시스템 2 물 · 시스템 3 지형.
 */

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8ed4ee');

// 고정 3/4 부감 오소 카메라 — 아이소 대각 (yaw ~35°). 남서쪽에서 북동을 본다:
// 해안·잔교가 사선으로 흐르고 건물의 정면+측면 두 면이 보인다 (quality-bar 구도).
// 피치(고도각 ≈35°)와 거리는 정면 시절 그대로.
const aspect = window.innerWidth / window.innerHeight;
const VIEW_H = 308;
export const CAM_YAW = 0.52; // ≈30°
const camera = new THREE.OrthographicCamera(
  (-VIEW_H * aspect) / 2, (VIEW_H * aspect) / 2, VIEW_H / 2, -VIEW_H / 2, 0.1, 2000,
);
const TARGET = new THREE.Vector3(14, 22, 2);
const HORIZ = 336, HEIGHT = 238; // 기존 (0,238,336) 오프셋의 수평거리·높이
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
scene.add(makeRidges());
scene.add(makeTrees());
scene.add(makeDeco());
const sky = makeSky();
scene.add(sky);

// ── 시스템 4: 수상파크 ──
const park = makePark();
scene.add(park.group);

// ── 시스템 5: 건물·서비스열·잔교·보트 ──
scene.add(makeLodge());
scene.add(makeServiceRow());
const dock = makeDock();
scene.add(dock.group);
setFoamRings(water.material, [...park.foam, ...dock.foam, [-64, 138, 6.5]]);

// ── 시스템 6·7: 손님·바나나보트·구조보트·움직임 ──
const guests = makeGuests();
scene.add(guests.group);

// 구름 드리프트 준비
const clouds: THREE.Object3D[] = [];
sky.traverse((o) => { if (o.name === 'cloud') clouds.push(o); });

const pipeline = new PixelPipeline(aspect);

window.addEventListener('resize', () => {
  const a = window.innerWidth / window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.left = (-VIEW_H * a) / 2;
  camera.right = (VIEW_H * a) / 2;
  camera.updateProjectionMatrix();
  pipeline.resize(a);
});

let t = 0;
renderer.setAnimationLoop(() => {
  t += 1 / 60;
  water.material.uniforms.uTime!.value = t;
  // 손님·바나나보트 갱신 + 항적 유니폼
  const boat = guests.update(t);
  (water.material.uniforms.uBoat!.value as THREE.Vector4).set(boat.boatX, boat.boatZ, boat.boatCos, boat.boatSin);
  // 구름 드리프트 — 아주 느리게 동쪽으로, 화면 밖에서 되돌아온다
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i]!;
    c.position.x += (0.010 + i * 0.004);
    if (c.position.x > 130) c.position.x = -120;
  }
  pipeline.render(renderer, scene, camera);
});
