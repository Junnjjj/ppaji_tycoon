import Phaser from 'phaser';
import {
  footprint,
  requireFacilityDef,
  PLACE_FAILURE_MESSAGES,
  type FacilityDef,
  type Game as Sim,
  type Rotation,
} from '../sim/index.js';
import { TILE_SIZE } from './constants.js';

/**
 * 모바일 배치 조작 — 계획서 §2.3.
 *
 *   팔레트에서 시설 선택 → 화면 중앙에 반투명 고스트 등장
 *   한 손가락 드래그 → 고스트 이동      (두 손가락 → 화면 이동/확대)
 *   ↻ 회전   ✓ 확정   ✕ 취소
 *
 * 손가락으로 정밀 조작이 어려우므로, 고스트는 손가락 위치가 아니라
 * "손가락이 움직인 만큼" 따라간다. 손가락에 가려 안 보이는 문제를 피한다.
 */

const VALID_COLOR = 0x3ddc84;
const INVALID_COLOR = 0xff5252;

export interface PlacementState {
  defId: string;
  def: FacilityDef;
  x: number;
  y: number;
  rot: Rotation;
  valid: boolean;
  reason: string;
}

export class PlacementController {
  private active: PlacementState | null = null;
  private ghost?: Phaser.GameObjects.Image;
  private outline?: Phaser.GameObjects.Graphics;

  /** 타일 단위 누적 이동량 (한 타일이 안 되는 드래그를 모은다) */
  private dragAccX = 0;
  private dragAccY = 0;

