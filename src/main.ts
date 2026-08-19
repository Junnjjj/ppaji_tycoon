import './compat.js'; // 다른 무엇보다 먼저 — 스프라이트를 굽기 전에 보정이 끝나야 한다
import './ui/style.css';
import { Game as Sim } from './sim/index.js';
import { createAssetProvider } from './assets/index.js';
import { boot, type MainScene } from './render/index.js';
import { Hud } from './ui/hud.js';
import { loadFromStorage, saveToStorage } from './save/index.js';
// 타입만 — 값은 아래 동적 import 로 온다 (⚠ `bootKairo` 앞뒤 순서 규칙과 무관하게 지워진다)
import type { ComboBreakdown } from './ui/kairo-report.js';

const DEFAULT_SEED = 20260811;
const AUTOSAVE_INTERVAL_MS = 30_000;

/**
 * 카이로 씬 — **기본**이다 (K13). v1 씬은 `?v1=1` 로만 열린다.
 *
 * K12 에서 세이브가 생긴 뒤에 바꿨다. 순서가 중요했다 — 세이브 없이 기본으로 올리면
 * 폰에서 새로고침 한 번에 판이 전부 날아가고, 그건 이 프로젝트 1순위 목표
 * ("폰에서 돌아가는 것")에 정면으로 어긋난다.
 */
