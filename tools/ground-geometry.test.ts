/**
 * 접지 기하 실측기 검사 (게이트 4).
 *
 * ## 이 파일이 지키는 것
 *
 * 게이트 4 의 기대값은 **정본 마스크를 같은 추정기로 재서** 나온다
 * (`measureCanonical`). 그 방식의 위험은 "추정기가 통째로 틀려도 자기 자신과는
 * 일치한다"는 것이다 — 이 저장소가 여러 번 적은 **자기참조** 함정이다
 * (K38: "검사가 자기가 쓰는 함수로 시험 자리를 고르면 자기참조다").
 *
 * 그래서 여기서는 **투영에서 손으로 유도한 닫힌 식**과 대조한다:
 *
 *     바닥 꼭짓점 x / 캔버스 폭 = w/(w+d)      (⚠ 0.5 가 아니다)
 *     아래 두 변 기울기          = +0.5 / −0.5
 *     쐐기(좌하+우하) 면적       = 64(w² + d²)
 *
 * 둘이 갈라지면 추정기든 투영이든 하나가 틀린 것이다.
 */

import { describe, it, expect } from 'vitest';
import {
  measureCanonical,
  measureSprite,
  canonicalGroundMask,
  canonicalWedgeArea,
  synthSprite,
  geomVerdict,
  GEOM_HOLDOUT,
  SLOPE_TOL,
} from './ground-geometry.js';
import { footprintCanvas, TILE_W, TILE_H } from '../src/render/kairo/iso.js';

/** 실제 계약에 있는 발자국을 고루 덮는다 (정사각·가로긴·세로긴·큰 것) */
const SHAPES: readonly (readonly [number, number, number])[] = [
  [1, 1, 0],
  [1, 1, 20],
  [2, 2, 24],
  [4, 1, 16],
  [1, 2, 20],
  [3, 2, 24],
  [2, 3, 20],
  [3, 3, 40],
  [6, 5, 64],
  [8, 6, 28],
];

describe('접지 기하 — 정본 마스크', () => {
  it('바닥 꼭짓점은 w/(w+d) 다 (0.5 가 아니다)', () => {
    for (const [w, d, bodyH] of SHAPES) {
      const m = measureCanonical(w, d, bodyH);
      expect(m.bottomFrac, `${w}×${d}`).toBeCloseTo(w / (w + d), 10);
    }
    // 대조군 — 비정사각은 실제로 0.5 가 아니어야 한다 (아니면 위 줄이 아무것도 안 잰다)
    expect(measureCanonical(4, 1, 16).bottomFrac).toBeCloseTo(0.8, 10);
  });

  it('아래 두 변의 기울기는 정확히 ±0.5 다', () => {
    for (const [w, d, bodyH] of SHAPES) {
      const m = measureCanonical(w, d, bodyH);
      // 1×1 은 한 변이 16텍셀뿐이라 최소자승에 쓸 점이 적다 — 그래도 정확히 나와야 한다
      expect(m.slopeLeft, `${w}×${d} 왼쪽`).toBeCloseTo(0.5, 6);
      expect(m.slopeRight, `${w}×${d} 오른쪽`).toBeCloseTo(-0.5, 6);
    }
  });

  it('마스크 면적 = 타일당 256, 쐐기 면적 = 64(w²+d²)', () => {
    for (const [w, d, bodyH] of SHAPES) {
      const area = canonicalGroundMask(w, d, bodyH).filter(Boolean).length;
      expect(area, `${w}×${d} 다이아몬드`).toBe(256 * w * d);
      expect(canonicalWedgeArea(w, d, bodyH), `${w}×${d} 쐐기`).toBe(64 * (w * w + d * d));
    }
  });

  it('접지 밴드는 캔버스 하단 (w+d)×8 이다', () => {
    for (const [w, d, bodyH] of SHAPES) {
      const c = footprintCanvas(w, d, bodyH);
      expect(c.x).toBe((w + d) * (TILE_W / 2));
      expect(c.y - bodyH).toBe((w + d) * (TILE_H / 2));
    }
  });
});

