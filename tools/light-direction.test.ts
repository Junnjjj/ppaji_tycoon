/**
 * 광원 방향 실측기 검사 (게이트 5).
 *
 * ## 이 파일이 지키는 것
 *
 * 게이트 5 는 **자기가 만든 합성 상자**로 대조군을 돌린다. 그 방식의 위험은
 * 게이트 4 와 똑같다 — "추정기가 통째로 틀려도 자기 자신과는 일치한다"
 * (K38: "검사가 자기가 쓰는 함수로 시험 자리를 고르면 자기참조다").
 *
 * 그래서 여기서는 **밖에서 유도한 값**과 대조한다:
 *
 *   ① 합성 상자의 점수는 **팔레트 두 색의 휘도 차와 정확히 같아야 한다**
 *      (`#dcb079` − `#c49a6a` = 21.92). 지표가 "왼쪽 벽과 오른쪽 벽의 톤 차"를 잰다는
 *      주장 그 자체다 — 근처 값이 아니라 **같은 값**이어야 한다.
 *   ② 문턱은 팔레트의 **가장 좁은 인접 톤 간격**의 절반이다. 그 간격을 여기서
 *      **손으로 적어** 대조한다 (모듈이 도는 루프를 다시 돌리지 않는다).
 *   ③ 지표는 flipX 에 대해 홀함수다 — 발자국 열 가지에서 부호만 뒤집혀야 한다.
 *
 * ⚠ 게이트 자체의 대조군은 `tools/kairo-gate.ts --selftest` 가 **매 실행** 돌린다.
 * 여기 있는 것은 그 대조군이 **무엇을 근거로 옳은가**를 고정하는 몫이다.
 */

import { describe, it, expect } from 'vitest';
import {
  PALETTE,
  TONE_STEP,
  LIGHT_TOL,
  BAND_TEXELS,
  MIN_COLUMNS,
  OUTLINE_FAMILY,
  toneLadders,
  nearestFamily,
  luminance,
  measureLight,
  lightVerdict,
  synthLitSprite,
  flipX,
  wallColumns,
} from './light-direction.js';

/** 실제 계약에 있는 발자국을 고루 덮는다 — 게이트 4 검사와 같은 표 */
const SHAPES: readonly (readonly [number, number, number])[] = [
  [1, 1, 20],
  [2, 2, 24],
  [4, 1, 16],
  [1, 2, 20],
  [3, 2, 24],
  [2, 3, 20],
  [3, 3, 40],
  [4, 5, 72],
  [6, 5, 64],
  [8, 6, 28],
];

const lum = (hex: string): number =>
  luminance(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  );

describe('팔레트에서 유도한 문턱', () => {
  it('톤 사다리는 단색상 계열 7종이다 — `지붕`·`장비` 는 색상 모음이라 빠진다', () => {
    expect(new Set(toneLadders())).toEqual(new Set(['잔디', '모래', '물', '목재', '벽', '피부', '폰툰']));
    /*
     * 대조군 — 이 둘이 사다리로 들어오면 `TONE_STEP` 이 2.5 로 떨어져 사각지대가
     * 1.25 가 된다. 그 상태에서는 잡음 하나가 "광원 방향"으로 판정된다.
     */
    expect(toneLadders()).not.toContain('지붕');
    expect(toneLadders()).not.toContain('장비');
    expect(toneLadders()).not.toContain(OUTLINE_FAMILY);
  });

  it('한 톤 단계 = 팔레트에서 가장 좁은 인접 간격 (모래 #f0dcae → #e8cf9a)', () => {
    // 손으로 유도한 값 — 모듈의 루프를 다시 돌리지 않는다
    expect(TONE_STEP).toBeCloseTo(lum('#f0dcae') - lum('#e8cf9a'), 10);
    expect(TONE_STEP).toBeCloseTo(12.44, 2);
    // 어떤 사다리에도 이보다 좁은 간격이 없어야 "가장 좁은"이 맞다
    for (const fam of toneLadders()) {
      const ls = (PALETTE.get(fam) ?? []).map((c) => luminance(c[0], c[1], c[2])).sort((a, b) => b - a);
      for (let i = 1; i < ls.length; i++) expect(ls[i - 1]! - ls[i]!).toBeGreaterThanOrEqual(TONE_STEP - 1e-9);
    }
  });

  it('사각지대는 한 단계의 절반이다', () => {
    expect(LIGHT_TOL).toBeCloseTo(TONE_STEP / 2, 10);
    expect(LIGHT_TOL).toBeLessThan(TONE_STEP); // 한 톤 갈린 그림은 반드시 판정된다
  });

  it('팔레트 색은 저마다 제 계열로 분류된다 — 양자화기 가중치 복제본의 대조군', () => {
    for (const [fam, cs] of PALETTE) {
      for (const c of cs) expect(nearestFamily(c[0], c[1], c[2]), `${fam} ${c.join(',')}`).toBe(fam);
    }
    // 아웃라인 두 색이 `윤곽` 이어야 띠에서 빠진다 (지표의 전제)
    expect(nearestFamily(0x4a, 0x38, 0x26)).toBe(OUTLINE_FAMILY);
    expect(nearestFamily(0x1e, 0x33, 0x48)).toBe(OUTLINE_FAMILY);
  });
});

