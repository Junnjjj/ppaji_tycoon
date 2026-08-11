import Phaser from 'phaser';
import type { Game as Sim } from '../sim/index.js';
import type { AssetProvider } from '../assets/index.js';
import { MainScene, type FrameInfo } from './scenes/MainScene.js';
import type { PlacementState } from './placement.js';
import type { CourseEditState } from './course-editor.js';

export { MainScene } from './scenes/MainScene.js';
export type { FrameInfo } from './scenes/MainScene.js';
export { CameraController } from './camera.js';
export { PlacementController } from './placement.js';
export type { PlacementState } from './placement.js';
export { CourseEditor } from './course-editor.js';
export type { CourseEditState } from './course-editor.js';
export { CourseLayer } from './course-layer.js';
export { EntityLayer } from './entities.js';
export type { EntityStats } from './entities.js';
export * from './constants.js';

export interface BootOptions {
  parent: HTMLElement | string;
  sim: Sim;
  provider: AssetProvider;
  onFrame?: (info: FrameInfo) => void;
  onPlacementChange?: (state: PlacementState | null) => void;
  onCourseEditChange?: (state: CourseEditState | null) => void;
}

export function boot(opts: BootOptions): Phaser.Game {
  const scene = new MainScene({
    sim: opts.sim,
    provider: opts.provider,
    ...(opts.onFrame ? { onFrame: opts.onFrame } : {}),
    ...(opts.onPlacementChange ? { onPlacementChange: opts.onPlacementChange } : {}),
    ...(opts.onCourseEditChange ? { onCourseEditChange: opts.onCourseEditChange } : {}),
  });

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    backgroundColor: '#0d1b26',
    // 픽셀아트 — 확대해도 뭉개지지 않게
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      activePointers: 3, // 두 손가락 핀치 + 여유
    },
    scene: [scene],
  });
}
