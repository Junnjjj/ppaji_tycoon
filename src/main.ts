import './compat.js'; // 다른 무엇보다 먼저 — 스프라이트를 굽기 전에 보정이 끝나야 한다
import './ui/style.css';
import { Game as Sim } from './sim/index.js';
import { createAssetProvider } from './assets/index.js';
import { boot, type MainScene } from './render/index.js';
import { Hud } from './ui/hud.js';
import { loadFromStorage, saveToStorage } from './save/index.js';
// 타입만 — 값은 아래 동적 import 로 온다 (⚠ `bootKairo` 앞뒤 순서 규칙과 무관하게 지워진다)
import type { ComboBreakdown, ReportPrescription } from './ui/kairo-report.js';

const DEFAULT_SEED = 20260811;
const AUTOSAVE_INTERVAL_MS = 30_000;
/** 공유 URL이 실제로 어느 소스에서 시작됐는지 확인하는 읽기 전용 정체. */
const KAIRO_BUILD = Object.freeze({ ...__PPAJI_BUILD__ });

/**
 * 카이로 씬 — **기본**이다 (K13). v1 씬은 `?v1=1` 로만 열린다.
 *
 * K12 에서 세이브가 생긴 뒤에 바꿨다. 순서가 중요했다 — 세이브 없이 기본으로 올리면
 * 폰에서 새로고침 한 번에 판이 전부 날아가고, 그건 이 프로젝트 1순위 목표
 * ("폰에서 돌아가는 것")에 정면으로 어긋난다.
 */
