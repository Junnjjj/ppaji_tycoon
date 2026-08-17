import * as THREE from 'three';

/**
 * 카메라 조작 — 카이로소프트식 **3단 줌 스냅**.
 *
 * 연속 줌을 버린 이유: 대부분의 배율에서 스프라이트 텍셀이 화면 도트와 어긋나
 * 도트가 지글거린다. 카이로 게임이 줌을 딱딱 끊는 것도 같은 이유다.
 *
 *   ×0.96  리조트 한눈 (텍셀 ≈ ½도트)
 *   ×1.40  기본 — "건물 단위라 조금 축소된 느낌" (사용자 판정)
 *   ×1.92  최대 — 텍셀 1:1, 도트 가장 선명
 *
 * - 핀치: 잡고 있는 동안은 연속(중점 고정), 놓으면 가장 가까운 단으로 스냅
 * - 더블탭: 1.4 ↔ 1.92 토글, 탭 지점이 화면에서 안 움직이게 앵커
 * - 팬: 무대 밖으로 살짝 끌리되(저항) 놓으면 경계 안으로 되돌아온다 (elastic)
 * - 휠(데스크톱): 사다리를 한 단씩 오르내림
 *
 * ⚠ `update()` 는 **애니메이션 중일 때만** 카메라를 만진다. 촬영 도구·skillcheck 가
 * 카메라를 직접 조작하는데, 매 프레임 목표값으로 되돌리면 전부 깨진다 (설계 제약).
 */

export interface CameraCtl {
  panEnabled: boolean;
  /** 이번 포인터다운~업이 탭이었나 (드래그면 false) — 탭 판정에 쓴다 */
  readonly wasTap: boolean;
  update: () => void;
}

/** 줌 사다리 — 텍셀 정합 근거는 위 주석. 순서 오름차순 유지 */
export const ZOOM_STEPS = [0.96, 1.4, 1.92] as const;
export const ZOOM_DEFAULT = 1.4;

/** 팬 경계 — 무대(±96, ±72) + 배경 감상 여백 */
const BOUNDS = { minX: -120, maxX: 120, minZ: -95, maxZ: 95 };
/** 경계 밖 최대 overshoot(월드)와 드래그 저항 배율 */
const ELASTIC = 26;
const RESIST = 0.35;

