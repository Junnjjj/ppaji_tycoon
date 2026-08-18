import { describe, it, expect } from 'vitest';
import {
  viewport,
  integerDpr,
  stepUpscale,
  violatesDotGrid,
  UPSCALE_STEPS,
  UPSCALE_DEFAULT,
} from './upscale.js';
import { KairoCamera, worldBounds, BACKDROP_ABOVE, BACKDROP_BELOW } from './kairo-camera.js';
import { STEP_X, STEP_Y, GRID_W, GRID_H } from './iso.js';

describe('업스케일 — 비정수 배율을 표현 불가능하게 만든다', () => {
  it('사다리가 정수뿐이고 축소가 없다', () => {
    for (const s of UPSCALE_STEPS) expect(Number.isInteger(s)).toBe(true);
    expect(Math.min(...UPSCALE_STEPS)).toBe(1);
  });

  it('DPR 을 정수로 반올림한다 — 2.625·2.75 가 비정수 배율을 만든다', () => {
    expect(integerDpr(2.625)).toBe(3);
    expect(integerDpr(2.75)).toBe(3);
    expect(integerDpr(1)).toBe(1);
    expect(integerDpr(0.5)).toBe(1); // 하한 1
    expect(integerDpr(4)).toBe(3); // 상한 3
  });

  it('폰 세로 393×852 · S=1 · DPR 3 삼각관계', () => {
    const v = viewport(393, 852, 1, 3);
    expect(v.bufferW).toBe(393);
    expect(v.bufferH).toBe(852);
    expect(v.cssW).toBe(393);
    expect(v.deviceScale).toBe(3); // 텍셀 1개 = 3 디바이스픽셀
    expect(v.overflowX).toBe(0);
  });

  it('S=2 에서 CSS 393 은 나누어떨어지지 않아 1px 넘친다', () => {
    const v = viewport(393, 852, 2, 3);
    expect(v.bufferW).toBe(197); // ceil(393/2)
    expect(v.cssW).toBe(394);
    expect(v.overflowX).toBe(1); // overflow:hidden 이 자른다
    expect(v.overflowX).toBeLessThanOrEqual(1); // 최대 S−1
  });

  it('모든 단·주요 폰 크기에서 도트 격자를 지킨다', () => {
    const screens = [
      [393, 852],
      [390, 844],
      [360, 800],
      [412, 915],
      [1280, 720],
    ] as const;
    for (const s of UPSCALE_STEPS) {
      for (const [w, h] of screens) {
        for (const dpr of [1, 2, 2.625, 2.75, 3]) {
          const v = viewport(w, h, s, dpr);
          expect(violatesDotGrid(v, s), `${w}×${h} S=${s} dpr=${dpr}`).toEqual([]);
        }
      }
    }
  });

  it('넘침이 항상 0..S−1 이다 — 내림하면 화면 끝에 배경색 띠가 생긴다', () => {
    for (const s of UPSCALE_STEPS) {
      for (let w = 300; w < 460; w++) {
        const v = viewport(w, 800, s, 3);
        expect(v.overflowX).toBeGreaterThanOrEqual(0);
        expect(v.overflowX).toBeLessThanOrEqual(s - 1);
      }
    }
  });

  it('텍셀당 디바이스픽셀이 항상 정수다 — 카메라 줌을 쓰면 여기서 반 픽셀이 들어온다', () => {
    for (const s of UPSCALE_STEPS) {
      for (const dpr of [1, 2, 2.625, 2.75, 3]) {
        const v = viewport(393, 852, s, dpr);
        expect(Number.isInteger(v.deviceScale), `S=${s} dpr=${dpr}`).toBe(true);
      }
    }
  });

  it('사다리 밖으로 나가지 않는다', () => {
    expect(stepUpscale(1, -1)).toBe(1);
    expect(stepUpscale(2, 1)).toBe(2);
    expect(stepUpscale(1, 1)).toBe(2);
    expect(stepUpscale(2, -1)).toBe(1);
  });
});

