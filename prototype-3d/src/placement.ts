import * as THREE from 'three';
import type { Game } from '../../src/sim/index.js';
import {
  requireFacilityDef, footprint, PLACE_FAILURE_MESSAGES,
  EQUIPMENT_DEFS, requireEquipmentDef, validateCourse, sampleSpline,
  COURSE_ISSUE_MESSAGES, type Vec2, type EquipmentDef,
} from '../../src/sim/index.js';
import { TILE, footprintCenter, worldToTile, tileToWorld } from './simworld.js';
import { makeHud, ICONS, type Mode } from './hud.js';
import type { CameraCtl } from './camera-ctl.js';

/**
 * 배치·철거 컨트롤러. 폰에서 실수하지 않도록 **확정형**이다:
 * 고른다 → 고스트가 뜬다 → 끌어서 옮긴다 → [확정] 을 눌러야 지어진다.
 * (탭 즉시 배치는 손가락이 미끄러지면 되돌릴 방법이 없었다.)
 */

const START_MONEY = 30_000_000;
const NEED_LABEL: Record<string, string> = {
  hunger: '허기', thirst: '갈증', toilet: '화장실', heat: '더위', rest: '휴식', fun: '재미',
};
const REFUND = 0.5;
/** 장비 minDepth → 사람이 읽는 말 */
const DEPTH_LABEL: Record<number, string> = { 1: '얕은 물', 2: '깊은 물', 3: '넓은 수역' };

export interface Placement {
  ghost: THREE.Group;
  onFrame: () => void;
  /** Game 의 onSpend 가 부른다 — 손님이 쓴 돈이 자금에 들어온다 */
  addIncome: (amount: number) => void;
}

const isEquipment = (id: string): boolean => EQUIPMENT_DEFS.some((e: EquipmentDef) => e.id === id);
/** 드래그 궤적을 제어점 N 개로 줄인다 — 스플라인은 점이 적어야 매끄럽다 */
function reducePath(raw: Vec2[], maxPoints: number): Vec2[] {
  if (raw.length <= 2) return raw;
  const n = Math.max(3, Math.min(maxPoints, Math.round(raw.length / 6)));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) out.push(raw[Math.round((i * (raw.length - 1)) / (n - 1))]!);
  return out;
}