  onChange?: (state: PlacementState | null) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
  ) {}

  get isActive(): boolean {
    return this.active !== null;
  }

  get state(): PlacementState | null {
    return this.active;
  }

  /**
   * 배치 모드 시작.
   *
   * 화면 중앙에서 시작하되, 그 자리가 못 짓는 곳이면 가장 가까운 유효 칸으로 스냅한다.
   * (선착장을 고를 때 육지 한복판에 뜨면 손가락으로 한참 끌어야 하므로)
   */
  begin(defId: string): void {
    const def = requireFacilityDef(defId);
    const cam = this.scene.cameras.main;
    const center = cam.getWorldPoint(cam.width / 2, cam.height / 2);

    const [w, h] = footprint(def, 0);
    const cx = Math.floor(center.x / TILE_SIZE) - Math.floor(w / 2);
    const cy = Math.floor(center.y / TILE_SIZE) - Math.floor(h / 2);
    const spot = this.nearestValid(def, cx, cy);

    this.active = { defId, def, x: spot.x, y: spot.y, rot: 0, valid: false, reason: '' };
    this.dragAccX = 0;
    this.dragAccY = 0;
    this.ensureVisuals();
    this.refresh();

    // 스냅한 자리가 화면 밖이면 카메라를 그쪽으로 옮겨 준다
    if (spot.moved) {
      cam.pan(
        (spot.x + w / 2) * TILE_SIZE,
        (spot.y + h / 2) * TILE_SIZE,
        260,
        'Sine.easeOut',
      );
    }
  }

  /** (cx, cy) 에서 나선형으로 훑어 지을 수 있는 가장 가까운 칸을 찾는다 */
  private nearestValid(
    def: FacilityDef,
    cx: number,
    cy: number,
    maxRadius = 24,
  ): { x: number; y: number; moved: boolean } {
    if (this.sim.facilities.canPlace(def, cx, cy, 0).ok) {
      return { x: cx, y: cy, moved: false };
    }
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          // 반지름 r 테두리만 (안쪽은 이미 검사함)
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.sim.facilities.canPlace(def, cx + dx, cy + dy, 0).ok) {
            return { x: cx + dx, y: cy + dy, moved: true };
          }
        }
      }
    }
    return { x: cx, y: cy, moved: false };
  }

  cancel(): void {
    this.active = null;
    this.ghost?.setVisible(false);
    this.outline?.setVisible(false);
    this.onChange?.(null);
  }

  rotate(): void {
    if (!this.active) return;
    this.active.rot = ((this.active.rot + 1) % 4) as Rotation;
    this.refresh();
  }

  /** 화면상 드래그 델타(px)를 타일 이동으로 바꾼다 */
  dragBy(screenDx: number, screenDy: number): void {
    if (!this.active) return;
    const zoom = this.scene.cameras.main.zoom;
    this.dragAccX += screenDx / (TILE_SIZE * zoom);
    this.dragAccY += screenDy / (TILE_SIZE * zoom);

    const stepX = Math.trunc(this.dragAccX);
    const stepY = Math.trunc(this.dragAccY);
    if (stepX === 0 && stepY === 0) return;

    this.dragAccX -= stepX;
    this.dragAccY -= stepY;
    this.active.x += stepX;
    this.active.y += stepY;
    this.refresh();
  }

  /** 월드 좌표를 직접 지정 (탭으로 옮기기) */
  moveToWorld(worldX: number, worldY: number): void {
    if (!this.active) return;
    const [w, h] = footprint(this.active.def, this.active.rot);
    this.active.x = Math.floor(worldX / TILE_SIZE) - Math.floor(w / 2);
    this.active.y = Math.floor(worldY / TILE_SIZE) - Math.floor(h / 2);
    this.dragAccX = 0;
    this.dragAccY = 0;
    this.refresh();
  }

  /** 확정. 성공하면 배치된 뒤 모드가 유지되어 연속 배치가 가능하다. */
  confirm(): boolean {
    const s = this.active;
    if (!s || !s.valid) return false;

    const placed = this.sim.placeFacility(s.defId, s.x, s.y, s.rot);
    if (!placed) return false;

    // 길처럼 여러 개 놓는 시설은 모드를 유지, 그 외는 종료
    if (s.def.drawable) {
      this.refresh();
    } else {
      this.cancel();
    }
    return true;
  }

  /** 유효성을 다시 계산하고 고스트를 갱신한다 */
  private refresh(): void {
    const s = this.active;
    if (!s) return;

    const check = this.sim.facilities.canPlace(s.def, s.x, s.y, s.rot);
    s.valid = check.ok;
    s.reason = check.ok ? '' : (PLACE_FAILURE_MESSAGES[check.reason!] ?? '');

    this.drawGhost(s);
    this.onChange?.(s);
  }

  private ensureVisuals(): void {
    if (!this.outline) {
      this.outline = this.scene.add.graphics();
      this.outline.setDepth(1_000_000);
    }
    // 고스트 이미지는 실제 스프라이트 키를 알게 된 뒤(drawGhost)에 만든다.
    // 없는 텍스처로 먼저 만들면 Phaser 가 초록 물음표를 띄운다.
  }

  private ensureGhost(textureKey: string): Phaser.GameObjects.Image {
    if (!this.ghost) {
      this.ghost = this.scene.add.image(0, 0, textureKey);
      this.ghost.setOrigin(0.5, 1);
      this.ghost.setAlpha(0.75);
      this.ghost.setDepth(1_000_001);
    }
    return this.ghost;
  }

  private drawGhost(s: PlacementState): void {
    this.ensureVisuals();
    const [w, h] = footprint(s.def, s.rot);
    const px = s.x * TILE_SIZE;
    const py = s.y * TILE_SIZE;
    const pw = w * TILE_SIZE;
    const ph = h * TILE_SIZE;
    const color = s.valid ? VALID_COLOR : INVALID_COLOR;

    const g = this.outline!;
    g.setVisible(true);
    g.clear();
    g.fillStyle(color, 0.28);
    g.fillRect(px, py, pw, ph);
    g.lineStyle(2, color, 0.95);
    g.strokeRect(px, py, pw, ph);

    // 타일 격자 — 몇 칸짜리인지 손가락으로도 읽히게
    g.lineStyle(1, color, 0.35);
    for (let i = 1; i < w; i++) {
      g.lineBetween(px + i * TILE_SIZE, py, px + i * TILE_SIZE, py + ph);
    }
    for (let i = 1; i < h; i++) {
      g.lineBetween(px, py + i * TILE_SIZE, px + pw, py + i * TILE_SIZE);
    }

    if (!this.scene.textures.exists(s.def.sprite)) {
      this.ghost?.setVisible(false);
      return;
    }
    const img = this.ensureGhost(s.def.sprite);
    if (img.texture.key !== s.def.sprite) img.setTexture(s.def.sprite);
    img.setVisible(true);
    img.setPosition(px + pw / 2, py + ph);
    img.setTint(s.valid ? 0xffffff : 0xff9999);
  }

  destroy(): void {
    this.ghost?.destroy();
    this.outline?.destroy();
  }
}