describe('월드 경계 — 배경 여백을 포함한다', () => {
  it('맵 다이아몬드 + 위 200 / 아래 76 텍셀', () => {
    const b = worldBounds();
    expect(b.minX).toBe(-GRID_H * STEP_X);
    expect(b.maxX).toBe(GRID_W * STEP_X);
    expect(b.minY).toBe(-BACKDROP_ABOVE);
    expect(b.maxY).toBe((GRID_W + GRID_H) * STEP_Y + BACKDROP_BELOW);
  });

  it('맵 가로 폭이 1792 텍셀 — 폰 393 의 4.6 화면 (K25 확대)', () => {
    const b = worldBounds();
    expect(b.maxX - b.minX).toBe(1792);
    expect((b.maxX - b.minX) / 393).toBeCloseTo(4.56, 1);
  });

  it('⚠ 맵 세로가 폰 852 를 넘는다 — K25 부터 세로도 팬한다', () => {
    /*
     * 40×32 시절엔 세로가 정확히 852 라 세로 팬이 필요 없었다. 64×48 은 1172 이라
     * 넘는다 — **의도한 변경**이다 (`GRID_SUM_MAX` 주석 참고). 카메라의 `tallEnough`
     * 분기가 이 경우를 이미 처리한다. 이 테스트는 "넘는다"를 못박아, 세로 팬이 조용히
     * 사라지면(=다시 화면에 들어오면) 알아채게 한다.
     */
    const b = worldBounds();
    expect(b.maxY - b.minY).toBe(896 + BACKDROP_ABOVE + BACKDROP_BELOW);
    expect(b.maxY - b.minY).toBeGreaterThan(852);
  });
});

describe('카메라', () => {
  const mk = (): KairoCamera => {
    const c = new KairoCamera();
    c.setScreenSize(393, 852);
    return c;
  };

  it('기본 업스케일이 1 이다', () => {
    expect(mk().upscale).toBe(UPSCALE_DEFAULT);
  });

  it('view 는 항상 정수를 낸다 — 반 픽셀 밀림 방지', () => {
    const c = mk();
    for (let k = 0; k < 40; k++) {
      c.pan(0.4, -0.3); // 소수 드래그를 계속 누적
      const v = c.view();
      expect(Number.isInteger(v.scrollX)).toBe(true);
      expect(Number.isInteger(v.scrollY)).toBe(true);
    }
  });

  it('소수 드래그가 누적된다 — 반올림된 값을 다시 누적하면 느린 드래그가 안 먹는다', () => {
    const c = mk();
    const before = c.rawCenter().x;
    for (let k = 0; k < 10; k++) c.pan(0.4, 0);
    expect(c.rawCenter().x).toBeCloseTo(before - 4, 5);
  });

  it('팬이 경계 안으로 확정된다', () => {
    const c = mk();
    for (let k = 0; k < 500; k++) c.pan(-50, -50);
    c.release();
    const v = c.view();
    const b = worldBounds();
    expect(v.scrollX + 393).toBeLessThanOrEqual(b.maxX + 1);
    expect(v.scrollY + 852).toBeLessThanOrEqual(b.maxY + 1);
  });

  it('업스케일이 클수록 같은 드래그가 적게 움직인다', () => {
    const a = mk();
    const b = mk();
    b.setUpscale(2);
    const a0 = a.rawCenter().x;
    const b0 = b.rawCenter().x;
    a.pan(100, 0);
    b.pan(100, 0);
    expect(Math.abs(a.rawCenter().x - a0)).toBeCloseTo(100, 5);
    expect(Math.abs(b.rawCenter().x - b0)).toBeCloseTo(50, 5);
  });

  it('앵커 줌 — 찍은 텍셀이 화면에서 거의 안 움직인다', () => {
    const c = mk();
    const anchorScreen = { x: 120, y: 300 };
    const anchorTexel = c.screenToTexel(anchorScreen.x, anchorScreen.y);
    c.setUpscale(2, anchorTexel);
    const after = c.screenToTexel(anchorScreen.x, anchorScreen.y);
    // 정수 스냅 때문에 1텍셀 이내 오차는 허용
    expect(Math.abs(after.x - anchorTexel.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - anchorTexel.y)).toBeLessThanOrEqual(1);
  });

  it('화면↔텍셀 왕복', () => {
    const c = mk();
    c.setUpscale(2);
    const t = c.screenToTexel(50, 70);
    const v = c.view();
    expect((t.x - v.scrollX) * 2).toBeCloseTo(50, 5);
    expect((t.y - v.scrollY) * 2).toBeCloseTo(70, 5);
  });

  it('버퍼 크기가 배율에서 파생된다 — 이걸 안 갱신하면 앵커 줌이 어긋난다', () => {
    const c = mk();
    expect(c.bufferSize()).toEqual({ w: 393, h: 852 });
    c.setUpscale(2);
    expect(c.bufferSize()).toEqual({ w: 197, h: 426 });
  });

  it('뷰가 월드보다 커도 카메라가 튀지 않는다 — clamp min>max 방지', () => {
    const c = new KairoCamera(4, 4); // 아주 작은 맵
    c.setScreenSize(1600, 1200);
    c.pan(999, 999);
    c.release();
    const v = c.view();
    expect(Number.isFinite(v.scrollX)).toBe(true);
    expect(Number.isFinite(v.scrollY)).toBe(true);
  });
});
