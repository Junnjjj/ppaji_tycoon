import Phaser from 'phaser';

/** Keep logical world coordinates while drawing two samples per world pixel.
 * Origin zero avoids Phaser's center-based zoom shifting the map and screen FX.
 */
export class DetailCamera extends Phaser.Cameras.Scene2D.Camera {
  constructor(width: number, height: number) {
    super(0, 0, width, height);
    this.setOrigin(0, 0);
  }

  override preRender(): void {
    super.preRender();
    // Phaser 3.90 computes these bounds assuming a centered origin, even when
    // its actual render/input matrix uses origin zero. Keep the public view exact.
    const w = this.width / this.zoomX;
    const h = this.height / this.zoomY;
    this.worldView.setTo(this.scrollX, this.scrollY, w, h);
    this.midPoint.set(this.scrollX + w / 2, this.scrollY + h / 2);
  }
}
