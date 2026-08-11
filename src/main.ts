import './compat.js'; // 다른 무엇보다 먼저 — 스프라이트를 굽기 전에 보정이 끝나야 한다
import './ui/style.css';
import { Game as Sim } from './sim/index.js';
import { createAssetProvider } from './assets/index.js';
import { boot, type MainScene } from './render/index.js';
import { Hud } from './ui/hud.js';
import { loadFromStorage, saveToStorage } from './save/index.js';

const DEFAULT_SEED = 20260811;
const AUTOSAVE_INTERVAL_MS = 30_000;

async function main(): Promise<void> {
  const parent = document.getElementById('game');
  if (!parent) throw new Error('#game 컨테이너를 찾지 못했습니다');

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