describe('합성 상자 — 지표가 무엇을 재는가', () => {
  it('점수는 두 벽 톤의 휘도 차와 **정확히** 같다 (목재 base − shadow)', () => {
    const want = lum('#dcb079') - lum('#c49a6a');
    expect(want).toBeCloseTo(21.92, 2);
    for (const [w, d, bodyH] of SHAPES) {
      const m = measureLight(synthLitSprite(w, d, bodyH));
      expect(m.score, `${w}×${d}`).toBeCloseTo(want, 10);
    }
  });

  it('판정 셋 — 정본 좌상단 · 미러 뒤집힘 · 무음영 평탄', () => {
    for (const [w, d, bodyH] of SHAPES) {
      expect(lightVerdict(measureLight(synthLitSprite(w, d, bodyH))), `${w}×${d} 정본`).toBe(
        'upper-left',
      );
      expect(
        lightVerdict(measureLight(synthLitSprite(w, d, bodyH, { mirror: true }))),
        `${w}×${d} 미러`,
      ).toBe('flipped');
      expect(
        lightVerdict(measureLight(synthLitSprite(w, d, bodyH, { flat: true }))),
        `${w}×${d} 무음영`,
      ).toBe('flat');
    }
  });

  /*
   * ⚠ **가로로 긴 발자국이 이 검사의 이유다.** 앞선 구현(줄 기준 지표)은 정사각에서
   * 전부 통과하고 4×1 에서만 무너졌다 — 왼쪽 모서리가 오른쪽 모서리보다 24텍셀 위에
   * 있어 같은 줄에서 윗면과 옆면을 비교했기 때문이다. 명암을 **완전히 없앤** 상자가
   * `−17.9`(뒤집힘)로 나왔었다. 정사각만 시험하면 그 버그가 통과한다.
   */
  it('무음영 상자는 어떤 발자국에서도 정확히 0 이다 — 모양이 부호를 만들지 않는다', () => {
    for (const [w, d, bodyH] of SHAPES) {
      expect(measureLight(synthLitSprite(w, d, bodyH, { flat: true })).score, `${w}×${d}`).toBe(0);
    }
  });
});

describe('flipX 에 대해 홀함수', () => {
  it('좌우를 뒤집으면 점수는 부호만 바뀐다', () => {
    for (const [w, d, bodyH] of SHAPES) {
      const r = synthLitSprite(w, d, bodyH);
      const a = measureLight(r).score!;
      const b = measureLight(flipX(r)).score!;
      expect(b, `${w}×${d}`).toBeCloseTo(-a, 10);
    }
  });

  it('두 번 뒤집으면 원래대로 — 뒤집기 자체가 항등의 제곱근이다', () => {
    const r = synthLitSprite(3, 2, 24);
    expect(measureLight(flipX(flipX(r))).score).toBeCloseTo(measureLight(r).score!, 10);
  });

  it('열 집합도 맞바뀐다 (점수만 우연히 맞는 게 아니다)', () => {
    const r = synthLitSprite(4, 1, 16);
    const a = wallColumns(r);
    const b = wallColumns(flipX(r));
    expect(a.left.length).toBe(b.right.length);
    expect(a.right.length).toBe(b.left.length);
    // 4×1 은 두 면의 열 수가 실제로 다르다 — 아니면 위 두 줄이 아무것도 안 잰다
    expect(a.left.length).not.toBe(a.right.length);
  });
});

describe('측정 불가는 조용히 통과하지 않는다', () => {
  it('한쪽 벽이 MIN_COLUMNS 미만이면 점수가 null 이고 판정은 측정불가다', () => {
    // 가로 6텍셀짜리 막대 — 꼭짓점 양옆으로 4열을 못 만든다
    const w = 6;
    const h = 10;
    const data = new Uint8Array(w * h * 4);
    for (let y = h - 4; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y * w + x) * 4;
        data[k] = 0xdc;
        data[k + 1] = 0xb0;
        data[k + 2] = 0x79;
        data[k + 3] = 255;
      }
    }
    const m = measureLight({ w, h, data });
    expect(m.score).toBeNull();
    expect(lightVerdict(m)).toBe('unmeasurable');
    expect(Math.min(m.left, m.right)).toBeLessThan(MIN_COLUMNS);
  });

  it('완전히 빈 래스터도 던지지 않고 측정불가로 떨어진다', () => {
    const m = measureLight({ w: 8, h: 8, data: new Uint8Array(8 * 8 * 4) });
    expect(lightVerdict(m)).toBe('unmeasurable');
  });
});

describe('벽 띠', () => {
  it('띠 높이는 3텍셀이고, 그보다 얇은 몸통에서는 열이 안 잡힌다', () => {
    expect(BAND_TEXELS).toBe(3);
    // bodyH 4 (`parking`·`footvolley` 의 실측 최소) 에서도 띠가 잡혀야 한다
    const m = measureLight(synthLitSprite(4, 4, 4));
    expect(m.score).not.toBeNull();
    expect(Math.min(m.left, m.right)).toBeGreaterThanOrEqual(MIN_COLUMNS);
  });

  it('아웃라인은 띠에서 빠진다 — 안 빼면 점수가 톤 차보다 작아진다', () => {
    /*
     * 합성 상자는 계약대로 1텍셀 아웃라인(`#4a3826`, 휘도 58.5)을 두르고 있다.
     * 그걸 안 빼면 접지선 바로 위 3텍셀 중 하나가 아웃라인이라 점수가 21.92 → 14.61 로
     * 희석된다 (실측). 즉 이 검사는 "빼고 있다"를 값으로 확인한다.
     */
    const m = measureLight(synthLitSprite(2, 2, 24));
    expect(m.score).toBeCloseTo(lum('#dcb079') - lum('#c49a6a'), 10);
    expect(m.score!).toBeGreaterThan(14.61 + 1); // 안 뺐을 때의 값과 확실히 다르다
  });
});