export function makePlacement(
  sim: Game,
  camera: THREE.Camera,
  dom: HTMLCanvasElement,
  cam: CameraCtl,
  onChanged: () => void,
): Placement {
  /** 코스 그리기 상태 — 시설과 완전히 다른 흐름이라 따로 둔다 */
  let coursePath: Vec2[] = [];
  let courseIssue = '';
  let money = START_MONEY;
  let mode: Mode = 'view';
  let picked: string | null = null;
  let rot: 0 | 1 | 2 | 3 = 0;
  let tile: { x: number; y: number } | null = null;
  let toast = '';
  let toastUntil = 0;
  let selectedIid = -1;
  let income = 0;
  /** 길처럼 1×1 이고 싼 것은 드래그로 죽 긋는다 */
  let dragPaint = false;

  /** sim 이 손님 지출을 알려주면 자금에 더한다 (Game 의 onSpend 콜백) */
  const addIncome = (amount: number): void => { money += amount; income += amount; };

  // ── 고스트 (윗면 밝은 반투명 박스 + 격자 발자국) ──
  const ghost = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#7fd07f', transparent: true, opacity: 0.38 }),
  );
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.4, 1),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }),
  );
  ghost.add(body, pad);
  ghost.visible = false;

  // 코스 미리보기 — 그리는 동안 경로를 점으로 보여준다 (유효 초록 / 무효 빨강)
  const PREVIEW_MAX = 120;
  const preview = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1.1, 6, 5),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    PREVIEW_MAX,
  );
  preview.frustumCulled = false;
  preview.count = 0;
  const previewColor = new THREE.Color();
  ghost.add(preview);

  const hud = makeHud({
    onPick: (id) => {
      picked = id;
      rot = 0;
      coursePath = [];
      courseIssue = '';
      if (isEquipment(id)) {
        cam.panEnabled = false;
        hud.setPlacing(id);
        say('물 위에 손가락으로 코스를 그리세요 (선착장 근처에서 시작)');
        return;
      }
      tile = tile ?? worldToTile(0, 20);
      cam.panEnabled = false; // 배치 중엔 손가락이 고스트를 끈다
      hud.setPlacing(id);
    },
    onCancel: () => {
      picked = null;
      coursePath = [];
      cam.panEnabled = true;
      hud.setPlacing(null);
    },
    onRotate: () => { rot = ((rot + 1) % 4) as 0 | 1 | 2 | 3; },
    onConfirm: () => {
      if (picked && isEquipment(picked)) {
        const def = requireEquipmentDef(picked);
        const pts = reducePath(coursePath, def.maxPoints);
        if (def.vehicleCost > money) return;
        const c = sim.createCourse(picked, pts, 1);
        if (c) {
          money -= def.vehicleCost;
          coursePath = [];
          onChanged();
          say(`${def.name} 코스 개설 — 차량 1대`);
        } else {
          say('코스를 만들 수 없습니다');
        }
        return;
      }
      if (!picked || !tile) return;
      const def = requireFacilityDef(picked);
      if (def.cost > money) return;
      if (!sim.facilities.canPlace(def, tile.x, tile.y, rot).ok) return;
      if (sim.placeFacility(picked, tile.x, tile.y, rot)) {
        money -= def.cost;
        onChanged();
        say(`${def.name} 완공`);
        // 연속 배치 — 같은 종류를 계속 놓을 수 있게 고스트를 유지한다
      }
    },
    onMode: (m) => {
      mode = m;
      if (m !== 'place') { picked = null; hud.setPlacing(null); }
      cam.panEnabled = m !== 'place' || picked === null;
      say(m === 'demolish' ? '철거할 시설을 탭하세요 (절반 환급)' : '');
    },
    onSpeed: (s) => { sim.clock.speed = s; },
    onDemolishSelected: () => {
      const f = sim.facilities.byIid(selectedIid);
      if (!f) return;
      const def = requireFacilityDef(f.defId);
      if (sim.removeFacility(f.iid)) {
        money += Math.round(def.cost * REFUND);
        selectedIid = -1;
        hud.showSheet(null);
        onChanged();
        say(`${def.name} 철거 — ${Math.round((def.cost * REFUND) / 10000)}만원 환급`);
      }
    },
    onCloseSheet: () => { selectedIid = -1; hud.showSheet(null); },
  });

  function say(msg: string): void {
    toast = msg;
    toastUntil = performance.now() + 2600;
  }

  // ── 레이캐스트 ──
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const pick = (cx: number, cy: number): { x: number; y: number } | null => {
    const r = dom.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, hit) ? worldToTile(hit.x, hit.z) : null;
  };

  const drag = (e: PointerEvent): void => {
    if (mode !== 'place' || !picked) return;
    const t = pick(e.clientX, e.clientY);
    if (!t) return;
    tile = t;
    if (isEquipment(picked)) {
      if (!dragPaint) return;
      // 타일 중심을 연속 좌표로 (validateCourse 가 Math.floor 로 타일을 찾는다)
      const p: Vec2 = { x: t.x + 0.5, y: t.y + 0.5 };
      const last = coursePath[coursePath.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) >= 1.2) coursePath.push(p);
      return;
    }
    // 길·데크처럼 1×1 이면 끄는 대로 죽 깔린다 (한 칸씩 확정하는 건 폰에서 고문이다)
    if (dragPaint && (picked === 'path' || picked === 'deck')) {
      const def = requireFacilityDef(picked);
      if (def.cost <= money && sim.facilities.canPlace(def, t.x, t.y, 0).ok) {
        if (sim.placeFacility(picked, t.x, t.y, 0)) { money -= def.cost; onChanged(); }
      }
    }
  };
  dom.addEventListener('pointerdown', (e) => { dragPaint = true; drag(e); });
  dom.addEventListener('pointerup', () => { dragPaint = false; });
  dom.addEventListener('pointercancel', () => { dragPaint = false; });
  dom.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') drag(e); });

  dom.addEventListener('pointerup', (e) => {
    if (!cam.wasTap) return;
    const t = pick(e.clientX, e.clientY);
    if (!t) return;
    if (mode === 'demolish') {
      const f = sim.facilities.facilityAt(t.x, t.y);
      if (!f) { say('그 자리엔 시설이 없습니다'); return; }
      const def = requireFacilityDef(f.defId);
      if (sim.removeFacility(f.iid)) {
        money += Math.round(def.cost * REFUND);
        onChanged();
        say(`${def.name} 철거 — ${Math.round((def.cost * REFUND) / 10000)}만원 환급`);
      }
      return;
    }
    if (mode === 'view') {
      const f = sim.facilities.facilityAt(t.x, t.y);
      if (!f) { selectedIid = -1; hud.showSheet(null); return; }
      selectedIid = f.iid;
    }
  });

  const onFrame = (): void => {
    const st = sim.stats();
    let canPlace = false;
    let canAfford = true;
    let hint = '';

    if (picked && isEquipment(picked)) {
      // ── 코스 그리기 미리보기 ──
      const def = requireEquipmentDef(picked);
      const pts = reducePath(coursePath, def.maxPoints);
      canAfford = def.vehicleCost <= money;
      if (pts.length >= 3) {
        const v = validateCourse(pts, def, sim.world, sim.facilities);
        canPlace = v.ok;
        courseIssue = v.ok ? '' : (COURSE_ISSUE_MESSAGES[v.issues[0]!] ?? '');
        const samples = sampleSpline(pts);
        const bad = new Set(v.badSamples);
        const step = Math.max(1, Math.floor(samples.length / PREVIEW_MAX));
        let n = 0;
        const m = new THREE.Matrix4();
        // 전부 빨갛게 칠하면 "어디가 문제인지" 를 못 본다 — **나쁜 구간만** 빨강
        for (let i = 0; i < samples.length && n < PREVIEW_MAX; i += step) {
          const sp = samples[i]!;
          const w = tileToWorld(sp.pos.x - 0.5, sp.pos.y - 0.5);
          m.makeTranslation(w.x, 1.4, w.z);
          preview.setMatrixAt(n, m);
          previewColor.set(bad.has(i) ? '#ef4b4b' : v.ok ? '#7fd07f' : '#f2b53f');
          preview.setColorAt(n, previewColor);
          n++;
        }
        preview.count = n;
        preview.instanceMatrix.needsUpdate = true;
        if (preview.instanceColor) preview.instanceColor.needsUpdate = true;
      } else {
        preview.count = 0;
        canPlace = false;
        courseIssue = '';
      }
      ghost.position.set(0, 0, 0);
      ghost.visible = true;
      body.scale.setScalar(0.0001);
      pad.scale.setScalar(0.0001);
      const need = DEPTH_LABEL[def.minDepth] ?? '물';
      hint = !canAfford ? '차량 구입비가 부족합니다'
        : courseIssue === '수심이 얕습니다'
          ? `${def.name}는 ${need} 이상이 필요합니다 — 빨간 구간을 더 바깥으로`
        : courseIssue === '선착장에 연결해야 합니다'
          ? '선착장 근처(3칸)를 지나야 합니다 — 데크로 선착장을 물 쪽으로 빼세요'
        : courseIssue ? courseIssue
        : canPlace ? '확정하면 차량 1대로 운행을 시작합니다'
        : `${def.name} 코스를 물 위에 그리세요 (${need} 이상)`;
    } else if (picked && tile) {
      const def = requireFacilityDef(picked);
      preview.count = 0;
      const [w, h] = footprint(def, rot);
      const check = sim.facilities.canPlace(def, tile.x, tile.y, rot);
      canPlace = check.ok;
      canAfford = def.cost <= money;
      const c = footprintCenter(tile.x, tile.y, w, h);
      body.scale.set(w * TILE * 0.86, 9, h * TILE * 0.86);
      body.position.y = 4.5;
      pad.scale.set(w * TILE, 0.4, h * TILE);
      pad.position.y = 0.3;
      ghost.position.set(c.x, 0, c.z);
      const col = canPlace && canAfford ? '#7fd07f' : '#ef6b5e';
      (body.material as THREE.MeshBasicMaterial).color.set(col);
      (pad.material as THREE.MeshBasicMaterial).color.set(col);
      ghost.visible = true;
      if (!check.ok) hint = PLACE_FAILURE_MESSAGES[check.reason!] ?? '';
      else if (!canAfford) hint = '자금이 부족합니다';
      else hint = '끌어서 위치를 잡고 확정하세요';
    } else {
      ghost.visible = false;
      preview.count = 0;
      if (st.facilities === 0) hint = '🔨 건설 → 🎫 입장 게이트를 잔디에 놓으면 손님이 들어옵니다';
    }
    if (toast && performance.now() < toastUntil) hint = toast;
    else if (toast) toast = '';

    // 선택된 시설 상세 — 대기·이용 수가 실시간으로 바뀌므로 매 프레임 갱신한다
    if (selectedIid >= 0) {
      const f = sim.facilities.byIid(selectedIid);
      if (!f) { selectedIid = -1; hud.showSheet(null); }
      else {
        const def = requireFacilityDef(f.defId);
        const needs = (def.needs ?? []).map((n) => NEED_LABEL[n] ?? n).join('·') || '—';
        hud.showSheet({
          icon: ICONS[def.id] ?? '🏗',
          name: def.name,
          desc: def.desc ?? '',
          rows: [
            ['이용 중', `${f.inUse} / ${def.capacity}`],
            ['대기줄', `${f.queue}명`],
            ['해소 욕구', needs],
            ['이용료', `${(def.fee / 10000).toFixed(1)}만원`],
            ['만족 기여', `+${def.satisfaction}`],
            ['건설비', `${Math.round(def.cost / 10000)}만원`],
          ],
        });
      }
    }

    hud.update({
      money, day: st.day, guests: st.guests, queued: st.queued,
      happiness: st.avgHappiness, facilities: st.facilities,
      speed: sim.clock.speed, canAfford, canPlace, hint, income,
    });
  };

  return { ghost, onFrame, addIncome };
}
