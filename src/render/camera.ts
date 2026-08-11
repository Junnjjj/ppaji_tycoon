import Phaser from 'phaser';
import { ZOOM_MIN, ZOOM_MAX, lodForZoom, type Lod } from './constants.js';

/**
 * 드래그 팬 + 두 손가락 핀치 줌.
 *
 * 눌린 포인터를 이벤트에서 직접 Map 으로 추적한다.
 * Phaser 의 input.pointer1/2 는 터치 전용이고 마우스는 mousePointer 로 따로 오기 때문에,
 * 그쪽을 보면 데스크톱에서 팬이 동작하지 않는다.
 *
 * 핀치할 때는 두 손가락 중점 아래의 월드 좌표가 고정되도록 스크롤을 보정한다.
 * 이게 없으면 확대할 때 화면이 미끄러져 조작감이 무너진다.
 */
export class CameraController {
  /** 현재 눌려 있는 포인터: id → 마지막 화면 좌표 */
  private readonly down = new Map<number, { x: number; y: number }>();

  private pinching = false;
  private pinchStartDist = 0;
  private pinchStartZoom = 1;

  /** 팬 중 이동한 화면 거리. 탭과 드래그를 구분한다. */
  private travel = 0;

  /** 드래그로 움직인 거리가 이 값 이하이면 탭으로 본다 */
  static readonly TAP_SLOP = 8;

  onLodChange?: (lod: Lod) => void;

  /**
   * 한 손가락 드래그를 카메라가 먹을지 넘길지.
   * 배치 모드에서는 false 로 두어 고스트가 드래그를 받는다.
   * 두 손가락 핀치는 이 값과 무관하게 항상 카메라가 처리한다.
   */
  panEnabled = true;
  /** panEnabled 가 false 일 때 한 손가락 드래그 델타(px)를 받는다 */
  onSingleDrag?: (dx: number, dy: number) => void;

  private lod: Lod;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
  ) {
    this.lod = lodForZoom(cam.zoom);

    // 두 번째 터치 포인터 확보 (기본은 1개)
    scene.input.addPointer(1);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    // 휠은 POINTER_WHEEL 하나만 건다. GAMEOBJECT_WHEEL 을 같이 걸면
    // 인터랙티브 오브젝트 위에서 줌이 두 번 적용된다.
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  get wasTap(): boolean {
    return this.travel <= CameraController.TAP_SLOP;
  }

  get currentLod(): Lod {
    return this.lod;
  }

  private twoPoints(): [{ x: number; y: number }, { x: number; y: number }] | null {
    if (this.down.size < 2) return null;
    const it = this.down.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? [a, b] : null;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    this.down.set(pointer.id, { x: pointer.x, y: pointer.y });
    if (this.down.size === 1) this.travel = 0;
    if (this.down.size >= 2) this.beginPinch();
  }

  private beginPinch(): void {
    const pts = this.twoPoints();
    if (!pts) return;
    const [a, b] = pts;
    this.pinching = true;
    this.pinchStartDist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    this.pinchStartZoom = this.cam.zoom;
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    const prev = this.down.get(pointer.id);
    if (!prev) return; // 누르지 않은 포인터의 이동은 무시

    const dx = pointer.x - prev.x;
    const dy = pointer.y - prev.y;
    prev.x = pointer.x;
    prev.y = pointer.y;

    if (this.down.size >= 2) {
      if (!this.pinching) this.beginPinch();
      const pts = this.twoPoints();
      if (!pts || this.pinchStartDist <= 0) return;
      const [a, b] = pts;
      const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      this.zoomAt(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        this.pinchStartZoom * (dist / this.pinchStartDist),
      );
      return;
    }

    this.travel += Math.abs(dx) + Math.abs(dy);

    if (!this.panEnabled) {
      this.onSingleDrag?.(dx, dy);
      return;
    }
    this.cam.scrollX -= dx / this.cam.zoom;
    this.cam.scrollY -= dy / this.cam.zoom;
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    this.down.delete(pointer.id);
    if (this.down.size < 2) this.pinching = false;
    // 손가락 하나가 남으면 남은 손가락 기준으로 팬을 이어간다.
    // (down 맵의 좌표가 이미 최신이므로 별도 처리 불필요)
  }

  private onWheel(
    pointer: Phaser.Input.Pointer,
    _objects: unknown,
    _dx: number,
    dy: number,
  ): void {
    this.zoomAt(pointer.x, pointer.y, this.cam.zoom * (dy > 0 ? 0.9 : 1.1));
  }

  /** 화면 좌표 (sx, sy) 아래의 월드 지점을 고정한 채 줌을 바꾼다. */
  zoomAt(sx: number, sy: number, targetZoom: number): void {
    const clamped = Phaser.Math.Clamp(targetZoom, ZOOM_MIN, ZOOM_MAX);
    if (clamped === this.cam.zoom) return;

    const before = this.cam.getWorldPoint(sx, sy);
    this.cam.setZoom(clamped);
    const after = this.cam.getWorldPoint(sx, sy);

    this.cam.scrollX += before.x - after.x;
    this.cam.scrollY += before.y - after.y;

    const nextLod = lodForZoom(clamped);
    if (nextLod !== this.lod) {
      this.lod = nextLod;
      this.onLodChange?.(nextLod);
    }
  }

  centerOn(worldX: number, worldY: number): void {
    this.cam.centerOn(worldX, worldY);
  }

  destroy(): void {
    this.down.clear();
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
  }
}
