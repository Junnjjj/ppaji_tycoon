import Phaser from 'phaser';
import {
  footprint,
  requireFacilityDef,
  type Game as Sim,
  type Guest,
  type PlacedFacility,
} from '../sim/index.js';
import { variantId } from '../assets/index.js';
import { TILE_SIZE, Lod } from './constants.js';

/**
 * 시설·손님 스프라이트를 sim 상태에 맞춰 유지한다.
 *
 * 손님 스프라이트는 풀에서 재사용한다 — 매 tick 생성·파괴하면 GC 가 프레임을 씹는다.
 * 깊이는 y 좌표로 정렬해 아래쪽 오브젝트가 위쪽을 가린다.
 */

/** 화면 밖 여유 (타일). 이 밖의 손님은 스프라이트를 붙이지 않는다. */
const CULL_MARGIN = 2;

export interface EntityStats {
  facilitySprites: number;
  guestSprites: number;
  culled: number;
}

export class EntityLayer {
  private readonly facilitySprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly guestPool: Phaser.GameObjects.Image[] = [];
  private guestActive = 0;
  private lastStats: EntityStats = { facilitySprites: 0, guestSprites: 0, culled: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
  ) {}

  get stats(): EntityStats {
    return this.lastStats;
  }

  update(lod: Lod): void {
    this.syncFacilities();
    const culled = this.syncGuests(lod);
    this.lastStats = {
      facilitySprites: this.facilitySprites.size,
      guestSprites: this.guestActive,
      culled,
    };
  }

  // ── 시설 ──

  private syncFacilities(): void {
    const seen = new Set<number>();

    for (const f of this.sim.facilities.all) {
      seen.add(f.iid);
      if (this.facilitySprites.has(f.iid)) continue;
      const img = this.makeFacilitySprite(f);
      if (img) this.facilitySprites.set(f.iid, img);
    }

    // 철거된 시설의 스프라이트 정리
    for (const [iid, img] of this.facilitySprites) {
      if (!seen.has(iid)) {
        img.destroy();
        this.facilitySprites.delete(iid);
      }
    }
  }

  private makeFacilitySprite(f: PlacedFacility): Phaser.GameObjects.Image | null {
    const def = requireFacilityDef(f.defId);
    if (!this.scene.textures.exists(def.sprite)) return null;

    const [w, h] = footprint(def, f.rot);
    // 앵커는 아래 중앙 — 발밑이 타일에 붙는다
    const px = (f.x + w / 2) * TILE_SIZE;
    const py = (f.y + h) * TILE_SIZE;

    const img = this.scene.add.image(px, py, def.sprite);
    img.setOrigin(0.5, 1);
    img.setDepth(py);
    return img;
  }

  // ── 손님 ──

  private syncGuests(lod: Lod): number {
    if (lod === Lod.Map) {
      // 최소 줌에서는 손님을 그리지 않는다 (경영 지도 뷰)
      this.hideGuestsFrom(0);
      this.guestActive = 0;
      return this.sim.guests.count;
    }

    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const minX = view.x / TILE_SIZE - CULL_MARGIN;
    const maxX = view.right / TILE_SIZE + CULL_MARGIN;
    const minY = view.y / TILE_SIZE - CULL_MARGIN;
    const maxY = view.bottom / TILE_SIZE + CULL_MARGIN;

    // 축소 상태에서는 걸음 애니메이션을 멈춰 텍스처 교체 비용을 없앤다
    const animate = lod >= Lod.Normal;

    let used = 0;
    let culled = 0;

    for (const g of this.sim.guests.all) {
      const tx = g.cx + (g.nx - g.cx) * g.p;
      const ty = g.cy + (g.ny - g.cy) * g.p;

      if (tx < minX || tx > maxX || ty < minY || ty > maxY) {
        culled++;
        continue;
      }

      const img = this.acquireGuest(used++);
      const px = (tx + 0.5) * TILE_SIZE;
      const py = (ty + 1) * TILE_SIZE;
      img.setPosition(px, py);
      img.setDepth(py);
      img.setVisible(true);

      const key = this.guestTexture(g, animate);
      if (img.texture.key !== key && this.scene.textures.exists(key)) {
        img.setTexture(key);
      }
    }

    this.hideGuestsFrom(used);
    this.guestActive = used;
    return culled;
  }

  private guestTexture(g: Guest, animate: boolean): string {
    // 걷기: 0 → 1 → 0 → 2 순환
    const frame = animate ? ([0, 1, 0, 2][Math.floor(g.anim) & 3] as number) : 0;
    return variantId('guest/body', { palette: g.palette, dir: g.facing, frame });
  }

  private acquireGuest(index: number): Phaser.GameObjects.Image {
    let img = this.guestPool[index];
    if (!img) {
      img = this.scene.add.image(0, 0, variantId('guest/body', {
        palette: 0,
        dir: 'down',
        frame: 0,
      }));
      img.setOrigin(0.5, 1);
      this.guestPool[index] = img;
    }
    return img;
  }

  private hideGuestsFrom(index: number): void {
    for (let i = index; i < this.guestPool.length; i++) {
      const img = this.guestPool[i];
      if (img && img.visible) img.setVisible(false);
    }
  }

  destroy(): void {
    for (const img of this.facilitySprites.values()) img.destroy();
    this.facilitySprites.clear();
    for (const img of this.guestPool) img.destroy();
    this.guestPool.length = 0;
  }
}
