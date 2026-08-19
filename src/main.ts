import './compat.js'; // 다른 무엇보다 먼저 — 스프라이트를 굽기 전에 보정이 끝나야 한다
import './ui/style.css';
import { Game as Sim } from './sim/index.js';
import { createAssetProvider } from './assets/index.js';
import { boot, type MainScene } from './render/index.js';
import { Hud } from './ui/hud.js';
import { loadFromStorage, saveToStorage } from './save/index.js';

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
  const { previewCombos, evaluateCombos } = await import('./sim/kairo/combos.js');
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
  const { KairoReport } = await import('./ui/kairo-report.js');
  const { KairoCardView } = await import('./ui/kairo-card.js');
  const { KairoUnlockView } = await import('./ui/kairo-unlock.js');
  const { CardStore, CARD_RNG_SALT, triggerCard } = await import('./sim/kairo/cards.js');
  const { accidentChance } = await import('./sim/kairo/risk.js');
  const scen = await import('./sim/kairo/scenario.js');
  const { seasonShares } = await import('./sim/kairo/groups.js');
  const { KairoNewGame } = await import('./ui/kairo-newgame.js');
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
       * 출입구 (K36-B) — **칸을 탭한다.** 경계를 폰에서 정확히 찍는 것은 무리다.
       * 그 칸의 쓸 수 있는 면 중 하나에 문이 나고, 다시 탭하면 다음 면으로 돌아간다.
       * 한 바퀴 돌면 없앤다. 후보 판정은 `doorCandidates` 하나를 sim 과 공유한다 —
       * 갈라지면 UI 가 놓으라고 해 놓고 굽기가 무시하는 상태가 된다.
       */
      /*
       * 이동 (K42) — 첫 탭: 시설 선택 · 둘째 탭: 고스트 → 확정.
       * 자기 자신과의 겹침 판정은 "치우고 재고 되돌리는" 프로브로 푼다 — 복제 규칙을
       * 만들지 않는다 (판정은 placement.check 하나다).
       */
      if (brush === 'move') {
        if (!exam.toolsUnlocked) {
          toast('이동은 첫 심사 통과의 보상입니다');
          return;
        }
        if (!moveSel) {
          const hit = h.placement.at(i, j);
          if (!hit) {
            toast('옮길 시설을 탭하세요');
            return;
          }
          const def = facilityDef(hit.defId);
          moveSel = { handle: hit.handle, defId: hit.defId, i: hit.i, j: hit.j, facing: hit.facing ?? 0 };
          hud.setBrush(`이동: ${def?.name ?? hit.defId}`);
          toast(
            `${def?.name ?? hit.defId} — 옮길 자리를 탭하세요 ` +
              `(${Math.round(Math.floor((def?.cost ?? 0) * 0.1) / 10000)}만)`,
          );
          return;
        }
        const sel = moveSel;
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
        h.scene.setGhost(sel.defId, i, j, chk.ok, sel.facing);
        hud.showConfirm(
          chk.ok
            ? `이동: ${def?.name ?? sel.defId} · ${Math.round(fee / 10000)}만`
            : PLACE_FAIL_MESSAGES[chk.fail ?? 'unknown-def'],
          chk.ok && fee <= week.cash,
          {
            cancel: () => {
              h.scene.setGhost(null);
              moveSel = null;
              hud.setBrush('이동');
            },
            confirm: () => {
              h.scene.setGhost(null);
              if (fee > week.cash) {
                toast('돈이 부족합니다');
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
                return;
              }
              week.spend(fee);
              const gone = sel.handle;
              moveSel = null;
              hud.setBrush('이동');
              h.scene.refreshFacility(gone);
              h.scene.refreshFacility(r.placed.handle);
              h.guests.invalidate();
              audio.play('sfx/place');
              toast(`이동 — ${Math.round(fee / 10000)}만`, 'ok');
              persist();
            },
          },
        );
        return;
      }
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
      if (brush === 'erase') {
        // 시설이 먼저 — 시설 위를 탭했으면 그걸 지운다
        const hit = h.placement.at(i, j);
        if (hit) {
          const def = facilityDef(hit.defId);
          h.placement.remove(hit.handle);
          h.scene.refreshFacility(hit.handle);
          h.guests.invalidate();
          refreshBuildList(); // 자리가 비었으면 잠금이 풀려야 한다 (K31)
          /*
           * 절반만 돌려준다. 전액이면 "놓아보고 안 맞으면 지운다"가 공짜라 배치가
           * 판단이 아니게 되고, 0원이면 오조작 한 번이 판을 망친다.
           */
          const back = def ? Math.floor(def.cost * 0.5) : 0;
          if (back > 0) {
            week.earn(back);
            toast(`철거 — ${Math.round(back / 10000)}만 환급`, 'ok');
          }
          persist();
          return;
        }
        // 벽은 개별로 못 지운다 — **바닥을 잔디로 되돌리면** 그 벽이 같이 사라진다 (K27)
        if (h.terrain.kindAt(i, j) !== 'lawn' && !h.terrain.isWater(i, j)) {
          /* placement 를 넘긴다 — 길을 지워 시설이 끊기면 거절된다 (K32-B) */
          const r = paintFloor(h.terrain, h.walls, GATE, i, j, 'lawn', walkableNow, h.placement, doors);
          if (!r.ok) {
            toast(INDOOR_FAIL_MESSAGES[r.fail ?? 'no-door']);
            return;
          }
          h.scene.refreshTile(i, j);
          h.scene.refreshAllWalls();
          h.guests.invalidate();
          persist();
        }
        return;
      }
      if (brush === 'facility') {
        const defId = brushFacility;
        // 해금 — 골격(등급) 또는 사건(의뢰 보상). isUnlocked 하나로 묻는다 (K41)
        const grade = currentGrade();
        if (!unlocks.isUnlocked(defId, grade.grade)) {
          const need = requiredGrade(defId);
          toast(
            need <= 5
              ? `아직 못 짓습니다 — ${need}등급 필요 (현재 ${grade.grade}등급 ${grade.name})`
              : '아직 못 짓습니다 — 의뢰 보상으로 열립니다',
          );
          return;
        }
        /*
         * 건설비를 **놓기 전에** 확인한다. 놓고 나서 차감하면 잔액 부족일 때 되돌려야 하고,
         * 그 되돌리기가 점유 격자·거리장까지 건드려 실패 경로가 두 배로 늘어난다.
         *
         * ⚠ K12 까지 UI 는 시설을 공짜로 지었다 — 헤드리스 봇만 돈을 써서,
         * 밸런싱한 건설비 곡선이 실제 플레이에는 없었다.
         */
        const def = facilityDef(defId);
        const cost = def?.cost ?? 0;
        if (cost > week.cash) {
          toast(
            `돈이 부족합니다 — ${Math.round(cost / 10000)}만 필요 ` +
              `(현재 ${Math.round(week.cash / 10000)}만)`,
          );
          return;
        }
        /*
         * ── 고스트 → 확정 (K32) ──
         *
         * 탭하면 **바로 안 놓는다.** 실제 스프라이트를 그 자리에 반투명으로 보여주고,
         * 확정을 눌러야 놓인다. 회전과 "장비 탄 손님" 그림이 나중에 들어오므로 놓기 전에
         * 만질 수 있는 상태가 필요하다.
         *
         * 못 놓는 자리도 고스트를 띄운다 — 왜 안 되는지 라벨로 알려주는 편이
         * 토스트만 스치는 것보다 낫다.
         */
        lastFacilityTap = { i, j };
        const chk = h.placement.check(h.terrain, h.walls, GATE, defId, i, j, {
          ...placeOpts(),
          facing: ghostFacing,
        });
        h.scene.setGhost(defId, i, j, chk.ok, ghostFacing);
        // 회전은 비정사각에만 뜻이 있다 (정사각은 발자국이 같아 버튼이 거짓말이 된다)
        const rotatable = def !== undefined && def.size[0] !== def.size[1];
        hud.showConfirm(
          chk.ok
            ? `${def?.name ?? defId} · ${Math.round(cost / 10000)}만`
            : PLACE_FAIL_MESSAGES[chk.fail ?? 'unknown-def'],
          chk.ok,
          {
            cancel: () => {
              h.scene.setGhost(null);
              ghostFacing = 0;
            },
            ...(rotatable
              ? {
                  rotate: () => {
                    ghostFacing = ghostFacing === 0 ? 1 : 0;
                    if (lastFacilityTap) tapTile(lastFacilityTap.i, lastFacilityTap.j);
                  },
                }
              : {}),
            confirm: () => {
              h.scene.setGhost(null);
              const r = h.placement.place(h.terrain, h.walls, GATE, defId, i, j, {
                ...placeOpts(),
                facing: ghostFacing,
              });
              if (!r.ok || !r.placed) {
                toast(PLACE_FAIL_MESSAGES[r.fail ?? 'unknown-def']);
                return;
              }
              week.spend(cost);
              h.scene.refreshFacility(r.placed.handle);
              h.guests.invalidate();
              const now = evaluateCombos(h.placement);
              refreshBuildList(); // 방이 찼으면 다음 시설이 잠겨야 한다 (K31)
              const msgs: string[] = [`−${Math.round(cost / 10000)}만`];
              if (now.active.length > 0) msgs.push(`콤보 ${now.active.length}개 발동`);
              toast(msgs.join(' · '), 'ok');
              persist();
            },
          },
        );
        return;
      }
      /*
       * 바닥 — 카이로의 `Tiling` 이다 (K27). **편집기 도구가 아니라 사는 것**이고,
       * 실내 바닥을 깐 자리는 그대로 방이 되어 벽이 자동으로 생긴다.
       */
      /*
       * 붓 ID 는 `path_stone` 또는 `floor_indoor@4` 형태다 — 뒤의 숫자가 블록 크기다 (K32).
       * 탭한 칸을 **블록의 좌상단**이 아니라 가운데에 가깝게 두어야 손가락이 가리킨 곳에
       * 깔린다.
       */
      const [kindId, sizeStr] = brush.split('@');
      const n = sizeStr ? Number(sizeStr) : 1;
      const kind = GROUND_KINDS.find((k) => k.id === kindId);
      if (!kind) return;
      const oi = i - Math.floor((n - 1) / 2);
      const oj = j - Math.floor((n - 1) / 2);

      /*
       * 토지 밖에는 못 깐다 (K32).
       *
       * ⚠ 시설은 `outside-land` 로 막는데 **바닥은 안 막고 있었다** — 아직 안 산 땅을
       * 포장하고 건물까지 지을 수 있었다. 등급으로 땅이 열린다는 규칙이 절반만 걸려 있었다.
       */
      const land = landRect(currentGrade());
      if (oi < land.i0 || oj < land.j0 || oi + n > land.i0 + land.w || oj + n > land.j0 + land.h) {
        toast(PLACE_FAIL_MESSAGES['outside-land']);
        return;
      }
      /*
       * ⚠ 바닥 붓도 막아야 한다 (K36). 시설만 막고 바닥을 열어 두면 플레이어가 도로를
       * 석재로 덮어 버린다 — K32 에서 토지 제한을 시설에만 걸어 두고 바닥을 빼먹었던
       * 것과 **정확히 같은 구멍**이다.
       */
      for (let dj = 0; dj < n; dj++) {
        for (let di = 0; di < n; di++) {
          if (h.terrain.inside(oi + di, oj + dj) && !h.terrain.isBuildable(oi + di, oj + dj)) {
            toast(PLACE_FAIL_MESSAGES['not-buildable']);
            return;
          }
        }
      }

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
      if (willChange === 0) return;
      const cost = kind.cost * willChange;
      if (cost > week.cash) {
        toast(
          `돈이 부족합니다 — ${Math.round(cost / 10000)}만 필요 ` +
            `(현재 ${Math.round(week.cash / 10000)}만)`,
        );
        return;
      }
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
  /** 고스트 회전 (K45) — 붓을 새로 집으면 0 으로 */
  let ghostFacing: 0 | 1 = 0;
  /** 마지막 시설 탭 자리 — ↻ 가 같은 자리에서 다시 미리보기를 돌린다 */
  let lastFacilityTap: { i: number; j: number } | null = null;

  const ZONE_NAME: Record<string, string> = {
    indoor: '실내',
    land: '야외',
    water: '물 위',
    pension: '펜션',
    season: '계절',
  };

  const hud = new KairoHud(document.body, {
    onPick: (it: HudItem) => {
      // 붓을 바꾸면 진행 중이던 배치는 취소한다 — 안 그러면 확정 바가 옛 시설을 가리킨다
      hud.hideConfirm();
      h.scene.setGhost(null);
      if (it.kind === 'facility') {
        brush = 'facility';
        brushFacility = it.id;
      } else {
        brush = it.kind === 'erase' ? 'erase' : it.id;
      }
    },
    onWeek: () => skipForward(),
    // 리포트 (K46) — 지난 결산 다시 보기. 수동 열람이라 카드 사슬을 안 탄다
    onReport: () => {
      if (!lastReport) {
        toast('아직 결산이 없습니다 — 첫 주를 보내세요');
        return;
      }
      reportSeenWeek = lastReport.week;
      report.show(lastReport, { onClose: () => undefined });
      refreshCaps();
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
      ...questStatuses(h.placement, lastSummary)
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
    ghostFacing = 0;
    lastFacilityTap = null;
    hud.setBrush(null);
    hud.hideConfirm();
    h.scene.setGhost(null);
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
  Object.assign(h, {
    Rng: RngCls,
    tapTile, // 도구용 — 하네스가 UI 경로를 그대로 밟는다 (K32)
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
  let lastSummary = saved?.lastSummary ?? null;
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
      weekSkip: flow.weekSkipUnlocked,
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
    /** 결산까지 스킵 — 첫 심사 통과 보상 (K42, 스펙 A2). 그 전의 ⏩ 는 하루 단위다 */
    weekSkipUnlocked: exam.toolsUnlocked || (saved?.weekSkip ?? false),
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
      const d = closed[closed.length - 1];
      if (d) {
        const profit = d.revenue - d.upkeep;
        toast(
          `${d.name} · ${profit >= 0 ? '+' : '−'}${Math.abs(Math.round(profit / 10000))}만 · 손님 ${d.visitors}`,
          profit >= 0 ? 'ok' : '',
        );
        audio.play('sfx/day-end');
      }
      // 주말 진입 — sim 의 1.6× 는 예전부터 있었다. 표기가 없었을 뿐이다 (검수 A1)
      if (closed.length === 5) toast('주말 — 손님이 몰립니다', 'ok');
      flow.daysSeen = closed.length;
      refreshCaps();
    }
    if (p.done) settleWeek();
  };

  const flowTick = (dtMs: number): void => {
    if (flow.frozen) return;
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

  /** ⏩ — 기본은 하루 끝까지. 주 스킵은 해금 뒤 (PSS 는 배속을 엔드게임에 준다 — 스펙 A2) */
  const skipForward = (): void => {
    const p = week.liveProgress();
    if (!p || p.done || panelHost.anyOpen) return;
    audio.play('sfx/tap');
    const skipped = week.step(
      flow.weekSkipUnlocked ? TICKS_PER_WEEK - p.tick : TICKS_PER_DAY - (p.tick % TICKS_PER_DAY),
    );
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
      toast(`등급이 내려갔습니다 — ${currentGrade().name}. 만족도를 살피세요`);
    }
    // 심사 판정 (K42) — 부분 점수, 무작위 없음. 결과는 다음 날 아침에 도착한다
    const verdict = exam.judge(week.week, h.placement, {
      visitors: rep.visitors,
      turnedAway: rep.turnedAway,
      profit: rep.profit,
      exitSatisfaction: rep.exitSatisfaction,
    });
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
        // 첫 통과 보상 — 이동 붓 + ⏩ 주 스킵 (스펙 §4.1·A2)
        flow.weekSkipUnlocked = true;
        hud.setWeekLabel('한 주 »');
        refreshBuildList();
        arrivalQueue.push({
          title: '새 도구',
          name: '이동 · 한 주 감기',
          sub: '첫 심사 통과 보상 — 시설을 옮기고, ⏩ 가 한 주를 감습니다',
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
    const weekClaim = progress.claim(questStatuses(h.placement, lastSummary));
    if (weekClaim.cash > 0) {
      week.earn(weekClaim.cash);
      audio.play('sfx/cash');
    }
    /*
     * 소원 (K43) — EXP 적립·소원 열림·성사 판정. 전부 결산 tick 의 결정적 계산이고,
     * 연출(인물 도착·말풍선)은 다음 날 아침 큐가 푼다 (A6).
     */
    for (const ev of wishes.settle(lastSummary, rep.byGroup, h.placement)) {
      if (ev.kind === 'arrive') {
        arrivalQueue.push({
          title: '새 손님이 왔어요',
          name: ev.char.name,
          sub: '소원을 들어주면 또 옵니다 (메뉴 → 소원)',
        });
      } else if (ev.kind === 'open') {
        arrivalQueue.push({
          title: `${ev.char.name}의 소원`,
          name: ev.wish.line,
          sub: '메뉴의 소원 목록에서 진행을 볼 수 있어요',
        });
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
          arrivalQueue.push({
            title: '소원 성사!',
            name: ev.char.name,
            sub:
              ev.wish.reward.cash !== undefined
                ? `고마움의 표시 +${Math.round(ev.wish.reward.cash / 10000)}만`
                : '다음 소원이 기다립니다',
          });
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
      report.show(rep, { onClose: () => nextWeekCards() });
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
   * 지금 주를 끝까지 감고 결산으로 — 주 스킵 해금 뒤의 ⏩ 와 하네스가 쓴다.
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
   * 주 진행·의뢰·위험도는 HUD 가 소유한다 (K28). 위험도는 **하단 바 안**이라
   * 여전히 상시 표시다 — 사고가 RNG 로 느껴지면 안 된다 (v4 결정).
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
    for (const id of activeComboIds(h.placement)) {
      if (!discovered.has(id)) {
        discovered.add(id);
        fresh.push(id);
      }
    }
    return fresh;
  };
  noteDiscoveries();

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

  /** 배속 (K44) — 상시 버튼 3개 불변식 때문에 메뉴 안이다. 세션 선호라 저장 안 한다 */
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
    toast(`심사 신청 — ${pending.judgeWeek}주차 주말 판정 (${reqText})`, 'ok');
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
    for (const q of questStatuses(h.placement, lastSummary)
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
      `위험도 ${RISK_NAMES[r.level]}` + (r.safetyNeeded > 0 ? ` · 안전 +${r.safetyNeeded}` : ''),
    );
  };

  const refreshQuests = (): void => {
    const st = questStatuses(h.placement, lastSummary);
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
    const openW = wishes.openWishes(h.placement, lastSummary);
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
  /** 리포트 배지 — 이 주차 결산을 아직 안 열어 봤으면 N (K46) */
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
      reportNew: lastReport !== null && lastReport.week > reportSeenWeek,
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
  setInterval(() => {
    refreshQuests();
    refreshRisk();
    refreshStaffBtn();
    refreshExamBtn();
    refreshGoal();
    refreshCaps();
  }, 1500);

  /*
   * 흐르는 낮 시동 (K39). 배경 탭에서는 rAF 가 서므로 저절로 멈춘다 —
   * "끄면 멈춘다, 방치 진행 없음" (카이로와 같다, 스펙 §1). 복귀 직후 dt 를 잘라
   * 밀린 시간이 몰아서 흐르지 않게 한다 (멈춤이지 빚이 아니다).
   */
  h.scene.setClockOwner('week');
  syncTickPace();
  syncBoats();
  if (flow.weekSkipUnlocked) hud.setWeekLabel('한 주 »');
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
    combos: { previewCombos, evaluateCombos },
    quests: { questStatuses, gradeFor, requiredGrade },
    risk: { assessRisk, RISK_NAMES },
    refreshRisk,
    /** 지금 해금된 토지 — 검증이 좌표를 박지 않게 (K36) */
    land: () => landRect(currentGrade()),
    /** 놓아 둔 출입구 (K36-B) — 검증이 읽는다 */
    doors,
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