export function makeCameraCtl(
  camera: THREE.OrthographicCamera,
  dom: HTMLElement,
  target: THREE.Vector3,
  viewH: number,
): CameraCtl {
  const offset = camera.position.clone().sub(target);
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let wasTap = false;
  let pinchDist = 0;
  let lastTapAt = 0;
  let lastTapX = 0, lastTapY = 0;

  // 부팅 줌 — 기본 단
  camera.zoom = ZOOM_DEFAULT;
  camera.updateProjectionMatrix();

  // ── 애니메이션 목표 (snapActive 일 때만 update 가 카메라를 움직인다) ──
  let snapActive = false;
  const goal = { x: target.x, z: target.z, zoom: camera.zoom };

  const right = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  const apply = (): void => {
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  };

  /** 경계에 저항 붙여 클램프 (드래그 중) — 밖으로 갈수록 무거워진다 */
  const soft = (v: number, min: number, max: number): number => {
    if (v < min) return Math.max(min - ELASTIC, min + (v - min) * RESIST);
    if (v > max) return Math.min(max + ELASTIC, max + (v - max) * RESIST);
    return v;
  };

  /** 화면 좌표 → 지면(y=0) 월드 좌표 (오소 카메라) */
  const groundAt = (clientX: number, clientY: number): THREE.Vector3 => {
    const r = dom.getBoundingClientRect();
    const ndc = new THREE.Vector3(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
      -1,
    );
    ndc.unproject(camera);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const t = -ndc.y / dir.y;
    return ndc.addScaledVector(dir, t);
  };

  /**
   * 앵커 줌 — 지면점 G 가 화면에서 안 움직이게 타깃을 보정한다.
   * 화면 오프셋 ∝ (G − target)·zoom 이므로 target' = G − (G − target)·(zoom/zoom')
   */
  const zoomAnchored = (newZoom: number, anchor: THREE.Vector3): void => {
    const k = camera.zoom / newZoom;
    goal.x = THREE.MathUtils.clamp(anchor.x - (anchor.x - target.x) * k, BOUNDS.minX, BOUNDS.maxX);
    goal.z = THREE.MathUtils.clamp(anchor.z - (anchor.z - target.z) * k, BOUNDS.minZ, BOUNDS.maxZ);
    goal.zoom = newZoom;
    snapActive = true;
  };

  const nearestStep = (z: number): number => {
    let best: number = ZOOM_STEPS[0];
    for (const s of ZOOM_STEPS) if (Math.abs(s - z) < Math.abs(best - z)) best = s;
    return best;
  };

  const stepFrom = (z: number, dir: 1 | -1): number => {
    // 현재 줌과 "확실히 다른" 이웃 단으로 — 부동소수 오차로 같은 단에 머무는 걸 막는다
    const sorted = [...ZOOM_STEPS];
    if (dir > 0) return sorted.find((s) => s > z * 1.02) ?? sorted[sorted.length - 1]!;
    return [...sorted].reverse().find((s) => s < z * 0.98) ?? sorted[0]!;
  };

  dom.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
    moved = 0;
    wasTap = false;
    snapActive = false; // 손을 대면 진행 중이던 스냅은 중단
  });

  dom.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved += Math.abs(dx) + Math.abs(dy);

    if (pointers.size >= 2) {
      // 핀치 — 잡는 동안은 연속. 중점의 지면점을 고정해 "잡은 곳이 커진다"
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 0 && d > 0) {
        const mid = groundAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
        const z2 = THREE.MathUtils.clamp(
          camera.zoom * (d / pinchDist), ZOOM_STEPS[0] * 0.85, ZOOM_STEPS[ZOOM_STEPS.length - 1] * 1.15,
        );
        const k = camera.zoom / z2;
        target.x = mid.x - (mid.x - target.x) * k;
        target.z = mid.z - (mid.z - target.z) * k;
        camera.zoom = z2;
        camera.updateProjectionMatrix();
        apply();
      }
      pinchDist = d;
      return;
    }
    if (!ctl.panEnabled) return;

    // 화면 픽셀 → 월드 거리 (오소 카메라: 화면 높이 = viewH / zoom)
    const perPx = viewH / camera.zoom / dom.clientHeight;
    right.setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
    fwd.copy(UP).cross(right).normalize();
    target.addScaledVector(right, -dx * perPx);
    target.addScaledVector(fwd, dy * perPx);
    target.x = soft(target.x, BOUNDS.minX, BOUNDS.maxX);
    target.z = soft(target.z, BOUNDS.minZ, BOUNDS.maxZ);
    apply();
  });

  const end = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    wasTap = moved < 12;

    if (pointers.size === 1) return; // 핀치에서 한 손가락만 뗀 상태 — 아직 확정 아님
    if (pinchDist > 0) {
      // 핀치 종료 → 가장 가까운 단으로 스냅
      pinchDist = 0;
      goal.x = THREE.MathUtils.clamp(target.x, BOUNDS.minX, BOUNDS.maxX);
      goal.z = THREE.MathUtils.clamp(target.z, BOUNDS.minZ, BOUNDS.maxZ);
      goal.zoom = nearestStep(camera.zoom);
      snapActive = true;
      return;
    }

    // 팬 종료 — 경계 밖이면 elastic 복귀
    if (target.x < BOUNDS.minX || target.x > BOUNDS.maxX
      || target.z < BOUNDS.minZ || target.z > BOUNDS.maxZ) {
      goal.x = THREE.MathUtils.clamp(target.x, BOUNDS.minX, BOUNDS.maxX);
      goal.z = THREE.MathUtils.clamp(target.z, BOUNDS.minZ, BOUNDS.maxZ);
      goal.zoom = camera.zoom;
      snapActive = true;
    }

    // 더블탭 — 1.4 ↔ 1.92 토글 (배치 모드에선 끔: 탭이 배치 확정과 겹친다)
    if (wasTap && ctl.panEnabled) {
      const now = performance.now();
      const near = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40;
      if (now - lastTapAt < 320 && near) {
        const anchor = groundAt(e.clientX, e.clientY);
        zoomAnchored(camera.zoom < 1.9 ? 1.92 : ZOOM_DEFAULT, anchor);
        lastTapAt = 0;
        return;
      }
      lastTapAt = now;
      lastTapX = e.clientX;
      lastTapY = e.clientY;
    }
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);

  // 데스크톱 휠 — 사다리 한 단씩, 커서 앵커
  dom.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAnchored(stepFrom(goal.zoom, e.deltaY > 0 ? -1 : 1), groundAt(e.clientX, e.clientY));
  }, { passive: false });

  const ctl: CameraCtl = {
    panEnabled: true,
    get wasTap() { return wasTap; },
    update: () => {
      if (!snapActive) return;
      // 지수 감쇠 — 프레임마다 목표로 1/4 씩. 0.2 월드·0.002 줌 이내면 종료
      target.x += (goal.x - target.x) * 0.25;
      target.z += (goal.z - target.z) * 0.25;
      camera.zoom += (goal.zoom - camera.zoom) * 0.25;
      camera.updateProjectionMatrix();
      apply();
      if (Math.abs(goal.x - target.x) < 0.2 && Math.abs(goal.z - target.z) < 0.2
        && Math.abs(goal.zoom - camera.zoom) < 0.002) {
        target.x = goal.x; target.z = goal.z;
        camera.zoom = goal.zoom;
        camera.updateProjectionMatrix();
        apply();
        snapActive = false;
      }
    },
  };
  apply();
  return ctl;
}