async function mainKairo(parent: HTMLElement): Promise<void> {
  const { bootKairo } = await import('./render/kairo/boot.js');
  const { GROUND_KINDS } = await import('./sim/kairo/terrain.js');
  const { DoorSet: DoorSetCls } = await import('./sim/kairo/doors.js');
  const { bakeIndoorWalls, paintFloor, paintFloorBlock, doorCandidates, INDOOR_FAIL_MESSAGES } = await import(
    './sim/kairo/indoor.js'
  );
  const { allFacilityDefs, PLACE_FAIL_MESSAGES, guestWalkable } = await import(
    './sim/kairo/placement.js'
  );
  const { WeekRunner, TICKS_PER_DAY, TICKS_PER_WEEK, DAY_NAMES } = await import(
    './sim/kairo/week.js'
  );
  const { audio } = await import('./audio/index.js');
  const { previewCombos, evaluateCombos, comboEffect } = await import('./sim/kairo/combos.js');
  const { UnlockStore } = await import('./sim/kairo/unlocks.js');
  const { ExamStore } = await import('./sim/kairo/exam.js');
  const { WishStore } = await import('./sim/kairo/wishes.js');
  const { COMBOS } = await import('./sim/kairo/combos.js');
  const {
    questStatuses,
    ProgressStore,
    gradeFor,
    requiredGrade,
    admissionLimit,
    Reputation,
    nextGrade,
    landRect,
    GRADES,
  } = await import('./sim/kairo/progress.js');
  const { assessRisk, RISK_NAMES } = await import('./sim/kairo/risk.js');
  const { swimRiskPoints } = await import('./sim/kairo/swim.js');
  const { KairoReport, comboBreakdown } = await import('./ui/kairo-report.js');
  const { KairoCardView } = await import('./ui/kairo-card.js');
  const { KairoUnlockView } = await import('./ui/kairo-unlock.js');
  const { CardStore, CARD_RNG_SALT, triggerCard } = await import('./sim/kairo/cards.js');
  const { accidentChance } = await import('./sim/kairo/risk.js');
  const scen = await import('./sim/kairo/scenario.js');
  const { seasonShares } = await import('./sim/kairo/groups.js');
  const { KairoNewGame } = await import('./ui/kairo-newgame.js');
  /*
   * 뉴스 티커 (K47-①) — 사건의 전용 채널. ⚠ 동적 import 는 **전부 boot 앞**이다
   * (아래 `Object.assign(h, …)` 위 주석의 경고: boot 뒤 await 는 간헐 부팅 실패가 된다).
   */
  const { KairoTicker } = await import('./ui/kairo-ticker.js');
  const { KairoHud } = await import('./ui/kairo-hud.js');
  type GoalChip = import('./ui/kairo-hud.js').GoalChip;
  const { applyStartKit } = await import('./sim/kairo/startkit.js');
  const { WallGrid: WallGridCls } = await import('./sim/kairo/walls.js');
  const { PlacementGrid: PlacementGridCls } = await import('./sim/kairo/placement.js');
  type HudItem = import('./ui/kairo-hud.js').BuildItem;
  const { KairoTerrain: KairoTerrainCls } = await import('./sim/kairo/terrain.js');
  const { GRID_W: GRID_W_C, GRID_H: GRID_H_C } = await import('./render/kairo/iso.js');
  const { StaffStore, STAFF_ROLES: STAFF_ROLE_LIST } = await import('./sim/kairo/staff.js');
  const { KairoStaffPanel } = await import('./ui/kairo-staff.js');
  const course = await import('./sim/kairo/course.js');
  const { KairoCoursePanel } = await import('./ui/kairo-course.js');
  const { KairoCatalog, activeComboIds } = await import('./ui/kairo-catalog.js');
  const { KairoShowcase } = await import('./ui/kairo-showcase.js');
  const { panelHost } = await import('./ui/panels.js');
  const { Rng: RngCls } = await import('./sim/rng.js');
  const { loadKairoFromStorage, saveKairoToStorage, clearKairoStorage } = await import(
    './save/kairo.js'
  );
  const { facilityDef } = await import('./sim/kairo/placement.js');

  /**
   * 세이브를 먼저 읽는다 — 지형·벽·시설을 씬에 넘겨야 하므로 부팅보다 앞이어야 한다.
   * 없으면 시드에서 새로 만든다 (`bootKairo` 기본 동작).
   */
  const saved = loadKairoFromStorage();
  const KAIRO_SEED = saved?.seed ?? 20260818;
  /**
   * 맵 타입과 시나리오 (§4.5). 세이브에 없으면 기본값 —
   * 새 판은 `KairoNewGame` 이 세이브를 지우고 이 값을 심는다.
   */
  /*
   * 새 판은 URL 로 넘어온다 (`?map=…&scenario=…`) — 세이브를 지운 직후라 저장값이 없다.
   * 세이브가 있으면 저장값이 이긴다: 진행 중인 판의 맵을 URL 로 바꿀 수 있으면 안 된다.
   */
  const q = new URLSearchParams(location.search);
  const mapId = saved?.mapId ?? q.get('map') ?? scen.DEFAULT_MAP;
  const scenarioId = saved?.scenarioId ?? q.get('scenario') ?? scen.DEFAULT_SCENARIO;
  const mapDef = scen.mapType(mapId);
  const scenario = scen.scenarioDef(scenarioId);
  let accidentCount = saved?.accidentCount ?? 0;
  /*
   * 디버그 오버레이 — `?debug=1` 일 때만 **보인다**. 좌상단 1/6 을 상시로 덮고 있었다.
   *
   * ⚠ 숨기되 DOM 에서 지우지는 않는다. `verify-kairo` 9곳과 `verify-pwa` 1곳이 이
   * 요소의 `textContent` 로 부팅 완료를 판정한다 — 지우면 두 하네스가 죽는다.
   */
  const box = document.createElement('div');
  box.id = 'kairo-debug';
  // 상단 캡슐·목표 아래에 둔다 — 켰을 때 그것들을 덮으면 켠 의미가 반감된다
  box.className = 'kdebug';
  if (new URLSearchParams(location.search).get('debug') !== '1') {
    box.style.visibility = 'hidden';
  }
  document.body.append(box);

  /**
   * ⚠ `onFrame` 은 `bootKairo` 가 돌아오기 **전에** 이미 불릴 수 있다 (Phaser 가 첫 프레임을
   * 잡는 시점은 우리가 정하지 않는다). 아래에서 `const` 로 선언된 것을 `onFrame` 이
   * 직접 참조하면 TDZ ReferenceError 가 나고, 그 예외가 루프를 frame 0 에서 죽인다 —
   * 화면은 그려진 채로 멈추므로 "부팅 성공" 처럼 보인다 (실측: started:true, frame:0).
   *
   * 그래서 프레임이 읽는 상태는 **미리 선언한 널 가능 참조**로만 만진다. 주석으로
   * "boot 뒤에 await 를 두지 말 것"이라고 적는 것만으로는 재발을 못 막는다.
   */
  let runner: InstanceType<typeof WeekRunner> | null = null;

  /*
   * 세이브의 벽을 **지형에서 다시 굽는다** (K27) — 정본은 실내 바닥이지 벽 스냅샷이 아니다.
   *
   * ⚠ 반드시 `bootKairo` **앞**이다. 뒤에서 굽고 `scene.refreshAllWalls()` 를 부르면
   * 씬의 `create()` 가 아직 안 돌아 `this.add` 가 없다 — 새 판(벽 0장)에서는 조용히
   * 지나가고 **세이브를 불러올 때만** 터진다 (실측: 새로고침 후 판이 통째로 안 뜬다).
   */
  if (saved) {
    // ⚠ 놓아 둔 출입구를 같이 넘긴다 — 안 넘기면 불러올 때마다 문이 자동 하나로 되돌아간다
    bakeIndoorWalls(
      saved.terrain,
      saved.walls,
      saved.gate,
      guestWalkable(saved.terrain, saved.placement),
      DoorSetCls.fromSnapshot(saved.doors),
    );
  }

  /**
   * 새 판 — **물려받은 빠지**를 먼저 놓는다 (K30).
   *
   * 빈 땅에서 시작하면 위생 시설 9종이 전부 `needs-indoor` 로 막히는데 첫 의뢰가
   * "기본 위생 3개"였다. 실내동을 미리 주면 그 벽이 사라진다.
   *
   * ⚠ `bootKairo` **앞**이다. 뒤에서 놓고 `scene.refreshAllWalls()` 를 부르면 씬의
   * `create()` 가 아직 안 돌아 `this.add` 가 없다 (K27 에서 겪었다). 그래서 지형·벽·점유를
   * 여기서 만들어 넘긴다 — 세이브 경로가 이미 그렇게 한다.
   */
  const fresh = saved
    ? null
    : (() => {
        const terrain = KairoTerrainCls.generate(GRID_W_C, GRID_H_C, new RngCls(KAIRO_SEED), mapDef);
        const walls = new WallGridCls(GRID_W_C, GRID_H_C);
        const placement = new PlacementGridCls(GRID_W_C, GRID_H_C);
        const kitCourses = new course.CourseStore();
        const r = applyStartKit({
          terrain,
          walls,
          placement,
          // ⚠ 아래에서 정하는 GATE 와 **같아야 한다** — 다르면 킷이 엉뚱한 곳에 깔린다 (K36)
          gate: KairoTerrainCls.parkGate(),
          map: mapDef,
          courses: kitCourses,
        });
        if (r.skipped.length > 0) console.warn('[카이로] 시작 배치 일부 생략', r.skipped);
        return { terrain, walls, placement, courses: kitCourses, kit: r };
      })();

  /**
   * 배치 검사에 넘길 바깥 사정 — 이제 **토지뿐**이다.
   * 실내는 지형이 안다 (K27). `h` 는 boot 뒤에 생기므로 함수로 감싼다.
   */
  const placeOpts = (): { land: ReturnType<typeof landRect>; permitArea: number } => ({
    land: landRect(currentGrade()),
    // 수면 허가 (S1) — 물 위 시설이 강을 밀폐해 만드는 수영 구역의 총면적 상한
    permitArea: currentGrade().permitArea,
  });
  /** 손님과 **같은** 걷기 판정 — 문 자리를 고를 때 쓴다 */
  const walkableNow = (i: number, j: number): boolean => guestWalkable(h.terrain, h.placement)(i, j);

  const h = bootKairo({
    parent,
    seed: KAIRO_SEED,
    // 세이브가 있으면 그것, 없으면 위에서 만든 **물려받은 빠지** (§4.5 · K30)
    ...(saved
      ? {
          terrain: saved.terrain,
          walls: saved.walls,
          placement: saved.placement,
          gate: saved.gate,
        }
      : {
          terrain: fresh!.terrain,
          walls: fresh!.walls,
          placement: fresh!.placement,
          // ⚠ 안 넘기면 boot 의 기본값 (0,0) 이 쓰인다 — 거긴 이제 차도다 (K36)
          gate: KairoTerrainCls.parkGate(),
        }),
    onFrame: (s) => {
      // 버스 — sim 이 위치를 갖고 렌더는 따라 그린다 (K36-B③)
      const bs = runner?.bus.state;
      h.scene.setBus(bs && bs.visible ? bs.pos : null);
      box.textContent =
        `FPS ${s.fps}  S=${s.upscale}  버퍼 ${s.bufferW}×${s.bufferH}\n` +
        `스크롤 ${s.scrollX},${s.scrollY}  타일 ${s.tiles}\n` +
        `벽 ${s.walls}  시설 ${s.facilities}  손님 ${s.guests}\n` +
        `퇴장만족 ${s.exitSat.toFixed(0)}  주차 ${runner?.week ?? 0}  ` +
        `현금 ${Math.round((runner?.cash ?? 0) / 10000)}만\n` +
        (s.dotGridViolations.length === 0
          ? '도트격자 OK'
          : `도트격자 위반: ${s.dotGridViolations.join(' / ')}`);
    },
    onTapTile: (i, j) => tapTile(i, j),
  });

  /**
   * 화면 탭 한 번. **도구용으로도 열어 둔다** (`__kairo.tapTile`) — 하네스가 실제
   * 좌표 계산 없이 이 경로를 그대로 밟을 수 있어야 검사가 UI 와 안 갈라진다.
   *
   * ## K47-③ 에서 뜻이 바뀌었다 — 탭은 이제 **조준 이동**이다
   *
   * 예전엔 "탭한 칸에 고스트를 띄운다"였고 그게 곧 배치 좌표였다. 이제 배치는 팬으로
   * 정렬하고 확정으로 놓는다 (손가락이 고스트를 가리지 않는 것이 카이로가 이 방식을
   * 쓰는 이유다). 탭은 **성긴 조준**으로 남는다 — 멀리 있는 칸으로 한 번에 건너뛰는
   * 수단이고, 하네스 10여 곳이 이 시그니처를 쓰므로 다리이기도 하다.
   *
   * 탭이 그대로 남는 붓은 둘뿐이다: **출입구**(면 순환)와 **이동 1단계**(대상 지정).
   * 둘 다 배치가 아니라 대상 지정이라 고스트가 없다.
   */
  const tapTile = (i: number, j: number): void => {
      if (!brush) {
        console.log(`[카이로] 탭 타일 (${i}, ${j}) — ${h.terrain.kindAt(i, j) ?? '?'}`);
        return;
      }
      /*
       * 코스 편집 중에는 붓이 죽는다 (K45) — 편집기가 지도 탭을 잔교·핸들로 쓰므로
       * 같은 탭이 붓으로도 흐르면 이중 반응이 된다. openCourse 가 붓을 내려놓지만,
       * 편집 중에 시트를 다시 열어 붓을 집는 경로가 남아 있어 여기서도 막는다.
       */
      if (coursePanel.visible) return;
      /*
       * 이동 1단계 (K42) — **탭 유지.** 옮길 시설을 지목하는 것이지 자리를 정하는 게
       * 아니다. 2단계(목적지)는 아래 `aimMove` 로 넘어가 조준 + 확정을 탄다.
       */
      if (brush === 'move' && !moveSel) {
        if (!exam.toolsUnlocked) {
          toast('이동은 첫 심사 통과의 보상입니다');
          return;
        }
        const hit = h.placement.at(i, j);
        if (!hit) {
          toast('옮길 시설을 탭하세요');
          return;
        }
        const def = facilityDef(hit.defId);
        moveSel = { handle: hit.handle, defId: hit.defId, i: hit.i, j: hit.j, facing: hit.facing ?? 0 };
        ticker.setBrush(`이동: ${def?.name ?? hit.defId}`);
        toast(
          `${def?.name ?? hit.defId} — 지도를 움직여 자리를 맞추세요 ` +
            `(${Math.round(Math.floor((def?.cost ?? 0) * 0.1) / 10000)}만)`,
        );
        startAim();
        return;
      }
      /*
       * 출입구 (K36-B) — **칸을 탭한다.** 경계를 폰에서 정확히 찍는 것은 무리다.
       * 그 칸의 쓸 수 있는 면 중 하나에 문이 나고, 다시 탭하면 다음 면으로 돌아간다.
       * 한 바퀴 돌면 없앤다. 후보 판정은 `doorCandidates` 하나를 sim 과 공유한다 —
       * 갈라지면 UI 가 놓으라고 해 놓고 굽기가 무시하는 상태가 된다.
       */
      if (brush === 'door') {
        const cand = doorCandidates(h.terrain, GATE, i, j, walkableNow);
        if (cand.length === 0) {
          toast(
            h.terrain.isIndoor(i, j)
              ? '길이 닿은 쪽이 없습니다 — 건물 옆에 길을 까세요'
              : '건물 안을 탭하세요 — 출입구는 건물에 냅니다',
          );
          return;
        }
        const cur = cand.findIndex((d) => doors.has(i, j, d));
        for (const d of cand) doors.remove(i, j, d);
        // 마지막 후보에서 또 탭하면 없앤다 — 되돌릴 방법이 있어야 한다
        const next = cur + 1;
        if (next < cand.length) doors.add(i, j, cand[next]!);
        const baked = bakeIndoorWalls(h.terrain, h.walls, GATE, walkableNow, doors);
        if (!baked.ok) {
          // 되돌린다 — 반쯤 적용된 벽이 남는 것이 최악이다
          for (const d of cand) doors.remove(i, j, d);
          if (cur >= 0) doors.add(i, j, cand[cur]!);
          bakeIndoorWalls(h.terrain, h.walls, GATE, walkableNow, doors);
          toast(INDOOR_FAIL_MESSAGES[baked.fail ?? 'no-door']);
          return;
        }
        h.scene.refreshAllWalls();
        h.guests.invalidate();
        persist();
        toast(next < cand.length ? '출입구를 냈습니다' : '출입구를 없앴습니다', 'ok');
        return;
      }
      /*
       * 나머지 붓(시설 · 건물 블록 · 바닥 · 철거 · 이동 2단계)은 전부 **조준**이다.
       * 탭은 조준을 그 칸으로 옮길 뿐 놓지는 않는다 — 놓는 것은 확정 버튼 하나다.
       */
      aimAt(i, j);
  };

  /*
   * ── 조준 배치 (K47-③) ─────────────────────────────────────────────────
   *
   * `aim = {i, j, facing}` 이 **정본**이고 화면 레티클은 표시일 뿐이다. 팬은 씬의
   * 조준 커서를 밀고, 커서가 다른 칸으로 넘어간 순간에만 `onAimTile` 이 올라온다 —
   * 판정 비용 실측이 야외 0.054ms · 실내 0.325ms · 물 위 0.240ms 라 폰 3~5배로 잡아도
   * 칸이 바뀔 때만이면 무료지만 **매 프레임이면 위험**하다.
   *
   * 왜 커서가 화면 중앙이 아닌지(순진한 중앙 고정이 판의 32% 를 못 짓게 만든다)는
   * `KairoScene.aimTexel` 에 한 번만 적어 뒀다.
   */

  /** 확정 바가 가리는 높이를 씬에 알린다 — 레티클이 바 밑에 숨지 않게 (K33 규칙) */
  const syncReticleInset = (): void => {
    h.scene.setReticleInset(hud.confirmInset);
  };

  /**
   * 조준 시작 — 레티클 밑 칸에서. 격자 밖을 보고 있으면 가장자리로 당긴다.
   *
   * ⚠ **두 번 잰다.** 조준 자리를 정하는 시점에는 확정 바가 아직 안 떴고, 그 바의
   * 라벨이 비어 있어 `confirmInset` 이 실제보다 낮게 답한다 (실측: 라벨 없는 바
   * 83px → 라벨이 든 바 99px). 레티클은 가려진 높이의 **절반**만큼 위로 올라가므로
   * 16px 차이가 곧 8텍셀 = `i+j` 한 칸이고, 첫 조준만 고스트가 레티클보다
   * **(+1,+1)** 아래에 섰다.
   *
   * 그 어긋남은 세로로만 보인다 — (+1,+1) 은 `i−j` 를 안 바꾸고 `i+j` 만 2 바꾼다.
   * 그래서 "팬하면 조준의 세로축이 절반만 움직인다"로 나타났다 (K47-③ 실측:
   * 레티클 Δ(i+j)=4 vs 첫 조준 기준 Δ(i+j)=2). 커서 누적은 멀쩡했다 —
   * **출발 칸**이 틀렸던 것이다.
   *
   * `refreshAim()` 이 바를 띄우고 잰 값을 갱신하므로, 그 뒤에 한 번 더 재서 자리가
   * 달라졌으면 다시 잡는다. 두 번이면 끝난다 (두 번째부터는 바 높이가 이미 확정이다).
   * 팬 중에는 절대 다시 재지 않는다 — 그러면 오프셋 설계가 무너져 지도 가장자리
   * 32% 가 다시 막힌다.
   */
  const startAim = (): void => {
    aim = null;
    for (let pass = 0; pass < 2; pass++) {
      syncReticleInset();
      const r = h.scene.reticleTile();
      const i = Math.max(0, Math.min(GRID_W_C - 1, r.i));
      const j = Math.max(0, Math.min(GRID_H_C - 1, r.j));
      if (aim && aim.i === i && aim.j === j) break;
      aim = { i, j, facing: 0 };
      h.scene.beginAim(i, j);
      refreshAim();
    }
  };

  /**
   * 조준을 이 칸으로 옮긴다 (성긴 조준 = 탭 · 하네스의 `tapTile`).
   * 방향은 유지한다 — 회전해 둔 것이 탭 한 번에 풀리면 ↻ 가 소용없다.
   */
  const aimAt = (i: number, j: number): void => {
    aim = { i, j, facing: aim?.facing ?? 0 };
    h.scene.beginAim(i, j);
    refreshAim();
  };

  /** 조준 종료 — 고스트·표식·확정 바를 한꺼번에 내린다 */
  const endAim = (): void => {
    aim = null;
    h.scene.endAim();
    h.scene.setGhost(null);
    hud.hideConfirm();
  };

  /** 지금 붓이 조준을 쓰나 — 출입구와 이동 1단계만 탭으로 남는다 */
  const aimingBrush = (): boolean =>
    brush !== null && brush !== 'door' && !(brush === 'move' && !moveSel);

  /**
   * 지금 조준 칸을 다시 판정해 고스트·표식·확정 바를 맞춘다.
   * **칸이 바뀐 때·회전한 때·확정 직후**에만 부른다 (위 비용 주석).
   */
  const refreshAim = (): void => {
    if (!aim || !brush) return;
    if (brush === 'facility') aimFacility(aim.i, aim.j);
    else if (brush === 'move') aimMove(aim.i, aim.j);
    else if (brush === 'erase') aimErase(aim.i, aim.j);
    else aimGround(aim.i, aim.j);
    // 라벨이 두 줄이 되면 바가 높아진다 — 잰 값을 매번 갱신한다 (상수로 박지 말 것)
    syncReticleInset();
  };

  /** 조준 중 확정 바의 취소 — 붓은 남는다 (같은 붓으로 다시 겨눌 수 있어야 한다) */
  const cancelAim = (): void => {
    if (brush === 'move' && moveSel) {
      moveSel = null;
      ticker.setBrush('이동');
    }
    endAim();
  };

  /** 시설 — 조준 + ↻ + 확정. 손가락 가림이 정확히 이 케이스다 */
  const aimFacility = (i: number, j: number): void => {
    const defId = brushFacility;
    const def = facilityDef(defId);
    const cost = def?.cost ?? 0;
    const chk = h.placement.check(h.terrain, h.walls, GATE, defId, i, j, {
      ...placeOpts(),
      facing: aim?.facing ?? 0,
    });
    /*
     * 건설비를 **놓기 전에** 확인한다. 놓고 나서 차감하면 잔액 부족일 때 되돌려야 하고,
     * 그 되돌리기가 점유 격자·거리장까지 건드려 실패 경로가 두 배로 늘어난다.
     * (K12 까지 UI 는 시설을 공짜로 지었다 — 밸런싱한 건설비 곡선이 실제 플레이에 없었다.)
     *
     * ⚠ 값 부족은 **확정을 막을 뿐 조준은 막지 않는다.** 예전엔 탭 자체를 거절했는데,
     * 조준은 "여기 놓으면 얼마"를 보는 화면이라 거절하면 볼 수가 없다.
     */
    const poor = cost > week.cash;
    const ok = chk.ok && !poor;
    h.scene.setGhost(defId, i, j, ok, aim?.facing ?? 0);
    // 발자국은 회전을 탄다 — 실물과 같은 규칙(가로·세로 교환)이라야 윤곽이 안 거짓말한다
    const [fw, fd] =
      (aim?.facing ?? 0) === 1
        ? [def?.size[1] ?? 1, def?.size[0] ?? 1]
        : [def?.size[0] ?? 1, def?.size[1] ?? 1];
    h.scene.setReticleMark(i, j, ok, fw, fd);
    // 회전은 비정사각에만 뜻이 있다 (정사각은 발자국이 같아 버튼이 거짓말이 된다)
    const rotatable = def !== undefined && def.size[0] !== def.size[1];
    hud.showConfirm(
      !chk.ok
        ? PLACE_FAIL_MESSAGES[chk.fail ?? 'unknown-def']
        : poor
          ? `돈이 부족합니다 — ${Math.round(cost / 10000)}만 필요 (현재 ${Math.round(week.cash / 10000)}만)`
          : `${def?.name ?? defId} · ${Math.round(cost / 10000)}만`,
      ok,
      {
        cancel: cancelAim,
        ...(rotatable
          ? {
              rotate: () => {
                /*
                 * ⚠ 예전엔 `tapTile(lastFacilityTap)` 을 다시 불러 우회했다 (K45).
                 * 조준에서는 자리가 정본이므로 방향만 뒤집고 같은 자리를 다시 잰다.
                 */
                if (!aim) return;
                aim.facing = aim.facing === 0 ? 1 : 0;
                refreshAim();
              },
            }
          : {}),
        confirm: () => {
          const facing = aim?.facing ?? 0;
          const r = h.placement.place(h.terrain, h.walls, GATE, defId, i, j, {
            ...placeOpts(),
            facing,
          });
          if (!r.ok || !r.placed) {
            toast(PLACE_FAIL_MESSAGES[r.fail ?? 'unknown-def']);
            refreshAim(); // 바를 되살린다 — 실패로 조준이 사라지면 왜 안 됐는지가 사라진다
            return;
          }
          week.spend(cost);
          h.scene.refreshFacility(r.placed.handle);
          h.guests.invalidate();
          refreshBuildList(); // 방이 찼으면 다음 시설이 잠겨야 한다 (K31)
          /*
           * 채널 분리 (K47-①). 예전엔 한 토스트에 둘이 섞여 있었다:
           *   `−12만 · 콤보 3개 발동`
           * 앞은 **내 행동의 대답**(토스트)이고 뒤는 **일어난 일**(뉴스)이다.
           */
          toast(`−${Math.round(cost / 10000)}만`, 'ok');
          pushComboNews();
          persist();
          // 시설은 한 번 놓으면 조준을 끝낸다 (붓은 남는다 — 탭하면 다시 겨눈다)
          endAim();
        },
      },
    );
  };

  /**
   * 이동 2단계 (K42) — 목적지는 시설과 같은 문제라 조준 + 확정이다.
   *
   * 자기 자신과의 겹침 판정은 "치우고 재고 되돌리는" 프로브로 푼다 — 복제 규칙을
   * 만들지 않는다 (판정은 `placement.check` 하나다).
   */
  const aimMove = (i: number, j: number): void => {
    const sel = moveSel;
    if (!sel) return;
    const def = facilityDef(sel.defId);
    const fee = Math.floor((def?.cost ?? 0) * 0.1);
    // 프로브 — 원자리를 잠깐 치우고 재야 자기 발자국과 안 겹친다
    h.placement.remove(sel.handle);
    const chk = h.placement.check(h.terrain, h.walls, GATE, sel.defId, i, j, {
      ...placeOpts(),
      facing: sel.facing,
    });
    const restored = h.placement.place(h.terrain, h.walls, GATE, sel.defId, sel.i, sel.j, {
      ...placeOpts(),
      facing: sel.facing,
    });
    const oldHandle = sel.handle;
    if (restored.ok && restored.placed) sel.handle = restored.placed.handle;
    h.scene.refreshFacility(oldHandle);
    h.scene.refreshFacility(sel.handle);
    const ok = chk.ok && fee <= week.cash;
    h.scene.setGhost(sel.defId, i, j, ok, sel.facing);
    const [fw, fd] =
      sel.facing === 1
        ? [def?.size[1] ?? 1, def?.size[0] ?? 1]
        : [def?.size[0] ?? 1, def?.size[1] ?? 1];
    h.scene.setReticleMark(i, j, ok, fw, fd);
    hud.showConfirm(
      chk.ok
        ? `이동: ${def?.name ?? sel.defId} · ${Math.round(fee / 10000)}만`
        : PLACE_FAIL_MESSAGES[chk.fail ?? 'unknown-def'],
      ok,
      {
        cancel: cancelAim,
        confirm: () => {
          if (fee > week.cash) {
            toast('돈이 부족합니다');
            refreshAim();
            return;
          }
          h.placement.remove(sel.handle);
          const r = h.placement.place(h.terrain, h.walls, GATE, sel.defId, i, j, {
            ...placeOpts(),
            facing: sel.facing,
          });
          if (!r.ok || !r.placed) {
            // 되돌린다 — 반쯤 옮겨진 상태가 최악이다
            const rr = h.placement.place(h.terrain, h.walls, GATE, sel.defId, sel.i, sel.j, {
              ...placeOpts(),
              facing: sel.facing,
            });
            const gone = sel.handle;
            if (rr.ok && rr.placed) sel.handle = rr.placed.handle;
            h.scene.refreshFacility(gone);
            h.scene.refreshFacility(sel.handle);
            toast(PLACE_FAIL_MESSAGES[r.fail ?? 'unknown-def']);
            refreshAim();
            return;
          }
          week.spend(fee);
          const gone = sel.handle;
          moveSel = null;
          ticker.setBrush('이동');
          h.scene.refreshFacility(gone);
          h.scene.refreshFacility(r.placed.handle);
          h.guests.invalidate();
          audio.play('sfx/place');
          toast(`이동 — ${Math.round(fee / 10000)}만`, 'ok');
          persist();
          endAim(); // 옮길 시설을 다시 고르는 것부터가 다음 이동이다
        },
      },
    );
  };

  /**
   * 철거 — K47-③ 에서 **조준 + 확정으로 승격**했다.
   *
   * 예전엔 탭 즉시 삭제 + 50% 환급이었고 되돌리기가 없었다. 폰에서 손가락이 미끄러지면
   * 그대로 손실이고, 하네스에도 동작 검사가 0건이었다.
   */
  const aimErase = (i: number, j: number): void => {
    h.scene.setGhost(null);
    const hit = h.placement.at(i, j);
    const def = hit ? facilityDef(hit.defId) : undefined;
    /*
     * 절반만 돌려준다. 전액이면 "놓아보고 안 맞으면 지운다"가 공짜라 배치가 판단이
     * 아니게 되고, 0원이면 오조작 한 번이 판을 망친다.
     */
    const back = def ? Math.floor(def.cost * 0.5) : 0;
    const floorErasable =
      !hit && h.terrain.kindAt(i, j) !== 'lawn' && !h.terrain.isWater(i, j);
    const ok = hit !== null || floorErasable;
    // 시설을 지울 땐 **그 시설의 발자국 전체**를 두른다 — 한 칸만 보면 뭘 지우는지 모른다
    const eDef = hit ? facilityDef(hit.defId) : undefined;
    const [ew, ed] =
      hit && eDef
        ? hit.facing === 1
          ? [eDef.size[1], eDef.size[0]]
          : [eDef.size[0], eDef.size[1]]
        : [1, 1];
    h.scene.setReticleMark(hit ? hit.i : i, hit ? hit.j : j, ok, ew, ed);
    hud.showConfirm(
      hit
        ? `철거: ${def?.name ?? hit.defId}` + (back > 0 ? ` · +${Math.round(back / 10000)}만 환급` : '')
        : floorErasable
          ? '철거: 바닥을 잔디로'
          : '지울 것이 없습니다',
      ok,
      {
        cancel: cancelAim,
        confirm: () => {
          if (hit) {
            h.placement.remove(hit.handle);
            h.scene.refreshFacility(hit.handle);
            h.guests.invalidate();
            refreshBuildList(); // 자리가 비었으면 잠금이 풀려야 한다 (K31)
            if (back > 0) {
              week.earn(back);
              toast(`철거 — ${Math.round(back / 10000)}만 환급`, 'ok');
            }
            persist();
          } else if (floorErasable) {
            // 벽은 개별로 못 지운다 — **바닥을 잔디로 되돌리면** 그 벽이 같이 사라진다 (K27)
            /* placement 를 넘긴다 — 길을 지워 시설이 끊기면 거절된다 (K32-B) */
            const r = paintFloor(
              h.terrain,
              h.walls,
              GATE,
              i,
              j,
              'lawn',
              walkableNow,
              h.placement,
              doors,
            );
            if (!r.ok) {
              toast(INDOOR_FAIL_MESSAGES[r.fail ?? 'no-door']);
              refreshAim();
              return;
            }
            h.scene.refreshTile(i, j);
            h.scene.refreshAllWalls();
            h.guests.invalidate();
            persist();
          }
          // 연속 철거 — 붓이 그대로니 바도 그대로다 (같은 자리를 다시 재서 라벨을 고친다)
          refreshAim();
        },
      },
    );
  };

  /**
   * 바닥·건물 블록 — 조준 + 확정, **확정 후 바를 닫지 않는다** (연속 배치).
   *
   * 4×4 = 48만원이 예전엔 탭 한 번에 즉시 지출이었고 미리보기가 아예 없었다.
   * ⚠ 드래그 페인트는 안 넣는다 — 한 손가락 드래그 = 팬이 이미 확정이라
   * 제스처 문법이 둘이 된다 (계획 §3 표).
   */
  const aimGround = (i: number, j: number): void => {
    h.scene.setGhost(null);
    /*
     * 붓 ID 는 `path_stone` 또는 `floor_indoor@4` 형태다 — 뒤의 숫자가 블록 크기다 (K32).
     * 조준 칸을 **블록의 좌상단**이 아니라 가운데에 가깝게 두어야 표식이 가리킨 곳에 깔린다.
     */
    const [kindId, sizeStr] = (brush ?? '').split('@');
    const n = sizeStr ? Number(sizeStr) : 1;
    const kind = GROUND_KINDS.find((k) => k.id === kindId);
    if (!kind) return;
    const oi = i - Math.floor((n - 1) / 2);
    const oj = j - Math.floor((n - 1) / 2);

    /** 못 깔면 이유, 깔 수 있으면 `null` — 라벨과 확정 가능 여부가 같은 판정을 쓴다 */
    const reject = (): string | null => {
      /*
       * 토지 밖에는 못 깐다 (K32).
       *
       * ⚠ 시설은 `outside-land` 로 막는데 **바닥은 안 막고 있었다** — 아직 안 산 땅을
       * 포장하고 건물까지 지을 수 있었다. 등급으로 땅이 열린다는 규칙이 절반만 걸려 있었다.
       */
      const land = landRect(currentGrade());
      if (oi < land.i0 || oj < land.j0 || oi + n > land.i0 + land.w || oj + n > land.j0 + land.h) {
        return PLACE_FAIL_MESSAGES['outside-land'];
      }
      /*
       * ⚠ 바닥 붓도 막아야 한다 (K36). 시설만 막고 바닥을 열어 두면 플레이어가 도로를
       * 석재로 덮어 버린다 — K32 에서 토지 제한을 시설에만 걸어 두고 바닥을 빼먹었던
       * 것과 **정확히 같은 구멍**이다.
       */
      for (let dj = 0; dj < n; dj++) {
        for (let di = 0; di < n; di++) {
          if (h.terrain.inside(oi + di, oj + dj) && !h.terrain.isBuildable(oi + di, oj + dj)) {
            return PLACE_FAIL_MESSAGES['not-buildable'];
          }
        }
      }
      /*
       * 수영장 붓 (S3) — 시설이 선 칸에는 물을 못 채운다. 바닥 붓은 시설 밑을
       * 지나가도 되지만(포장을 바꾸는 것) 물은 시설을 침수시킨다.
       */
      if (kindId === 'pool_water') {
        for (let dj = 0; dj < n; dj++) {
          for (let di = 0; di < n; di++) {
            if (h.placement.handleAt(oi + di, oj + dj) !== 0) {
              return '시설 아래에는 물을 채울 수 없습니다 — 먼저 옮기세요';
            }
          }
        }
      }
      return null;
    };

    // 실제로 바뀔 칸 수를 먼저 세어 값을 확인한다 — 물에 걸치면 그만큼 덜 낸다
    let willChange = 0;
    for (let dj = 0; dj < n; dj++) {
      for (let di = 0; di < n; di++) {
        const ti = oi + di;
        const tj = oj + dj;
        if (!h.terrain.inside(ti, tj) || h.terrain.isWater(ti, tj)) continue;
        if (h.terrain.kindAt(ti, tj) !== kindId) willChange++;
      }
    }
    const cost = kind.cost * willChange;
    const why = reject();
    const poor = cost > week.cash;
    const ok = why === null && willChange > 0 && !poor;
    // 블록 전체를 두른다 — 바닥 붓은 고스트가 없어 이 윤곽이 **유일한 미리보기**다
    h.scene.setReticleMark(oi, oj, ok, n, n);
    hud.showConfirm(
      why !== null
        ? why
        : willChange === 0
          ? `${kind.name} — 이미 깔려 있습니다`
          : poor
            ? `돈이 부족합니다 — ${Math.round(cost / 10000)}만 필요 (현재 ${Math.round(week.cash / 10000)}만)`
            : `${kind.name}${n > 1 ? ` ${n}×${n}` : ''} · ${willChange}칸 · ${Math.round(cost / 10000)}만`,
      ok,
      {
        cancel: cancelAim,
        confirm: () => {
          const painted = paintFloorBlock(
            h.terrain,
            h.walls,
            GATE,
            oi,
            oj,
            n,
            n,
            kindId as string,
            walkableNow,
            h.placement,
            doors,
          );
          if (!painted.ok) {
            toast(INDOOR_FAIL_MESSAGES[painted.fail ?? 'no-door']);
            refreshAim();
            return;
          }
          if (painted.changed > 0) {
            if (kind.cost > 0) week.spend(kind.cost * painted.changed);
            for (let dj = 0; dj < n; dj++) {
              for (let di = 0; di < n; di++) h.scene.refreshTile(oi + di, oj + dj);
            }
            h.scene.refreshAllWalls();
            h.guests.invalidate(); // 통행 가능성과 실내가 바뀐다
            // 방이 넓어졌으면 "자리 없음" 잠금이 풀려야 한다 (K31)
            refreshBuildList();
            persist();
          }
          // 연속 배치 — 바를 닫지 않는다. 길을 까는 것이 가장 자주 하는 동작이다 (K32-B)
          refreshAim();
        },
      },
    );
  };

  /** 게이트 — K4 에서 매표소 배치로 대체한다. 지금은 좌상단 고정 */
  /*
   * 게이트 — 도시 띠 아래 **공원 입구 칸**이다 (K36). 예전엔 (0,0) 좌상단 고정이었는데,
   * 그 자리는 이제 차도다. 손님은 보도(정류장)에서 내려 뚫린 입구 열로 들어온다.
   */
  const GATE = saved?.gate ?? KairoTerrainCls.parkGate();

  const msg = document.createElement('div');
  msg.id = 'kairo-toast';
  msg.className = 'ktoast bad';
  msg.hidden = true;
  document.body.append(msg);
  let toastTimer = 0;
  const toast = (text: string, kind: '' | 'ok' = ''): void => {
    msg.textContent = text;
    msg.hidden = text === '';
    // 성공은 주 색, 거절은 경고색 — 색은 `style.css` 가 소유한다 (K34)
    msg.classList.toggle('bad', kind !== 'ok');
    window.clearTimeout(toastTimer);
    if (text !== '') toastTimer = window.setTimeout(() => (msg.hidden = true), 2600);
  };

  /*
   * 붓 — **건설 시트**에서 고른다 (K28). 예전에는 하단에 바닥 붓 바가 상시로 깔려 있고
   * 시설은 73종 `<select>` 드롭다운이었다. 카이로에는 드롭다운이 없다 — 아이콘 격자다.
   */
  let brush: string | null = null;
  let brushFacility = '';
  /** 이동 붓의 선택 시설 (K42) — 첫 탭에서 잡고 확정·취소에서 푼다 */
  let moveSel: { handle: number; defId: string; i: number; j: number; facing: 0 | 1 } | null =
    null;
  /**
   * 조준 상태 (K47-③) — **이것이 배치 좌표의 정본**이다.
   *
   * K45 까지는 `lastFacilityTap`(마지막 탭 자리) + `ghostFacing`(회전) 둘로 흩어져
   * 있었고, ↻ 는 `tapTile` 을 다시 불러 우회했다. 조준 배치에서는 팬이 자리를 계속
   * 바꾸므로 자리와 방향이 한 덩어리여야 한다 — 화면 레티클은 이 값을 비추는 표시일 뿐이다.
   */
  let aim: { i: number; j: number; facing: 0 | 1 } | null = null;

  const ZONE_NAME: Record<string, string> = {
    indoor: '실내',
    land: '야외',
    water: '물 위',
    pension: '펜션',
    season: '계절',
  };

  /*
   * ── 뉴스 채널 (K47-①) ────────────────────────────────────────────────────
   *
   * 채널 계약은 `src/ui/kairo-ticker.ts` 상단 표가 정본이다:
   *   모달 = 축하(시간 멈춤) · **티커 = 뉴스(내가 안 했는데 일어난 일)** · 토스트 = 내 행동의 대답
   *
   * ⚠ hud **보다 먼저** 만든다 — hud 의 `onBrush` 콜백이 티커를 참조한다.
   */
  const ticker = new KairoTicker(document.body);
  /**
   * 음성 대조군 (저장소 규칙 — "검증이 조용히 통과"를 8건 실측으로 겪었다).
   * 켜면 라우팅이 통째로 죽는다. 검사는 "끄면 티커가 안 뜬다"를 확인해서,
   * 자기가 재는 것이 실제로 이 경로인지 증명한다.
   */
  let newsMuted = false;
  /**
   * 시점 라벨 — "3주 화". 알림함이 "언제 왔나"를 못 말하면 스크롤이 곧 뒤죽박죽이 된다.
   *
   * ⚠ 흐름 중의 표시 주차는 `week.week + 1` 이다 (`refreshCaps` 와 같은 규칙).
   * 갈라지면 헤더와 알림함이 서로 다른 주를 말한다.
   */
  const stampNow = (): string => {
    const lp = week.liveProgress();
    // 주 사이 (finish 뒤·begin 전) — 방금 끝난 주가 week.week 다
    if (!lp) return `${week.week}주`;
    // ⚠ `lp.done` 이어도 **아직 그 주 안**이다. `week.week` 로 찍으면 마지막 날 소식만
    //   한 주 앞으로 밀려 "0주"가 된다 (실측으로 걸렸다)
    return lp.done ? `${week.week + 1}주` : `${week.week + 1}주 ${DAY_NAMES[lp.day] ?? ''}`;
  };
  /**
   * 뉴스 한 줄 — 티커에 흐르고 알림함에 쌓인다.
   *
   * `stamp` 를 직접 줄 수 있다: 하루 마감처럼 **일어난 시점과 알리는 시점이 다른** 소식은
   * 자동 시점을 쓰면 하루가 밀려 찍힌다 (토요일 결산이 "일" 로 찍혔다 — 실측).
   */
  const news = (
    icon: string,
    text: string,
    stamp: string = stampNow(),
    onOpen?: () => void,
  ): void => {
    if (newsMuted) return;
    ticker.push(icon, text, stamp, onOpen);
  };

  const hud = new KairoHud(document.body, {
    // 붓 라벨의 정본은 티커다 (K47-①) — 하단 바는 누르는 곳, 읽는 것은 티커
    onBrush: (label) => ticker.setBrush(label),
    onPick: (it: HudItem) => {
      // 붓을 바꾸면 진행 중이던 배치는 취소한다 — 안 그러면 확정 바가 옛 시설을 가리킨다
      endAim();
      moveSel = null;
      if (it.kind === 'facility') {
        /*
         * 해금 — 골격(등급) 또는 사건(의뢰 보상). `isUnlocked` 하나로 묻는다 (K41).
         * ⚠ 조준 **전에** 본다. 못 짓는 것을 겨누게 두면 확정 바가 매 칸 같은 거짓말을
         * 하고, 왜 안 되는지(등급인지 자리인지)가 섞인다.
         */
        const grade = currentGrade();
        if (!unlocks.isUnlocked(it.id, grade.grade)) {
          const need = requiredGrade(it.id);
          toast(
            need <= 5
              ? `아직 못 짓습니다 — ${need}등급 필요 (현재 ${grade.grade}등급 ${grade.name})`
              : '아직 못 짓습니다 — 의뢰 보상으로 열립니다',
          );
          brush = null;
          return;
        }
        brush = 'facility';
        brushFacility = it.id;
      } else {
        brush = it.kind === 'erase' ? 'erase' : it.id;
      }
      /*
       * 고르는 즉시 **고스트가 화면에 뜬다** (K47-③) — 이것이 조준 배치의 시작점이다.
       * 출입구와 이동은 배치가 아니라 대상 지정이라 탭으로 남는다.
       */
      if (aimingBrush()) startAim();
    },
    // 카드 썸네일 — 게임과 같은 그림을 같은 계약 ID 로 (제공자가 곧 정본이다)
    thumbFor: (sid: string) => (h.provider.has(sid) ? h.provider.get(sid) : null),
    /*
     * 코스 탭 — 패널은 `coursePanel` 이 소유한다. `h` 와 마찬가지로 아래에서 만들어지므로
     * 함수로 감싸 지연 참조한다 (TDZ 사고를 여러 번 겪었다).
     */
    onCourse: () => openCourse(),
  });

  /** 코스 편집 열기 — 아래에서 패널이 만들어진 뒤에 실제로 불린다 */
  let openCourse = (): void => {
    /* 패널이 아직 없다 — 시트를 눌러도 아무 일도 안 일어나는 편이 낫다 */
  };

  /** 건설 목록 — 등급이 오르면 잠금이 풀리므로 결산 뒤에 다시 만든다 */
  /**
   * 실내 시설이 **지금 방에 들어갈 자리가 있나**. 실내 칸만 훑으므로 싸다 (보통 수십 칸).
   *
   * 등급 잠금과 같은 방식이다 — "열어봐야 아는 정보면 아무도 안 연다". 자리가 없으면
   * 시트에서 미리 잠겨 보이고, 왜 잠겼는지(건물을 넓히라고) 같이 알려준다.
   */
  const indoorFits = (defId: string): boolean => {
    const t = h.terrain;
    for (let j = 0; j < GRID_H_C; j++) {
      for (let i = 0; i < GRID_W_C; i++) {
        if (!t.isIndoor(i, j)) continue;
        if (h.placement.check(t, h.walls, GATE, defId, i, j, placeOpts()).ok) return true;
      }
    }
    return false;
  };

  /** 실내 바닥 한 칸 값 — 여러 곳에서 쓴다 */
  const FLOOR_COST = GROUND_KINDS.find((k) => k.id === 'floor_indoor')?.cost ?? 0;
  /**
   * 수영장 한 칸 값 — 라벨을 값으로 박지 말 것. 데이터의 `cost` 를 바꾸면 UI 가
   * 조용히 거짓말을 한다 (다른 붓들은 전부 `k.cost` 에서 읽는다).
   */
  const POOL_COST = GROUND_KINDS.find((k) => k.id === 'pool_water')?.cost ?? 0;

  const refreshBuildList = (): void => {
    const grade = currentGrade().grade;
    const items: HudItem[] = [
      /*
       * 건물 — 확장이 카이로의 핵심 동사라 자기 탭을 준다 (K31).
       * 2×2 · 4×4 두 크기 (K32) — 처음엔 크게 잡고 모서리는 작게 다듬는다.
       * 값은 칸 수대로라 **크기가 값을 정하지 않는다** (물에 걸치면 그만큼 덜 낸다).
       */
      ...([2, 4] as const).map((n) => ({
        kind: 'ground' as const,
        tab: 'building' as const,
        id: `floor_indoor@${n}`,
        name: `건물 바닥 ${n}×${n}`,
        sub: `칸당 ${Math.round(FLOOR_COST / 10000)}만 · 넓어짐`,
      })),
      /*
       * 출입구 (K36-B) — 카이로에서 건물은 **지나가는 곳**이기도 하다. 문이 하나면
       * 건물이 막다른 곳이라 손님이 빙 돌아간다. 문을 더 내면 건물 자체가 통로가 된다.
       */
      {
        kind: 'door' as const,
        tab: 'building' as const,
        id: 'door',
        name: '출입구',
        sub: '실내 칸을 탭 · 다시 탭하면 옮김',
      },
      { kind: 'erase' as const, tab: 'building' as const, id: 'erase', name: '철거', sub: '잔디로' },
      /*
       * 길 — K32-B 부터 **손님은 포장한 바닥만 지나간다.** 그래서 길을 까는 것이
       * 가장 자주 하는 동작이 됐는데, 한 칸씩 찍어서는 폰에서 못 깐다. 건물 바닥에
       * 쓰던 블록 붓(K32-A)을 그대로 붙인다 — 1칸은 손보기, 2·3칸은 실제로 길 내기.
       *
       * `sub` 에 통행 여부를 적는다. 안 적으면 "잔디는 왜 안 되지"를 화면 어디에서도
       * 알 수 없다 — 규칙을 바꿔 놓고 알려주지 않는 것이 이 게임의 반복된 실수였다.
       */
      ...GROUND_KINDS.filter(
        (k) => k.id !== 'floor_indoor' && k.buildable && k.guestWalk && k.paintable !== false,
      ).flatMap((k) =>
        [1, 2, 3].map((n) => ({
          kind: 'ground' as const,
          tab: 'ground' as const,
          id: n === 1 ? k.id : `${k.id}@${n}`,
          name: n === 1 ? k.name : `${k.name} ${n}×${n}`,
          sub: `칸당 ${Math.round(k.cost / 10000)}만 · 손님 통행`,
        })),
      ),
      /*
       * ⚠ `buildable` 이 아닌 종류(도로·보도·가로수)는 **팔레트에 넣지 않는다** (K36).
       * 플레이어가 깔 수 없는 것을 목록에 두면 눌러 보고 거절당한다.
       *
       * ⚠ `paintable === false` 도 뺀다 (K37 — 산의 암반). 지을 수는 있지만 칠할 수는
       * 없는 종류다. 이 조건이 없어서 암반이 조용히 새어 들어갔다 (12개 → 13개).
       */
      ...GROUND_KINDS.filter(
        (k) => k.id !== 'floor_indoor' && k.buildable && !k.guestWalk && k.paintable !== false,
      ).map((k) => ({
        kind: 'ground' as const,
        tab: 'ground' as const,
        id: k.id,
        name: k.name,
        sub: '무료 · 손님이 못 지나감',
      })),
      /*
       * 수영장 붓 (S3) — `buildable:false` 인데 `paintable` 인 유일한 종류라 위 두
       * 필터(둘 다 `buildable` 을 요구한다)에 안 걸린다. 칠하는 축과 짓는 축이 갈라진
       * 첫 종류다 — 도로·보도와 달리 **플레이어가 깐다**. 2등급 해금 — 첫 심사 뒤에 연다
       * (스펙 §2.4, 초반 과부하 방지). 최소 4칸이어야 구역이 된다.
       */
      ...(currentGrade().grade >= 2
        ? [2, 3].map((n) => ({
            kind: 'ground' as const,
            tab: 'ground' as const,
            id: n === 2 ? 'pool_water@2' : 'pool_water@3',
            name: `수영장 ${n}×${n}`,
            sub: `칸당 ${Math.round(POOL_COST / 10000)}만 · 4칸부터 구역`,
          }))
        : []),
      { kind: 'erase' as const, tab: 'ground' as const, id: 'erase', name: '철거', sub: '잔디로' },
      /*
       * 시설 — **해금된 것만** 카드로 낸다 (K40, UX 검수 §4).
       *
       * 73종을 다 늘어놓고 45% 를 잠가 두면 목록이 아니라 소음이다 — 조사 결론이
       * "정보 과부하는 리텐션 킬러"였다. 잠긴 것은 숨기고, **다음에 올 것 두 장**만
       * 티저로 예고한다 (카이로: 해금은 벽이 아니라 도착이다). 전 목록은 도감이 담당한다.
       * '자리 없음'(건물을 넓히세요)은 그대로 보인다 — 그건 정보가 아니라 처방이다.
       */
      ...allFacilityDefs()
        .filter((d) => unlocks.isUnlocked(d.id, grade))
        .map((d) => {
          const locked =
            d.placement.requiresIndoor && !indoorFits(d.id)
              ? '자리 없음 · 건물을 넓히세요'
              : null;
          return {
            kind: 'facility' as const,
            tab: 'facility' as const,
            id: d.id,
            name: d.name,
            sub: `${d.size[0]}×${d.size[1]} · ${Math.round((d.cost ?? 0) / 10000)}만`,
            group: ZONE_NAME[d.layer] ?? d.layer,
            sprite: d.sprite,
            ...(locked ? { locked } : {}),
          };
        }),
      /*
       * 이동 (K42) — 다듬기의 최소 도구. 첫 심사 통과 보상이라 그 전엔 목록에 없다.
       * 철거+재구매(반값 손실)는 다듬기가 아니라 벌금이었다.
       */
      ...(exam.toolsUnlocked
        ? [
            {
              kind: 'move' as const,
              tab: 'facility' as const,
              id: 'move',
              name: '이동',
              sub: '건설비의 10%',
            },
          ]
        : []),
      /*
       * 티저 (K40·K41) — ① 진행 중 의뢰의 보상 시설 ("이 의뢰를 끝내면 이게 열린다"),
       * ② 다음 등급 골격의 첫 시설. 해금이 벽이 아니라 도착이라는 걸 시트가 예고한다.
       */
      ...questStatuses(h.placement, lastSummary, h.guests.swimZones())
        .filter((q) => !q.done && q.rewardFacility !== undefined)
        .slice(0, 1)
        .flatMap((q) => {
          const d = allFacilityDefs().find((x) => x.id === q.rewardFacility);
          return d
            ? [
                {
                  kind: 'facility' as const,
                  tab: 'facility' as const,
                  id: `teaser-${d.id}`,
                  name: d.name,
                  teaser: `의뢰 「${q.name}」 보상`,
                  sprite: d.sprite,
                },
              ]
            : [];
        }),
      ...allFacilityDefs()
        .filter((d) => requiredGrade(d.id) === grade + 1)
        .slice(0, 1)
        .map((d) => ({
          kind: 'facility' as const,
          tab: 'facility' as const,
          id: `teaser-${d.id}`,
          name: d.name,
          teaser: `${grade + 1}등급에 열림`,
          sprite: d.sprite,
        })),
    ];
    hud.setBuildItems(items);
  };

  /** 붓을 놓는다 — 하네스가 `__kairoBrush()` 로 확인한다 */
  const clearBrush = (): void => {
    brush = null;
    moveSel = null;
    ticker.setBrush(null);
    endAim(); // 조준·고스트·표식·확정 바가 한 덩어리다 (K47-③)
  };

  /*
   * 검증 도구가 시뮬 규칙을 직접 부를 수 있게 노출한다 (브라우저에서 규칙을 재구현하지 않도록).
   *
   * ⚠ 여기서 `await import` 를 다시 하면 안 된다. `bootKairo` 뒤에 await 가 하나라도 있으면
   * 그 지점에서 양보한 사이 **첫 프레임이 먼저 돌아** `onFrame` 이 아직 초기화되지 않은
   * `week` 를 건드리고, ReferenceError 로 루프가 frame 0 에서 죽는다 (K1 과 같은 서명:
   * `started:true, frame:0, children:1282`). 실측으로 겪었다 — 화면이 그려진 채 멈춘다.
   * 동적 import 는 전부 boot 앞에 모아 둔다.
   */
  /*
   * 팬 → 조준 (K47-③). 씬은 커서가 **다른 칸으로 넘어간 순간에만** 올린다 —
   * 매 프레임 판정은 폰에서 최악 1.6ms 라 위험하다 (실측 근거는 `refreshAim` 주석).
   */
  h.scene.onAimTile = (i, j) => {
    if (!aim) return;
    aim.i = i;
    aim.j = j;
    refreshAim();
  };

  Object.assign(h, {
    Rng: RngCls,
    tapTile, // 도구용 — 하네스가 UI 경로를 그대로 밟는다 (K32)
    /**
     * 지금 조준 중인 칸·방향 (K47-③) — main 이 쥔 정본 쪽 값이다.
     * 하네스는 씬의 `aimTileNow()`(그려지는 쪽)로 "고스트가 팬을 따라오나"를 재므로
     * 이쪽은 둘이 갈라졌을 때 대조하는 용도다.
     */
    aim: () => (aim ? { ...aim } : null),
    sim: { bakeIndoorWalls, paintFloor, INDOOR_FAIL_MESSAGES, guestWalkable },
    simDefs: Object.fromEntries(allFacilityDefs().map((d) => [d.id, d])),
  });
  /**
   * 주 단위 루프 — 핵심 루프의 30초 사이클.
   *   한 주 진행 → 압축 연출(3.5초) → 결산에서 병목 확인 → 구조물을 키움 → 다시 한 주
   *
   * 실시간 시뮬은 "만지는 동안"만 돌고, 시간이 흐르는 건 이 버튼뿐이다 — 렌더가 프레임마다
   * tick 을 돌리면 결산이 언제 끝났는지 알 수 없다.
   */
  const progress = saved ? saved.progress : new ProgressStore();
  // 사건 해금 집합 (K41) — 의뢰 보상으로 열린 시설. 등급에서 다시 만들 수 없는 상태다
  const unlocks = UnlockStore.fromSnapshot(saved?.unlocks);
  // 심사 (K42) — 승급은 응시하는 시험이다. 신청 대기·통과 횟수가 상태다
  const exam = ExamStore.fromSnapshot(saved?.exam);
  // 소원 체인 (K43) — 인물·EXP·열린 소원이 상태다
  const wishes = WishStore.fromSnapshot(saved?.wishes);
  const week = new WeekRunner(h.terrain, h.placement, h.guests);
  runner = week; // 프레임이 이제부터 주차·현금을 읽을 수 있다
  const report = new KairoReport(document.body);
  /**
   * 지난 결산 다시 보기 (K46 의 리포트 버튼 → K47-② 알림함 행).
   *
   * 수동 열람이라 **카드 사슬을 안 탄다** (`onClose` 가 비어 있다) — 여기서 다음 주를
   * 시작하면 결산을 다시 볼 때마다 주가 넘어간다.
   * ⚠ 본문이 `lastReport`·`lastCombos`·`reportSeenWeek`·`refreshCaps` 를 읽는다. 전부 아래에서
   *   선언되지만 **부르는 시점은 사용자 탭**이라 TDZ 에 안 걸린다.
   * ⚠ 언제나 **가장 최근 결산**을 연다. 전체 결산(히트맵·재생 프레임)은 그 주에만
   *   존재하고 세이브에도 안 들어가므로(위 `lastReport` 주석), 알림함의 옛 행을 눌러도
   *   과거 주차를 되살릴 수는 없다. 되살리려면 주별 보관이 먼저다.
   */
  const openLastReport = (): void => {
    if (!lastReport) {
      toast('아직 결산이 없습니다 — 첫 주를 보내세요');
      return;
    }
    reportSeenWeek = lastReport.week;
    report.show(lastReport, { onClose: () => undefined }, lastCombos ?? undefined);
    refreshCaps();
  };
  const cardView = new KairoCardView(document.body);
  /*
   * 주간 카드는 **모달**이다 (K37). 선택하지 않으면 주가 안 넘어가는 것이 카드의 존재
   * 이유인데, 다른 패널이 밀어내면 선택을 조용히 건너뛴다.
   */
  panelHost.register(cardView, { modal: true });

  /*
   * 해금 도착 큐 (K41, A6) — 판정은 주 경계에서 나고 **연출은 다음 날 아침에 온다.**
   * 흐름이 아침(tick 8)에 닿으면 하나씩 모달로 띄운다. 모달이라 뜨는 동안 시간이 멈춘다.
   * 큐는 세이브에 안 넣는다 — 해금 자체(unlocks)는 저장되므로, 재부팅으로 잃는 것은
   * 축하 연출 한 번뿐이다.
   */
  const arrivalQueue: import('./ui/kairo-unlock.js').Celebration[] = [];
  const unlockView = new KairoUnlockView(document.body, {
    thumbFor: (sid) => (h.provider.has(sid) ? h.provider.get(sid) : null),
  });
  const weekRng = new RngCls(31337);
  const cards = saved?.cards ? CardStore.fromSnapshot(saved.cards) : new CardStore();
  /** 카드는 전용 RNG 스트림 — 손님·날씨와 섞으면 카드 한 장에 날씨가 밀린다 (불변식 2) */
  const cardRng = saved
    ? RngCls.fromState(saved.cardRngState)
    : new RngCls(31337).fork(CARD_RNG_SALT);
  const staff = saved?.staff ? StaffStore.fromSnapshot(saved.staff) : new StaffStore();
  /** 고장 판정 전용 스트림 — 손님·날씨와 섞으면 시설 하나에 날씨가 밀린다 (불변식 2) */
  const staffRng = saved
    ? RngCls.fromState(saved.staffRngState)
    : new RngCls(20260818).fork(0x57aff);
  const staffPanel = new KairoStaffPanel(document.body);
  /**
   * 사고로 닫힌 시설과 남은 주 수 (§12.1). 주마다 하나씩 깎는다.
   * 직원 부족으로 서는 것과 **합쳐서** 손님에게 넘긴다 — 손님은 이유를 구분하지 않는다.
   */
  const accidentIdle = new Map<number, number>(saved?.accidentIdle ?? []);
  /*
   * 코스 — 새 판이면 **물려받은 코스**가 이미 들어 있다 (K30). 시작 배치가 만든
   * 저장소를 그대로 쓴다. 새로 만들면 물려받은 코스가 조용히 사라진다.
   */
  /**
   * 플레이어가 놓은 출입구 (K36-B). **희망이지 상태가 아니다** — 벽은 여전히 실내
   * 바닥에서 파생된다 (K27). 세이브에 담기지만 없으면 빈 집합이라 예전과 똑같이 돈다.
   */
  const doors = DoorSetCls.fromSnapshot(saved?.doors);

  const courses = saved?.courses
    ? course.CourseStore.fromSnapshot(saved.courses)
    : (fresh?.courses ?? new course.CourseStore());

  /**
   * 코스가 더하는 위험 (§7.6 안전도). 안전도가 낮을수록 위험 점수가 크다 —
   * 안 넣으면 험한 코스를 그려도 위험도 게이지가 안 움직여, 안전도가 코스 화면 안에서만
   * 도는 숫자가 된다.
   */
  const courseRiskPoints = (): number => {
    if (courses.count === 0) return 0;
    const w = courses.weekly();
    return Math.round(((100 - w.safety) / 100) * 8 * courses.count);
  };
  /**
   * 계절. MVP 는 여름만 돈다 (스펙 v4: "여름이 재미없으면 사계절도 소용없다").
   * 세이브에는 이미 담고 있으므로, 계절 순환을 넣을 때 포맷을 바꾸지 않아도 된다.
   */
  const season = saved?.season ?? 'summer';
  if (saved) {
    week.restore(saved.week);
    weekRng.setState(saved.weekRngState);
  }
  /**
   * 전체 결산(히트맵·재생 프레임)은 세이브에 안 들어간다 — 재생은 그 주에만 의미가 있고
   * 히트맵 1,280칸은 localStorage 를 넘긴다. 등급·의뢰가 읽는 요약만 복원한다.
   */
  let lastReport: ReturnType<typeof week.run> | null = null;
  /**
   * 그 주가 **열린 시점**의 콤보 발동 목록 (P2-B) — 결산의 콤보 줄이 쓴다.
   *
   * ⚠ 결산을 열 때 다시 계산하면 안 된다. 흐르는 낮 동안 지은 시설이 섞여
   * "목록은 13개인데 적용된 숫자는 12개 몫"이 된다 — 주는 `begin()` 시점 배치로 계산된다.
   * 총합(만족·매출)은 여기 없다: `rep.combos` 가 **실제로 적용된 값**을 들고 온다.
   */
  let lastCombos: ComboBreakdown | null = null;
  let lastSummary = saved?.lastSummary ?? null;
  /**
   * 누적 방문객 (K47-① 신규 발화 d). 이 카운터는 **원래 없었다** — "지금까지 몇 명이
   * 다녀갔나"를 게임 어디에서도 못 물었다.
   *
   * ⚠ 세이브에는 **optional** 로 들어간다 (`src/save/kairo.ts` 의 v7 규칙) — 옛 세이브는 0 에서
   * 다시 세기 시작할 뿐이라 마이그레이션이 필요 없다. 버전을 올리면 v7 세이브가
   * 전부 한 칸씩 밀린다.
   */
  let visitorsTotal = saved?.visitorsTotal ?? 0;
  /** 마일스톤 — 자릿수가 바뀌는 지점. 너무 촘촘하면 축하가 소음이 된다 */
  const VISITOR_MILESTONES = [100, 500, 1000, 2000, 5000] as const;
  /**
   * 평판 — 퇴장 만족도의 **이동평균** (§9.2). 지난주 값 하나로 등급을 정하면 진동한다:
   * 등급↑ → 수요↑ → 혼잡 → 만족도↓ → 등급↓ → 수요↓ → 만족도↑ → … (실측 40주에 35번).
   * 등급에 이력(hysteresis)도 걸어 한 번 오른 등급이 유지되게 한다.
   */
  const reputation = Reputation.fromSnapshot(
    saved?.reputation ?? lastSummary?.exitSatisfaction ?? 0,
  );
  let gradeNo = saved?.gradeNo ?? gradeFor(reputation.value).grade;
  /** 지금 등급 — 이력이 걸린 값이다. 화면·판정이 전부 이걸 쓴다 */
  /*
   * 지금 등급 = gradeNo 그대로 (K42). 예전엔 nextGrade 로 **평판이 문턱을 넘는 순간
   * 자동 승급**이었다 — 이제 승급은 심사 통과로만 일어난다. 강등은 결산에서 자동이다.
   */
  const currentGrade = (): ReturnType<typeof gradeFor> =>
    GRADES.find((g) => g.grade === gradeNo) ?? (GRADES[0] as ReturnType<typeof gradeFor>);

  /** 세이브 — 배치·주 진행처럼 상태가 실제로 바뀐 뒤에만 부른다 */
  // 부팅 시점의 토지 — 세이브에서 복원된 등급이 그대로 화면에 반영돼야 한다
  {
    h.scene.setLand(landRect(currentGrade()));
  }

  const persist = (): void => {
    saveKairoToStorage({
      seed: KAIRO_SEED,
      gate: GATE,
      terrain: h.terrain,
      walls: h.walls,
      placement: h.placement,
      progress,
      week: week.toSnapshot(),
      weekRngState: weekRng.state,
      season,
      lastSummary,
      cards: cards.toSnapshot(),
      cardRngState: cardRng.state,
      staff: staff.toSnapshot(),
      staffRngState: staffRng.state,
      courses: courses.toSnapshot(),
      doors: doors.toSnapshot(),
      accidentIdle: [...accidentIdle],
      mapId,
      scenarioId,
      accidentCount,
      reputation: reputation.toSnapshot(),
      gradeNo,
      discovered: [...discovered],
      resortName,
      priceMult,
      unlocks: unlocks.toSnapshot(),
      // 누적 방문객 (K47-①) — optional 필드라 옛 세이브도 그대로 열린다
      visitorsTotal,
      exam: exam.toSnapshot(),
      wishes: wishes.toSnapshot(),
    });
  };

  /** 입고 카드(K43)로 산 시설 — 해금 + 다음 날 아침 도착 */
  const applyCardUnlocks = (ids: readonly string[]): void => {
    for (const uid of ids) {
      if (!unlocks.grant(uid)) continue;
      const def = allFacilityDefs().find((x) => x.id === uid);
      arrivalQueue.push({
        title: '새 시설 해금!',
        name: def?.name ?? uid,
        sub: '설비 상인에게서 샀다',
        ...(def?.sprite !== undefined ? { sprite: def.sprite } : {}),
      });
      refreshBuildList();
    }
  };

  /**
   * 주 옵션 조립 — `week.begin` 직전에 한 번. 카드 효과(modifiers)가 정해진 **뒤**여야
   * 하므로 카드 선택 → beginWeek 순서가 고정이다 (카드는 그 주에 적용된다).
   */
  const assembleWeekOpts = () => {
    const gr = currentGrade();
    const mods = cards.modifiers();
    // 등급이 동시 손님 상한과 방문 수요를 올린다 — 만족도를 관리해야 성장한다
    h.guests.setMaxGuests(admissionLimit(gr, h.placement.totalCapacity(), mods.crowdMult));
    const staffEff = staff.effects(h.placement);
    const courseWeek = courses.weekly();
    const risk = assessRisk(h.placement, h.guests, {
      staffSafety: staffEff.safetyPoints,
      courseRisk: courseRiskPoints(),
      swimRisk: swimRiskPoints(h.guests.swimZones()),
    });
    /*
     * 결산에 실을 콤보 목록 (P2-B) — **주가 열리는 지금** 떠 놓는다. 결산을 열 때
     * 다시 계산하면 흐르는 낮 동안 지은 시설이 섞여 목록과 숫자가 어긋난다.
     *
     * ⚠ `evaluateCombos` 를 아래에서 한 번 더 부른다. 하나로 합치고 싶지만,
     * `week.test.ts` 의 정적 검사가 **`comboEffect(evaluateCombos(… swimZones()`
     * 라는 인라인 형태**를 main.ts·kairo-sim.ts 양쪽에서 찾는다 (한쪽만 넘기면
     * 헤드리스와 실제 판이 갈라지는 사고를 이 저장소가 여러 번 겪었다). 배치가 같은
     * 시점의 같은 순수 함수라 두 결과는 언제나 같다 — 주에 한 번뿐인 비용이다.
     */
    const zonesNow = h.guests.swimZones();
    lastCombos = comboBreakdown(
      evaluateCombos(h.placement, undefined, zonesNow).active,
      zonesNow,
    );
    return {
      season,
      reputation: gr.reputationPull,
      priceMult,
      mapShares: scen.shiftedShares(seasonShares(season), mapDef),
      mapSceneryBonus: mapDef.sceneryBonus,
      modifiers: mods,
      courses: {
        revenue: courseWeek.revenue,
        upkeep: courseWeek.upkeep,
        riders: courseWeek.riders,
      },
      /*
       * 콤보 보너스 (S5) — 주가 열리는 시점의 배치로 잰다.
       *
       * ⚠ `tools/kairo-sim.ts` 도 **같은 함수·같은 인자**로 넘긴다. 한쪽만 넘기면
       * 헤드리스 밸런싱과 실제 판이 다른 세계를 재게 된다 (이 저장소가 여러 번 겪었다).
       * `week.test.ts` 의 정적 검사가 두 파일 모두에 `comboEffect(` 가 있는지 본다.
       *
       * `swimZones()` 를 반드시 같이 넘긴다 — 안 주면 zone 콤보 3종이 **조용히 0** 이다.
       */
      combos: comboEffect(evaluateCombos(h.placement, undefined, h.guests.swimZones())),
      // 위험 단계가 아니면 0 — 안전한데 사고가 나면 억울하다 (v4 결정)
      accidentChance: accidentChance(risk, mods.accidentMult),
      staff: {
        wages: staffEff.wages,
        satisfactionDelta: staffEff.satisfactionDelta,
        foodMult: staffEff.foodMult,
        idle: new Set([
          ...staff.idleHandles(h.placement, staffRng),
          ...accidentIdle.keys(),
        ]),
      },
    };
  };

  /**
   * 흐르는 낮 (K39) — 지도가 보이는 동안 rAF 가 tick 을 소비한다.
   * 하루(120 tick) = 48초 ⚖ (스펙 §2.1 — 밀도 계측으로 확정한다).
   */
  const flow = {
    acc: 0,
    speed: 1,
    /** 하네스·도구용 — true 면 흐름이 완전히 선다 (setAutoTick 과 독립) */
    frozen: false,
    daysSeen: 0,
  };
  /*
   * 하루 = 120 tick × 0.2초 = **24초** (K44 실측 조정). 처음 48초(0.4초/tick)는
   * ticksPerStep=4 와 겹쳐 손님이 1.6초/칸으로 걸어 "느려졌다"는 보고를 받았다 —
   * 0.8초/칸이면 산책으로 읽힌다. 배속 2×(메뉴)면 0.4초/칸 = 예전 유휴 시뮬 속도다.
   */
  const TICK_MS = 200;

  /** 씬 보간에 현재 박자를 알린다 — 배속·부팅에서 부른다 (K44) */
  const syncTickPace = (): void => {
    h.scene.setTickSeconds(TICK_MS / 1000 / flow.speed);
  };

  /** 코스 보트 갱신 (K45) — 코스가 바뀔 때마다. 경로는 sim 스플라인 그대로 */
  const syncBoats = (): void => {
    h.scene.setCourseBoats(
      courses.all.map((c) => ({
        path: course.sampleCourse(c.dock, c.handles).map((sm) => ({ x: sm.pos.x, y: sm.pos.y })),
        vehicles: c.vehicles,
      })),
    );
  };

  const beginWeek = (): void => {
    week.begin(weekRng, assembleWeekOpts());
    flow.acc = 0;
    flow.daysSeen = 0;
    /*
     * 심사 D-day (K47-① 신규 발화 c). `judgeWeek` 는 지금까지 칩·버튼 라벨로만
     * 렌더됐다 — 상시 표시라 **눈에 익어서 안 보인다.** 판정 주가 열리는 순간
     * 한 번 흘려야 "이번 주가 그 주"가 사건이 된다.
     *
     * ⚠ `week.begin` **뒤**여야 한다. 진행 중 주차는 `week.week + 1` 이고
     * (stampNow 와 같은 규칙), 판정은 이 주의 결산에서 난다.
     */
    if (exam.pending && exam.pending.judgeWeek === week.week + 1) {
      news('⚖', `이번 주말 심사 — ${exam.pending.target}등급 판정`);
    }
    refreshCaps();
  };

  /** step 뒤처리 — 하루 마디 토스트·낮밤 틴트·해금 도착·주 마디 진입 */
  const afterStep = (): void => {
    const p = week.liveProgress();
    if (!p) return;
    h.scene.setDayPhase(p.done ? null : (p.tick % TICKS_PER_DAY) / TICKS_PER_DAY);
    // 해금 도착 (A6) — 아침(tick 8)이 되면 하나씩. 모달이 닫히면 흐름이 다시 흘러
    // 다음 아침 조건에서 다음 것이 온다
    if (
      arrivalQueue.length > 0 &&
      !p.done &&
      p.tick % TICKS_PER_DAY >= 8 &&
      !panelHost.anyOpen
    ) {
      const c = arrivalQueue.shift();
      // 다른 모달이 선점했으면 버리지 않는다 — 축하가 조용히 증발하면 해금이 안 보인다
      if (c && !unlockView.show(c)) arrivalQueue.unshift(c);
    }
    const closed = week.liveDays() ?? [];
    if (closed.length > flow.daysSeen) {
      /*
       * 하루 마감·주말 진입은 **뉴스**다 (K47-①) — 내가 누른 것의 대답이 아니라
       * 시간이 흘러서 일어난 일이다. 토스트에 있던 것을 티커로 옮겼다: 토스트는
       * 2.6초 뒤 사라져 놓치면 끝인데, 이건 그 주의 손익을 읽는 유일한 실황이었다.
       */
      for (let k = flow.daysSeen; k < closed.length; k++) {
        const d = closed[k];
        if (!d) continue;
        const profit = d.revenue - d.upkeep;
        news(
          profit >= 0 ? '📈' : '📉',
          `${d.name} · ${profit >= 0 ? '+' : '−'}${Math.abs(Math.round(profit / 10000))}만 · 손님 ${d.visitors}`,
          // ⚠ 시점은 **그 날**이다. 자동 시점은 이미 다음 날로 넘어간 뒤라 하루 밀린다
          `${week.week + 1}주 ${d.name}`,
        );
        /*
         * 누적 방문객 (K47-① 신규 발화 d). 하루가 닫힐 때마다 더한다 —
         * ⚠ `rep.visitors` 는 이 날들의 합이므로 결산에서 또 더하면 **두 배**가 된다.
         * 세는 곳은 여기 하나다.
         */
        visitorsTotal += d.visitors;
        for (const m of VISITOR_MILESTONES) {
          if (visitorsTotal >= m && visitorsTotal - d.visitors < m) {
            news('🎊', `누적 손님 ${m.toLocaleString('ko-KR')}명 돌파!`);
          }
        }
      }
      if (closed[closed.length - 1]) audio.play('sfx/day-end');
      /*
       * 주말 진입 — sim 의 1.6× 는 예전부터 있었다. 표기가 없었을 뿐이다 (검수 A1).
       * ⚠ `=== 5` 가 아니라 **넘었는가**로 본다. ⏩ 로 여러 날이 한 번에 닫히면
       * 정확히 5 인 순간이 없어서 주말 알림이 조용히 사라진다.
       */
      if (flow.daysSeen < 5 && closed.length >= 5) news('🏖', '주말 — 손님이 몰립니다');
      flow.daysSeen = closed.length;
      refreshCaps();
    }
    if (p.done) settleWeek();
  };

  const flowTick = (dtMs: number): void => {
    if (flow.frozen) return;
    /*
     * 조준 중에는 시간이 안 흐른다 (K47-③).
     *
     * 확정 바는 `PanelHost` 패널이 **아니라서**(스크림 없는 바라 배타 규칙이 시트·결산과
     * 충돌한다) 지금까지 흐름을 못 멈췄다. 그래서 **지금도** 확정 바를 띄운 채 주가
     * 마감되고, 결산 위로 확정을 눌러 옛 현금 기준으로 지출하는 것이 가능했다.
     * 조준 배치는 그 시간을 수 초로 늘리므로 여기서 막는다 — 누산기도 0 으로 되돌려
     * 손을 뗀 순간 밀린 시간이 몰아 흐르지 않게 한다 (멈춤이지 빚이 아니다).
     */
    if (hud.confirming) {
      flow.acc = 0;
      return;
    }
    if (!week.liveProgress()) return; // 주 경계 — 결산·카드 게이트 중
    if (!h.scene.tickingEnabled) return; // 검증 도구가 화면을 얼렸다 (setAutoTick)
    if (panelHost.anyOpen) {
      flow.acc = 0; // 시트·패널이 연 시간은 흐르지 않는다 — 카이로의 암묵 멈춤
      return;
    }
    flow.acc += dtMs;
    const per = TICK_MS / flow.speed;
    const n = Math.floor(flow.acc / per);
    if (n <= 0) return;
    flow.acc -= n * per;
    week.step(n);
    h.scene.advanceBoats(n);
    afterStep();
  };

  /**
   * 하루 끝까지 감기.
   *
   * ⚠ K47-② 에서 **화면의 `하루 »` 버튼은 없앴다** (계획 §2: 시간은 흐르는 낮으로 이미
   * 자동이고, 스킵을 누르고 싶은 순간은 "할 게 없다"는 신호라 스킵으로 가릴 게 아니다).
   * 함수는 남긴다 — `window.__kairo` 로 노출돼 있어 **하네스가 시간을 감을 유일한
   * 수단**이다. 주 스킵 분기도 같이 사라져 이제 언제나 하루 단위다.
   */
  const skipForward = (): void => {
    const p = week.liveProgress();
    if (!p || p.done || panelHost.anyOpen) return;
    if (hud.confirming) return; // 조준 중에는 시간이 안 흐른다 (K47-③ — flowTick 과 같은 규칙)
    audio.play('sfx/tap');
    const skipped = week.step(TICKS_PER_DAY - (p.tick % TICKS_PER_DAY));
    h.scene.advanceBoats(skipped);
    afterStep();
  };

  /** 주 마감 — 결산을 띄우고, 닫으면 다음 주 카드 → begin (스펙 §2.1: 결산 → 카드) */
  const settleWeek = (): void => {
    const t0 = performance.now();
    const rep = week.finish();
    h.scene.setDayPhase(null);
    // 사고로 닫힌 시설의 남은 주를 깎는다
    for (const [handle, left] of [...accidentIdle]) {
      if (left <= 1) accidentIdle.delete(handle);
      else accidentIdle.set(handle, left - 1);
    }
    if (rep.accident) {
      accidentIdle.set(rep.accident.handle, rep.accident.weeks);
      accidentCount += 1;
    }
    cards.tickWeek();
    lastReport = rep;
    reputation.push(rep.exitSatisfaction);
    /*
     * 강등만 자동이다 (K42) — 관리 실패는 시험을 봐 주지 않는다.
     * 승급은 아래의 심사 판정으로만 일어난다.
     */
    const downTo = nextGrade(gradeNo, reputation.value).grade;
    if (downTo < gradeNo) {
      gradeNo = downTo;
      h.scene.setLand(landRect(currentGrade()));
      /*
       * 강등은 **뉴스**다 (K47-①). 내가 누른 것의 대답이 아니라 결산이 내린 판정이고,
       * 2.6초 뒤 사라지는 토스트로 알리기엔 판이 통째로 좁아지는 사건이다.
       * (승급·탈락은 모달 그대로 — 그건 축하/판정 연출이다.)
       */
      news('▼', `등급이 내려갔습니다 — ${currentGrade().name}. 만족도를 살피세요`);
    }
    // 심사 판정 (K42) — 부분 점수, 무작위 없음. 결과는 다음 날 아침에 도착한다
    const verdict = exam.judge(
      week.week,
      h.placement,
      {
        visitors: rep.visitors,
        turnedAway: rep.turnedAway,
        profit: rep.profit,
        exitSatisfaction: rep.exitSatisfaction,
      },
      h.guests.swimZones(),
    );
    if (verdict) {
      if (verdict.passed) {
        gradeNo = verdict.target;
        if (verdict.grant > 0) week.earn(verdict.grant); // 통과 지원금 (수수료 × 2)
        const nl = landRect(currentGrade());
        h.scene.setLand(nl);
        audio.play('sfx/exam-pass');
        const newly = allFacilityDefs().filter((d) => requiredGrade(d.id) === gradeNo);
        arrivalQueue.push({
          title: `${gradeNo}등급 승급!`,
          name: `${currentGrade().name} — ${verdict.score}/${verdict.max}점`,
          sub: `토지 ${nl.w}×${nl.h} · 새 시설 ${newly.length}종 · 지원금 ${Math.round(verdict.grant / 10000)}만`,
          ...(newly[0]?.sprite !== undefined ? { sprite: newly[0].sprite } : {}),
        });
      } else {
        audio.play('sfx/exam-fail');
        // 처방 — 가장 점수가 낮은 조건을 지목한다 (거절은 방법까지 말한다)
        const worst = [...verdict.perReq].sort((a, b) => a.score - b.score)[0];
        arrivalQueue.push({
          title: '심사 탈락',
          name: `${verdict.score}/${verdict.max}점 (커트 ${Math.ceil(verdict.max * 0.75)})`,
          sub: worst ? `부족한 것: ${worst.detail} — 채우고 다시 신청하세요` : '다시 신청하세요',
        });
      }
      if (verdict.firstPass) {
        /*
         * 첫 통과 보상 — **이동 붓만** (K47-②). 예전엔 ⏩ 주 스킵이 같이 왔는데
         * 스킵 자체를 없앴다 (계획 §2). 해금의 정본은 `exam.toolsUnlocked` 이고
         * 그건 이동 붓도 잠그므로 그대로 둔다.
         */
        refreshBuildList();
        arrivalQueue.push({
          title: '새 도구',
          name: '이동',
          sub: '첫 심사 통과 보상 — 이제 지은 시설을 옮길 수 있습니다',
        });
      }
    }
    lastSummary = {
      visitors: rep.visitors,
      turnedAway: rep.turnedAway,
      profit: rep.profit,
      exitSatisfaction: rep.exitSatisfaction,
    };
    // 의뢰 보상은 결산 시점에 지급한다 — 배치 때마다 주면 같은 의뢰가 여러 번 판정된다
    // 새로 터진 콤보를 도감에 기록한다 — 결산이 발견의 순간이다 (§0 재미의 축)
    // 숨은 콤보(K43)는 첫 발동이 사건이다: 보상 + 다음 날 아침 축하
    for (const cid of noteDiscoveries()) {
      const combo = COMBOS.find((x) => x.id === cid);
      if (!combo?.hidden) continue;
      if (combo.discoverCash !== undefined) week.earn(combo.discoverCash);
      audio.play('sfx/discover');
      arrivalQueue.push({
        title: '숨은 조합 발견!',
        name: combo.name,
        sub:
          combo.discoverCash !== undefined
            ? `도감에 기록 · +${Math.round(combo.discoverCash / 10000)}만`
            : '도감에 기록됐습니다',
      });
    }
    const claimStatuses = questStatuses(h.placement, lastSummary, h.guests.swimZones());
    const weekClaim = progress.claim(claimStatuses);
    if (weekClaim.cash > 0) {
      week.earn(weekClaim.cash);
      audio.play('sfx/cash');
    }
    /*
     * 의뢰 달성 (K47-① 신규 발화 a). 여기가 **UI 가 완전히 무음이던 자리**다 —
     * 현금만 조용히 들어오고 "무슨 의뢰를 끝냈는지"를 화면 어디에서도 말하지 않았다.
     * 보상 시설이 붙은 의뢰는 아래 모달(축하)이 따로 뜨지만, 현금뿐인 의뢰는 아무것도
     * 없었다. `claim` 은 id 만 돌려주므로 방금 넘긴 statuses 에서 이름을 되찾는다.
     */
    for (const qid of weekClaim.ids) {
      const q = claimStatuses.find((s) => s.id === qid);
      news(
        '📋',
        `의뢰 달성 — ${q?.name ?? qid}` +
          (q && q.reward > 0 ? ` · +${Math.round(q.reward / 10000)}만` : ''),
      );
    }
    /*
     * 소원 (K43) — EXP 적립·소원 열림·성사 판정. 전부 결산 tick 의 결정적 계산이고,
     * 연출(인물 도착·말풍선)은 다음 날 아침 큐가 푼다 (A6).
     */
    for (const ev of wishes.settle(lastSummary, rep.byGroup, h.placement, h.guests.swimZones())) {
      if (ev.kind === 'arrive') {
        arrivalQueue.push({
          title: '새 손님이 왔어요',
          name: ev.char.name,
          sub: '소원을 들어주면 또 옵니다 (메뉴 → 소원)',
        });
      } else if (ev.kind === 'open') {
        /*
         * 소원 개시는 **뉴스**다 (K47-①). 모달에서 내렸다: 목표가 하나 열리는 것은
         * 축하가 아니고, 주당 여러 건이 열릴 수 있어 그때마다 시간을 멈추면
         * "한 주 진행"이 팝업 행렬이 된다 (PSS 부정 리뷰 1위가 팝업 과다였다).
         * 진행은 메뉴의 소원 목록이 계속 들고 있으므로 놓쳐도 잃는 것이 없다.
         */
        news('💭', `${ev.char.name}의 소원 — ${ev.wish.line}`);
      } else {
        // done — 보상
        if (ev.wish.reward.cash !== undefined && ev.wish.reward.cash > 0) {
          week.earn(ev.wish.reward.cash);
        }
        const fid = ev.wish.reward.facility;
        if (fid !== undefined && unlocks.grant(fid)) {
          const def = allFacilityDefs().find((x) => x.id === fid);
          arrivalQueue.push({
            title: '새 시설 해금!',
            name: def?.name ?? fid,
            sub: `${ev.char.name}의 소원 보상`,
            ...(def?.sprite !== undefined ? { sprite: def.sprite } : {}),
          });
          refreshBuildList();
        } else {
          /*
           * 보상이 **시설이면 모달**(위: 새 시설 해금 — 축하), 현금뿐이면 **뉴스**다.
           * 채널을 보상의 무게로 가른다 — 현금 몇 만에 시간을 멈추면 축하가 값싸진다.
           */
          news(
            '💗',
            `소원 성사! ${ev.char.name}` +
              (ev.wish.reward.cash !== undefined
                ? ` · 고마움의 표시 +${Math.round(ev.wish.reward.cash / 10000)}만`
                : ''),
          );
        }
      }
    }
    // 의뢰 보상 시설 (K41) — 지금 해금하고, 축하는 다음 날 아침에 도착한다 (A6)
    for (const fid of weekClaim.facilities) {
      if (!unlocks.grant(fid)) continue;
      const def = allFacilityDefs().find((x) => x.id === fid);
      arrivalQueue.push({
        title: '새 시설 해금!',
        name: def?.name ?? fid,
        sub: '의뢰 보상',
        ...(def?.sprite !== undefined ? { sprite: def.sprite } : {}),
      });
      refreshBuildList();
    }
    persist();
    console.log(
      `[카이로] ${rep.week}주차 계산 ${(performance.now() - t0).toFixed(0)}ms · ` +
        `방문 ${rep.visitors} · 손익 ${rep.profit}`,
    );
    const showReport = (): void => {
      /*
       * 결산은 **모달 그대로**다 (K47-①). 한 주의 결론을 보는 것이 핵심 루프의 절반이라
       * 흘려보낼 수 없다. 다만 알림함에도 남긴다 — K47-② 부터는 **그 행이 곧 리포트
       * 버튼**이다 (헤더 버튼을 없앤 자리). 탭하면 그 주 결산을 다시 연다.
       */
      news(
        '📊',
        `${rep.week}주차 결산 도착 · 손님 ${rep.visitors} · 손익 ${Math.round(rep.profit / 10000)}만`,
        stampNow(),
        openLastReport,
      );
      report.show(rep, { onClose: () => nextWeekCards() }, lastCombos ?? undefined);
    };
    /*
     * 사고가 났으면 결산 **전에** 대응 카드를 띄운다 (§12.1). 결산 뒤에 띄우면 이미
     * 숫자를 본 뒤라 "내 선택으로 끝난다"는 감각이 안 생긴다.
     */
    const accidentCard = rep.accident ? triggerCard('accident_response') : undefined;
    if (accidentCard) {
      panelHost.closeAll(); // 모달 충돌로 카드가 거절되면 주가 영원히 안 시작된다 (위와 동일)
      cardView.show([accidentCard], week.cash, (choices) => {
        for (const ch of choices) {
          const r = cards.choose(cardRng, ch.card, ch.optionIndex);
          if (r.cash > 0) week.earn(r.cash);
          else if (r.cash < 0) week.spend(-r.cash);
          applyCardUnlocks(r.unlocks);
        }
        persist();
        showReport();
      });
      return;
    }
    showReport();
  };

  /**
   * 다음 주 카드 — 결산 **뒤**에 온다 (UX 검수 §5: 결과를 보고 결정한다).
   * 효과는 이어서 begin 하는 주에 적용된다 — 의미는 예전과 같고 순서만 바로잡았다.
   * 1주차는 카드 없이 시작한다 (부팅 직후 모달은 온보딩 마찰 — 빼기가 원칙).
   */
  const nextWeekCards = (): void => {
    /*
     * ⚠ 판 잠금 방어 (K45). 카드는 모달이라 **다른 모달이 열려 있으면 show 가 조용히
     * 거절되고**, 그러면 beginWeek 콜백이 영원히 안 불려 주가 시작되지 않는다 —
     * "돈이 없어(선택을 못 해) 안 넘어간다"로 보고된 잠금의 유력 경로. 카드 전에
     * 열려 있는 것을 전부 닫는다 (닫힌 축하는 위의 재큐 규칙이 다시 살린다).
     */
    panelHost.closeAll();
    const gr0 = currentGrade();
    const drawn = cards.draw(cardRng, {
      season,
      week: week.week + 1,
      grade: gr0.grade,
      isUnlocked: (id) => unlocks.isUnlocked(id, gradeNo),
    });
    if (drawn.length === 0) {
      beginWeek();
      return;
    }
    audio.play('sfx/card');
    cardView.show(drawn, week.cash, (choices) => {
      for (const ch of choices) {
        const r = cards.choose(cardRng, ch.card, ch.optionIndex);
        if (r.cash > 0) week.earn(r.cash);
        else if (r.cash < 0) week.spend(-r.cash);
        applyCardUnlocks(r.unlocks);
      }
      beginWeek();
    });
  };

  /**
   * 지금 주를 끝까지 감고 결산으로 — K47-② 로 ⏩ 주 스킵이 사라져 지금은 **하네스
   * 전용**이다 (`window.__kairo.runWeek`). 화면에서 주를 감는 경로는 없다.
   * 주 경계(결산·카드가 떠 있는 중)면 아무것도 하지 않는다.
   */
  const runWeek = (): void => {
    const p = week.liveProgress();
    if (!p) return;
    const n = week.step(TICKS_PER_WEEK - p.tick);
    h.scene.advanceBoats(n);
    afterStep();
  };

  /*
   * 의뢰·위험도는 HUD 가 소유한다 (K28). 위험도는 K47-② 에서 하단 바에서 **헤더
   * 2줄째**로 올라갔고 상시 표시는 그대로다 — 사고가 RNG 로 느껴지면 안 된다 (v4 결정).
   * 처방(`안전 +N`)만 티커로 갔다: 그건 상태가 아니라 사건이다.
   */
  const questPanel = hud.quests;


  /**
   * 직원 버튼 — 시트를 연다. 상시 표시하지 않는 이유는 **매주 만지는 화면이 아니기**
   * 때문이다 (시설 구성이 바뀔 때 만진다). 상시로 두면 폰 화면을 잡아먹는다.
   */
  /**
   * 코스 패널 — 프리셋 탭 + 장비 + 대수. 핸들은 **화면에서 직접 끈다** (§7.3).
   * 선착장은 지금 게이트로 대신한다 (선착장 시설 배치는 K6 아쿠아파크가 소유).
   */
  const coursePanel = new KairoCoursePanel(document.body, {
    terrain: h.terrain,
    scene: h.scene,
    courses,
    /*
     * 선착장 후보 — **잔교 하나가 후보 하나다** (K33, `dockCandidates`).
     *
     * 예전엔 여기서 "물 위/밟고 지나가는 첫 시설"을 하나 집어 줬다. 플레이어가 못 골랐고,
     * 코스가 뻗는 방향도 패널이 `{x:0,y:1}` 로 박아 뒀다. 이제 데크 칸들을 넘겨 주면
     * sim 이 잔교로 묶고 끝·방향까지 낸다.
     */
    docks: () =>
      course.dockCandidates(
        h.placement
          .all()
          .filter((it) => {
            const def = allFacilityDefs().find((d) => d.id === it.defId);
            return def?.layer === 'water' || def?.walkOn === true;
          })
          .map((it) => ({ x: it.i, y: it.j })),
        { x: GATE.i, y: GATE.j },
        /*
         * 앵커 = 선착장(dock) 시설의 발자국 (K45). 선착장이 붙은 잔교만 코스 후보다 —
         * 코스는 견인 스테이션에서 시작한다 (시설 note 의 원래 의도).
         */
        h.placement
          .all()
          .filter((it) => it.defId === 'dock')
          .flatMap((it) => {
            const def = allFacilityDefs().find((d) => d.id === 'dock');
            if (!def) return [];
            const tiles: { x: number; y: number }[] = [];
            for (let dj = 0; dj < def.size[1]; dj++) {
              for (let di = 0; di < def.size[0]; di++) {
                tiles.push({ x: it.i + di, y: it.j + dj });
              }
            }
            return tiles;
          }),
      ),
    grade: () => currentGrade().grade,
    cash: () => week.cash,
    spend: (n) => week.spend(n),
    onChange: () => {
      refreshCourseBtn();
      refreshRisk();
      syncBoats();
      persist();
    },
    onConfirmed: (text) => {
      toast(text, 'ok');
      audio.play('sfx/place');
    },
  });

  /**
   * 도감과 감상 화면 (§15.8 · §15 감상).
   *
   * 발견한 콤보는 **누적**한다 — 지금 발동 중인 것만 보여주면 시설을 지웠을 때 도감이
   * 줄어들고, 그건 "발견"이 아니라 현황판이다.
   */
  const discovered = new Set<string>(saved?.discovered ?? []);
  const noteDiscoveries = (): string[] => {
    const fresh: string[] = [];
    for (const id of activeComboIds(h.placement, h.guests.swimZones())) {
      if (!discovered.has(id)) {
        discovered.add(id);
        fresh.push(id);
      }
    }
    return fresh;
  };
  noteDiscoveries();

  /**
   * 발동 중인 콤보의 서명 (K47-① 신규 발화 b).
   *
   * `evaluateCombos` 는 이름을 돌려주는데 UI 는 **개수만** 쓰고 버리고 있었다. 같은
   * 콤보가 계속 발동 중인 것은 뉴스가 아니므로 **새로 터진 것**만 흘린다 —
   * `id#index` 로 세는 이유는 같은 콤보가 여러 벌 성립할 수 있기 때문이다 (체감 감쇠).
   *
   * ⚠ 시작 상태를 미리 담는다. 안 담으면 물려받은 빠지(K30)의 콤보가 첫 배치에서
   * 한꺼번에 뉴스가 되어, 사건이 아니라 현황판이 된다.
   */
  const comboKey = (c: { id: string; index: number }): string => `${c.id}#${c.index}`;
  let comboSeen = new Set(
    evaluateCombos(h.placement, undefined, h.guests.swimZones()).active.map(comboKey),
  );
  const pushComboNews = (): void => {
    const now = evaluateCombos(h.placement, undefined, h.guests.swimZones());
    const fresh = now.active.filter((c) => !comboSeen.has(comboKey(c)));
    comboSeen = new Set(now.active.map(comboKey));
    for (const c of fresh) {
      /*
       * ⚠ 숨은 콤보의 **첫 발견은 모달**이 담당한다 (결산의 `noteDiscoveries` 사슬).
       * 여기서도 흘리면 한 사건이 두 채널에 나온다 — 채널 계약 위반이다.
       * 이미 발견한 숨은 콤보의 재발동은 그냥 뉴스다.
       */
      if (COMBOS.find((x) => x.id === c.id)?.hidden === true && !discovered.has(c.id)) continue;
      news('✨', `콤보 발동 — ${c.name}`);
    }
  };

  const catalog = new KairoCatalog(document.body, {
    placement: h.placement,
    courses,
    grade: () => currentGrade().grade,
    discovered: () => discovered,
  });

  let resortName = saved?.resortName ?? '가평 빠지';
  /** 요금 배율 (§15.9 "값을 매긴다") — 세이브에 담긴다 */
  let priceMult = saved?.priceMult ?? 1;
  const showcase = new KairoShowcase(
    document.body,
    h.scene,
    () => ({
      name: resortName,
      grade: currentGrade().grade,
      visitors: lastSummary?.visitors ?? 0,
      week: week.week,
      facilities: h.placement.count,
    }),
    (n) => {
      resortName = n;
      persist();
    },
  );
  /*
   * 감상은 **배타가 아니다** (K37). 화면을 덮지 않고 위아래 띠만 얹는 것이 목적이라
   * (지도가 보여야 감상이다) 배타로 두면 자기가 자기를 닫는다. 다른 패널은
   * `display:none` 으로 감췄다가 되돌린다 — `hide()` 로 닫으면 나올 때 복원이 안 된다.
   */
  panelHost.register(showcase, { exclusive: false });

  /**
   * 새 판 — 맵·시나리오를 고른다 (§4.5). 세이브를 지우고 다시 부팅한다.
   *
   * 다시 부팅하는 이유: 지형이 맵 타입에서 나오므로, 지금 판의 지형을 갈아끼우면
   * 시설·벽·코스가 물 위에 떠 있거나 육지에 잠긴 상태가 된다.
   */
  const newGame = new KairoNewGame(document.body, {
    grade: () => currentGrade().grade,
    start: (m, sc) => {
      clearKairoStorage();
      const url = new URL(location.href);
      url.searchParams.set('kairo', '1');
      url.searchParams.set('map', m);
      url.searchParams.set('scenario', sc);
      location.href = url.toString();
    },
  });

  /** 배속 (K44) — 상시 버튼 2개 불변식 때문에 메뉴 안이다 (K47-②). 세션 선호라 저장 안 한다 */
  const speedBtn = document.createElement('button');
  speedBtn.id = 'kairo-speed';
  speedBtn.className = 'kitem';
  const refreshSpeedBtn = (): void => {
    speedBtn.textContent = `배속 ${flow.speed}× → ${flow.speed === 1 ? 2 : 1}×`;
  };
  speedBtn.addEventListener('click', () => {
    flow.speed = flow.speed === 1 ? 2 : 1;
    syncTickPace();
    refreshSpeedBtn();
    toast(`배속 ${flow.speed}×`, 'ok');
  });
  refreshSpeedBtn();
  hud.menuSlot.append(speedBtn);

  /*
   * 심사 신청 (K42) — 자격이 되면 메뉴에 나타난다. 신청하면 수수료를 내고
   * 주말(목요일 이후 신청이면 다음 주말)에 심사관이 판정한다.
   */
  const examBtn = document.createElement('button');
  examBtn.id = 'kairo-exam-open';
  examBtn.className = 'kitem';
  examBtn.addEventListener('click', () => {
    const next = exam.eligible(gradeNo, reputation.value);
    if (!next) return;
    const fee = next.examFee ?? 0;
    if (fee > week.cash) {
      toast(`수수료가 부족합니다 — ${Math.round(fee / 10000)}만`);
      return;
    }
    week.spend(fee);
    const lp = week.liveProgress();
    const pending = exam.apply(next.grade, week.week + 1, lp ? lp.tick : TICKS_PER_WEEK);
    audio.play('sfx/card');
    const reqText = (next.examReqs ?? [])
      .map((c) => (c.kind === 'needSupply' ? `${c.need} ${c.value}` : `${c.kind} ${c.value}`))
      .join(' · ');
    // 신청은 **내 행동**이라 토스트가 맞다. 예고는 뉴스다 — 둘 다 낸다 (K47-①)
    toast(`심사 신청 — ${pending.judgeWeek}주차 주말 판정 (${reqText})`, 'ok');
    news('📝', `${next.grade}등급 심사 접수 — ${pending.judgeWeek}주차 주말 판정 (${reqText})`);
    refreshExamBtn();
    refreshGoal();
    persist();
  });
  hud.menuSlot.append(examBtn);
  const refreshExamBtn = (): void => {
    const next = exam.eligible(gradeNo, reputation.value);
    if (exam.pending) {
      examBtn.hidden = false;
      examBtn.disabled = true;
      examBtn.textContent = `심사 대기 — ${exam.pending.judgeWeek}주차 주말`;
    } else if (next) {
      examBtn.hidden = false;
      examBtn.disabled = false;
      examBtn.textContent = `심사 신청 — ${next.grade}등급 (${Math.round((next.examFee ?? 0) / 10000)}만)`;
    } else {
      examBtn.hidden = true;
    }
  };
  refreshExamBtn();

  const newGameBtn = document.createElement('button');
  newGameBtn.id = 'kairo-newgame-open';
  newGameBtn.textContent = '새 판';
  newGameBtn.className = 'kitem';
  newGameBtn.addEventListener('click', () => {
    if (newGame.visible) newGame.hide();
    else newGame.show();
  });
  hud.menuSlot.append(newGameBtn);

  /**
   * 의뢰 칩 (K40) — "다음에 뭘 할지"를 상시로. 예전 목표란은 "북한강형 · 자유 플레이"
   * 라는 판 설정만 비췄다 (UX 검수 §1 — 의도한 주석은 "얼마나 남았나"였는데 기본
   * 시나리오가 자유 플레이라 자리가 비어 있었다). 이제 의뢰 둘 + 등급 게이지(A4)를
   * 비추고, 판 설정은 메뉴 상단으로 갔다.
   */
  const refreshGoal = (): void => {
    const st = { week: week.week, grade: currentGrade().grade, accidents: accidentCount };
    const status = scen.scenarioStatus(scenario, st);
    const chips: GoalChip[] = [];
    for (const q of questStatuses(h.placement, lastSummary, h.guests.swimZones())
      .filter((q) => !q.done)
      .slice(0, 2)) {
      chips.push({ icon: '📋', label: q.name, detail: q.detail, progress: q.progress });
    }
    // 다음 등급 게이지 — 구경(만족도)이 쌓이는 게 보인다. 좋아요 1000 의 우리식 번역 (A4)
    // 자격이 차면 '응시 가능', 신청하면 '심사 대기'로 바뀐다 (K42)
    const next = GRADES.find((g) => g.grade === currentGrade().grade + 1);
    if (exam.pending) {
      chips.push({
        icon: '📋',
        label: `${exam.pending.target}등급 심사`,
        detail: `${exam.pending.judgeWeek}주차 주말 판정`,
        progress: 1,
      });
    } else if (next && exam.eligible(gradeNo, reputation.value)) {
      chips.push({
        icon: '⭐',
        label: '심사 응시 가능!',
        detail: '메뉴에서 신청하세요',
        progress: 1,
      });
    } else if (next) {
      chips.push({
        icon: '⭐',
        label: `${next.grade}등급까지`,
        detail: `만족도 ${Math.round(reputation.value)}/${next.reqExitSatisfaction}`,
        progress: reputation.value / Math.max(1, next.reqExitSatisfaction),
      });
    }
    if (status === 'won') chips.push({ icon: '🎉', label: '목표 달성', progress: 1, tone: 'won' });
    else if (status === 'lost') {
      chips.push({ icon: '✕', label: '실패 — 새 판으로', progress: 0, tone: 'lost' });
    } else if (scenario.goal.kind !== 'none') {
      chips.push({
        icon: '🚩',
        label: scenario.name,
        detail: scen.scenarioProgress(scenario, st),
        progress: 0,
      });
    }
    hud.setChips(chips);
  };
  hud.setContext(`${mapDef.name} · ${scenario.name}`);
  refreshGoal();

  const catalogBtn = document.createElement('button');
  catalogBtn.id = 'kairo-catalog-open';
  catalogBtn.textContent = '도감';
  catalogBtn.className = 'kitem';
  catalogBtn.addEventListener('click', () => {
    if (catalog.visible) catalog.hide();
    else catalog.show();
  });
  hud.menuSlot.append(catalogBtn);

  const showcaseBtn = document.createElement('button');
  showcaseBtn.id = 'kairo-showcase-open';
  showcaseBtn.textContent = '감상';
  showcaseBtn.className = 'kitem';
  showcaseBtn.addEventListener('click', () => showcase.show());
  hud.menuSlot.append(showcaseBtn);

  const courseBtn = document.createElement('button');
  courseBtn.id = 'kairo-course-open';
  courseBtn.textContent = '코스';
  courseBtn.className = 'kitem';
  courseBtn.addEventListener('click', () => {
    if (coursePanel.visible) coursePanel.hide();
    else coursePanel.show();
  });
  hud.menuSlot.append(courseBtn);

  // 건설 시트의 코스 탭이 여는 곳 — 메뉴의 버튼과 같은 동작이다 (K32)
  openCourse = (): void => {
    /*
     * ⚠ 붓을 먼저 내려놓는다 (K45 버그). 건물/바닥 붓을 든 채 코스 탭을 누르면
     * 붓이 살아남아, 코스 편집의 지도 탭(잔교 고르기·핸들)이 그대로 **설치**로
     * 흘렀다 — "코스를 선택하면 건물이 깔린다"로 보고된 버그.
     */
    clearBrush();
    if (!coursePanel.visible) coursePanel.show();
  };

  const refreshCourseBtn = (): void => {
    courseBtn.textContent = courses.count > 0 ? `코스 ${courses.count}` : '코스';
  };
  refreshCourseBtn();

  const staffBtn = document.createElement('button');
  staffBtn.id = 'kairo-staff-open';
  staffBtn.textContent = '경영';
  staffBtn.className = 'kitem';
  staffBtn.addEventListener('click', () => {
    if (staffPanel.visible) staffPanel.hide();
    else
      staffPanel.show(
        staff,
        h.placement,
        () => {
          refreshStaffBtn();
          persist();
        },
        {
          price: () => priceMult,
          setPrice: (v) => {
            priceMult = v;
          },
          cash: () => week.cash,
          spend: (n) => week.spend(n),
        },
      );
  });
  hud.menuSlot.append(staffBtn);

  /** 부족하면 버튼에 표시한다 — 시트를 열어봐야 아는 정보면 아무도 안 연다 */
  const refreshStaffBtn = (): void => {
    const eff = staff.effects(h.placement);
    const short = STAFF_ROLE_LIST.filter((r) => eff.coverage[r.id] < 1).length;
    staffBtn.textContent = short > 0 ? `경영 ⚠${short}` : '경영';
    staffBtn.classList.toggle('on', short > 0);
    staffPanel.refresh();
  };

  /**
   * 마지막으로 알린 위험 단계 — 처방 뉴스를 **나빠질 때만** 흘리기 위한 기억.
   * `null` 이면 아직 한 번도 안 쟀다 (부팅 직후에 뉴스가 터지면 안 된다).
   */
  let riskShown: number | null = null;
  /** 나쁨 순서 — 뉴스는 이 값이 **오를 때만** 나간다 (1.5초 폴링이라 왕복이면 소음이다) */
  const RISK_ORDER: Record<string, number> = { safe: 0, watch: 1, caution: 2, danger: 3 };
  const refreshRisk = (): void => {
    // 안전요원이 위험도를 내린다 — 시설과 같은 축이다
    const r = assessRisk(h.placement, h.guests, {
      staffSafety: staff.effects(h.placement).safetyPoints,
      courseRisk: courseRiskPoints(),
      swimRisk: swimRiskPoints(h.guests.swimZones()),
    });
    hud.setRisk(
      r.level as 'safe' | 'watch' | 'caution' | 'danger',
      // "위험 위험"으로 겹쳐 읽히던 것 — 축은 '위험도'고 값이 단계 이름이다
      `위험도 ${RISK_NAMES[r.level]}`,
    );
    /*
     * 처방(`안전 +N`)은 헤더에서 뺐다 (K47-②) — 2줄째 폭 예산이 빡빡하고, 처방은
     * **상시 표시할 상태가 아니라 사건**이다. 단계가 나빠지는 순간만 뉴스로 흘린다.
     * ⚠ 이 함수는 1.5초 폴링이 부른다. 단계 왕복(watch↔safe)에도 발화하면 티커가
     *   위험도 소식으로 도배된다 — 그래서 **오를 때만** 이다.
     */
    const now = RISK_ORDER[r.level] ?? 0;
    if (riskShown !== null && now > riskShown) {
      news(
        '⚠',
        `위험도 ${RISK_NAMES[r.level]}` +
          (r.safetyNeeded > 0 ? ` — 안전 +${r.safetyNeeded} 필요` : ' — 혼잡을 살피세요'),
      );
    }
    riskShown = now;
  };

  const refreshQuests = (): void => {
    const st = questStatuses(h.placement, lastSummary, h.guests.swimZones());
    const open = st.filter((s) => !progress.isClaimed(s.id));
    const rows = open.slice(0, 6);
    questPanel.replaceChildren();
    const title = document.createElement('div');
    const g = currentGrade();
    title.textContent =
      `의뢰 ${st.length - open.length}/${st.length} · ${g.grade}등급 ${g.name}\n` +
      `동시 ${g.maxGuests}명 · 수요 ×${g.reputationPull}`;
    title.className = 'kquest-head';
    questPanel.append(title);
    for (const s of rows) {
      const row = document.createElement('div');
      row.className = 'kquest';
      const name = document.createElement('div');
      name.textContent = `${s.done ? '✓ ' : ''}${s.name}`;
      if (s.done) name.className = 'done';
      const bar = document.createElement('div');
      bar.className = s.done ? 'kprog done' : 'kprog';
      const fill = document.createElement('i');
      // 폭은 **데이터**다 — 색은 클래스가 갖는다 (K34)
      fill.style.width = `${Math.round(s.progress * 100)}%`;
      bar.append(fill);
      const det = document.createElement('div');
      det.textContent = s.detail;
      det.className = 'kquest-detail';
      row.append(name, bar, det);
      questPanel.append(row);
    }
    /*
     * 소원 (K43) — 열린 소원을 의뢰 아래에 잇는다. 의뢰와 같은 행 모양을 쓴다
     * (새 표면을 만들지 않는다). 인물의 말이 곧 조건 설명이다.
     */
    const openW = wishes.openWishes(h.placement, lastSummary, h.guests.swimZones());
    if (openW.length > 0) {
      const head = document.createElement('div');
      head.className = 'ksheet-group';
      head.textContent = `소원 ${openW.length}`;
      questPanel.append(head);
      for (const w of openW) {
        const row = document.createElement('div');
        row.className = 'kquest';
        const name = document.createElement('div');
        name.textContent = `${w.char.name} — ${w.wish.line}`;
        const bar = document.createElement('div');
        bar.className = 'kprog';
        const fill = document.createElement('i');
        fill.style.width = `${Math.round(w.progress * 100)}%`;
        bar.append(fill);
        const det = document.createElement('div');
        det.textContent = w.detail;
        det.className = 'kquest-detail';
        row.append(name, bar, det);
        questPanel.append(row);
      }
    }
  };
  /**
   * 상단 캡슐 — 주차·계절과 현금. 레퍼런스도 이 둘을 늘 띄워 둔다.
   * 등급이 바뀌면 건설 시트의 잠금도 같이 풀려야 하므로 여기서 함께 갱신한다.
   */
  const SEASON_NAME: Record<string, string> = {
    summer: '여름',
    autumn: '가을',
    winter: '겨울',
    spring: '봄',
  };
  let lastGradeShown = -1;
  /**
   * 마지막으로 열어 본 결산 주차. K46 에서는 헤더 배지(N)의 조건이었고, K47-② 에서
   * 배지를 없앤 뒤로는 **미열람 판정**에만 쓴다 (알림함 행이 리포트 버튼을 대신한다).
   */
  let reportSeenWeek = saved?.lastSummary ? (saved.week.week ?? 0) : 0;
  const WEATHER_GLYPH: Record<string, string> = {
    clear: '☀',
    cloudy: '☁',
    rain: '🌧',
    heat: '🔥',
    cold: '❄',
  };
  const WEATHER_NAME: Record<string, string> = {
    clear: '맑음',
    cloudy: '흐림',
    rain: '비',
    heat: '폭염',
    cold: '쌀쌀',
  };
  const refreshCaps = (): void => {
    const g = currentGrade();
    const lp = week.liveProgress();
    const dayLabel = lp && !lp.done ? ` ${DAY_NAMES[lp.day] ?? ''}` : '';
    // 하루 120 tick 을 09:00~21:00 으로 — 시각은 표시일 뿐 sim 은 tick 만 안다
    const frac = lp && !lp.done ? (lp.tick % TICKS_PER_DAY) / TICKS_PER_DAY : 0;
    const mins = Math.floor(9 * 60 + frac * 12 * 60);
    const clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    // 날씨 이름도 상태줄에 — 칩의 그림만으로는 "지금 무엇"이 안 읽힌다 (레퍼런스 구조)
    const wname = WEATHER_NAME[week.liveWeather() ?? ''];
    hud.setStatus(
      `주 ${lp ? week.week + 1 : week.week}${dayLabel} · ${SEASON_NAME[season] ?? season}` +
        (wname !== undefined ? ` · ${wname}` : '') +
        ` · ${clock}`,
    );
    hud.setCash(week.cash);
    hud.setHeader({
      weather: WEATHER_GLYPH[week.liveWeather() ?? ''] ?? '☀',
      sat: `${Math.round(reputation.value)}%`,
      visitors: `${lastSummary?.visitors ?? 0}명`,
      grade: `${g.grade}등급`,
    });
    if (g.grade !== lastGradeShown) {
      lastGradeShown = g.grade;
      refreshBuildList();
    }
  };

  refreshQuests();
  refreshRisk();
  refreshStaffBtn();
  refreshCaps();
  // 수영 구역 오버레이 (S3) — 구역은 파생이라 서명이 바뀔 때만 다시 그린다
  let swimSig = '';
  const syncSwim = (): void => {
    const zones = h.guests.swimZones();
    const sig = JSON.stringify(zones.map((z) => [z.kind, z.area, z.tiles[0]]));
    if (sig === swimSig) return;
    swimSig = sig;
    h.scene.setSwimZones(zones);
  };
  syncSwim();
  setInterval(() => {
    refreshQuests();
    refreshRisk();
    refreshStaffBtn();
    refreshExamBtn();
    refreshGoal();
    refreshCaps();
    syncSwim();
  }, 1500);

  /*
   * 흐르는 낮 시동 (K39). 배경 탭에서는 rAF 가 서므로 저절로 멈춘다 —
   * "끄면 멈춘다, 방치 진행 없음" (카이로와 같다, 스펙 §1). 복귀 직후 dt 를 잘라
   * 밀린 시간이 몰아서 흐르지 않게 한다 (멈춤이지 빚이 아니다).
   */
  h.scene.setClockOwner('week');
  syncTickPace();
  syncBoats();
  beginWeek();
  let lastRaf = performance.now();
  const rafLoop = (now: number): void => {
    const dt = Math.min(250, now - lastRaf);
    lastRaf = now;
    flowTick(dt);
    requestAnimationFrame(rafLoop);
  };
  requestAnimationFrame(rafLoop);

  Object.assign(h, {
    week,
    report,
    runWeek,
    flow,
    unlocks,
    exam,
    wishes,
    arrivalQueue,
    openWeekCards: nextWeekCards,
    skipForward,
    beginWeek,
    cards,
    cardView,
    staff,
    staffPanel,
    courses,
    coursePanel,
    courseApi: course,
    catalog,
    showcase,
    newGame,
    scenario,
    mapDef,
    priceMult: () => priceMult,
    cardsApi: { triggerCard },
    progress,
    refreshQuests,
    refreshBuildList,
    getLastReport: () => lastReport,
    /**
     * 아직 안 열어 본 결산이 있나 (K47-②).
     *
     * K46 에서는 헤더 배지(N)가 이걸 화면에 그렸다. 배지는 없앴지만 판정은 남긴다 —
     * 열람 경로가 **알림함 행 하나뿐**이라, 그 행이 실제로 결산을 여는지를 이 값이
     * 뒤집히는 것으로 증명할 수 있다.
     *
     * ⚠ **아직 아무도 안 읽는다.** 하네스는 `#kairo-report` 의 `hidden` 으로 재고 있어
     * 이 값은 화면에도 검사에도 소비자가 없다 — 쓰이지 않는 판정은 조용히 썩는다.
     */
    reportUnread: () => lastReport !== null && lastReport.week > reportSeenWeek,
    /**
     * 판 **셋업**용 등급 설정 (K47-③) — `week.earn`·`terrain.paint` 과 같은 급이다.
     *
     * 조준 배치의 커버 검사는 **5등급 토지(96×64)에서만 뜻이 있다.** 1등급 땅은
     * 통째로 화면 중앙이 닿는 범위 안이라 (i+j 최대 115 < 클램프 상한 120) 중앙 고정과
     * 오프셋이 같은 결과를 낸다 — 실측으로 확인했다. 즉 낮은 등급에서 재면 32% 구멍을
     * **재고 있지 않으면서 통과한다.**
     *
     * ⚠ 검사하려는 경로(조준·판정)를 우회하지 않는다. 심사를 통과시키는 것도 결국
     * 이 한 줄인데, 그 길로 가려면 5등급 조건 시설을 다 지어야 해서 검사가 배치
     * 스크립트가 된다 (그때 재는 것은 조준이 아니다).
     */
    setGradeForTest: (n: number) => {
      gradeNo = Math.max(1, Math.min(5, Math.round(n)));
      h.scene.setLand(landRect(currentGrade()));
      refreshBuildList();
      refreshCaps();
    },
    combos: { previewCombos, evaluateCombos },
    quests: { questStatuses, gradeFor, requiredGrade },
    risk: { assessRisk, RISK_NAMES },
    refreshRisk,
    /** 지금 해금된 토지 — 검증이 좌표를 박지 않게 (K36) */
    land: () => landRect(currentGrade()),
    /** 놓아 둔 출입구 (K36-B) — 검증이 읽는다 */
    doors,
    /** 뉴스 티커 (K47-①) — 쌓인 소식 수·띠 글을 검증에 여는 손잡이 (`count`·`lineText`) */
    ticker,
    news,
    /**
     * 음성 대조군 (K47-①). 켜면 라우팅이 통째로 죽어 티커에 아무것도 안 흐른다.
     *
     * ⚠ **코드에 둔다.** 손으로 주입해 확인한 것은 다음 사람에게 안 남는다 —
     * `setRenderFaultForTest` 와 같은 판단이다. 켜고 사건을 일으켜 "정말로 이 경로를
     * 재고 있었나"를 증명하라고 만든 스위치다.
     *
     * ⚠ **하네스가 아직 안 켠다.** 티커 절(`verify-kairo.ts` K47-①)은 사건 전후 텍스트
     * 비교와 라인 강제 원복으로만 대조군을 세운다 — 이 스위치를 쓰는 검사가 붙기 전까지
     * 대조군은 반쪽이다.
     */
    setNewsMutedForTest: (v: boolean) => {
      newsMuted = v;
    },
    /** 누적 방문객 (K47-①) — 마일스톤 판정의 근거. ⚠ 아직 읽는 검사가 없다 */
    visitorsTotal: () => visitorsTotal,
    persist,
  });
  Object.assign(window, {
    __kairo: h,
    __kairoBrush: () => brush,
    __kairoClearBrush: clearBrush,
    __kairoCards: cardView,
  });
  console.log(
    `[카이로] 에셋 ${h.provider.name} (${h.provider.ids.length}장 플레이스홀더) · ` +
      '카메라 줌 1 고정 · 확대는 캔버스 정수 배율',
  );
}

