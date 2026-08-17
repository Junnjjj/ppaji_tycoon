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
 * 카이로 씬 — `?kairo=1` 로 띄운다.
 *
 * v1 씬(Phase 0~1 산출물)을 아직 기본으로 둔다. 카이로가 페이즈를 다 통과하면
 * 기본을 바꾸고 `verify:mobile` 도 그때 옮긴다 — 지금 바꾸면 기존 검증이 통째로 깨진다.
 */
async function mainKairo(parent: HTMLElement): Promise<void> {
  const { bootKairo } = await import('./render/kairo/boot.js');
  const { GROUND_KINDS } = await import('./sim/kairo/terrain.js');
  const { placeWall, removeWall, WALL_SOLID, WALL_DOOR, PLACE_MESSAGES } = await import(
    './sim/kairo/walls.js'
  );
  const box = document.createElement('div');
  box.id = 'kairo-debug';
  box.style.cssText =
    'position:fixed;left:8px;top:8px;z-index:9;font:11px/1.5 ui-monospace,monospace;' +
    'background:rgba(0,0,0,.55);color:#e8f4ff;padding:6px 8px;border-radius:6px;' +
    'pointer-events:none;white-space:pre';
  document.body.append(box);

  const h = bootKairo({
    parent,
    onFrame: (s) => {
      box.textContent =
        `FPS ${s.fps}  S=${s.upscale}  버퍼 ${s.bufferW}×${s.bufferH}\n` +
        `스크롤 ${s.scrollX},${s.scrollY}  타일 ${s.tiles}  벽 ${s.walls}\n` +
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
          toast('');
        } else {
          // 밀폐 차단이면 몇 칸이 갇히는지 함께 보여준다
          toast(PLACE_MESSAGES[r.reason] + (r.sealed ? ` (${r.sealed}칸)` : ''));
        }
        return;
      }
      if (brush === 'erase') {
        if (removeWall(h.walls, i, j)) h.scene.refreshWall(i, j);
        return;
      }
      if (h.terrain.paint(i, j, brush)) h.scene.refreshTile(i, j);
    },
  });

  /** 게이트 — K4 에서 매표소 배치로 대체한다. 지금은 좌상단 고정 */
  const GATE = { i: 0, j: 0 };

  const msg = document.createElement('div');
  msg.id = 'kairo-toast';
  msg.style.cssText =
    'position:fixed;left:50%;transform:translateX(-50%);bottom:64px;z-index:10;' +
    'font:12px/1.4 system-ui;background:rgba(180,40,30,.92);color:#fff;padding:8px 12px;' +
    'border-radius:8px;pointer-events:none;max-width:86vw;text-align:center';
  msg.hidden = true;
  document.body.append(msg);
  let toastTimer = 0;
  const toast = (text: string): void => {
    msg.textContent = text;
    msg.hidden = text === '';
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
    { id: 'erase', name: '벽 지우기' },
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

  // 검증 도구가 시뮬 규칙을 직접 부를 수 있게 노출한다 (브라우저에서 규칙을 재구현하지 않도록)
  Object.assign(h, { sim: { placeWall, removeWall, WALL_SOLID, WALL_DOOR, PLACE_MESSAGES } });
  Object.assign(window, { __kairo: h, __kairoBrush: () => brush });
  console.log(
    `[카이로] 에셋 ${h.provider.name} (${h.provider.ids.length}장 플레이스홀더) · ` +
      '카메라 줌 1 고정 · 확대는 캔버스 정수 배율',
  );
}

async function main(): Promise<void> {
  const parent = document.getElementById('game');
  if (!parent) throw new Error('#game 컨테이너를 찾지 못했습니다');

  if (new URLSearchParams(location.search).get('kairo') === '1') {
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