async function mainKairo(parent: HTMLElement): Promise<void> {
  const launchQuery = new URLSearchParams(location.search);
  const hdPixelPilot = launchQuery.get('hd') === '1';
  const hdApprovedFit = hdPixelPilot && launchQuery.get('hdFit') === '1';
  const terrainV2Pilot = hdPixelPilot && launchQuery.get('terrain') === 'v2';
  const terrainV3SourceRequested = launchQuery.get('terrain') === 'v3';
  /** 20종×4방향 런타임 검토. 세이브와 시간 흐름에서 격리한다. */
  const assetReview = launchQuery.get('assetReview') === '1';
  const shoreRadiusRaw = launchQuery.get('shoreRadius');
  const shoreRadius = shoreRadiusRaw === null ? undefined : Number(shoreRadiusRaw);
  const reviewedShoreRadius =
    shoreRadius !== undefined && Number.isFinite(shoreRadius) && shoreRadius >= 0 && shoreRadius <= 1
      ? shoreRadius
      : undefined;
  const { bootKairo } = await import('./render/kairo/boot.js');
  const { GROUND_KINDS } = await import('./sim/kairo/terrain.js');
  const { DoorSet: DoorSetCls } = await import('./sim/kairo/doors.js');
  const { bakeIndoorWalls, paintFloor, paintFloorBlock, doorCandidates, INDOOR_FAIL_MESSAGES } = await import(
    './sim/kairo/indoor.js'
  );
  const { allFacilityDefs, PLACE_FAIL_MESSAGES, guestWalkable } = await import(
    './sim/kairo/placement.js'
  );
  const {
    WeekRunner,
    TICKS_PER_DAY,
    TICKS_PER_WEEK,
    DAY_NAMES,
    forkWeekRngStreams,
    restoreWeekRngStreams,
    snapshotWeekRngStreams,
    summarizeWeek,
  } = await import('./sim/kairo/week.js');
  const { audio } = await import('./audio/index.js');
  const { previewCombos, evaluateCombos, comboEffect } = await import('./sim/kairo/combos.js');
  const { UnlockStore } = await import('./sim/kairo/unlocks.js');
  const { ExamStore, nextGradeDef, scoreExam, examJudgeWeek } = await import('./sim/kairo/exam.js');
  const { KairoExamView, examItemView, paintExamItem, setExamFaultForTest } = await import(
    './ui/kairo-exam.js'
  );
  // 사이드 인증 (P3-E) — 등급 상한을 푸는 유일한 고리가 `effectiveGrade` 다
  const { CertStore, certStatuses, effectiveGrade, CERTS } = await import('./sim/kairo/certs.js');
  const { WishStore, REGULAR_CHARACTERS } = await import('./sim/kairo/wishes.js');
  const { MenuStore, ingredientDef, recipeDef } = await import('./sim/kairo/menu.js');
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
  const { KairoReport, comboBreakdown, NEED_NAME } = await import('./ui/kairo-report.js');
  const { KairoCardView } = await import('./ui/kairo-card.js');
  const { createEventSpriteSource } = await import('./ui/kairo-event-art.js');
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
  /*
   * AI 픽셀아트 아틀라스 (Phase G) — 있으면 하이브리드, 없으면 지금까지와 똑같이
   * 절차 플레이스홀더. ⚠ **여기서** await 한다: `bootKairo` 뒤의 await 는 간헐 부팅
   * 실패가 된 적이 있다 (아래 `Object.assign(h, …)` 위 경고).
   */
  const { createKairoAssetProvider } = await import('./assets/kairo-atlas.js');
  const baseKairoProvider = await createKairoAssetProvider();
  let kairoProvider = baseKairoProvider;
  if (hdPixelPilot) {
    const { createKairoHdPilotProvider } = await import('./assets/kairo-hd-pilot.js');
    if (hdApprovedFit) {
      const [{ setFacilityReviewOverrides }, { setKairoFacilityReviewOverrides }] = await Promise.all([
        import('./sim/kairo/placement.js'),
        import('./assets/kairo-contract.js'),
      ]);
      const approved = {
        icecream: { size: [1, 1] as const, facings: 4 as const },
        cafe: { size: [2, 2] as const, facings: 4 as const },
      };
      setFacilityReviewOverrides(approved);
      setKairoFacilityReviewOverrides(approved);
    }
    kairoProvider = await createKairoHdPilotProvider(kairoProvider, {
      approvedFit: hdApprovedFit,
    });
    if (terrainV2Pilot) {
      const { createKairoTerrainV2PilotProvider } = await import('./assets/kairo-terrain-v2-pilot.js');
      kairoProvider = await createKairoTerrainV2PilotProvider(kairoProvider);
    }
  }
  /*
   * source-v1 지형·물은 라이브 기본값이다. 거절된 macro-shore 8종은 공급자에서
   * 제외하며, 반경 합성도 명시적인 검토 query에서만 켠다. `terrain=v2`는 과거
   * 비교 화면을 보존하기 위한 유일한 예외다.
   */
  if (!terrainV2Pilot) {
    const { createKairoTerrainV3SourceProvider } = await import('./assets/kairo-terrain-v3-source.js');
    kairoProvider = await createKairoTerrainV3SourceProvider(kairoProvider, {
      ...(terrainV3SourceRequested && reviewedShoreRadius !== undefined
        ? { shoreRadius: reviewedShoreRadius }
        : {}),
    });
  }
  const {
    KairoHud,
    createGoalSlots,
    inheritedCourseGoal,
    recommendedActionGoal,
  } = await import('./ui/kairo-hud.js');
  type GoalSlotInput = import('./ui/kairo-hud.js').GoalSlotInput;
  type GoalChip = import('./ui/kairo-hud.js').GoalChip;
  // 건설 상태 머신 (UI v3) — 붓·조준·연속 설치가 여기 하나에 산다
  const { BuildSession } = await import('./ui/kairo-build-flow.js');
  type RepeatToggleView = import('./ui/kairo-hud.js').RepeatToggle;
  const { applyStartKit } = await import('./sim/kairo/startkit.js');
  const { WallGrid: WallGridCls } = await import('./sim/kairo/walls.js');
  const { PlacementGrid: PlacementGridCls } = await import('./sim/kairo/placement.js');
  type HudItem = import('./ui/kairo-hud.js').BuildItem;
  const { KairoTerrain: KairoTerrainCls } = await import('./sim/kairo/terrain.js');
  const { GRID_W: GRID_W_C, GRID_H: GRID_H_C } = await import('./render/kairo/iso.js');
  const { StaffStore, STAFF_ROLES: STAFF_ROLE_LIST } = await import('./sim/kairo/staff.js');
  const { KairoStaffPanel } = await import('./ui/kairo-staff.js');
  // 시설 인스턴스 정보 (K49) — 지도에서 시설을 탭하면 뜬다
  const { KairoFacilityInfo, facilityInfo } = await import('./ui/kairo-facility.js');
  const { KairoMenuLab } = await import('./ui/kairo-menu-lab.js');
  const course = await import('./sim/kairo/course.js');
  const { KairoCoursePanel } = await import('./ui/kairo-course.js');
  const { KairoCatalog, activeComboIds, noteSeen } = await import('./ui/kairo-catalog.js');
  const { KairoShowcase } = await import('./ui/kairo-showcase.js');
  const {
    KairoManagementMenu,
    managementTodayPresentation,
    runManagementAction,
  } = await import('./ui/kairo-management.js');
  type ManagementMenuAction = import('./ui/kairo-management.js').ManagementMenuAction;
  type ManagementSettingsSection = import('./ui/kairo-management.js').ManagementSettingsSection;
  type ManageScreenId = import('./ui/kairo-management.js').ManageScreenId;
  const { certList, questList, regularList, wishList } = await import('./ui/kairo-growth.js');
  const { conditionLine, conditionSubject, REPUTATION_NAME } =
    await import('./ui/kairo-terms.js');
  const { KairoEndingPanel, endingChoiceActions } = await import('./ui/kairo-ending.js');
  const { KairoEventDialog } = await import('./ui/kairo-event-dialog.js');
  const { won } = await import('./ui/money.js');
  const {
    OnboardingStore,
    endingMilestone,
    managementWarnings,
    observeOnboardingBuild,
    observeOnboardingMenu,
    onboardingRecommendation,
    todayRecommendation,
  } = await import('./sim/kairo/meta.js');
  type OnboardingEvent = import('./sim/kairo/meta.js').OnboardingEvent;
  type ManagementAction = import('./sim/kairo/meta.js').ManagementAction;
  const { loadCareerProfile, saveCareerProfile } = await import('./save/kairo-career.js');
  const { panelHost } = await import('./ui/panels.js');
  const { Rng: RngCls } = await import('./sim/rng.js');
  const { loadKairoFromStorage, saveKairoToStorage, clearKairoStorage } = await import(
    './save/kairo.js'
  );
  const { facilityDef, canRotate, nextFacing } = await import('./sim/kairo/placement.js');
  const { installFourDirectionAssetReview } = await import('./review/kairo-asset-review.js');

  /**
   * 세이브를 먼저 읽는다 — 지형·벽·시설을 씬에 넘겨야 하므로 부팅보다 앞이어야 한다.
   * 없으면 시드에서 새로 만든다 (`bootKairo` 기본 동작).
   */
  // 리뷰 URL은 사용자 판을 읽지도, 뒤에서 덮어쓰지도 않는 일회성 전시 판이다.
  const saved = assetReview ? null : loadKairoFromStorage();
  const career = loadCareerProfile();
  const KAIRO_SEED = saved?.seed ?? 20260818;
  /**
   * 맵 타입과 시나리오 (§4.5). 세이브에 없으면 기본값 —
   * 새 판은 `KairoNewGame` 이 세이브를 지우고 이 값을 심는다.
   */
  /*
   * 새 판은 URL 로 넘어온다 (`?map=…&scenario=…`) — 세이브를 지운 직후라 저장값이 없다.
   * 세이브가 있으면 저장값이 이긴다: 진행 중인 판의 맵을 URL 로 바꿀 수 있으면 안 된다.
   */
  const q = launchQuery;
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
    provider: kairoProvider,
    // 승인된 C안: 논리 32×16 타일은 그대로, 기본 백버퍼만 2×로 렌더한다.
    // 아틀라스는 프레임별 1×/2× 밀도를 기록하므로 레거시와 새 시설을 함께 그릴 수 있다.
    renderDensity: 2 as const,
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
        `FPS ${s.fps}  S=${s.upscale}  D=${s.renderDensity}  버퍼 ${s.bufferW}×${s.bufferH}\n` +
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
      cancelFacilityInfo(); // 새 탭이 왔으면 먼저 예약된 정보는 무효다
      /*
       * 코스 편집 중에는 지도 탭이 죽는다 (K45) — 편집기가 지도 탭을 잔교·핸들로 쓰므로
       * 같은 탭이 붓으로도 흐르면 이중 반응이 된다. openCourse 가 붓을 내려놓지만,
       * 편집 중에 시트를 다시 열어 붓을 집는 경로가 남아 있어 여기서도 막는다.
       *
       * ⚠ 이 검사는 **`!brush` 조기 반환보다 위**여야 한다 (K49). 아래로 내려가 있던
       * 동안에는 "붓 없음"이 먼저 걸려서 코스 편집 중의 탭이 이 문을 아예 안 지났다 —
       * 붓이 없을 때 하는 일이 `console.log` 뿐이라 티가 안 났을 뿐이다. 시설 정보가
       * 그 자리에 들어오면서 곧바로 코스 편집을 덮는 버그가 된다.
       */
      if (coursePanel.visible) return;
      if (!build.brush) {
        /*
         * ⚠ **이 줄을 지우지 말 것.** `verify-kairo` 의 "탭한 타일이 정확히 해석된다"가
         * 이 콘솔 줄로 해석 결과를 읽는다 (`tapLog`) — 반 타일이 밀리면 2×2 배치가
         * 통째로 거절되는데, 그걸 잡는 유일한 검사다.
         */
        console.log(`[카이로] 탭 타일 (${i}, ${j}) — ${h.terrain.kindAt(i, j) ?? '?'}`);
        const courseHandle = course.courseAtTile(courses.all, { x: i, y: j });
        if (courseHandle !== null) {
          openCourse(courseHandle);
          return;
        }
        /*
         * ★ 붓이 없을 때만 **시설 정보**다 (K49). 붓을 든 상태에서 정보가 뜨면
         * 배치 흐름이 끊긴다 — 그때의 탭은 조준 이동이고, 그 뜻을 뺏으면 안 된다.
         * 빈 칸이면 지금까지와 똑같이 아무 일도 안 일어난다.
         */
        const hit = h.placement.at(i, j);
        if (hit) scheduleFacilityInfo(hit.handle);
        return;
      }
      /*
       * 이동 1단계 (K42) — **탭 유지.** 옮길 시설을 지목하는 것이지 자리를 정하는 게
       * 아니다. 2단계(목적지)는 아래 `aimMove` 로 넘어가 조준 + 확정을 탄다.
       */
      if (build.brush === 'move' && build.move === null) {
        if (!exam.toolsUnlocked) {
          toast('이동은 첫 심사 통과의 보상입니다');
          return;
        }
        const hit = h.placement.at(i, j);
        if (!hit) {
          toast('옮길 시설을 탭하세요');
          return;
        }
        beginMove(hit.handle);
        return;
      }
      /*
       * 출입구 (K36-B) — **칸을 탭한다.** 경계를 폰에서 정확히 찍는 것은 무리다.
       * 그 칸의 쓸 수 있는 면 중 하나에 문이 나고, 다시 탭하면 다음 면으로 돌아간다.
       * 한 바퀴 돌면 없앤다. 후보 판정은 `doorCandidates` 하나를 sim 과 공유한다 —
       * 갈라지면 UI 가 놓으라고 해 놓고 굽기가 무시하는 상태가 된다.
       */
      if (build.brush === 'door') {
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

  /**
   * 이동 1단계 — 이 시설을 붓에 물린다 (K42).
   *
   * ⚠ 입구가 **둘**이다: 이동 붓으로 시설을 탭하거나, 시설 정보 화면의 `이동` 버튼
   * (K49). 두 곳에 같은 다섯 줄을 두면 언젠가 한쪽만 고쳐진다 — 특히 `startAim()` 을
   * 빠뜨리면 붓은 물렸는데 고스트가 안 떠서 "눌러도 아무 일이 없다"가 된다.
   */
  const beginMove = (handle: number): boolean => {
    const item = h.placement.all().find((it) => it.handle === handle);
    if (!item) return false;
    const def = facilityDef(item.defId);
    /*
     * 세션이 붓·선택·조준을 한 번에 잡는다 (UI v3) — `beginMove` 가 `startAim()` 을
     * 빠뜨려 "붓은 물렸는데 고스트가 안 뜬다"가 되던 자리가 이제 구조적으로 없다.
     */
    const facing = item.facing ?? 0;
    build.beginMove(
      { handle, defId: item.defId, i: item.i, j: item.j, originalFacing: facing, facing },
      `이동: ${def?.name ?? item.defId}`,
    );
    toast(
      `${def?.name ?? item.defId} — 지도를 움직여 자리를 맞추세요 ` +
        `(${Math.round(Math.floor((def?.cost ?? 0) * 0.1) / 10000)}만)`,
    );
    return true;
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
    build.setAim(-1, -1);
    for (let pass = 0; pass < 2; pass++) {
      syncReticleInset();
      const r = h.scene.reticleTile();
      const i = Math.max(0, Math.min(GRID_W_C - 1, r.i));
      const j = Math.max(0, Math.min(GRID_H_C - 1, r.j));
      const cur = build.aim;
      if (cur && cur.i === i && cur.j === j) break;
      build.setAim(i, j);
      h.scene.beginAim(i, j);
      refreshAim();
    }
  };

  /**
   * 조준을 이 칸으로 옮긴다 (성긴 조준 = 탭 · 하네스의 `tapTile`).
   * 방향은 유지한다 — 회전해 둔 것이 탭 한 번에 풀리면 ↻ 가 소용없다.
   */
  const aimAt = (i: number, j: number): void => {
    build.aimTo(i, j);
    h.scene.beginAim(i, j);
    refreshAim();
  };

  /**
   * 조준 종료 — 고스트·표식·확정 바·투시를 한꺼번에 내린다.
   *
   * ⚠ **세션의 `closeAim` 효과다.** 여기서 붓·조준 상태를 지우지 않는다 —
   * 상태를 지우는 곳은 `BuildSession.end()` **하나**여야 정리가 갈라지지 않는다
   * (`src/ui/kairo-build-flow.ts` 머리말: 붓마다 남는 것이 달랐던 것이 원버그다).
   */
  const closeAim = (): void => {
    h.scene.endAim();
    h.scene.setGhost(null);
    hud.hideConfirm();
  };

  /**
   * 지금 조준 칸을 다시 판정해 고스트·표식·확정 바를 맞춘다.
   * **칸이 바뀐 때·회전한 때·연속 설치의 다음 판정**에만 부른다 (위 비용 주석).
   */
  const refreshAim = (): void => {
    const at = build.aim;
    const brush = build.brush;
    if (!at || brush === null) return;
    if (brush === 'facility') aimFacility(at.i, at.j);
    else if (brush === 'move') aimMove(at.i, at.j);
    else if (brush === 'erase') aimErase(at.i, at.j);
    else aimGround(at.i, at.j);
    // 라벨이 두 줄이 되면 바가 높아진다 — 잰 값을 매번 갱신한다 (상수로 박지 말 것)
    syncReticleInset();
  };

  /**
   * 조준 중 확정 바의 취소 — **세션이 끝난다** (UI v3).
   *
   * ⚠ 예전엔 붓을 남겼다. 그래서 취소한 뒤에도 지도 탭이 다시 조준을 열었고, 화면에는
   * 아무 모드 표시가 없어 "끝난 줄 알았는데 안 끝난" 상태가 됐다. 지금은 취소가 곧
   * 종료이고, 같은 것을 또 놓으려면 건설 시트에서 다시 고른다 (계획 §1.5 전이표).
   */
  const cancelAim = (): void => build.cancel();

  /**
   * 연속 설치 토글의 화면 계약 — 못 켜는 붓(이동)에서는 **토글 자체를 안 만든다.**
   * `rotate` 와 같은 조건부 스프레드다 (`exactOptionalPropertyTypes`).
   */
  const repeatToggle = (): { repeat: RepeatToggleView } | Record<string, never> =>
    build.canRepeat
      ? {
          repeat: {
            on: build.repeat,
            label: build.repeatLabel,
            toggle: () => {
              build.setRepeat(!build.repeat);
              refreshAim(); // 바의 라벨·토글 상태를 같은 판정으로 다시 그린다
            },
          },
        }
      : {};

  /**
   * 성공 영수증 (계획 §1.5-8) — **무엇을 · 얼마에 · 남은 돈**을 한 줄로.
   * 예전엔 `−12만` 뿐이라 무엇을 놓았는지도, 얼마가 남았는지도 안 말했다.
   */
  const receiptText = (what: string, delta: number): string => {
    const money = delta === 0 ? '무료' : delta < 0 ? won(delta) : `${won(delta, { signed: true })} 환급`;
    return `${what} · ${money} · 잔액 ${won(week.cash)}`;
  };

  /** 시설 — 조준 + ↻ + 확정. 손가락 가림이 정확히 이 케이스다 */
  const aimFacility = (i: number, j: number): void => {
    const defId = build.facilityId;
    const def = facilityDef(defId);
    const cost = def?.cost ?? 0;
    const facing0 = build.aim?.facing ?? 0;
    const chk = h.placement.check(h.terrain, h.walls, GATE, defId, i, j, {
      ...placeOpts(),
      facing: facing0,
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
    h.scene.setGhost(defId, i, j, ok, facing0);
    /*
     * 발자국은 회전을 탄다 — 산수의 정본은 `PlacementGrid.sizeOf` **하나**다 (K53).
     * 예전엔 여기·이동·철거·시트·씬 두 곳에 `facing === 1 ? [d,w] : [w,d]` 가 **여섯 벌**
     * 이었는데, 4방향에서는 `facing % 2` 로 바뀌므로 각자 고치면 반드시 한 곳이 남는다.
     */
    const [fw, fd] = def ? PlacementGridCls.sizeOf(def, facing0) : [1, 1];
    h.scene.setReticleMark(i, j, ok, fw, fd);
    /*
     * 회전 버튼을 띄우나 — **데이터가 정한다** (`canRotate`, 불변식 3).
     * 2방향은 예전 그대로 "비정사각만"이고, `facings: 4` 인 시설은 정사각이어도
     * 그림이 네 장이라 그때 처음으로 정사각에서 회전이 살아난다 (매점·대여소 등).
     */
    const rotatable = def !== undefined && canRotate(def);
    hud.showConfirm(
      !chk.ok
        ? PLACE_FAIL_MESSAGES[chk.fail ?? 'unknown-def']
        : poor
          ? `돈이 부족합니다 — ${won(cost)} 필요 (현재 ${won(week.cash)})`
          : `${def?.name ?? defId} · ${won(cost)}`,
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
                const at = build.aim;
                if (!at || !def) return;
                // 2방향은 0↔1, 4방향은 0→1→2→3→0 — 몇 방향인지는 데이터가 안다
                build.setFacing(nextFacing(def, at.facing));
                refreshAim();
              },
            }
          : {}),
        ...repeatToggle(),
        confirm: () => {
          const facing = build.aim?.facing ?? 0;
          const r = h.placement.place(h.terrain, h.walls, GATE, defId, i, j, {
            ...placeOpts(),
            facing,
          });
          if (!r.ok || !r.placed) {
            toast(PLACE_FAIL_MESSAGES[r.fail ?? 'unknown-def']);
            refreshAim(); // 바를 되살린다 — 실패로 조준이 사라지면 왜 안 됐는지가 사라진다
            return;
          }
          week.spend(cost, 'building');
          h.scene.refreshFacility(r.placed.handle);
          h.guests.invalidate();
          refreshBuildList(); // 방이 찼으면 다음 시설이 잠겨야 한다 (K31)
          /*
           * 채널 분리 (K47-①). 예전엔 한 토스트에 둘이 섞여 있었다:
           *   `−12만 · 콤보 3개 발동`
           * 앞은 **내 행동의 대답**(토스트)이고 뒤는 **일어난 일**(뉴스)이다.
           */
          const receipt = receiptText(`${def?.name ?? defId} 설치 완료`, -cost);
          pushComboNews();
          if (observeOnboardingBuild(onboarding, def)) refreshManagement();
          persist();
          /*
           * 1회 설치가 기본이다 (UI v3). 세션이 붓·조준·고스트·레티클·확정 콜백·투시를
           * **원자적으로** 지운다 — 연속 설치를 켜 뒀을 때만 같은 붓으로 다시 겨눈다.
           */
          build.finish(receipt);
        },
      },
      {
        kind: 'facility',
        mode: build.modeLabel,
        name: def?.name ?? defId,
        cost: won(cost),
        result: !chk.ok
          ? PLACE_FAIL_MESSAGES[chk.fail ?? 'unknown-def']
          : poor
            ? '돈이 부족합니다'
            : '배치 가능',
        ...(def?.sprite !== undefined ? { sprite: def.sprite } : {}),
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
    const sel = build.move;
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
      // 이동 미리보기에서 방향을 바꿔도 원본은 확정 전까지 그대로 둔다.
      facing: sel.originalFacing,
    });
    const oldHandle = sel.handle;
    // 프로브가 새 handle 을 만들면 세션의 선택도 같이 옮긴다 (정본은 하나다)
    if (restored.ok && restored.placed) build.retagMove(restored.placed.handle);
    h.scene.refreshFacility(oldHandle);
    h.scene.refreshFacility(sel.handle);
    const ok = chk.ok && fee <= week.cash;
    h.scene.setGhost(sel.defId, i, j, ok, sel.facing);
    const [fw, fd] = def ? PlacementGridCls.sizeOf(def, sel.facing) : [1, 1];
    h.scene.setReticleMark(i, j, ok, fw, fd);
    hud.showConfirm(
      chk.ok
        ? `이동: ${def?.name ?? sel.defId} · ${won(fee)}`
        : PLACE_FAIL_MESSAGES[chk.fail ?? 'unknown-def'],
      ok,
      {
        cancel: cancelAim,
        ...(def && canRotate(def)
          ? {
              rotate: () => {
                /*
                 * 이미 놓인 시설도 새 배치와 같은 방향 순서를 쓴다. 선택 방향은 고스트에만
                 * 반영하고, 원본은 `originalFacing` 으로 복원한다 — 취소가 회전 확정이 되면
                 * 안 된다.
                 */
                const move = build.move;
                if (!move) return;
                build.setMoveFacing(nextFacing(def, move.facing));
                refreshAim();
              },
            }
          : {}),
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
              facing: sel.originalFacing,
            });
            const gone = sel.handle;
            if (rr.ok && rr.placed) build.retagMove(rr.placed.handle);
            h.scene.refreshFacility(gone);
            h.scene.refreshFacility(sel.handle);
            toast(PLACE_FAIL_MESSAGES[r.fail ?? 'unknown-def']);
            refreshAim();
            return;
          }
          week.spend(fee);
          const gone = sel.handle;
          h.scene.refreshFacility(gone);
          h.scene.refreshFacility(r.placed.handle);
          h.guests.invalidate();
          audio.play('sfx/place');
          const receipt = receiptText(`${def?.name ?? sel.defId} 이동 완료`, -fee);
          persist();
          // 옮길 시설을 다시 고르는 것부터가 다음 이동이다 — 이동은 연속을 못 켠다
          build.finish(receipt);
        },
      },
      {
        kind: 'move',
        mode: build.modeLabel,
        name: `이동: ${def?.name ?? sel.defId}`,
        cost: won(fee),
        result: !chk.ok
          ? PLACE_FAIL_MESSAGES[chk.fail ?? 'unknown-def']
          : fee > week.cash
            ? '돈이 부족합니다'
            : '이동 가능',
        ...(def?.sprite !== undefined ? { sprite: def.sprite } : {}),
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
    const [ew, ed] = hit && eDef ? PlacementGridCls.sizeOf(eDef, hit.facing ?? 0) : [1, 1];
    h.scene.setReticleMark(hit ? hit.i : i, hit ? hit.j : j, ok, ew, ed);
    hud.showConfirm(
      hit
        ? `철거: ${def?.name ?? hit.defId}` + (back > 0 ? ` · ${won(back, { signed: true })} 환급` : '')
        : floorErasable
          ? '철거: 바닥을 잔디로'
          : '지울 것이 없습니다',
      ok,
      {
        cancel: cancelAim,
        ...repeatToggle(),
        confirm: () => {
          // 확정이 눌린 이상 지울 것은 있다 (`ok` 가 아니면 버튼이 죽어 있다) — 그래도
          // 빈 영수증으로 끝나지 않게 기본 문장을 둔다
          let receipt = '철거 완료';
          if (hit) {
            h.placement.remove(hit.handle);
            h.scene.refreshFacility(hit.handle);
            h.guests.invalidate();
            refreshBuildList(); // 자리가 비었으면 잠금이 풀려야 한다 (K31)
            if (back > 0) week.earn(back);
            receipt = receiptText(`${def?.name ?? hit.defId} 철거 완료`, back);
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
            receipt = receiptText('바닥 철거 완료 — 잔디로', 0);
            persist();
          }
          /*
           * 1회 철거가 기본이다 (UI v3). 예전엔 여기서 `refreshAim()` 으로 바를
           * 되살려 **연속 철거가 기본**이었다 — 되돌릴 수 없는 행동이 반복 상태로
           * 남아 있는 것이 가장 위험한 조합이었다.
           */
          build.finish(receipt);
        },
      },
      {
        kind: 'erase',
        mode: build.modeLabel,
        name: hit ? `철거: ${def?.name ?? hit.defId}` : '바닥 철거',
        cost: back > 0 ? `무료 · ${won(back, { signed: true })} 환급` : '무료',
        result: ok ? '철거 가능' : '지울 것이 없습니다',
        ...(def?.sprite !== undefined ? { sprite: def.sprite } : {}),
      },
    );
  };

  /**
   * 바닥·건물 블록 — 조준 + 확정, 그리고 **확정 한 번으로 끝난다** (UI v3).
   * 길을 길게 까는 편의는 명시적 `연속 설치` 토글로 남는다 (계획 §4: 편의를 없애지 않는다).
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
    const [kindId, sizeStr] = (build.brush ?? '').split('@');
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
            ? `돈이 부족합니다 — ${won(cost)} 필요 (현재 ${won(week.cash)})`
            : `${kind.name}${n > 1 ? ` ${n}×${n}` : ''} · ${willChange}칸 · ${won(cost)}`,
      ok,
      {
        cancel: cancelAim,
        ...repeatToggle(),
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
          let receipt = `${kind.name} — 바뀐 칸이 없습니다`;
          if (painted.changed > 0) {
            if (kind.cost > 0) week.spend(kind.cost * painted.changed, 'building');
            for (let dj = 0; dj < n; dj++) {
              for (let di = 0; di < n; di++) h.scene.refreshTile(oi + di, oj + dj);
            }
            h.scene.refreshAllWalls();
            h.guests.invalidate(); // 통행 가능성과 실내가 바뀐다
            // 방이 넓어졌으면 "자리 없음" 잠금이 풀려야 한다 (K31)
            refreshBuildList();
            receipt = receiptText(
              `${kind.name} ${painted.changed}칸 완료`,
              -kind.cost * painted.changed,
            );
            persist();
          }
          /*
           * ⚠ 여기가 **원버그의 자리**다 (UI v3). 예전에는 확정 직후 `refreshAim()` 로
           * 바를 되살려 두는 것이 기본이었고 ("길을 까는 것이 가장 자주 하는 동작"이라는
           * 이유였다), 그래서 확정 한 번 뒤 조준이 남아 다음 칸이 즉시 활성화됐다
           * (2026-08-26 실측: 석재 보도 한 번에 현금 2회 차감). 길 깔기의 편의는
           * 없애지 않고 **명시적 `연속 설치` 토글**로 보존한다 (계획 §4).
           */
          build.finish(receipt);
        },
      },
      {
        kind: 'ground',
        mode: build.modeLabel,
        name: `${kind.name}${n > 1 ? ` ${n}×${n}` : ''}`,
        cost: won(cost),
        result:
          why !== null
            ? why
            : willChange === 0
              ? '이미 깔려 있습니다'
              : poor
                ? '돈이 부족합니다'
                : '배치 가능',
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
   * 건설 세션 (UI v3) — 붓·시설 ID·이동 선택·조준·연속 설치가 **한 상태**다.
   *
   * 붓은 **건설 시트**에서 고른다 (K28). 예전에는 하단에 바닥 붓 바가 상시로 깔려 있고
   * 시설은 73종 `<select>` 드롭다운이었다. 카이로에는 드롭다운이 없다 — 아이콘 격자다.
   *
   * 조준 자리(K47-③)는 여전히 **배치 좌표의 정본**이고 화면 레티클은 그 표시일 뿐이다.
   * K45 까지 `lastFacilityTap` + `ghostFacing` 둘로 흩어져 있던 것을 K47-③ 이 한
   * 덩어리로 모았고, UI v3 이 붓·이동 선택까지 같은 상자에 넣었다 — 정리 코드가
   * 호출부마다 복제되던 것이 "성공 뒤 무엇이 남는가"를 붓마다 다르게 만든 원인이다
   * (`src/ui/kairo-build-flow.ts` 머리말).
   */
  const build = new BuildSession({
    // 붓 라벨의 정본은 티커다 (K47-①) — 확정 바의 모드 줄은 같은 문장을 크게 쓴다
    label: (text) => ticker.setBrush(text),
    openAim: () => startAim(),
    reaim: () => refreshAim(),
    closeAim: () => closeAim(),
    // 내 행동의 대답 (K47-① 채널 계약) — 무엇을 · 얼마에 · 남은 돈
    receipt: (text) => toast(text, 'ok'),
  });

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

  /** 메뉴를 열 때만 Today/경고를 다시 파생한다. 조립 전 호출은 안전한 no-op이다. */
  let refreshManagement = (): void => undefined;
  /** 메뉴 라우터를 인덱스로 되돌린다 — 조립 전 호출은 안전한 no-op 이다 */
  let resetManagementScreen = (): void => undefined;
  /**
   * 홈에서 뺀 중·장기 목표를 메뉴에 넘기는 late-bound 경계 (UI v3).
   * `refreshGoal` 이 경영 메뉴 조립보다 먼저 한 번 도는 것은 그대로다.
   */
  let setMenuGoals = (_chips: readonly GoalChip[]): void => undefined;
  const hud = new KairoHud(document.body, {
    // 붓 라벨의 정본은 티커다 (K47-①) — 하단 바는 누르는 곳, 읽는 것은 티커
    onBrush: (label) => ticker.setBrush(label),
    /*
     * 홈 입력층은 셋(목표·티커·하단 바)이고 소유권은 한 값이다 (UI v3, 계획 §1.2).
     * HUD 가 목표·바를 직접 내리고, HUD 밖에 사는 티커만 이 콜백으로 같은 값을 받는다.
     */
    onSurface: (_surface, own) => ticker.setInputOwned(own.ticker),
    // 홈은 현재 행동 한 줄만 읽는다 — 중·장기는 메뉴의 `목표` 절로 간다 (계획 §1.1)
    onMenuGoals: (chips) => setMenuGoals(chips),
    /*
     * 메뉴를 여는 순간 목록을 다시 그린다 (P3-E). 인증 목록은 시트가 닫혀 있으면
     * 안 그리므로(아래 `refreshQuests`), 여는 순간이 유일한 갱신 시점이다.
     */
    onSheetOpen: (which) => {
      if (which === 'menu') {
        refreshQuests();
        refreshManagement();
        /*
         * 메뉴는 **언제나 인덱스에서 시작한다.** 지난번에 들어갔던 목적지에서 열리면
         * "여기가 어디였지"가 되고, `‹ 뒤로` 가 나타난 이유도 안 읽힌다.
         * ⚠ `openManageScreen` 은 이 뒤에 자기 화면으로 다시 보내므로 충돌하지 않는다.
         */
        resetManagementScreen();
      }
    },
    onPick: (it: HudItem) => {
      // ⚠ 예약된 시설 정보도 버린다 — 안 버리면 붓을 고른 직후 정보 시트가 튀어나온다
      cancelFacilityInfo();
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
          // 못 짓는 것을 고르면 세션은 시작조차 안 한다 (옛 조준이 남지 않게 통째로 끝낸다)
          build.abandon();
          return;
        }
      }
      /*
       * 붓을 바꾸면 진행 중이던 배치는 여기서 끝난다 (`pick` 이 먼저 `end()` 한다) —
       * 안 그러면 확정 바가 옛 시설을 가리킨 채 새 붓이 물린다.
       *
       * 고르는 즉시 **고스트가 화면에 뜬다** (K47-③) — 이것이 조준 배치의 시작점이다.
       * 출입구와 이동은 배치가 아니라 대상 지정이라 탭으로 남는다 (세션이 안다).
       */
      if (it.kind === 'facility') {
        build.pick('facility', it.name, { facilityId: it.id });
      } else {
        build.pick(it.kind === 'erase' ? 'erase' : it.id, it.kind === 'erase' ? '철거' : it.name);
      }
    },
    // 카드 썸네일 — 게임과 같은 그림을 같은 계약 ID 로 (제공자가 곧 정본이다)
    thumbFor: (sid: string) => (h.provider.has(sid) ? h.provider.get(sid) : null),
    /*
     * 코스 탭 — 패널은 `coursePanel` 이 소유한다. `h` 와 마찬가지로 아래에서 만들어지므로
     * 함수로 감싸 지연 참조한다 (TDZ 사고를 여러 번 겪었다).
     */
    onCourse: () => openCourse(),
  });

  /*
   * ★ 화면을 뺏기면 건설 세션도 끝난다 (UI v3, 계획 §1.2).
   *
   * 시트(메뉴·건설)는 `hud.toggle` 이 `cancelConfirm()` 으로 끊고 있었지만, 그 길은
   * **확정 바가 떠 있을 때만** 지난다. 출입구·이동 1단계처럼 바가 없는 붓은 시트를 열어도
   * 그대로 남았고, 시설 정보·결산·코스처럼 `PanelHost` 로만 열리는 화면은 아예 안 지났다
   * (`openFacilityInfo` 가 손으로 두 줄을 적어 두고 있던 이유가 그것이다).
   *
   * 그래서 소유권 경계 하나에 건다 — 어떤 패널이 열리든 세션은 여기서 끝난다.
   * ⚠ `hud` 뒤에 등록하는 것이 규칙이다: `abandon()` 이 `hud.hideConfirm()` 을 타므로
   * 그 전에 걸면 첫 패널이 TDZ 를 건드린다 (이 파일이 여러 번 겪은 사고).
   */
  panelHost.onChange((open) => {
    if (open) build.abandon();
  });

  /** 코스 편집 열기 — 아래에서 패널이 만들어진 뒤에 실제로 불린다 */
  let openCourse = (_handle?: number): void => {
    /* 패널이 아직 없다 — 시트를 눌러도 아무 일도 안 일어나는 편이 낫다 */
  };

  /**
   * 시설 정보 열기 (K49) — 지도 탭이 부른다.
   *
   * ⚠ `openCourse` 와 같은 지연 참조다. 실체는 경영 시트·심사 상태가 다 만들어진 **뒤**에
   * 꽂힌다 (개선 입구가 경영 시트를 열고, 이동 잠금이 `exam.toolsUnlocked` 를 본다).
   * `const` 로 아래에 두고 위에서 부르면 첫 프레임이 TDZ 를 건드린다 — 이 파일이
   * `bootKairo` 주석에서 두 번 경고하는 바로 그 사고다.
   */
  let openFacilityInfo = (_handle: number): void => {
    /* 패널이 아직 없다 — 탭해도 아무 일도 안 일어나는 편이 낫다 */
  };
  let openMenuLab = (_handle: number): void => {
    /* Phase 3 패널이 만들어지기 전의 안전한 지연 참조. */
  };

  /**
   * ⚠ **더블탭 확대와 같은 탭을 나눠 갖는다** (K49). 씬은 320ms 안의 두 번째 탭을
   * 확대로 쓰는데, **첫 탭은 그대로 `onTapTile` 로 올라온다** — 즉 정보를 즉시 열면
   * 시트가 두 번째 탭 자리를 덮어 확대가 안 걸린다 (실측: 시트 상단 y=378, 탭 지점 426
   * → 둘째 탭을 DIV 가 먹었다).
   *
   * 그래서 **한 박자 기다렸다** 연다. 그 사이에 확대 배율이 바뀌었으면 두 번째 탭은
   * 확대였다는 뜻이므로 정보를 아예 안 연다 — 손가락이 원한 것은 확대였다.
   * iOS 가 탭/더블탭을 가르는 방식과 같고, 붓을 든 경로(배치)는 **지연 없이** 그대로다.
   */
  const DOUBLE_TAP_MS = 320; // ⚠ `KairoScene` 의 더블탭 창과 같은 값이어야 한다
  let infoTimer = 0;
  const cancelFacilityInfo = (): void => {
    window.clearTimeout(infoTimer);
  };
  const scheduleFacilityInfo = (handle: number): void => {
    cancelFacilityInfo();
    const upscaleAtTap = h.scene.upscale;
    infoTimer = window.setTimeout(() => {
      if (h.scene.upscale !== upscaleAtTap) return; // 두 번째 탭은 확대였다
      openFacilityInfo(handle);
    }, DOUBLE_TAP_MS);
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
        cost: FLOOR_COST * n * n,
        role: '확장',
        sub: '실내 넓어짐',
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
        cost: 0,
        role: '동선',
        sub: '실내 칸을 탭 · 다시 탭하면 옮김',
      },
      {
        kind: 'erase' as const,
        tab: 'building' as const,
        id: 'erase',
        name: '철거',
        cost: 0,
        role: '정리',
        sub: '잔디로',
      },
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
          cost: k.cost * n * n,
          role: '통행',
          sub: '손님 통행',
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
        cost: k.cost,
        role: '바닥',
        sub: '손님이 못 지나감',
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
            cost: POOL_COST * n * n,
            role: '수영',
            sub: '4칸부터 구역',
          }))
        : []),
      {
        kind: 'erase' as const,
        tab: 'ground' as const,
        id: 'erase',
        name: '철거',
        cost: 0,
        role: '정리',
        sub: '잔디로',
      },
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
              ? '실내 빈자리 없음'
              : null;
          return {
            kind: 'facility' as const,
            tab: 'facility' as const,
            id: d.id,
            name: d.name,
            cost: d.cost,
            role: NEED_NAME[d.need ?? 'service'],
            sub: `${d.size[0]}×${d.size[1]} · 정원 ${d.capacity}`,
            group: ZONE_NAME[d.layer] ?? d.layer,
            sprite: d.sprite,
            ...(locked ? { locked, unlock: '건설 ▸ 건물에서 바닥을 넓히세요' } : {}),
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
              cost: 0,
              costLabel: '건설비 10%',
              role: '이동',
              sub: '시설 위치 다듬기',
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
                  cost: d.cost,
                  role: NEED_NAME[d.need ?? 'service'],
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
          cost: d.cost,
          role: NEED_NAME[d.need ?? 'service'],
          teaser: `${grade + 1}등급에 열림`,
          sprite: d.sprite,
        })),
    ];
    hud.setBuildItems(items);
  };

  /** 붓을 놓는다 — 하네스가 `__kairoBrush()` 로 확인한다 */
  const clearBrush = (): void => build.reset();

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
    if (!build.aim) return;
    build.aimTo(i, j);
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
    aim: () => (build.aim ? { ...build.aim } : null),
    sim: { bakeIndoorWalls, paintFloor, INDOOR_FAIL_MESSAGES, guestWalkable },
    simDefs: Object.fromEntries(allFacilityDefs().map((d) => [d.id, d])),
  });
  /**
   * 흐르는 낮 — 지도가 보이는 동안 rAF가 200ms 박자의 tick을 소비하고,
   * 840 tick이 차면 결산→카드→다음 주 순서로 넘어간다. 수동 주 스킵·주간 압축
   * 리플레이는 K39·K47-②에서 제거됐고, 4초 리플레이는 코스 시험 운행에만 남는다.
   */
  const progress = saved ? saved.progress : new ProgressStore();
  const onboarding = OnboardingStore.fromSnapshot(saved?.onboarding);
  // 사건 해금 집합 (K41) — 의뢰 보상으로 열린 시설. 등급에서 다시 만들 수 없는 상태다
  const unlocks = UnlockStore.fromSnapshot(saved?.unlocks);
  // 심사 (K42) — 승급은 응시하는 시험이다. 신청 대기·통과 횟수가 상태다
  const exam = ExamStore.fromSnapshot(saved?.exam);
  // 소원 체인 (K43) — 인물·EXP·열린 소원이 상태다
  const wishes = WishStore.fromSnapshot(saved?.wishes);
  const menus = MenuStore.fromSnapshot(saved?.menus);
  h.guests.setMenuStore(menus);
  /*
   * 사이드 인증 (P3-E) — 등급 사다리 **옆**의 병렬 목표. 획득분이 `maxGuests`·
   * `permitArea` 를 올린다. 이 저장소에서 후반 공백의 뿌리였던 등급 상한을 푸는
   * 유일한 고리이고, 그 가산은 `currentGrade()` **한 곳**으로만 들어온다.
   */
  const certs = CertStore.fromSnapshot(saved?.certs);
  /** 이미 "곧 딴다"를 알린 인증 — 매주 같은 뉴스가 흐르면 티커가 도배된다 */
  const certNearShown = new Set<string>();
  const week = new WeekRunner(h.terrain, h.placement, h.guests);
  runner = week; // 프레임이 이제부터 주차·현금을 읽을 수 있다
  /*
   * 수입 사건 → 지도 위 `+₩N` (K48). sim 은 평문 데이터만 내보내고 (불변식 1),
   * 그리는 것은 씬의 FX 등록부다. **관찰자를 붙이는 곳은 여기 하나** — 헤드리스
   * 밸런싱에는 안 붙는다 (손님 전수 스캔이 하나 더 붙는다).
   */
  week.setIncomeObserver((events) => h.scene.pushIncome(events));
  const report = new KairoReport(document.body);
  /** 리포트 처방이 여는 실제 운영 표면. 하단 패널들이 만들어진 뒤 실체를 연결한다. */
  let runReportAction = (_prescription: ReportPrescription): void => {
    /* 초기화 중에는 결산이 열리지 않는다. 지연 참조로 TDZ만 피한다. */
  };
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
    report.show(
      lastReport,
      { onClose: () => undefined, onPrescription: runReportAction },
      lastCombos ?? undefined,
      lastPreviousSummary,
    );
    if (report.visible && advanceOnboarding('report-opened')) persist();
    refreshCaps();
  };
  /*
   * 사건 카드 삽화 (Task 6) — 카드 뷰는 에셋을 모르고 **논리 ID 해석기만** 받는다.
   * 그림을 못 얻으면 합성이 `null` 을 내고 기존 CSS 테마 슬롯이 폴백으로 남는다.
   */
  const cardView = new KairoCardView(document.body, {
    spriteFor: createEventSpriteSource(h.provider),
  });
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
  /*
   * 주 RNG 루트는 구 v7 세이브의 결정론 호환점이고, 실제 소비는 네 독립 스트림이 한다.
   * 구 세이브에는 스트림 상태가 없으므로 저장된 루트에서 한 번 fork하면 언제 열어도 같다.
   */
  const weekRng = saved ? RngCls.fromState(saved.weekRngState) : new RngCls(31337);
  const weekRngStreams = saved?.weekRngStreams
    ? restoreWeekRngStreams(saved.weekRngStreams)
    : forkWeekRngStreams(weekRng);
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
  /*
   * 시설 인스턴스 정보 (K49). **등록하지 않는다** — `PanelHost` 의 기본이 배타라
   * (등록을 잊으면 겹치는 쪽이 아니라 닫히는 쪽이 기본이다) 건설 시트를 열어 둔 채
   * 지도를 탭해도 둘이 겹치지 않는다.
   */
  const facilityPanel = new KairoFacilityInfo(document.body);
  const menuLab = new KairoMenuLab(document.body);
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
  /** 현재 세션의 최신 결산이 비교한 전주. 전체 리포트처럼 재시작 뒤에는 보존하지 않는다. */
  let lastPreviousSummary: typeof lastSummary = null;
  /**
   * 누적 방문객 (K47-① 신규 발화 d). 이 카운터는 **원래 없었다** — "지금까지 몇 명이
   * 다녀갔나"를 게임 어디에서도 못 물었다.
   *
   * ⚠ 세이브에는 **optional** 로 들어간다 — 옛 세이브는 0 에서 다시 세기 시작할 뿐이다.
   * v7→v8 온보딩 migration은 이 필드를 그대로 보존한다.
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
   *
   * ⚠ **인증 가산이 게임에 들어오는 유일한 지점이다** (P3-E). `effectiveGrade` 로
   * 감싸므로 입장 상한(`admissionLimit`) · 수면 허가(`placeOpts`) · 결산의
   * `admissionCap` · 메뉴의 "동시 N명"이 **한 번에** 따라온다. `admissionLimit` 에
   * 인자를 더하는 쪽을 안 고른 이유는 `certs.ts` 의 `effectiveGrade` 주석에 있다 —
   * 부르는 쪽이 하나만 잊어도 화면과 시뮬이 다른 상한으로 돈다.
   */
  const currentGrade = (): ReturnType<typeof gradeFor> =>
    effectiveGrade(
      GRADES.find((g) => g.grade === gradeNo) ?? (GRADES[0] as ReturnType<typeof gradeFor>),
      certs.bonus(),
    );

  /** 세이브 — 배치·주 진행처럼 상태가 실제로 바뀐 뒤에만 부른다 */
  // 부팅 시점의 토지 — 세이브에서 복원된 등급이 그대로 화면에 반영돼야 한다
  {
    h.scene.setLand(landRect(currentGrade()));
  }

  const persist = (): void => {
    if (assetReview) return;
    /*
     * ⚠ **기록이 먼저다** (P3-C). 지금 서 있는 시설·코스를 도감 누적 집합에 합친 뒤 저장한다 —
     * 이 저장소에서 배치·철거·코스 편집은 전부 직후에 `persist()` 를 부르므로, 여기 한 줄이면
     * "지었다가 곧바로 철거한" 시설도 도감에 남는다.
     */
    noteCatalog();
    saveKairoToStorage({
      seed: KAIRO_SEED,
      gate: GATE,
      terrain: h.terrain,
      walls: h.walls,
      placement: h.placement,
      progress,
      week: week.toSnapshot(),
      weekRngState: weekRng.state,
      weekRngStreams: snapshotWeekRngStreams(weekRngStreams),
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
      // 도감 발견은 한 번 보면 영구다 (P3-C) — optional 필드라 옛 세이브도 그대로 열린다
      builtEver: [...builtEver],
      equipEver: [...equipEver],
      resortName,
      priceMult,
      unlocks: unlocks.toSnapshot(),
      // 누적 방문객 (K47-①) — optional 필드라 옛 세이브도 그대로 열린다
      visitorsTotal,
      exam: exam.toSnapshot(),
      wishes: wishes.toSnapshot(),
      // 사이드 인증 (P3-E) — optional 필드라 옛 세이브도 그대로 열린다 (버전 7 유지)
      certs: certs.toSnapshot(),
      menus: menus.toSnapshot(),
      onboarding: onboarding.toSnapshot(),
    });
    // A/B/C 목표는 저장하지 않는다. 상태가 실제로 바뀐 이 경계에서 기존 값으로 다시 만든다.
    refreshGoal();
  };

  /** production 사건 하나가 현재 단계와 맞을 때만 전진한다. */
  const advanceOnboarding = (event: OnboardingEvent): boolean => {
    const changed = onboarding.observe(event);
    if (changed) refreshManagement();
    return changed;
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
    h.guests.setMaxGuests(
      admissionLimit(
        gr,
        h.placement.operationalCapacity((id) => menus.hasRecipe(id)),
        mods.crowdMult,
      ),
    );
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
    /*
     * ⚠ `.active` 만 넘기면 **상성 감점(P4)이 조용히 사라진다** — 결과를 통째로 넘겨야
     * 결산이 감점 줄을 그린다. `zones` 를 안 넘기면 zone 콤보가 0 이 되는 함정과 같은 계열이다.
     */
    lastCombos = comboBreakdown(evaluateCombos(h.placement, undefined, zonesNow), zonesNow);
    return {
      season,
      reputation: gr.reputationPull,
      priceMult,
      mapShares: scen.shiftedShares(seasonShares(season), mapDef),
      mapSceneryBonus: mapDef.sceneryBonus,
      modifiers: mods,
      courses: {
        potentialRevenue: courseWeek.potentialRevenue,
        upkeep: courseWeek.upkeep,
        potentialRiders: courseWeek.potentialRiders,
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
      /*
       * 지금 지을 수 있는 것 — 결산 병목이 **막다른 길**을 안 가리키게 (P3-B).
       *
       * 병목은 이제 공급 0 인 종류도 후보로 올린다. 그런데 1등급 판에서 온열(최소 2등급)·
       * 숙박(최소 3등급)은 공급이 0 이어도 **지을 방법이 없다** — 그걸 가리키면 조언이
       * 아니라 소음이다. 건설 시트와 **같은 물음**(`unlocks.isUnlocked`)을 쓴다 —
       * 갈라지면 결산이 권한 것을 시트가 안 보여준다.
       */
      buildable: allFacilityDefs()
        .filter((d) => unlocks.isUnlocked(d.id, gr.grade))
        .map((d) => d.id),
      /*
       * 지금 등급 (P3-C) — 결산이 **정원이 찼는지**를 말할 수 있게. 위 `setMaxGuests` 가
       * 이미 `admissionLimit` 을 부르지만 그 결과는 손님 상한으로만 흘러가고 UI 는
       * 한 번도 읽지 않았다 — 그래서 후반 결산이 "정원이 꽉 찼는데 더 지으세요"를 했다.
       */
      grade: gr,
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
      regularVisits: wishes.regularVisitsForWeek(week.week + 1),
    };
  };

  /**
   * 흐르는 낮 (K39) — 지도가 보이는 동안 rAF 가 tick 을 소비한다.
   * 하루(120 tick) = 24초 (아래 200ms/tick 생산 박자).
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
    week.begin(weekRngStreams, assembleWeekOpts());
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

  /**
   * 헤더 현금만 즉시 따라오게 한다 (K48).
   *
   * ⚠ `refreshCaps` 는 **1.5초 폴링**이라 실시간 수입이 최대 1.5초 늦게 보인다 —
   * 지도에는 `+₩N` 이 떴는데 헤더 숫자는 그대로면 "이펙트만 뜨고 돈은 안 오른다"로
   * 읽힌다 (이번 버그의 재발 형태다). 그렇다고 폴링 주기를 줄일 수는 없다:
   * 같은 타이머에 `refreshQuests`(의뢰 전수 평가 + DOM 갈아끼우기)가 붙어 있어서
   * 비용이 현금 한 줄과 비교가 안 된다.
   *
   * 그래서 **현금만** step 뒤에 갱신한다. 값이 안 바뀌면 DOM 도 안 만진다.
   */
  let cashShown = week.cash;
  const syncCash = (): void => {
    if (week.cash === cashShown) return;
    cashShown = week.cash;
    hud.setCash(cashShown);
  };

  /** step 뒤처리 — 하루 마디 토스트·낮밤 틴트·해금 도착·주 마디 진입 */
  const afterStep = (): void => {
    syncCash();
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

  /** 엔딩 패널 조립 뒤 실제 판정으로 교체된다. 주 마감은 이 지연 경계만 안다. */
  let checkEnding = (): void => undefined;

  /** 주 마감 — 결산을 띄우고, 닫으면 다음 주 카드 → begin (스펙 §2.1: 결산 → 카드) */
  const settleWeek = (): void => {
    const t0 = performance.now();
    // 덮어쓰기 전에 잡는다. 이 값이 이번 결산의 '전주'이며 같은 정의 셋만 비교한다.
    lastPreviousSummary = lastSummary;
    const rep = week.finish();
    const regularEvents = wishes.settleRegularPurchases(rep.menuPurchases);
    for (const ev of regularEvents) {
      if (ev.kind === 'regular-done') {
        // `WishStore`가 characterId + 요청 메뉴를 모두 검증한 실제 구매만 여기 도착한다.
        advanceOnboarding('regular-purchased');
        rep.regularAffinityGained += ev.request.affinity;
        const next = wishes.regularStatus(ev.char.id);
        news(
          '💗',
          `${ev.char.name} 구매 성공 · 친밀도 ${ev.affinity}` +
            (next && !next.done ? ` · 다음: ${next.request.line}` : ' · 요청 사슬 완료'),
        );
      } else if (ev.kind === 'ingredient-unlock') {
        if (menus.unlockIngredient(ev.id)) {
          news(
            '🧂',
            `${ev.char.name}의 선물 · 새 재료 ${ingredientDef(ev.id)?.name ?? ev.id} 해금`,
          );
        }
      } else if (ev.kind === 'recipe-unlock') {
        if (menus.unlockRecipe(ev.id)) news('📖', `${ev.char.name}의 선물 · 새 레시피 해금`);
      } else {
        if (ev.reward.cash) week.earn(ev.reward.cash);
        if (ev.reward.facility && unlocks.grant(ev.reward.facility)) {
          const def = facilityDef(ev.reward.facility);
          arrivalQueue.push({
            title: '단골 보상!',
            name: def?.name ?? ev.reward.facility,
            sub: `${ev.char.name}과의 친밀도 보상`,
            ...(def?.sprite ? { sprite: def.sprite } : {}),
          });
          refreshBuildList();
        }
      }
    }
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
      news('▼', `등급이 내려갔습니다 — ${currentGrade().name}. ${REPUTATION_NAME}을 살피세요`);
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
    lastSummary = summarizeWeek(rep);
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
     * 사이드 인증 (P3-E) — **의뢰 청구 뒤**다. `questsDone` 조건이 방금 청구한 의뢰를
     * 세야 "마지막 의뢰를 끝낸 주에 사철 인증"이 성립한다.
     *
     * 채널: **달성은 모달**(정원이 늘어나는 콘텐츠 해금이라 축하 급) · **근접은 티커**
     * (내가 안 눌렀는데 일어난 소식). 조건이 하나 남았을 때 한 번만 흘린다 —
     * 매주 흘리면 12종이 티커를 도배한다.
     */
    {
      const certCtx = {
        zones: h.guests.swimZones(),
        courses: courses.count,
        questsDone: progress.claimedCount,
      };
      const certSt = certStatuses(h.placement, lastSummary, certCtx);
      const certClaim = certs.claim(certSt);
      if (certClaim.cash > 0) week.earn(certClaim.cash);
      for (const cid of certClaim.ids) {
        const c = CERTS.find((x) => x.id === cid);
        if (!c) continue;
        const gain: string[] = [];
        if (c.reward.capacity !== undefined) gain.push(`정원 +${c.reward.capacity}명`);
        if (c.reward.permitArea !== undefined) gain.push(`수면 허가 +${c.reward.permitArea}칸`);
        if (c.reward.cash !== undefined) gain.push(`+${Math.round(c.reward.cash / 10000)}만`);
        audio.play('sfx/exam-pass');
        arrivalQueue.push({
          title: '인증 획득!',
          name: c.name,
          sub: gain.join(' · '),
        });
      }
      for (const s of certSt) {
        if (s.done || s.remaining !== 1 || certNearShown.has(s.id)) continue;
        certNearShown.add(s.id);
        const left = s.reqs.find((r) => !r.done);
        news('🏅', `${s.name} 조건 하나 남았습니다 — ${left?.detail ?? ''}`);
      }
    }
    checkEnding();
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
      report.show(
        rep,
        {
          onClose: () => nextWeekCards(),
          onPrescription: (prescription) =>
            nextWeekCards(() => runReportAction(prescription)),
        },
        lastCombos ?? undefined,
        lastPreviousSummary,
      );
      if (report.visible && advanceOnboarding('report-opened')) persist();
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
   * 1~3주차는 카드 없이 시작한다 (온보딩 중 모달은 건설·관조 리듬을 끊는다).
   * 4주차부터 `CardStore` 스냅샷이 정한 2~4주 간격으로 최대 한 장만 나온다.
   * 사고 대응은 위 `triggerCard` 경로, 심사·해금은 `arrivalQueue` 경로라 이 간격을 우회한다.
   */
  const nextWeekCards = (afterBegin?: () => void): void => {
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
      afterBegin?.();
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
      afterBegin?.();
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
    courseDemand: () => lastReport?.courseDemand ?? 0,
    spend: (n) => week.spend(n, 'building'),
    onCourseModeChange: (active) => {
      hud.setGoalSurface(active ? 'course' : panelHost.anyOpen ? 'panel' : 'home');
    },
    onRouteDragged: () => {
      if (advanceOnboarding('route-dragged')) persist();
    },
    onTrialStarted: () => {
      audio.play('sfx/course-trial');
      if (advanceOnboarding('trial-started')) persist();
    },
    onRecord: (record) => {
      audio.play('sfx/course-record');
      if (career.recordCourse({
        mapId,
        scenarioId,
        presetId: record.presetId,
        equipmentId: record.equipmentId,
        thrill: record.thrill,
        week: week.week,
      })) saveCareerProfile(career);
    },
    onChange: () => {
      // 코스 수는 경영 메뉴 `코스` 행동의 보조값(`운행 N개`)이 정본이다.
      refreshManagement();
      refreshRisk();
      syncBoats();
      persist();
    },
    onConfirmed: (text) => {
      toast(text, 'ok');
      audio.play('sfx/place');
      if (advanceOnboarding('course-applied')) persist();
    },
  });

  /**
   * 도감과 감상 화면 (§15.8 · §15 감상).
   *
   * 발견한 콤보는 **누적**한다 — 지금 발동 중인 것만 보여주면 시설을 지웠을 때 도감이
   * 줄어들고, 그건 "발견"이 아니라 현황판이다.
   */
  const discovered = new Set<string>(saved?.discovered ?? []);
  /*
   * 도감의 나머지 두 탭도 **누적**이다 (P3-C).
   *
   * ⚠ 예전에는 도감이 `placement.all()`·`courses.all` 을 그 자리에서 훑었다 — 즉
   * **지금 서 있어야** 발견이었다. 철거하면 발견이 사라졌고, 코스 장비 19종은 코스를
   * 동시에 19개 놓을 수 없어 **완성이 구조적으로 불가능**했다. 도감은 현황판이 아니다.
   *
   * 옛 세이브(필드 없음)는 지금 배치에서 채워 시작한다 — 마이그레이션 없이 열린다.
   */
  const builtEver = new Set<string>(saved?.builtEver ?? []);
  const equipEver = new Set<string>(saved?.equipEver ?? []);
  /**
   * 지금 있는 것을 발견 집합에 **합친다**. 빼지 않는다.
   *
   * `persist()` 첫 줄에서 부른다 — 이 저장소에서 배치·코스·철거는 전부 바뀐 직후
   * `persist()` 를 부르므로, 기록을 놓치는 경로가 구조적으로 없다. 부르는 쪽마다
   * 따로 붙이면 새 경로가 생길 때 조용히 빠진다.
   */
  const noteCatalog = (): void => {
    noteSeen(builtEver, h.placement.all().map((it) => it.defId));
    noteSeen(equipEver, courses.all.map((c) => c.equipId));
  };
  /*
   * ⚠ 돌려주는 것은 **이번에 처음 본 것**뿐이다 — 숨은 콤보의 첫 발견 보상(`discoverCash`)이
   * 이 목록에만 걸려 있어서, 같은 콤보가 계속 발동해도 보상이 두 번 나가지 않는다.
   * `discovered` 는 세이브에 담기므로 재부팅으로도 다시 받을 수 없다.
   */
  const noteDiscoveries = (): string[] =>
    noteSeen(discovered, activeComboIds(h.placement, h.guests.swimZones()));
  noteDiscoveries();
  noteCatalog();

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

  /**
   * 삽화 사건 상자 — 의뢰·인증·소원·단골 상세가 여기로 온다 (표면은 여전히 셋).
   * ⚠ `PanelHost` 등록은 자기 생성자가 한다 — 배타가 기본이다.
   */
  const eventDialog = new KairoEventDialog(document.body);

  const catalog = new KairoCatalog(document.body, {
    grade: () => currentGrade().grade,
    discovered: () => discovered,
    builtEver: () => builtEver,
    equipEver: () => equipEver,
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
    /*
     * 확인 화면이 **지워지는 것을 숫자로** 말한다 — 주차·시설·현금.
     * 값은 전부 지금 판에서 읽는다 (새 상태 0).
     */
    currentRun: () => ({
      week: week.week + 1,
      facilities: h.placement.count,
      cash: week.cash,
    }),
    start: (m, sc) => {
      clearKairoStorage();
      const url = new URL(location.href);
      url.searchParams.set('kairo', '1');
      url.searchParams.set('map', m);
      url.searchParams.set('scenario', sc);
      location.href = url.toString();
    },
  });

  /**
   * 설정 IA (UI v3, 계획 §1.4) — 배속은 `진행`, 파괴적 시작은 `새 게임` 이다.
   *
   * ⚠ 예전엔 둘이 `.kmanage-utility` 한 줄에 **같은 크기로 나란히** 있었다. 배속은
   * 되돌릴 수 있는 세션 선호이고 새 판은 자동 저장을 덮는 파괴적 행동이라, 같은 위계로
   * 두면 실수 한 번이 몇 시간을 지운다. 파괴적 확인은 `KairoNewGame`의 게임 안 사건
   * 상자가 맡는다 — 여기서 다시 만들지 않는다.
   */
  const managementSettings: ManagementSettingsSection[] = [
    {
      id: 'play',
      label: '진행',
      items: [
        {
          id: 'speed',
          domId: 'kairo-speed',
          label: '배속',
          detail: '진행 속도',
          // 세션 선호라 저장 안 한다 (K44) — 현재값은 볼 때마다 다시 읽는다
          read: () => `현재 ${flow.speed}× · 탭하면 ${flow.speed === 1 ? 2 : 1}×`,
          run: () => {
            flow.speed = flow.speed === 1 ? 2 : 1;
            syncTickPace();
            refreshManagement();
            toast(`배속 ${flow.speed}×`, 'ok');
          },
        },
      ],
    },
    {
      id: 'save',
      label: '새 게임',
      items: [
        {
          id: 'newgame',
          domId: 'kairo-newgame-open',
          label: '새 게임 시작',
          detail: '지금 판을 지우고 처음부터 시작합니다 · 되돌릴 수 없습니다',
          destructive: true,
          run: () => {
            if (newGame.visible) newGame.hide();
            else newGame.show();
          },
        },
      ],
    },
  ];

  /*
   * 등급 심사 (K42, K48 에서 화면을 고쳤다).
   *
   * ⚠ K48 이전에는 **자격 미달이면 항목을 통째로 숨겼다.** 평판이 다음 문턱을 넘기 전이
   * 판의 대부분이라 심사는 사실상 없는 기능이었고, 사용자가 "심사로 등급 올리는 부분이
   * 사라졌다"고 물었다. 승급은 토지·시설 해금·정원 상한이 전부 걸린 유일한 성장 축이므로
   * **항상 보이고, 없으면 무엇이 모자란지 말한다** (`examItemView`).
   *
   * 그리고 탭이 **바로 돈을 쓰지 않는다** — 확인 화면에서 조건별 점수·커트라인·수수료를
   * 보고 신청을 눌러야 접수된다 (PSS 리서치 §3.1).
   */
  const examView = new KairoExamView(document.body);
  const examBtn = document.createElement('button');
  examBtn.id = 'kairo-exam-open';
  // 문구가 "무엇이 모자란지"까지 말하므로 92px 칸에 안 들어간다 — 메뉴 격자 한 줄을 쓴다
  examBtn.className = 'kitem wide span';

  /** 지금 상태 한 벌 — 메뉴 항목과 확인 화면이 **같은 값**을 본다 */
  const examGate = (): Parameters<typeof examItemView>[0] => ({
    next: nextGradeDef(gradeNo),
    gradeName: `${currentGrade().grade}등급 ${currentGrade().name}`,
    reputation: reputation.value,
    pendingWeek: exam.pending?.judgeWeek ?? null,
  });

  /** 신청 — 수수료를 내고 접수한다. **확인 화면의 신청 버튼만** 여기로 온다 */
  const applyExam = (): void => {
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
    /*
     * ⚠ **sim 의 원 키를 화면에 뿌리지 않는다** (UX 감사 P0-3).
     *
     * 예전엔 `hygiene 3 · food 2 · exitSatisfaction 55` 가 토스트·티커·알림함 **세 표면**에
     * 그대로 나갔다. 같은 게임의 심사 확인 화면은 이미 `위생 시설`·`먹거리 시설`·`평판` 으로
     * 쓰고 있었다 — 표가 없어서가 아니라 **연결이 안 돼 있어서**였다. 이제 그 표
     * (`kairo-terms.ts`)를 여기서도 쓴다.
     */
    const reqText = (next.examReqs ?? [])
      .map((c) => `${conditionSubject(c)} ${c.value}`)
      .join(' · ');
    /*
     * 393px 한 줄을 넘으므로 **토스트는 요약만**, 조건 상세는 알림함에 남긴다
     * (토스트 = 내 행동의 대답 · 티커/알림함 = 뉴스, K47-① 채널 계약 그대로).
     */
    toast(`심사 접수 — ${pending.judgeWeek}주차 주말에 판정합니다`, 'ok');
    news(
      '📝',
      `${next.grade}등급 심사 접수 — ${pending.judgeWeek}주차 주말 판정 · ${reqText}`,
    );
    refreshExamBtn();
    persist();
  };

  /**
   * 확인 화면을 연다 — 메뉴 항목과 **등급 칩**이 같은 입구를 쓴다 (K48-②).
   * 점수는 판정과 같은 평가기(`scoreExam`)로 잰다 — 갈라지면 "화면은 23점인데 떨어졌다"다.
   */
  const openExam = (): void => {
    const gate = examGate();
    const lp = week.liveProgress();
    examView.show(
      {
        gate,
        score: gate.next
          ? scoreExam(gate.next.grade, h.placement, lastSummary, h.guests.swimZones())
          : null,
        cash: week.cash,
        judgeWeek: examJudgeWeek(week.week + 1, lp ? lp.tick : TICKS_PER_WEEK),
      },
      applyExam,
    );
  };
  examBtn.addEventListener('click', openExam);
  hud.menuSlot.append(examBtn);

  /** 자격을 알린 목표 등급 — 매주 반복되면 소음이라 **처음 한 번만** 흘린다 (K48-④) */
  let examToldGrade = 0;
  const refreshExamBtn = (): void => {
    paintExamItem(examBtn, examItemView(examGate(), week.cash));
    /*
     * 자격 획득은 "내가 안 했는데 일어난 일" = 티커 뉴스다 (채널 계약 K47-①).
     * 등급 번호로 기억하므로 강등 후 다시 올라와도 한 번만 뜬다.
     */
    const next = exam.eligible(gradeNo, reputation.value);
    if (next && next.grade > examToldGrade) {
      examToldGrade = next.grade;
      news('⭐', `심사 응시 가능 — ${next.grade}등급 ${next.name}`, stampNow(), openExam);
    }
  };
  refreshExamBtn();

  /*
   * ⚠ 여기 `새 판` 버튼(`.kitem`)이 있었다. UI v3 에서 `설정 > 저장 및 새 게임 >
   * 새 게임 시작` 으로 옮겼다 (`managementSettings`) — 손잡이 id 는 그대로다.
   */

  /** 홈 A와 경영 Today가 같은 실제 action adapter를 쓰기 위한 late-bound 경계. */
  let runRecommendedAction = (_action: ManagementAction): void => undefined;

  /**
   * 의뢰 칩 (K40) — "다음에 뭘 할지"를 상시로. 예전 목표란은 "북한강형 · 자유 플레이"
   * 라는 판 설정만 비췄다 (UX 검수 §1 — 의도한 주석은 "얼마나 남았나"였는데 기본
   * 시나리오가 자유 플레이라 자리가 비어 있었다). 이제 의뢰 둘 + 등급 게이지(A4)를
   * 비추고, 판 설정은 메뉴 상단으로 갔다.
   */
  const refreshGoal = (): void => {
    const st = { week: week.week, grade: currentGrade().grade, accidents: accidentCount };
    const status = scen.scenarioStatus(scenario, st);
    // refreshGoal은 패널 조립보다 먼저 한 번 돈다. 함수를 값으로 넘기면 그때의 no-op이
    // 칩에 남으므로, 탭 시점의 production 함수를 읽는 late-bound wrapper를 넘긴다.
    const onboardingToday = onboardingRecommendation(onboarding.step);
    const immediate = onboardingToday
      ? recommendedActionGoal(
          managementTodayPresentation(onboardingToday),
          () => runRecommendedAction(onboardingToday.action),
        )
      : inheritedCourseGoal(courses.all, (handle) => openCourse(handle));

    /*
     * B — 이름 있는 소원이 있으면 그것이 먼저다. 없으면 기존 의뢰, 둘 다 끝났으면
     * 운행 중인 코스로 폴백한다. 새 목표 저장소를 만들지 않고 기존 상태의 뷰만 고른다.
     */
    const regular = REGULAR_CHARACTERS.map((c) => wishes.regularStatus(c.id)).find(
      (x) => x !== null && !x.done,
    );
    const wish = wishes.openWishes(h.placement, lastSummary, h.guests.swimZones())[0];
    const quest = questStatuses(h.placement, lastSummary, h.guests.swimZones()).find(
      (q) => !progress.isClaimed(q.id),
    );
    let mid: GoalSlotInput;
    if (regular) {
      mid = {
        icon: '♥',
        label: `${regular.char.name}의 메뉴 요청`,
        detail: `${regular.request.line} · 친밀도 ${regular.affinity}`,
        progress: regular.stage / Math.max(1, regular.char.regular?.requests.length ?? 3),
        action: () => {
          const targetDefId = recipeDef(regular.request.recipeId)?.facilityId;
          const target = h.placement.all().find((it) => it.defId === targetDefId);
          if (target) openMenuLab(target.handle);
          else hud.showMenu();
        },
      };
    } else if (wish) {
      mid = {
        icon: '💭',
        label: `${wish.char.name}의 소원`,
        detail: `${wish.wish.line} · ${wish.detail}`,
        progress: wish.progress,
        action: () => hud.showMenu(),
      };
    } else if (quest) {
      mid = {
        icon: '📋',
        label: quest.name,
        detail: quest.detail,
        progress: quest.progress,
        action: () => hud.showMenu(),
      };
    } else {
      mid = {
        icon: '🏁',
        label: '코스 기록 살피기',
        detail: `운행 중 ${courses.count}개`,
        progress: courses.count > 0 ? 1 : 0,
        action: () => openCourse(courses.all[0]?.handle),
      };
    }

    /*
     * C — 시나리오 엔딩 → 심사 → 인증 순으로 기존 장기 진행을 비춘다.
     *
     * 심사 칩은 기존과 같은 `openExam` callback을 쓴다. 최고 등급 뒤에는 가장 가까운
     * 미획득 인증을 골라 메뉴의 인증 목록으로 보낸다.
     */
    const next = GRADES.find((g) => g.grade === currentGrade().grade + 1);
    let long: GoalSlotInput;
    if (status === 'won') {
      long = {
        icon: '🎉',
        label: '장기 목표 달성',
        detail: '완성한 리조트를 감상하세요',
        progress: 1,
        tone: 'won',
        action: () => showcase.show(),
      };
    } else if (status === 'lost') {
      long = {
        icon: '✕',
        label: '시나리오 실패',
        detail: '새 판에서 다시 도전하세요',
        progress: 0,
        tone: 'lost',
        action: () => newGame.show(),
      };
    } else if (scenario.goal.kind !== 'none') {
      long = {
        icon: '🚩',
        label: scenario.name,
        detail: scen.scenarioProgress(scenario, st),
        progress: 0,
        action: () => hud.showMenu(),
      };
    } else if (exam.pending) {
      long = {
        icon: '📋',
        label: `${exam.pending.target}등급 심사`,
        detail: `${exam.pending.judgeWeek}주차 주말 판정`,
        progress: 1,
        action: openExam,
      };
    } else if (next && exam.eligible(gradeNo, reputation.value)) {
      long = {
        icon: '⭐',
        label: '심사 응시 가능!',
        detail: '탭하면 조건과 예상 점수',
        progress: 1,
        action: openExam,
      };
    } else if (next) {
      long = {
        icon: '⭐',
        label: `${next.grade}등급까지`,
        detail: `${REPUTATION_NAME} ${Math.round(reputation.value)}/${next.reqExitSatisfaction}`,
        progress: reputation.value / Math.max(1, next.reqExitSatisfaction),
        action: openExam,
      };
    } else {
      const cert = certStatuses(h.placement, lastSummary, {
        zones: h.guests.swimZones(),
        courses: courses.count,
        questsDone: progress.claimedCount,
      })
        .filter((c) => !certs.has(c.id))
        .sort((a, b) => b.progress - a.progress)[0];
      long = cert
        ? {
            icon: '🏅',
            label: cert.name,
            detail: cert.reqs.find((r) => !r.done)?.detail ?? cert.desc,
            progress: cert.progress,
            action: () => hud.showMenu(),
          }
        : {
            icon: '🏆',
            label: '장기 성장 완료',
            detail: '리조트를 감상하거나 계속 운영하세요',
            progress: 1,
            tone: 'won',
            action: () => showcase.show(),
          };
    }

    const chips = createGoalSlots({ immediate, mid, long });
    hud.setChips(chips);
    /* 뉴스가 없을 때는 CLAUDE.md 계약대로 현재 즉시 목표가 다음 행동 힌트가 된다. */
    ticker.setFallback(immediate.label);
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

  /*
   * ⚠ 여기 있던 레거시 `코스` 버튼(id `kairo-course-open`)을 걷어냈다.
   *
   * 경영 메뉴 v2 가 같은 id 를 자기 행동에 쓰면서 **소스에 같은 id 가 둘**이 됐다.
   * 실제 DOM 에서는 `KairoManagementMenu` 가 `host.replaceChildren()` 로 이 버튼을
   * 지워 살아남지 않았지만, `getElementById` 로 코스를 여는 모든 검사·문서가
   * "어느 쪽인가"를 물을 수 없는 상태였다. 진입점은 **경영 메뉴의 `코스` 하나**이고
   * 그 한 번 탭이 물려받은 코스를 그대로 연다 (`openCourse(courses.all[0]?.handle)`).
   */

  // 건설 시트의 코스 탭이 여는 곳 — 경영 메뉴의 `코스` 행동과 같은 경로다 (K32)
  openCourse = (handle?: number): void => {
    /*
     * ⚠ 붓을 먼저 내려놓는다 (K45 버그). 건물/바닥 붓을 든 채 코스 탭을 누르면
     * 붓이 살아남아, 코스 편집의 지도 탭(잔교 고르기·핸들)이 그대로 **설치**로
     * 흘렀다 — "코스를 선택하면 건물이 깔린다"로 보고된 버그.
     */
    clearBrush();
    if (!coursePanel.visible || handle !== undefined) coursePanel.show(handle);
    if (coursePanel.visible && advanceOnboarding('course-opened')) persist();
    /*
     * Phase 1의 기존 코스 production 경로. 패널의 기존 편집 의미는 Phase 2가 소유하므로
     * 여기서는 handle을 잃지 않고 실제 운행 코스를 화면에 잡는다. Phase 2는 같은 인자를
     * `coursePanel.show(handle)`로 넘기기만 하면 되고 목표/HUD를 다시 건드릴 필요가 없다.
     */
    const existing = handle === undefined ? undefined : courses.all.find((c) => c.handle === handle);
    if (existing && coursePanel.visible) {
      const panel = document.getElementById('kairo-course');
      const inset = panel ? Math.max(0, window.innerHeight - panel.getBoundingClientRect().top) : 0;
      h.scene.frameCourse(existing.dock, existing.handles, inset);
    }
  };

  const staffBtn = document.createElement('button');
  staffBtn.id = 'kairo-staff-open';
  staffBtn.textContent = '경영';
  staffBtn.className = 'kitem';
  const showManage = (tab: 'price' | 'staff' | 'upgrade'): void => {
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
        spend: (n) => week.spend(n, 'upgrades'),
      },
      tab,
    );
  };
  staffBtn.addEventListener('click', () => {
    if (staffPanel.visible) staffPanel.hide();
    else showManage('staff');
  });
  hud.menuSlot.append(staffBtn);

  const endingId = `${mapId}:${scenarioId}:first`;
  const readEnding = () => {
    const status = scen.scenarioStatus(scenario, {
      week: week.week,
      grade: currentGrade().grade,
      accidents: accidentCount,
    });
    return {
      status,
      milestone: endingMilestone({ grade: currentGrade().grade, certs: certs.count, scenario: status }),
    };
  };
  const endingPanel = new KairoEndingPanel(document.body, {
    continue: () => endingPanel.hide(),
    newRegion: () => {
      endingPanel.hide();
      newGame.show();
    },
    view: () => {
      endingPanel.hide();
      showcase.show();
    },
  });
  const openEnding = (): void => {
    const state = readEnding();
    endingPanel.show({
      milestone: state.milestone,
      grade: currentGrade().grade,
      certs: certs.count,
      title: `${mapDef.name} 첫 엔딩`,
    });
  };
  checkEnding = (): void => {
    const state = readEnding();
    let changed = false;
    if (state.status === 'won') changed = career.clear(mapId, scenarioId) || changed;
    else if (state.milestone.ready) changed = career.clearMap(mapId) || changed;
    if (state.milestone.ready && career.recordEnding(endingId)) {
      changed = true;
      arrivalQueue.push({
        title: '첫 엔딩 달성!',
        name: `${mapDef.name} 첫 엔딩`,
        sub: '계속 운영하거나 새 지역으로 떠나세요',
        actions: endingChoiceActions({
          continue: () => undefined,
          newRegion: () => newGame.show(),
          view: () => showcase.show(),
        }),
      });
    }
    if (changed) saveCareerProfile(career);
    refreshManagement();
  };

  /**
   * 목적지를 **연다** — 예전의 목록 점프는 같은 시트를 1,000px 가까이 튀게 했고,
   * 앵커가 없는 판(`#kairo-regular-list` 는 열린 소원이 있을 때만 만들어졌다)에서는
   * 자동 스크롤이 **조용한 no-op** 이었다 (UX 감사 P0-2 — 온보딩 6·7단계가
   * 그 버튼을 Today 주버튼으로 띄우는데 화면이 아무 반응도 안 했다).
   *
   * 이제 메뉴는 라우터라 목적지가 **자기 화면**이다. 화면은 언제나 존재하고, 내용이
   * 없으면 빈 상태(사실 + 방법 + 버튼)를 낸다.
   */
  const openManageScreen = (id: ManageScreenId): void => {
    hud.showMenu();
    refreshQuests();
    management.show(id);
  };
  const firstCraftMenuFacility = () => h.placement.all().find((item) => {
    const def = facilityDef(item.defId);
    return def?.menuMode === 'craft';
  });
  const managementActions: ManagementMenuAction[] = [
      { id: 'price', domId: 'kairo-price-open', label: '가격', detail: '요금·예상 만족', run: () => showManage('price') },
      { id: 'staff', domId: 'kairo-staff-open', label: '직원', detail: '인원·개선', run: () => showManage('staff') },
      { id: 'course', domId: 'kairo-course-open', label: '코스', detail: '루트·시험 운행', run: () => openCourse(courses.all[0]?.handle) },
      { id: 'exam', domId: 'kairo-exam-open', label: '심사', detail: '등급과 예상 점수', run: openExam },
      {
        id: 'regular',
        label: '단골',
        detail: '메뉴 요청',
        stayOpen: true,
        run: () => {
          const target = onboarding.step === 'equip-menu' ? firstCraftMenuFacility() : undefined;
          if (target) openMenuLab(target.handle);
          else openManageScreen('regulars');
        },
      },
      {
        id: 'quests',
        label: '의뢰',
        detail: '진행 목표',
        stayOpen: true,
        run: () => {
          if (onboarding.step === 'build-food') hud.showBuild();
          else openManageScreen('quests');
        },
      },
      { id: 'codex', domId: 'kairo-catalog-open', label: '도감', detail: '누적 발견', run: () => catalog.show() },
      { id: 'report', label: '결산', detail: '최근 기록', run: openLastReport },
      { id: 'view', domId: 'kairo-showcase-open', label: '감상', detail: '내 리조트', run: () => showcase.show() },
      { id: 'certs', label: '인증', detail: '등급 밖 성장', stayOpen: true, run: () => openManageScreen('certs') },
      { id: 'ending', label: '엔딩', detail: '커리어 기록', run: openEnding },
  ];
  runRecommendedAction = (id): void => {
    const action = managementActions.find((candidate) => candidate.id === id);
    if (action) runManagementAction(action);
  };
  const management = new KairoManagementMenu(
    hud.menuSlot,
    managementActions,
    () => {
      const risk = assessRisk(h.placement, h.guests, {
        staffSafety: staff.effects(h.placement).safetyPoints,
        courseRisk: courseRiskPoints(),
        swimRisk: swimRiskPoints(h.guests.swimZones()),
      }).level;
      const staffShortages = STAFF_ROLE_LIST.filter(
        (role) => staff.effects(h.placement).coverage[role.id] < 1,
      ).length;
      const state = {
        onboardingStep: onboarding.step,
        reportUnread: lastReport !== null && lastReport.week > reportSeenWeek,
        staffShortages,
        risk,
        endingReady: readEnding().milestone.ready,
        examReady: exam.eligible(gradeNo, reputation.value) !== null,
        regularReady: REGULAR_CHARACTERS.some((character) => {
          const status = wishes.regularStatus(character.id);
          return status !== null && !status.done;
        }),
      };
      const discovered = catalog.counts();
      return {
        today: todayRecommendation(state),
        warnings: managementWarnings(state),
        details: {
          price: `현재 요금 ${Math.round(priceMult * 100)}%`,
          staff: staffShortages > 0 ? `부족 ${staffShortages}개 역할` : '필요 역할 배치 완료',
          course: `운행 ${courses.count}개`,
          exam: `현재 ${currentGrade().grade}등급`,
          regular: state.regularReady ? '메뉴 요청 진행 중' : '다음 방문 대기',
          quests: onboarding.step === 'done' ? '운영 목표 진행 중' : '첫 운영 진행 중',
          codex: `콤보 ${discovered.combo[0]}/${discovered.combo[1]}`,
          report: lastReport ? `${lastReport.week}주 결산` : '첫 결산 대기',
          view: mapDef.name,
          certs: `${certs.count}/${CERTS.length} 획득`,
          ending: state.endingReady ? '달성 확인 가능' : '커리어 이정표',
        },
        /*
         * L1 라우터 네 줄의 부제 — **열기 전에** 그 안에 지금 무엇이 있는지 말한다.
         * 인증 가산(`동시 입장 +N`)이 여기 산다: 정원 숫자가 왜 등급표보다 큰지
         * 화면 어딘가는 말해야 하는데, 예전에는 의뢰 목록 머리가 그 자리였다.
         */
        routeDetails: {
          operations: `요금 ${Math.round(priceMult * 100)}% · 코스 ${courses.count}개 · ` +
            (staffShortages > 0 ? `직원 ${staffShortages}개 역할이 부족합니다` : '직원 배치 완료'),
          growth: `${currentGrade().grade}등급 · 인증 ${certs.count}/${CERTS.length}` +
            (certs.bonus().capacity > 0 ? ` (동시 입장 +${certs.bonus().capacity}명)` : ''),
          records: lastReport
            ? `${lastReport.week}주차 결산 · 콤보 ${discovered.combo[0]}/${discovered.combo[1]}`
            : `첫 결산 대기 · 콤보 ${discovered.combo[0]}/${discovered.combo[1]}`,
          settings: `배속 ${flow.speed}× · 자동 저장 켜짐`,
        },
        context: `${mapDef.name} · ${scenario.name}`,
      };
    },
    managementSettings,
    {
      listHost: hud.quests,
      /*
       * 빈 목록의 버튼은 **막다른 길이 아닐 때만** 만든다 (`kairo-growth.ts`).
       * 여기서는 그 버튼이 실제로 가는 곳을 잇는다 — 토스트로 대답하고 끝내지 않는다.
       */
      onListAction: (id) => {
        if (id === 'quests') openExam();
        else hud.showBuild();
      },
      /*
       * 목록의 한 행을 누르면 **삽화 사건 상자**가 뜬다 (카이로 문법: 장면 · 인물 · 이야기 ·
       * 아래 선택지). 발견 · 수락 · 완료가 전부 같은 상자다. 채널은 안 늘어난다 — 이건
       * 내가 열어 본 것이지 알림이 아니다 (K47-①).
       */
      onRowOpen: (list, event) => {
        eventDialog.show({
          kind: `growth:${list}`,
          mood: event.mood,
          kicker: event.kicker,
          title: event.title,
          body: event.body,
          figure: event.figure,
          choices: [
            { id: 'close', label: '알겠습니다', run: () => undefined },
            ...(list === 'certs' || list === 'quests'
              ? [{ id: 'build', label: '건설 열기', run: (): void => hud.showBuild() }]
              : []),
          ],
        });
      },
    },
  );
  refreshManagement = () => management.refresh();
  resetManagementScreen = () => management.reset();
  /*
   * 홈에서 뺀 중·장기 목표의 새 집 (UI v3). 새 상태를 만들지 않고 `refreshGoal` 이
   * 이미 파생한 chip 을 그대로 넘긴다 — 조립 전 호출은 안전한 no-op 이었다.
   */
  setMenuGoals = (chips) => management.setGoals(chips);
  refreshGoal();
  /*
   * 버전 줄은 **설정 화면 안**이다 (UX 감사 P2-27). 예전에는 메뉴 첫 화면 아래에
   * 커밋 SHA 와 브랜치명이 그대로 떴다 — 플레이어에게는 소음이고 개발자에게는
   * 설정에 있어도 충분하다. 하네스가 읽는 `data-build-identity` 손잡이는 그대로다.
   */
  management.setVersionLine(`버전 ${KAIRO_BUILD.shortSha} · ${KAIRO_BUILD.branch}`);

  runReportAction = (prescription): void => {
    if (prescription.action === 'course') {
      openCourse(courses.all[0]?.handle);
      return;
    }
    if (prescription.action === 'manage') {
      showManage('staff');
      return;
    }
    // target은 처방의 근거/접근성 표기에 남고, 실제 해금·카드 목록은 HUD 정본이 고른다.
    hud.showBuild();
  };

  /**
   * 시설 정보 (K49) — 지도에서 시설을 탭하면 여기로 온다.
   *
   * 값은 **전부 sim 에서 잰다** (`facilityInfo`). 데이터의 정가를 보여 주면 개선·특화가
   * 붙은 인스턴스에서 화면이 곧바로 거짓말이 되고, 이 화면의 존재 이유가 사라진다.
   */
  openFacilityInfo = (handle: number): void => {
    /*
     * ⚠ **조준을 먼저 끊는다.** 확정 바는 `PanelHost` 패널이 아니라서
     * (스크림 없는 바라 배타 규칙이 시트·결산과 부딪힌다 — `cancelConfirm` 주석)
     * `panelHost.open()` 만으로는 안 꺼진다. 조준 중에는 씬이 고스트를 가리는 시설·벽을
     * **투시**로 흐려 놓는데, 그 원복이 세션의 `closeAim`/`setGhost(null)` 에 걸려 있다 —
     * 안 끊으면 정보 시트를 여는 순간 판이 흐려진 채로 남는다.
     *
     * 탭 규칙상(붓이 없을 때만 정보) 정상 흐름에서는 조준 중일 수 없다. 그래도 끊는다 —
     * "그럴 리 없다"는 이 파일에서 여러 번 틀렸고, 값이 한 줄이다.
     */
    hud.cancelConfirm();
    build.abandon();
    /*
     * ⚠ **읽는 함수**를 넘긴다 (스냅샷이 아니라). 개선·특화를 그 자리에서 하므로 누른 뒤
     * 값을 다시 재야 하는데, 스냅샷 하나를 넘기면 화면이 옛 값에 고정된다.
     */
    const read = (): ReturnType<typeof facilityInfo> =>
      facilityInfo(
        h.placement,
        handle,
        // 지금 이용 중인 인원 — 슬롯 배열의 0 이 아닌 칸이 곧 손님이다
        h.guests.occupancy(handle).filter((id) => id !== 0).length,
      );
    if (!read()) return;
    facilityPanel.show(read, {
      onClose: () => h.scene.setRideMarkFor(null),
      cash: () => week.cash,
      /*
       * 개선 — **규칙은 `PlacementGrid` 가, 지갑은 `WeekRunner` 가** 갖는다. 경영 시트의
       * 개선 탭과 여기는 같은 규칙의 두 입구다 (규칙을 복사한 게 아니다).
       * ⚠ 돈을 먼저 쓰고 실패하면 안 된다 — 비용을 재고, 지출이 성공했을 때만 올린다.
       */
      upgrade: () => {
        const cost = h.placement.upgradeCost(handle);
        if (cost <= 0 || cost > week.cash) return false;
        if (!week.spend(cost, 'upgrades')) return false;
        if (!h.placement.upgrade(handle)) return false;
        audio.play('sfx/place');
        toast(`개선 — ${Math.round(cost / 10000)}만`, 'ok');
        refreshStaffBtn(); // 개선은 필요 직원 수를 바꾼다
        persist();
        return true;
      },
      /** 특화는 **공짜**다 — 고르는 것이 거래이지 돈이 아니다 (P1.5) */
      chooseSpecialty: (s) => {
        if (!h.placement.chooseSpecialty(handle, s)) return false;
        h.guests.invalidate(); // 회전 특화는 슬롯 수를 바꾼다
        audio.play('sfx/card');
        persist();
        return true;
      },
      /*
       * ⚠ 이동은 **첫 심사 통과의 보상**이다 (K42). 지도 탭의 이동 붓과 같은 조건을
       * 쓴다 — 갈라지면 "정보에서는 되는데 붓으로는 안 된다"가 된다.
       */
      move: exam.toolsUnlocked
        ? () => {
            facilityPanel.hide();
            beginMove(handle);
          }
        : null,
      moveHint: '이동은 첫 심사 통과의 보상입니다',
      /*
       * ⚠ 철거는 **조준 + 확정**이다 (K47-③). 정보 화면에서 바로 없애면 그 승격이
       * 무의미해진다 — 붓을 쥐여 주고 그 시설을 겨눌 뿐이고, 없애는 것은 확정 바다.
       */
      erase: () => {
        facilityPanel.hide();
        // 붓을 쥐여 주고 그 시설을 겨눌 뿐이다 — 없애는 것은 확정 바다
        build.pick('erase', '철거');
        const at = tileOf(handle);
        aimAt(at.i, at.j);
      },
      developMenu: read()?.menuCraft
        ? () => {
            facilityPanel.hide();
            openMenuLab(handle);
          }
        : null,
    });
    /*
     * 입출구 표식 (K51) — **이 시설 하나만**, 시트가 열려 있는 동안만이다.
     * 지도에 상시로 그리면 슬라이드 네 채짜리 워터파크가 표식 여덟 개로 덮인다.
     * `ride` 가 없는 시설이면 씬이 알아서 끈다 (`rideTilesOf` 가 `null`).
     *
     * ⚠ **`show()` 뒤에 `visible` 을 보고 켠다.** 앞에서 켜면 시트가 안 뜬 경우
     * (주간 카드가 모달로 막았다 — `panelHost.open` 이 `false`) 지도에 표식만 남는다.
     * 안 뜬 시트에는 `onClose` 도 안 오므로 되돌릴 길이 없다.
     */
    h.scene.setRideMarkFor(facilityPanel.visible ? handle : null);
  };

  openMenuLab = (handle: number): void => {
    const confirmEquippedMenu = (): boolean => {
      const item = h.placement.all().find((candidate) => candidate.handle === handle);
      const def = item ? facilityDef(item.defId) : undefined;
      // 장착·발견·시설 호환 규칙은 sim의 단일 운영 판정을 그대로 쓴다.
      const operable = h.placement.menuOperabilityOf(handle, (id) => menus.hasRecipe(id));
      const changed = observeOnboardingMenu(onboarding, def, operable);
      if (changed) refreshManagement();
      return changed;
    };
    menuLab.show(menus, h.placement, handle, {
      cash: () => week.cash,
      spend: (cost) => week.spend(cost, 'menuDevelopment'),
      onChanged: (result) => {
        h.guests.invalidate();
        confirmEquippedMenu();
        if (result?.kind === 'discovered') {
          audio.play('sfx/discover');
          toast(`${result.recipe?.name ?? '메뉴'} 발견 · 바로 장착`, 'ok');
        } else if (result?.kind === 'failed') {
          toast(`${result.clue} · 연구 ${Math.round(result.progress * 100)}%`);
        }
        persist();
      },
    });
    // 매점 기본 메뉴처럼 배치 순간 이미 장착된 상태는 실제 메뉴 시트를 열어 확인하면 된다.
    if (menuLab.visible && confirmEquippedMenu()) persist();
  };

  /** 시설의 앵커 칸 — 철거 조준이 그 자리를 겨눠야 무엇을 지우는지가 보인다 */
  const tileOf = (handle: number): { i: number; j: number } => {
    const it = h.placement.all().find((x) => x.handle === handle);
    return { i: it?.i ?? 0, j: it?.j ?? 0 };
  };

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

  /**
   * 성장 목록 넷을 다시 그린다 — 의뢰 · 소원 · 인증 · **단골**.
   *
   * ## 무엇이 바뀌었나 (IA 재설계 §4.1 · UX 감사 P0-2 · P1-10)
   *
   * · 넷이 메뉴 시트 꼬리에 직렬로 붙어 900px 를 먹던 것을 **각자 자기 화면**으로 보냈다.
   * · 의뢰는 `slice(0, 6)` 으로 16종 중 6종만 보이던 것을 **전량**으로.
   * · 조건 줄에 **주어를 붙인다** — `· 1 / 3개` 가 아니라 `선착장 1 / 3개`.
   *   주어는 `kairo-terms.ts` 가 `QuestCondition` 에서 만든다 (sim 에 한글 0).
   * · **단골 목록이 생겼다.** 예전에는 `#kairo-regular-list` 가 소원 머리였고 열린 소원이
   *   없으면 아예 없어서, 온보딩 6·7단계의 Today 버튼이 조용한 no-op 이었다.
   *
   * ⚠ 화면에 안 보여도 **언제나 그린다** — 하네스가 닫힌 시트에서 `#kairo-quests` 의
   * textContent 를 읽는다.
   */
  const refreshQuests = (): void => {
    const st = questStatuses(h.placement, lastSummary, h.guests.swimZones());
    const g = currentGrade();
    const nextGrade = GRADES.find((grade) => grade.grade === g.grade + 1);
    const quests = questList(
      st.map((s) => ({
        id: s.id,
        name: s.name,
        desc: s.desc,
        detail: s.detail,
        cond: s.cond,
        progress: s.progress,
        done: s.done,
        reward: s.reward,
        claimed: progress.isClaimed(s.id),
      })),
      nextGrade ? `${nextGrade.grade}등급` : '다음 등급',
    );

    const openW = wishes.openWishes(h.placement, lastSummary, h.guests.swimZones());
    const wishesList = wishList(
      openW.map((w) => ({
        id: `${w.char.id}:${w.wish.condition.kind}`,
        character: w.char.name,
        line: w.wish.line,
        detail: w.detail,
        progress: w.progress,
      })),
    );

    const regulars = regularList(
      REGULAR_CHARACTERS.map((character) => {
        const status = wishes.regularStatus(character.id);
        const requests = character.regular?.requests ?? [];
        return {
          id: character.id,
          name: character.name,
          /*
           * "만났다" = 단골 사슬이 시작됐다. `regularStatus` 는 데이터가 있는 인물이면
           * 언제나 값을 주므로, 만남 여부는 **친밀도가 움직였는지**로 잰다 — 그래야 새
           * 판에서 `아직 안 만났습니다` 가 정직하다.
           */
          met: status !== null && (status.stage > 0 || status.affinity > 0),
          stage: status?.stage ?? 0,
          stages: requests.length,
          want: status ? `“${status.request.line}”` : '',
          done: status?.done ?? false,
        };
      }),
    );

    /*
     * ⚠ **인증은 시트가 닫혀 있으면 다시 안 잰다** (P3-E). `evaluateCombos` 를 한 번 더
     * 돌리는 비용이 커서(실측 시설 53채에 2.2ms) 1.5초 폴링이 안 보이는 목록에 폰
     * 프레임을 쓸 이유가 없다. 대신 **옛 값을 그대로 유지**한다 — 목록 자체는 늘 있다.
     */
    const lists = [quests, wishesList, regulars];
    if (hud.menuOpen) {
      const certSt = certStatuses(h.placement, lastSummary, {
        zones: h.guests.swimZones(),
        courses: courses.count,
        questsDone: progress.claimedCount,
      });
      const nearest = [...certSt]
        .filter((c) => !certs.has(c.id))
        .sort((a, b) => b.progress - a.progress)[0];
      lists.push(
        certList(
          certSt.map((c) => ({
            id: c.id,
            name: c.name,
            desc: c.desc,
            reqs: c.reqs,
            progress: c.progress,
            earned: certs.has(c.id),
            reward: c.reward,
          })),
          nearest
            ? `가장 가까운 것은 ${nearest.name}입니다 (${conditionLine(nearest.reqs[0]!.cond, nearest.reqs[0]!.detail)})`
            : '시설을 늘리면 인증 조건이 채워집니다',
        ),
      );
    }
    management.setLists(lists);
    /*
     * 인증 가산은 **어딘가에서 보여야 한다** — 정원 숫자가 왜 등급표보다 큰지 말하지
     * 않으면 버그로 읽힌다. 라우터의 `성장` 부제가 그 자리다 (아래 `routeDetails`).
     */
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
    // 표시 중인 값을 같이 기억한다 — `syncCash`(K48) 와 정본이 갈리면 안 된다
    cashShown = week.cash;
    hud.setCash(cashShown);
    hud.setHeader({
      weather: WEATHER_GLYPH[week.liveWeather() ?? ''] ?? '☀',
      /*
       * ⚠ **`%` 를 붙이지 않는다** (UX 감사 P0-5). 평판은 0~100 정수지 백분율이 아니고,
       * 목표·심사·인증이 전부 `0/55` 처럼 같은 눈금으로 말한다. `%` 가 붙어 있으면
       * "헤더의 0% 와 목표의 0/55 가 같은 값인가"를 화면만 보고 풀 수 없다.
       */
      sat: `${Math.round(reputation.value)}`,
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
  checkEnding();
  refreshManagement();
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
    build: KAIRO_BUILD,
    week,
    report,
    runWeek,
    flow,
    unlocks,
    exam,
    /** 심사 확인 화면 (K48) — 하네스가 "탭이 바로 돈을 쓰지 않는다"를 잰다 */
    examView,
    openExam,
    refreshExamBtn,
    /**
     * 음성 대조군 (K48) — 고친 규칙을 **코드로** 되돌린다 (`setRenderFaultForTest` 와 같은 급).
     *
     * ⚠ 하네스가 `import('/src/ui/kairo-exam.ts')` 로 직접 부르면 **다른 모듈 사본**을
     * 만질 수 있다 (실측: 주입해도 화면이 안 바뀌었다). 앱이 쓰는 바로 그 사본을 여기로 낸다.
     */
    setExamFaultForTest,
    wishes,
    arrivalQueue,
    /** Phase 7 브라우저 계약 — production 사건만 관찰하고 단계 자체는 고치지 않는다. */
    onboardingStep: () => onboarding.step,
    /** 커리어 기록은 별도 영속 프로필이라 코스 적용 전후를 직접 대조한다. */
    careerSnapshot: () => career.toSnapshot(),
    /** 첫 엔딩 판정과 기록 시트. 판정은 production 함수 그대로다. */
    ending: { check: checkEnding, open: openEnding },
    /** 아침 도착과 같은 KairoUnlockView 경로를 쓰되 시간을 840 tick 감지 않는 셋업 손잡이. */
    showNextArrivalForTest: () => {
      const celebration = arrivalQueue.shift();
      if (!celebration) return false;
      if (unlockView.show(celebration)) return true;
      arrivalQueue.unshift(celebration);
      return false;
    },
    openWeekCards: nextWeekCards,
    skipForward,
    beginWeek,
    cards,
    cardView,
    staff,
    staffPanel,
    /**
     * 시설 인스턴스 정보 (K49) — 하네스가 "붓 없이 시설을 탭하면 실제 값이 뜨나"를 잰다.
     * ⚠ 여는 것은 `tapTile` 로 재라 — 이 손잡이로 직접 열면 **탭 규칙**(붓을 든 상태에서는
     * 안 뜬다 · 빈 칸은 아무 일도 없다)을 통째로 우회한다.
     */
    facilityPanel,
    menuLab,
    menus,
    facilityInfo: (handle: number) => facilityInfo(h.placement, handle),
    courses,
    coursePanel,
    courseApi: course,
    catalog,
    showcase,
    newGame,
    scenario,
    mapDef,
    priceMult: () => priceMult,
    /** 지도 위에 떠 있는 `+₩N` 의 수 (K48) — 하네스가 "이펙트가 실제로 떴나"를 잰다 */
    floatCount: () => h.scene.floatCountForTest,
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
    /**
     * 판 셋업용 평판 (K48) — `setGradeForTest` 와 같은 급.
     *
     * 심사 화면의 **자격 있는 상태**를 재려면 평판이 다음 문턱을 넘어야 하는데, 정상
     * 경로로 가려면 여러 주를 돌려야 한다 (그때 재는 것은 심사 화면이 아니다).
     * 평판은 이동평균이라 한 번 밀어서는 목표값에 못 닿는다 — 수렴시킨다.
     */
    setReputationForTest: (n: number) => {
      for (let i = 0; i < 80; i++) reputation.push(n);
      refreshExamBtn();
      refreshGoal();
      refreshCaps();
      return reputation.value;
    },
    combos: { previewCombos, evaluateCombos },
    quests: { questStatuses, gradeFor, requiredGrade },
    /**
     * 사이드 인증 (P3-E) — 하네스가 **화면과 시뮬이 같은 상한을 말하는지** 재는 손잡이.
     * `grade()` 는 인증 가산이 **들어간** 등급이다 (`currentGrade` 그대로).
     */
    certs: {
      earned: () => certs.earnedIds,
      bonus: () => certs.bonus(),
      grade: () => currentGrade(),
      statuses: () =>
        certStatuses(h.placement, lastSummary, {
          zones: h.guests.swimZones(),
          courses: courses.count,
          questsDone: progress.claimedCount,
        }),
      /**
       * 판 셋업용 (`setGradeForTest` 와 같은 급). 인증을 **정상 경로로** 따려면
       * 시설 수십 종·코스 여러 개를 지어야 해서 검사가 배치 스크립트가 된다 — 그때 재는 것은
       * "정원 가산이 입장을 늘리는가"가 아니다. 획득 판정 자체는 단위 검사가 잰다.
       */
      grantForTest: (id: string) => {
        const s = certStatuses(h.placement, lastSummary, {
          zones: h.guests.swimZones(),
          courses: courses.count,
          questsDone: progress.claimedCount,
        }).find((x) => x.id === id);
        if (!s) return false;
        certs.claim([{ ...s, done: true, remaining: 0 }]);
        refreshQuests();
        refreshCaps();
        return true;
      },
    },
    risk: { assessRisk, RISK_NAMES },
    refreshRisk,
    /** 지금 해금된 토지 — 검증이 좌표를 박지 않게 (K36) */
    land: () => landRect(currentGrade()),
    /**
     * 공원 입구 칸 (K36) — `land()` 와 같은 급의 읽기 손잡이.
     * 도달 검사(`placement.check`)가 이 칸에서 BFS 하므로, 검증이 시설을 하나 놓아 보려면
     * 이 값을 알아야 한다. `(0,0)` 으로 넘기면 전부 `unreachable` 로 조용히 거절된다.
     */
    gate: GATE,
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
    __kairoBrush: () => build.brush,
    __kairoClearBrush: clearBrush,
    __kairoCards: cardView,
  });
  if (assetReview) {
    Object.assign(h, {
      assetReview: installFourDirectionAssetReview(
        h as import('./review/kairo-asset-review.js').ReviewRuntimeHandle,
        allFacilityDefs(),
      ),
    });
  }
  const terrainLog = terrainV2Pilot
    ? 'terrain-v2 D=2'
    : terrainV3SourceRequested && reviewedShoreRadius !== undefined
      ? `terrain-v3-source D=4 radius=${reviewedShoreRadius}`
      : 'terrain-v3-source D=4 no-radius';
  console.log(
    `[카이로] 에셋 ${h.provider.name} (${h.provider.ids.length}장 플레이스홀더) · ` +
      `${hdPixelPilot ? 'HD 검토 D=2' : '기본 시설 D=2'} + ${terrainLog} · ` +
        '확대는 캔버스 정수 배율',
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