async function main(): Promise<void> {
  const parent = document.getElementById('game');
  if (!parent) throw new Error('#game 컨테이너를 찾지 못했습니다');

  /*
   * 기본은 카이로다. v1(자유 배치·실시간)은 폐기됐지만 `?v1=1` 로 남겨 둔다 —
   * `verify:mobile` 이 아직 그쪽을 검사하고, 지우는 것은 별도 결정이다.
   */
  if (new URLSearchParams(location.search).get('v1') !== '1') {
    await mainKairo(parent);
    return;
  }

  // 에셋: 아틀라스가 있으면 그것을, 없으면 절차적 생성 (계획서 §4)
  const provider = await createAssetProvider();

  // 세이브가 있으면 이어하고, 없으면 새 게임
  const sim = loadFromStorage() ?? new Sim({ seed: DEFAULT_SEED, width: 64, height: 64 });

  let scene: MainScene | undefined;

  const hud = new Hud(document.body, {
    onSpeedChange: (speed) => {
      sim.clock.speed = speed;
    },
    onBeginPlacement: (defId) => scene?.beginPlacement(defId),
    onConfirmPlacement: () => scene?.confirmPlacement(),
    onRotatePlacement: () => scene?.rotatePlacement(),
    onCancelPlacement: () => scene?.cancelPlacement(),
    onBeginCourse: (defId) => scene?.beginCourse(defId),
    onUndoCoursePoint: () => scene?.undoCoursePoint(),
    onChangeCourseVehicles: (d) => scene?.changeCourseVehicles(d),
    onConfirmCourse: () => scene?.confirmCourse(),
    onCancelCourse: () => scene?.cancelCourse(),
  });

  const game = boot({
    parent,
    sim,
    provider,
    onFrame: (info) => hud.update(info),
    onPlacementChange: (state) => hud.showPlacementBar(state),
    onCourseEditChange: (state) => hud.showCourseBar(state),
  });

  game.events.once('ready', () => {
    scene = game.scene.getScene('main') as MainScene;
  });
  // Phaser 3 는 씬이 곧바로 준비되므로 즉시 시도도 해둔다
  scene = game.scene.getScene('main') as MainScene | undefined;

  setInterval(() => saveToStorage(sim), AUTOSAVE_INTERVAL_MS);
  window.addEventListener('pagehide', () => saveToStorage(sim));

  // 개발 중 콘솔에서 만져보기 위한 핸들
  Object.assign(window, {
    __ppaji: {
      sim,
      provider,
      hud,
      get scene() {
        return game.scene.getScene('main');
      },
    },
  });

  console.log(
    `[빠지] 시드 ${sim.seed} · 맵 ${sim.world.width}×${sim.world.height} · ` +
      `에셋 ${provider.name} (${provider.ids.length}종) · 시설 ${sim.facilities.count}개`,
  );
}

/**
 * 서비스 워커 등록 — **배포 빌드에서만.**
 *
 * 개발 중에 켜면 낡은 번들이 캐시에 남아 "고쳤는데 안 바뀐다"가 된다. 이 프로젝트에서
 * 낡은 vite 번들로 검증이 가짜 실패한 적이 있어서, 그 함정을 스스로 만들지 않는다.
 *
 * 실패해도 게임은 돈다 — 오프라인은 부가 기능이지 전제가 아니다.
 */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e: unknown) => {
      console.warn('[빠지] 서비스 워커 등록 실패 — 오프라인은 안 되지만 게임은 돕니다', e);
    });
  });
}

registerServiceWorker();

main().catch((err: unknown) => {
  console.error(err);
  const box = document.createElement('div');
  box.className = 'boot-error';
  const h = document.createElement('h1');
  h.textContent = '실행에 실패했습니다';
  const pre = document.createElement('pre');
  pre.textContent = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  box.append(h, pre);
  document.body.append(box);
});
