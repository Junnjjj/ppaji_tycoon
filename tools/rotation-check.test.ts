/**
 * 게이트 6(회전)의 단위 검사.
 *
 * ⚠ **이 검사의 요점은 "돌았다/안 돌았다"가 아니라 셋째 판정이다.** 미러 판정을
 * 부호만으로 하면 자판기처럼 실루엣이 자기 미러와 거의 같은 물체가 **동전 던지기**로
 * 통과한다 — 그게 이 게이트를 만들게 한 사고의 형태 그대로다 (게이트 4·5 는 전부
 * 초록인데 그림이 안 돌아 있었다).
 *
 * 그래서 `대칭(판정불가)` 이 **실제로 나오는지**를 고정한다. 문턱을 0 으로 죽이면
 * 이 절이 빨개진다 (실측 — `kairo-gate` 종료 코드도 1 이 된다).
 */

import { describe, it, expect } from 'vitest';
import { decodePng } from './png.js';
import {
  measureRotation,
  rotationVerdict,
  rotationSelftest,
  synthAsymSprite,
  flipRaster,
  maskOf,
  texelWobble,
  MIRROR_OF,
  ROTATION_NAME,
} from './rotation-check.js';

describe('게이트 6 — 회전', () => {
  it('대조군 셋이 전부 제 판정으로 나온다 (돌았다·안 돌았다·대칭)', () => {
    const cases = rotationSelftest();
    const bad = cases.filter((c) => !c.ok);
    expect(
      bad.map((c) => `${c.name}: 기대 ${ROTATION_NAME[c.want]} · 실제 ${ROTATION_NAME[c.got]}`),
    ).toEqual([]);
    // 셋 다 실제로 등장해야 한다 — 하나라도 안 나오면 그 축이 무검사다
    expect(new Set(cases.map((c) => c.want)).size).toBe(3);
  });

  it('뒤집어 넣으면 돌았다, 그대로 넣으면 안 돌았다', () => {
    const base = synthAsymSprite(96, 48);
    expect(rotationVerdict(measureRotation(flipRaster(base), base))).toBe('mirrored');
    expect(rotationVerdict(measureRotation(base, base))).toBe('not-rotated');
  });

  it('좌우 대칭이면 통과가 아니라 판정불가다', () => {
    const sym = synthAsymSprite(96, 48, { symmetric: true });
    expect(rotationVerdict(measureRotation(sym, sym))).toBe('symmetric');
    expect(rotationVerdict(measureRotation(flipRaster(sym), sym))).toBe('symmetric');
  });

  it('문턱은 상수가 아니라 물체마다 유도된다 — 큰 물체일수록 작다', () => {
    const small = texelWobble(maskOf(synthAsymSprite(48, 24)));
    const big = texelWobble(maskOf(synthAsymSprite(192, 96)));
    expect(big).toBeLessThan(small);
    expect(big).toBeGreaterThan(0);
  });

  it('미러 대상은 d1·d3 둘뿐이다 — d2(뒷면)는 이 자의 대상이 아니다', () => {
    expect(MIRROR_OF.map((m) => m.dir)).toEqual([1, 3]);
    expect(MIRROR_OF.map((m) => m.ref)).toEqual([0, 2]);
  });

  /*
   * 실제 화소로 한 번 — 합성에서만 도는 자가 되지 않게 (게이트 5 의 `lightPackControl`
   * 과 같은 취지). 4방향 그림이 팩에 0장이므로 **팩의 아무 시설이나** 골라 자기 미러를
   * 넣어 본다. 4방향이 켜지면 이 절을 팩 대조군으로 승격할 것.
   */
  it('팩의 실제 화소로도 미러가 잡힌다', () => {
    const p = 'assets/generated/kairo/facility__slide_large.png';
    const r = decodePng(p);
    expect(rotationVerdict(measureRotation(flipRaster(r), r))).toBe('mirrored');
    expect(rotationVerdict(measureRotation(r, r))).toBe('not-rotated');
  });
});