describe('접지 기하 — 음성 대조군', () => {
  /*
   * ⚠ 이 저장소는 "검사가 조용히 통과"를 아홉 번 겪었다. 게이트가 **실제로 잡는지**를
   * 결함을 주입해 확인한다 (`seam --selftest` 형태). `tools/kairo-gate.ts` 의
   * `--selftest` 가 같은 대조군을 매 실행마다 돌리고, 여기서는 그 판정을 고정한다.
   */
  const verdict = (w: number, d: number, bodyH: number, opts: Parameters<typeof synthSprite>[3]) => {
    const png = synthSprite(w, d, bodyH, opts);
    return geomVerdict(
      '__synth__',
      measureSprite(png, w, d, bodyH),
      measureCanonical(w, d, bodyH),
      png.w,
      canonicalWedgeArea(w, d, bodyH),
      [w, d],
    );
  };

  it('양성 — 정본 그대로면 세 축 모두 통과한다', () => {
    for (const [w, d, bodyH] of SHAPES) {
      expect(verdict(w, d, bodyH, {}).bad, `${w}×${d}`).toEqual([]);
    }
  });

  it('30° 관습 아이소는 **기울기** 축이 잡는다', () => {
    const v = verdict(2, 2, 24, { slopeMul: 2 / Math.sqrt(3) });
    expect(v.bad).toContain('slope');
    // 문턱이 이 이탈보다 커지면 대조군이 죽는다 — 여유를 숫자로 고정해 둔다
    expect(v.slopeErrLeft!).toBeGreaterThan(SLOPE_TOL);
    expect(v.slopeErrLeft!).toBeCloseTo(0.08, 2);
  });

  it('좌우 반전은 비정사각에서 **꼭짓점**이 잡고, 축 뒤집힘으로 이름 붙는다', () => {
    const v = verdict(4, 1, 16, { mirror: true });
    expect(v.bad).toContain('vertex');
    expect(v.axesSwapped).toBe(true);
    // 정사각은 진짜 항등이다 — "잡혀야 한다"고 쓰면 없는 결함을 요구하는 셈이 된다
    const sq = verdict(3, 3, 40, { mirror: true });
    expect(sq.bad).toEqual([]);
    expect(sq.axesSwapped).toBeNull();
  });

  it('가로로 민 그림은 **꼭짓점**이 잡는다', () => {
    expect(verdict(2, 2, 24, { shiftX: 6 }).bad).toContain('vertex');
  });

  it('접지면만 0.8배(닮음)는 **IoU** 축만 잡을 수 있다', () => {
    const v = verdict(2, 2, 24, { scale: 0.8 });
    expect(v.bad).toContain('iou');
    // 꼭짓점을 축으로 한 닮음이라 나머지 둘은 안 움직인다 — 축이 독립인지 확인
    expect(v.bad).not.toContain('vertex');
    expect(v.bad).not.toContain('slope');
  });

  it('IoU 는 순수 기울기 오차에 둔하다 — 세 축은 서로를 대체하지 않는다', () => {
    /*
     * 30° 대조군의 IoU 는 0.88 로 실제 75종의 중앙값(0.73)보다 오히려 높다.
     * "IoU 하나면 충분하다"로 줄이면 각도 이탈이 통째로 새어 나간다.
     */
    const v = verdict(2, 2, 24, { slopeMul: 2 / Math.sqrt(3) });
    expect(v.bad).not.toContain('iou');
  });
});

describe('가이드 이미지 — 게이트와 같은 기하를 쓴다', () => {
  /*
   * `tools/make-kairo-guide.ts` 는 바닥면을 `canonicalGroundMask()` 에서 파생한다.
   * 그래서 **가이드대로 그린 그림은 게이트 4 를 통과하는 것이 구조적으로 보장**된다.
   * 그 문장을 주장으로 두지 않고 여기서 실제로 잰다 — 가이드와 게이트가 서로 다른
   * 기하를 갖는 순간 "가이드대로 그렸는데 게이트가 빨갛다"가 되고, 그러면 5단계
   * 재생성이 통째로 헛돈다.
   */
  it('가이드의 실루엣이 세 축을 다 통과한다', async () => {
    const { drawGuide, SCALE } = await import('./make-kairo-guide.js');
    for (const [w, d, bodyH] of SHAPES) {
      const g = drawGuide({ id: 't', sprite: 'facility/t', w, d, bodyH });
      const c = footprintCanvas(w, d, bodyH);
      // 확대를 되돌리고 크로마(#FF00FF)를 알파 0 으로 — 스프라이트와 같은 꼴로 만든다
      const data = new Uint8Array(c.x * c.y * 4);
      for (let y = 0; y < c.y; y++) {
        for (let x = 0; x < c.x; x++) {
          const s = ((y * SCALE) * g.w + x * SCALE) * 4;
          const magenta = g.data[s] === 255 && g.data[s + 1] === 0 && g.data[s + 2] === 255;
          data[(y * c.x + x) * 4 + 3] = magenta ? 0 : 255;
        }
      }
      const m = measureSprite({ w: c.x, h: c.y, data }, w, d, bodyH);
      const v = geomVerdict(
        't',
        m,
        measureCanonical(w, d, bodyH),
        c.x,
        canonicalWedgeArea(w, d, bodyH),
        [w, d],
      );
      expect(v.bad, `${w}×${d} bodyH${bodyH}`).toEqual([]);
      expect(m.wedgeIoU, `${w}×${d} bodyH${bodyH}`).toBe(1);
    }
  });
});

describe('접지 기하 — 면제 표', () => {
  it('면제는 축 단위이고, 꼭짓점은 아무도 면제받지 않는다', () => {
    // 접지가 다이아몬드가 아니어도 "타일 가운데 서 있다"는 여전히 검사 대상이다
    for (const h of GEOM_HOLDOUT) {
      expect(h.axes, h.id).not.toContain('vertex');
      expect(h.axes.length, h.id).toBeGreaterThan(0);
      expect(h.why.length, `${h.id}: 이유를 적을 것`).toBeGreaterThan(30);
    }
  });

  it('면제가 20종을 넘으면 게이트가 아무것도 안 재는 것에 가깝다', () => {
    expect(GEOM_HOLDOUT.length).toBeLessThanOrEqual(20);
    expect(GEOM_HOLDOUT.length, '면제가 0 이면 이 검사가 아무것도 안 잰다').toBeGreaterThan(0);
  });

  it('면제 ID 는 전부 실재하는 시설이다', async () => {
    const { KAIRO_SIM } = await import('../src/assets/kairo-contract.js');
    for (const h of GEOM_HOLDOUT) expect(KAIRO_SIM[h.id], h.id).toBeDefined();
  });
});
