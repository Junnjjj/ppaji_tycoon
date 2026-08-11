import Phaser from 'phaser';
import {
  COURSE_ISSUE_MESSAGES,
  EMPTY_METRICS,
  requireEquipmentDef,
  sampleSpline,
  type CourseMetrics,
  type EquipmentDef,
  type Game as Sim,
  type Vec2,
} from '../sim/index.js';
import { TILE_SIZE } from './constants.js';

/**
 * 모바일 코스 편집기 — 계획서 §2.4. RCT 의 트랙 설계에 대응한다.
 *
 *   물 위를 탭 → 제어점 추가
 *   점을 탭 → 그 점 제거
 *   장비 대수 +/− → 처리량 vs 안전 조절
 *   ↩ 되돌리기   ✓ 확정   ✕ 취소
 *
 * 점을 찍을 때마다 길이·스릴·처리량·안전도가 즉시 갱신되어야 한다.
 * 이 즉각적인 피드백이 "코스를 설계하는 재미"의 전부다.
 */

const VALID = 0x3ddc84;
const INVALID = 0xff5252;
const HANDLE = 0xffcf33;

/** 탭이 기존 점을 집었다고 보는 거리 (타일) */
const HANDLE_GRAB = 1.4;

export interface CourseEditState {
  defId: string;
  def: EquipmentDef;
  points: Vec2[];
  vehicles: number;
  metrics: CourseMetrics;
  valid: boolean;
  /** 사용자에게 보여줄 문제 설명 (없으면 빈 문자열) */
  reason: string;
  canAddMore: boolean;
}

export class CourseEditor {
  private active: CourseEditState | null = null;
  private gfx?: Phaser.GameObjects.Graphics;

  onChange?: (state: CourseEditState | null) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sim: Sim,
  ) {}

  get isActive(): boolean {
    return this.active !== null;
  }

  get state(): CourseEditState | null {
    return this.active;
  }

  begin(defId: string): void {
    const def = requireEquipmentDef(defId);
    this.active = {
      defId,
      def,
      points: [],
      vehicles: 1,
      metrics: { ...EMPTY_METRICS },
      valid: false,
      reason: `물 위를 탭해 점을 ${def.minPoints}개 이상 찍으세요`,
      canAddMore: true,
    };
    this.ensureGfx();
    this.refresh();
  }

  cancel(): void {
    this.active = null;
    this.gfx?.clear();
    this.gfx?.setVisible(false);
    this.onChange?.(null);
  }

  /**
   * 월드 좌표를 탭했을 때. 기존 점 근처면 그 점을 지우고, 아니면 새 점을 추가한다.
   * 손가락으로 점을 지우는 별도 모드를 만들지 않아도 되게.
   */
  tapAt(worldX: number, worldY: number): void {
    const s = this.active;
    if (!s) return;

    const tx = worldX / TILE_SIZE;
    const ty = worldY / TILE_SIZE;

    const hitIndex = s.points.findIndex(
      (p) => Math.hypot(p.x - tx, p.y - ty) <= HANDLE_GRAB,
    );
    if (hitIndex >= 0) {
      s.points.splice(hitIndex, 1);
    } else if (s.points.length < s.def.maxPoints) {
      s.points.push({ x: tx, y: ty });
    } else {
      return; // 더는 못 넣는다
    }
    this.refresh();
  }

  undo(): void {
    if (!this.active || this.active.points.length === 0) return;
    this.active.points.pop();
    this.refresh();
  }

  setVehicles(n: number): void {
    if (!this.active) return;
    this.active.vehicles = Math.max(1, Math.min(12, Math.round(n)));
    this.refresh();
  }

  addVehicle(delta: number): void {
    if (!this.active) return;
    this.setVehicles(this.active.vehicles + delta);
  }

  /** 확정. 성공하면 편집 모드가 끝난다. */
  confirm(): boolean {
    const s = this.active;
    if (!s || !s.valid) return false;
    const created = this.sim.createCourse(s.defId, s.points, s.vehicles);
    if (!created) return false;
    this.cancel();
    return true;
  }

  // ── 내부 ──

  private refresh(): void {
    const s = this.active;
    if (!s) return;

    const v = this.sim.courses.validate(s.points, s.defId);
    s.valid = v.ok;
    s.metrics = this.sim.courses.preview(s.points, s.defId, s.vehicles);
    s.canAddMore = s.points.length < s.def.maxPoints;

    if (v.ok) {
      s.reason = '';
    } else if (s.points.length < s.def.minPoints) {
      s.reason = `점을 ${s.def.minPoints - s.points.length}개 더 찍으세요`;
    } else {
      const first = v.issues[0];
      s.reason = first ? COURSE_ISSUE_MESSAGES[first] : '';
    }

    this.draw(v.badSamples);
    this.onChange?.(s);
  }

  private ensureGfx(): Phaser.GameObjects.Graphics {
    if (!this.gfx) {
      this.gfx = this.scene.add.graphics();
      this.gfx.setDepth(1_000_100);
    }
    this.gfx.setVisible(true);
    return this.gfx;
  }

  private draw(badSamples: readonly number[]): void {
    const s = this.active;
    const g = this.ensureGfx();
    g.clear();
    if (!s) return;

    const bad = new Set(badSamples);

    // ── 곡선 ── 문제 구간은 붉게
    if (s.points.length >= 3) {
      const samples = sampleSpline(s.points);
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1]!;
        const b = samples[i]!;
        const isBad = bad.has(i) || bad.has(i - 1);
        g.lineStyle(3, isBad ? INVALID : VALID, isBad ? 0.95 : 0.8);
        g.lineBetween(
          a.pos.x * TILE_SIZE,
          a.pos.y * TILE_SIZE,
          b.pos.x * TILE_SIZE,
          b.pos.y * TILE_SIZE,
        );
      }
      // 루프를 닫는 마지막 구간
      const last = samples[samples.length - 1]!;
      const first = samples[0]!;
      g.lineStyle(3, VALID, 0.8);
      g.lineBetween(
        last.pos.x * TILE_SIZE,
        last.pos.y * TILE_SIZE,
        first.pos.x * TILE_SIZE,
        first.pos.y * TILE_SIZE,
      );
    } else if (s.points.length === 2) {
      // 아직 곡선이 안 되는 단계 — 점끼리 잇는 안내선
      const a = s.points[0]!;
      const b = s.points[1]!;
      g.lineStyle(2, 0xffffff, 0.4);
      g.lineBetween(
        a.x * TILE_SIZE,
        a.y * TILE_SIZE,
        b.x * TILE_SIZE,
        b.y * TILE_SIZE,
      );
    }

    // ── 제어점 핸들 ── 손가락으로 집을 수 있게 크게
    s.points.forEach((p, i) => {
      const px = p.x * TILE_SIZE;
      const py = p.y * TILE_SIZE;
      g.fillStyle(0x1b3040, 0.9);
      g.fillCircle(px, py, 9);
      g.fillStyle(HANDLE, 1);
      g.fillCircle(px, py, 6);
      // 첫 점은 출발점 표시
      if (i === 0) {
        g.lineStyle(2, 0xffffff, 0.9);
        g.strokeCircle(px, py, 11);
      }
    });
  }

  destroy(): void {
    this.gfx?.destroy();
  }
}
