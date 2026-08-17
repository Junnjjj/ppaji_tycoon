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
  const { placeWall, removeWall, WALL_SOLID, WALL_DOOR, PLACE_MESSAGES } = await import(
    './sim/kairo/walls.js'
  );
  const { allFacilityDefs, PLACE_FAIL_MESSAGES } = await import('./sim/kairo/placement.js');
  const { WeekRunner } = await import('./sim/kairo/week.js');
  const { previewCombos, evaluateCombos } = await import('./sim/kairo/combos.js');
  const { questStatuses, ProgressStore, gradeFor, requiredGrade, admissionLimit } = await import(
    './sim/kairo/progress.js'
  );
  const { assessRisk, RISK_NAMES } = await import('./sim/kairo/risk.js');
  const { KairoReport } = await import('./ui/kairo-report.js');
  const { Rng: RngCls } = await import('./sim/rng.js');
  const { loadKairoFromStorage, saveKairoToStorage } = await import('./save/kairo.js');
  const { facilityDef } = await import('./sim/kairo/placement.js');

  /**
   * 세이브를 먼저 읽는다 — 지형·벽·시설을 씬에 넘겨야 하므로 부팅보다 앞이어야 한다.
   * 없으면 시드에서 새로 만든다 (`bootKairo` 기본 동작).
   */
  const saved = loadKairoFromStorage();
  const KAIRO_SEED = saved?.seed ?? 20260818;
  const box = document.createElement('div');
  box.id = 'kairo-debug';
  box.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:9;font:11px/1.5 ui-monospace,monospace;' +
    'background:rgba(0,0,0,.55);color:#e8f4ff;padding:6px 8px;border-radius:6px;' +
    'pointer-events:none;white-space:pre';
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

  const h = bootKairo({
    parent,
    seed: KAIRO_SEED,
    ...(saved
      ? {
          terrain: saved.terrain,
          walls: saved.walls,
          placement: saved.placement,
          gate: saved.gate,
        }
      : {}),
    onFrame: (s) => {
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
    onTapTile: (i, j) => {
      if (!brush) {
        console.log(`[카이로] 탭 타일 (${i}, ${j}) — ${h.terrain.kindAt(i, j) ?? '?'}`);
        return;
      }
      if (brush === 'wall' || brush === 'door') {
        const r = placeWall(
          h.terrain,
          h.walls,
          GATE,
          i,
          j,
          brush === 'wall' ? WALL_SOLID : WALL_DOOR,
        );
        if (r.ok) {
          h.scene.refreshWall(i, j);
          h.guests.invalidate(); // 벽이 바뀌면 거리장을 다시 만든다
          toast('');
          persist();
        } else {
          // 밀폐 차단이면 몇 칸이 갇히는지 함께 보여준다
          toast(PLACE_MESSAGES[r.reason] + (r.sealed ? ` (${r.sealed}칸)` : ''));
        }
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
        if (removeWall(h.walls, i, j)) {
          h.scene.refreshWall(i, j);
          h.guests.invalidate();
          persist();
        }
        return;
      }
      if (brush === 'facility') {
        const defId = picker.value;
        // 등급 해금 — 허가는 돈으로 못 산다 (퇴장 만족도로만 오른다)
        const grade = gradeFor(lastSummary?.exitSatisfaction ?? 0);
        const need = requiredGrade(defId);
        if (need > grade.grade) {
          toast(`아직 못 짓습니다 — ${need}등급 필요 (현재 ${grade.grade}등급 ${grade.name})`);
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
        const r = h.placement.place(h.terrain, h.walls, GATE, defId, i, j);
        if (r.ok && r.placed) {
          week.spend(cost);
          h.scene.refreshFacility(r.placed.handle);
          h.guests.invalidate();
          // 놓고 나서 터진 콤보를 알려준다
          const gained = previewCombos(h.placement, defId, i, j);
          const now = evaluateCombos(h.placement);
          const msgs: string[] = [`−${Math.round(cost / 10000)}만`];
          if (now.active.length > 0) msgs.push(`콤보 ${now.active.length}개 발동`);
          toast(msgs.join(' · '), 'ok');
          void gained;
          persist();
        } else {
          toast(PLACE_FAIL_MESSAGES[r.fail ?? 'unknown-def']);
        }
        return;
      }
      if (h.terrain.paint(i, j, brush)) {
        h.scene.refreshTile(i, j);
        h.guests.invalidate(); // 통행 가능성이 바뀐다
        persist();
      }
    },
  });

  /** 게이트 — K4 에서 매표소 배치로 대체한다. 지금은 좌상단 고정 */
  const GATE = saved?.gate ?? { i: 0, j: 0 };

  const msg = document.createElement('div');
  msg.id = 'kairo-toast';
  msg.style.cssText =
    'position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:10;' +
    'font:12px/1.4 system-ui;background:rgba(180,40,30,.92);color:#fff;padding:8px 12px;' +
    'border-radius:8px;pointer-events:none;max-width:86vw;text-align:center';
  msg.hidden = true;
  document.body.append(msg);
  let toastTimer = 0;
  const toast = (text: string, kind: '' | 'ok' = ''): void => {
    msg.textContent = text;
    msg.hidden = text === '';
    msg.style.background = kind === 'ok' ? 'rgba(40,140,90,.92)' : 'rgba(180,40,30,.92)';
    window.clearTimeout(toastTimer);
    if (text !== '') toastTimer = window.setTimeout(() => (msg.hidden = true), 2600);
  };

  // 지면 붓 — 터치 타깃 44px 이상 (모바일 검증 기준)
  let brush: string | null = null;
  const bar = document.createElement('div');
  bar.id = 'kairo-brush';
  bar.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;z-index:9;display:flex;gap:4px;padding:6px;' +
    'background:rgba(0,0,0,.6);overflow-x:auto';
  const BRUSHES: { id: string; name: string }[] = [
    ...GROUND_KINDS.map((k) => ({ id: k.id, name: k.name })),
    { id: 'wall', name: '벽' },
    { id: 'door', name: '문' },
    { id: 'facility', name: '시설' },
    { id: 'erase', name: '지우기' },
  ];
  for (const k of BRUSHES) {
    const b = document.createElement('button');
    b.textContent = k.name;
    b.dataset['kind'] = k.id;
    b.style.cssText =
      'min-width:64px;min-height:44px;border:2px solid transparent;border-radius:6px;' +
      'background:#20303c;color:#dceaf4;font-size:12px';
    b.addEventListener('click', () => {
      brush = brush === k.id ? null : k.id;
      for (const el of bar.querySelectorAll('button')) {
        (el as HTMLElement).style.borderColor =
          (el as HTMLElement).dataset['kind'] === brush ? '#7ad0ff' : 'transparent';
      }
    });
    bar.append(b);
  }
  document.body.append(bar);

  /**
   * 시설 선택 — 73종이라 버튼 바에 다 못 넣는다. 존별로 묶은 select 로 둔다.
   * 실제 게임 UI 는 K8 의 도감·건설 팔레트가 대체한다.
   */
  const picker = document.createElement('select');
  picker.id = 'kairo-facility';
  picker.style.cssText =
    'position:fixed;left:8px;bottom:64px;z-index:9;min-height:44px;font-size:13px;' +
    'background:#20303c;color:#dceaf4;border:1px solid #3a5566;border-radius:6px;padding:4px 6px;' +
    'max-width:60vw';
  const ZONE_NAME: Record<string, string> = {
    indoor: '실내',
    land: '야외',
    water: '물 위',
    pension: '펜션',
    season: '계절',
  };
  for (const zone of ['indoor', 'land', 'water', 'pension', 'season']) {
    const grp = document.createElement('optgroup');
    grp.label = ZONE_NAME[zone] ?? zone;
    for (const d of allFacilityDefs().filter((x) => x.layer === zone)) {
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = `${d.name} ${d.size[0]}×${d.size[1]}${
        d.placement.requiresWallAdjacent ? ' (벽)' : ''
      }`;
      grp.append(o);
    }
    picker.append(grp);
  }
  document.body.append(picker);

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
    sim: { placeWall, removeWall, WALL_SOLID, WALL_DOOR, PLACE_MESSAGES },
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
  const week = new WeekRunner(h.terrain, h.placement, h.guests);
  runner = week; // 프레임이 이제부터 주차·현금을 읽을 수 있다
  const report = new KairoReport(document.body);
  const weekRng = new RngCls(31337);
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

  /** 세이브 — 배치·주 진행처럼 상태가 실제로 바뀐 뒤에만 부른다 */
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
    });
  };

  const runWeek = (): void => {
    if (h.scene.isPlaying || report.visible) return;
    const t0 = performance.now();
    // 등급이 동시 손님 상한과 방문 수요를 올린다 — 만족도를 관리해야 성장한다
    const gr = gradeFor(lastSummary?.exitSatisfaction ?? 0);
    h.guests.setMaxGuests(admissionLimit(gr, h.placement.totalCapacity()));
    const rep = week.run(weekRng, {
      season,
      playbackEvery: 6,
      reputation: gr.reputationPull,
    });
    const calcMs = performance.now() - t0;
    lastReport = rep;
    lastSummary = {
      visitors: rep.visitors,
      turnedAway: rep.turnedAway,
      profit: rep.profit,
      exitSatisfaction: rep.exitSatisfaction,
    };
    // 의뢰 보상은 결산 시점에 지급한다 — 배치 때마다 주면 같은 의뢰가 여러 번 판정된다
    const weekClaim = progress.claim(questStatuses(h.placement, lastSummary));
    if (weekClaim.cash > 0) week.earn(weekClaim.cash);
    persist();
    console.log(
      `[카이로] ${rep.week}주차 계산 ${calcMs.toFixed(0)}ms · 방문 ${rep.visitors} · ` +
        `손익 ${rep.profit} · 프레임 ${rep.playback.length}`,
    );
    h.scene.playWeek(rep.playback, 3500, () => {
      report.show(rep, {
        onClose: () => undefined,
        onReplay: () => h.scene.playWeek(rep.playback, 3500, () => report.show(rep, { onClose: () => undefined })),
      });
    });
  };

  const weekBtn = document.createElement('button');
  weekBtn.id = 'kairo-week';
  weekBtn.textContent = '한 주 진행 ▶';
  weekBtn.style.cssText =
    'position:fixed;right:8px;bottom:64px;z-index:9;min-height:48px;min-width:120px;' +
    'border-radius:10px;border:none;background:#2f7fc0;color:#fff;font-size:15px;font-weight:600';
  weekBtn.addEventListener('click', runWeek);
  document.body.append(weekBtn);

  /**
   * 의뢰 목록 — **상시 표시**다. 선택 카드가 아니라 목록이라 플레이어가 언제든
   * "다음에 뭘 하지"에 답을 갖는다 (v4 결정).
   */
  const questPanel = document.createElement('div');
  questPanel.id = 'kairo-quests';
  questPanel.style.cssText =
    'position:fixed;right:8px;top:8px;z-index:9;width:190px;max-height:44vh;overflow-y:auto;' +
    'background:rgba(0,0,0,.6);color:#e8f4ff;border-radius:8px;padding:6px 8px;' +
    'font:11px/1.45 system-ui,sans-serif';
  document.body.append(questPanel);

  /**
   * 위험도 — **상시 표시**. 사고를 순수 확률로 두면 "안전도 78인데 RNG 로 폐쇄"가 되어
   * 억울하다. 단계를 항상 보여주고 사고는 경계·위험 단계에서만 난다 (v4 결정).
   */
  const riskBox = document.createElement('div');
  riskBox.id = 'kairo-risk';
  riskBox.style.cssText =
    'position:fixed;right:8px;bottom:120px;z-index:9;min-width:120px;padding:6px 8px;' +
    'border-radius:8px;font:11px/1.4 system-ui,sans-serif;color:#fff;text-align:center';
  document.body.append(riskBox);

  const RISK_COLOR: Record<string, string> = {
    safe: 'rgba(40,140,90,.9)',
    watch: 'rgba(190,160,40,.9)',
    caution: 'rgba(210,120,40,.92)',
    danger: 'rgba(200,50,40,.94)',
  };

  const refreshRisk = (): void => {
    const r = assessRisk(h.placement, h.guests);
    riskBox.style.background = RISK_COLOR[r.level] ?? RISK_COLOR['safe']!;
    riskBox.textContent =
      `위험도 ${RISK_NAMES[r.level]}` +
      (r.safetyNeeded > 0 ? `\n안전 시설 ${r.safetyNeeded}개 더` : '\n사고 없음');
    riskBox.style.whiteSpace = 'pre';
  };

  const refreshQuests = (): void => {
    const st = questStatuses(h.placement, lastSummary);
    const open = st.filter((s) => !progress.isClaimed(s.id));
    const rows = open.slice(0, 6);
    questPanel.replaceChildren();
    const title = document.createElement('div');
    const g = gradeFor(lastSummary?.exitSatisfaction ?? 0);
    title.textContent =
      `의뢰 ${st.length - open.length}/${st.length} · ${g.grade}등급 ${g.name}\n` +
      `동시 ${g.maxGuests}명 · 수요 ×${g.reputationPull}`;
    title.style.whiteSpace = 'pre';
    title.style.cssText = 'font-weight:600;margin-bottom:4px;opacity:.85';
    questPanel.append(title);
    for (const s of rows) {
      const row = document.createElement('div');
      row.style.cssText = 'margin-bottom:5px';
      const name = document.createElement('div');
      name.textContent = `${s.done ? '✓ ' : ''}${s.name}`;
      name.style.cssText = s.done ? 'color:#8fe08f' : '';
      const bar = document.createElement('div');
      bar.style.cssText =
        'height:3px;border-radius:2px;background:rgba(255,255,255,.15);margin:2px 0';
      const fill = document.createElement('div');
      fill.style.cssText =
        `height:100%;width:${Math.round(s.progress * 100)}%;border-radius:2px;` +
        `background:${s.done ? '#8fe08f' : '#4a9ad0'}`;
      bar.append(fill);
      const det = document.createElement('div');
      det.textContent = s.detail;
      det.style.cssText = 'opacity:.6;font-size:10px';
      row.append(name, bar, det);
      questPanel.append(row);
    }
  };
  refreshQuests();
  refreshRisk();
  setInterval(() => {
    refreshQuests();
    refreshRisk();
  }, 1500);

  Object.assign(h, {
    week,
    report,
    runWeek,
    progress,
    refreshQuests,
    getLastReport: () => lastReport,
    combos: { previewCombos, evaluateCombos },
    quests: { questStatuses, gradeFor, requiredGrade },
    risk: { assessRisk, RISK_NAMES },
    refreshRisk,
  });
  Object.assign(window, { __kairo: h, __kairoBrush: () => brush });
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
