import Phaser from 'phaser';
import {
  requireEquipmentDef,
  sampleAtDistance,
  type Course,
  type Game as Sim,
} from '../sim/index.js';
import { TILE_SIZE, Lod } from './constants.js';

/**
 * 배치된 코스와 그 위를 도는 장비를 그린다.
 *
 * 코스 경로는 점선으로, 장비는 스프라이트로. 장비는 진행 방향을 향해 회전하고
 * 뒤에 항적 거품을 남긴다 (프로토타입에서 검증한 표현).
 */

const PATH_COLOR = 0xffffff;
const PATH_ALPHA = 0.55;

interface Foam {
  x: number;
  y: number;
  life: number;
}

export class CourseLayer {
  private readonly paths: Phaser.GameObjects.Graphics;
  private readonly vehicleSprites: Phaser.GameObjects.Image[] = [];
  private readonly foam: Foam[] = [];
  private readonly foamGfx: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
  ) {
    this.paths = scene.add.graphics();
    this.paths.setDepth(-500); // 지형 위, 손님 아래
    this.foamGfx = scene.add.graphics();
    this.foamGfx.setDepth(-400);
  }

  update(lod: Lod, dtSeconds: number): void {
    this.drawPaths(lod);
    this.updateFoam(dtSeconds);
    this.drawVehicles(lod);
  }

  private drawPaths(lod: Lod): void {
    const g = this.paths;
    g.clear();
    if (lod === Lod.Map) return; // 최소 줌에서는 경로선 생략

    for (const c of this.sim.courses.all) {
      if (c.samples.length < 2) continue;
      // 안전도가 낮으면 경로가 붉어진다 — 한눈에 위험한 코스를 알아보게
      const risky = c.metrics.safety < 55;
      g.lineStyle(2, risky ? 0xff7a7a : PATH_COLOR, PATH_ALPHA);
      g.beginPath();
      const first = c.samples[0]!;
      g.moveTo(first.pos.x * TILE_SIZE, first.pos.y * TILE_SIZE);
      for (let i = 1; i < c.samples.length; i += 2) {
        const s = c.samples[i]!;
        g.lineTo(s.pos.x * TILE_SIZE, s.pos.y * TILE_SIZE);
      }
      g.closePath();
      g.strokePath();
    }
  }

  private drawVehicles(lod: Lod): void {
    let used = 0;

    for (const c of this.sim.courses.all) {
      if (c.samples.length === 0 || c.length <= 0) continue;
      const def = requireEquipmentDef(c.defId);
      if (!this.scene.textures.exists(def.sprite)) continue;

      for (const v of c.vehicles) {
        // 정박 중인 장비는 코스 시작점에 세워 둔다
        const u = v.state === 'running' ? v.u : 0;
        const s = sampleAtDistance(c.samples, c.length, u);
        if (!s) continue;

        const img = this.acquire(used++, def.sprite);
        const px = s.pos.x * TILE_SIZE;
        const py = s.pos.y * TILE_SIZE;
        img.setPosition(px, py);
        img.setDepth(py);
        img.setRotation(s.heading);
        img.setVisible(true);
        if (img.texture.key !== def.sprite) img.setTexture(def.sprite);

        // 달리는 중에만 항적을 남긴다
        if (v.state === 'running' && lod >= Lod.Far && this.foam.length < 220) {
          this.foam.push({ x: px, y: py, life: 1 });
        }
      }
    }

    for (let i = used; i < this.vehicleSprites.length; i++) {
      this.vehicleSprites[i]?.setVisible(false);
    }
  }

  private acquire(index: number, textureKey: string): Phaser.GameObjects.Image {
    let img = this.vehicleSprites[index];
    if (!img) {
      img = this.scene.add.image(0, 0, textureKey);
      img.setOrigin(0.5, 0.5);
      this.vehicleSprites[index] = img;
    }
    return img;
  }

  private updateFoam(dt: number): void {
    const g = this.foamGfx;
    g.clear();

    for (let i = this.foam.length - 1; i >= 0; i--) {
      const f = this.foam[i]!;
      f.life -= dt * 1.1;
      if (f.life <= 0) {
        this.foam.splice(i, 1);
        continue;
      }
      const r = (1 - f.life) * 5 + 2;
      g.fillStyle(0xffffff, f.life * 0.45);
      g.fillCircle(f.x, f.y, r);
    }
  }

  /** 코스 하나를 강조 표시 (선택했을 때) */
  highlight(course: Course | null): void {
    // Phase 3 에서 코스 선택 UI 가 붙을 때 사용
    void course;
  }

  destroy(): void {
    this.paths.destroy();
    this.foamGfx.destroy();
    for (const s of this.vehicleSprites) s.destroy();
    this.vehicleSprites.length = 0;
  }
}
