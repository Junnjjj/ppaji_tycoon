/**
 * K48 연출 등록부 — `docs/plan-live-unlock.md` §1-2 의 첫 구현이 계약을 지키나.
 *
 * 브라우저 없이 잰다. `fx.ts` 가 Phaser 를 **타입으로만** 가져오기 때문에 가능하고,
 * 그게 이 파일이 존재하는 이유다 — 합치기·상한 같은 정책이 브라우저 검사에서만
 * 확인되면 회귀를 놓친다 (`kairo-camera.ts` 와 같은 판단).
 *
 * K53 의 **상시 연출 등록부**(`AMBIENT_REGISTRY`)도 여기서 잰다 — `Pen`/`AmbientRaster`
 * 가 캔버스를 얇게 감싼 것도 같은 이유다 (그리기 규칙을 브라우저 없이 재려고).
 */
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_FACILITIES,
  AMBIENT_FRAMES,
  AMBIENT_REGISTRY,
  AMBIENT_TICKS_PER_FRAME,
  ambientPhase,
  isWaterPixel,
  sprayOrigin,
  FX_REGISTRY,
  IncomeFx,
  MAX_LIVE_FLOATS,
  MERGE_WINDOW_MS,
  playFx,
  wonLabel,
  type AmbientRaster,
  type FxHandle,
  type FxHost,
  type FxTarget,
  type Pen,
} from './fx.js';
import { depthKey, Z_BAND, Z_FLOAT } from './iso.js';
import { facilityDef } from '../../sim/kairo/placement.js';

// ── 가짜 sink (정책 검사용) ────────────────────────────────────────────────

interface Fake extends FxHandle {
  text: string;
  killed: boolean;
  i: number;
  j: number;
}

function fakeSink(): { spawn: (t: FxTarget) => FxHandle; made: Fake[] } {
  const made: Fake[] = [];
  return {
    made,
    spawn: (t) => {
      const f: Fake = {
        text: t.text,
        killed: false,
        i: t.i,
        j: t.j,
        alive: true,
        setText: (s) => {
          f.text = s;
        },
        kill: () => {
          f.killed = true;
        },
      };
      made.push(f);
      return f;
    },
  };
}

describe('K48 수입 숫자 — 합치기와 상한', () => {
  it('★ 같은 시설에서 연달아 나면 하나로 합쳐진다', () => {
    const s = fakeSink();
    const fx = new IncomeFx(s.spawn);
    fx.add(7, 3, 4, 1000, 0);
    fx.add(7, 3, 4, 2500, 100);
    fx.add(7, 3, 4, 500, MERGE_WINDOW_MS - 1);
    expect(s.made).toHaveLength(1);
    expect(s.made[0]?.text).toBe(wonLabel(4000));
    expect(fx.liveCount).toBe(1);
  });

  it('다른 시설은 안 합쳐진다 — 돈이 어디서 왔는지가 요점이다', () => {
    const s = fakeSink();
    const fx = new IncomeFx(s.spawn);
    fx.add(7, 3, 4, 1000, 0);
    fx.add(8, 9, 9, 1000, 0);
    expect(s.made).toHaveLength(2);
    expect(fx.liveCount).toBe(2);
  });

  it('합치는 창이 지나면 새 숫자가 뜬다 (영원히 쌓이지 않는다)', () => {
    const s = fakeSink();
    const fx = new IncomeFx(s.spawn);
    fx.add(7, 3, 4, 1000, 0);
    fx.add(7, 3, 4, 1000, MERGE_WINDOW_MS + 1);
    expect(s.made).toHaveLength(2);
    expect(s.made[1]?.text).toBe(wonLabel(1000));
  });

  it('★ 동시 표시가 상한을 넘지 않는다 — 1,200명 판에서 초당 수십 건이 터져도', () => {
    const s = fakeSink();
    const fx = new IncomeFx(s.spawn);
    for (let k = 0; k < 200; k++) fx.add(k, k % 20, 3, 1000, 0);
    expect(fx.liveCount).toBe(MAX_LIVE_FLOATS);
    expect(s.made.length).toBe(MAX_LIVE_FLOATS);
    expect(fx.dropped).toBe(200 - MAX_LIVE_FLOATS);
  });

  it('상한에 걸려도 이미 떠 있는 자리는 계속 합쳐 받는다', () => {
    const s = fakeSink();
    const fx = new IncomeFx(s.spawn);
    for (let k = 0; k < MAX_LIVE_FLOATS; k++) fx.add(k, k, 0, 1000, 0);
    fx.add(0, 0, 0, 5000, 10); // 이미 슬롯이 있는 handle
    expect(s.made).toHaveLength(MAX_LIVE_FLOATS);
    expect(s.made[0]?.text).toBe(wonLabel(6000));
  });

  it('죽은 라벨은 걷어낸다 — 상한이 유령에 막히면 안 된다', () => {
    const s = fakeSink();
    const fx = new IncomeFx(s.spawn);
    for (let k = 0; k < MAX_LIVE_FLOATS; k++) fx.add(k, k, 0, 1000, 0);
    expect(fx.dropped).toBe(0);
    for (const f of s.made) (f as { alive: boolean }).alive = false;
    fx.add(99, 1, 1, 1000, 10);
    expect(fx.dropped).toBe(0);
    expect(s.made).toHaveLength(MAX_LIVE_FLOATS + 1);
  });

  it('0 원은 안 띄운다', () => {
    const s = fakeSink();
    new IncomeFx(s.spawn).add(1, 0, 0, 0, 0);
    expect(s.made).toHaveLength(0);
  });

  it('clear() 가 남은 라벨을 치운다', () => {
    const s = fakeSink();
    const fx = new IncomeFx(s.spawn);
    fx.add(1, 0, 0, 100, 0);
    fx.clear();
    expect(s.made[0]?.killed).toBe(true);
    expect(fx.liveCount).toBe(0);
  });

  it('표기는 원화·천 단위 구분자', () => {
    expect(wonLabel(12400)).toBe('+₩12,400');
    expect(wonLabel(7)).toBe('+₩7');
  });
});

// ── 등록부 자체 ───────────────────────────────────────────────────────────

/** `add.text` / `tweens.add` 만 쓰는 오리 타입 씬 */
function stubHost(reduced: boolean): {
  host: FxHost;
  tweens: Record<string, unknown>[];
  texts: Record<string, unknown>[];
} {
  const tweens: Record<string, unknown>[] = [];
  const texts: Record<string, unknown>[] = [];
  const makeText = (x: number, y: number, s: string): Record<string, unknown> => {
    const t: Record<string, unknown> = {
      x,
      y,
      text: s,
      depth: 0,
      active: true,
      setOrigin: () => t,
      setResolution: () => t,
      setDepth: (d: number) => {
        t['depth'] = d;
        return t;
      },
      setText: (v: string) => {
        t['text'] = v;
        return t;
      },
      destroy: () => {
        t['active'] = false;
      },
    };
    texts.push(t);
    return t;
  };
  const scene = {
    add: { text: makeText },
    tweens: {
      add: (cfg: Record<string, unknown>) => {
        tweens.push(cfg);
        return { remove: () => undefined };
      },
    },
  };
  return {
    tweens,
    texts,
    host: {
      scene: scene as unknown as FxHost['scene'],
      liftAt: () => 0,
      reduced,
      ink: '#000',
      outline: '#fff',
    },
  };
}

describe('K48 FX 등록부 — 계약 (plan-live-unlock §1-2)', () => {
  it('이름으로만 부른다 — 등록부에 있는 것만 재생된다', () => {
    expect(Object.keys(FX_REGISTRY)).toContain('income-pop');
    for (const impl of Object.values(FX_REGISTRY)) expect(typeof impl).toBe('function');
  });

  it('★ 전환이 transform·opacity 만 만진다 (레이아웃 속성 금지)', () => {
    const BAD = ['width', 'height', 'displayWidth', 'displayHeight', 'style', 'padding'];
    for (const reduced of [false, true]) {
      const s = stubHost(reduced);
      playFx(s.host, 'income-pop', { i: 4, j: 5, text: '+₩100' });
      const cfg = s.tweens[0] as Record<string, unknown>;
      // 애니메이트되는 것은 `targets`·타이밍을 뺀 나머지 키다
      const timing = new Set(['targets', 'duration', 'delay', 'ease', 'onComplete']);
      const animated = Object.keys(cfg).filter((k) => !timing.has(k));
      for (const k of animated) expect(BAD, `${k}`).not.toContain(k);
      expect(animated.every((k) => k === 'y' || k === 'alpha')).toBe(true);
    }
  });

  it('★ prefers-reduced-motion 이면 뜨는 움직임이 빠진다 (숫자는 남는다)', () => {
    const still = stubHost(true);
    playFx(still.host, 'income-pop', { i: 4, j: 5, text: '+₩100' });
    expect(Object.keys(still.tweens[0] as object)).not.toContain('y');
    expect(still.texts[0]?.['text']).toBe('+₩100'); // 정보는 그대로 보인다

    const moving = stubHost(false);
    playFx(moving.host, 'income-pop', { i: 4, j: 5, text: '+₩100' });
    expect(Object.keys(moving.tweens[0] as object)).toContain('y');
  });

  it('★ 깊이가 그 칸의 띠 안에 있고 이모트보다 위다', () => {
    const s = stubHost(false);
    playFx(s.host, 'income-pop', { i: 4, j: 5, text: '+₩100' });
    const d = s.texts[0]?.['depth'] as number;
    expect(d).toBe(depthKey(4, 5) + Z_FLOAT);
    expect(d - depthKey(4, 5)).toBeLessThan(Z_BAND);
  });

  it('발자국 가운데(소수 좌표)도 받는다 — 깊이는 반올림한 칸', () => {
    const s = stubHost(false);
    playFx(s.host, 'income-pop', { i: 4.5, j: 5, text: '+₩100' });
    expect(s.texts[0]?.['depth']).toBe(depthKey(5, 5) + Z_FLOAT);
  });
});

// ── K53 상시 연출 (살아 있는 물) ────────────────────────────────────────────

/** 그린 사각형을 받아 적는 가짜 붓 — 브라우저 없이 그리기 규칙을 잰다 */
function fakePen(): { pen: Pen; ops: { c: string; x: number; y: number; w: number; h: number }[] } {
  const ops: { c: string; x: number; y: number; w: number; h: number }[] = [];
  let c = '';
  return {
    ops,
    pen: {
      use: (v) => {
        c = v;
      },
      rect: (x, y, w, h) => ops.push({ c, x, y, w, h }),
    },
  };
}

/** `fill(x, y)` 가 RGBA 를 주는 래스터 한 장 */
function raster(
  w: number,
  h: number,
  fill: (x: number, y: number) => [number, number, number, number],
): AmbientRaster {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const k = (y * w + x) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = a;
    }
  }
  return { w, h, data };
}

/** 카이로 아틀라스의 실측 물빛 (`facility/pool_warm` 안쪽) */
const WATER: [number, number, number, number] = [58, 150, 190, 255];
/** 나무 데크 (같은 아틀라스의 발판) */
const DECK: [number, number, number, number] = [196, 156, 100, 255];

const PAL = { glint: '#dff4ff', foam: '#fbffff' };

describe('K53 살아 있는 물 — 물빛 판정', () => {
  it('물빛은 통과하고 나무·잔디·모래는 안 통과한다', () => {
    expect(isWaterPixel(...WATER)).toBe(true);
    expect(isWaterPixel(...DECK)).toBe(false);
    expect(isWaterPixel(96, 168, 82, 255)).toBe(false); // 잔디
    expect(isWaterPixel(232, 214, 168, 255)).toBe(false); // 모래
  });

  it('반투명 가장자리와 그림자 속 어두운 픽셀은 뺀다', () => {
    expect(isWaterPixel(58, 150, 190, 120)).toBe(false); // 알파 낮음
    expect(isWaterPixel(12, 40, 60, 255)).toBe(false); // 너무 어둡다
  });
});

describe('K53 살아 있는 물 — 그리기', () => {
  it('★ 프레임 둘의 그림이 다르다 — 이게 "움직인다"의 정의다', () => {
    const src = raster(96, 64, () => WATER);
    const a = fakePen();
    const b = fakePen();
    AMBIENT_REGISTRY['water-glint'](a.pen, src, 0, PAL);
    AMBIENT_REGISTRY['water-glint'](b.pen, src, 1, PAL);
    expect(a.ops.length).toBeGreaterThan(10);
    expect(JSON.stringify(a.ops)).not.toBe(JSON.stringify(b.ops));
  });

  it('★ 같은 프레임은 언제 그려도 같다 — 아니면 반짝임이 아니라 노이즈다', () => {
    const src = raster(96, 64, () => WATER);
    const a = fakePen();
    const b = fakePen();
    AMBIENT_REGISTRY['water-glint'](a.pen, src, 0, PAL);
    AMBIENT_REGISTRY['water-glint'](b.pen, src, 0, PAL);
    expect(JSON.stringify(a.ops)).toBe(JSON.stringify(b.ops));
  });

  it('★ 물이 아닌 곳에는 한 점도 안 찍는다 — AI 그림 위를 덮으면 안 된다', () => {
    const deckOnly = raster(96, 64, () => DECK);
    const p = fakePen();
    AMBIENT_REGISTRY['water-glint'](p.pen, deckOnly, 0, PAL);
    expect(p.ops).toEqual([]);
  });

  it('★ 물웅덩이 가장자리 밖으로 획이 삐치지 않는다', () => {
    // 왼쪽 절반만 물. 획 길이가 3 이므로 x = 46,47 에서 시작하면 데크를 밟는다
    const half = raster(96, 64, (x) => (x < 48 ? WATER : DECK));
    const p = fakePen();
    AMBIENT_REGISTRY['water-glint'](p.pen, half, 0, PAL);
    expect(p.ops.length).toBeGreaterThan(0);
    for (const o of p.ops) expect(o.x + o.w).toBeLessThanOrEqual(48);
  });

  it('색은 팔레트에서만 나온다 — 하드코딩 색 0 (색은 style.css 가 소유한다)', () => {
    const src = raster(96, 64, () => WATER);
    const p = fakePen();
    AMBIENT_REGISTRY['fountain-spray'](p.pen, src, 1, PAL);
    for (const o of p.ops) expect([PAL.glint, PAL.foam]).toContain(o.c);
  });

  it('★ 분수는 물줄기 **꼭대기**를 그림에서 찾는다 (좌표를 안 박는다)', () => {
    // 위쪽에 가느다란 줄기, 아래쪽에 넓은 수반
    const src = raster(64, 44, (x, y) =>
      (y < 12 && x >= 30 && x < 34) || (y >= 24 && x >= 8 && x < 56) ? WATER : DECK,
    );
    expect(sprayOrigin(src)).toEqual({ x: 32, y: 0 });

    const p = fakePen();
    AMBIENT_REGISTRY['fountain-spray'](p.pen, src, 0, PAL);
    // 물방울은 2×2 다 — 반짝임(가로 3×1)과 크기로 갈린다
    const drops = p.ops.filter((o) => o.w === 2 && o.h === 2);
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) expect(Math.abs(d.x - 32)).toBeLessThanOrEqual(10);
  });

  it('물이 한 점도 없으면 분수도 아무것도 안 그린다', () => {
    const p = fakePen();
    AMBIENT_REGISTRY['fountain-spray'](p.pen, raster(32, 32, () => DECK), 0, PAL);
    expect(p.ops).toEqual([]);
    expect(sprayOrigin(raster(32, 32, () => DECK))).toBeNull();
  });
});

describe('K53 상시 연출 등록부', () => {
  it('박자는 손님과 같은 식이다 — 6프레임마다 2장을 번갈아', () => {
    expect(AMBIENT_FRAMES).toBe(2);
    expect(ambientPhase(0)).toBe(0);
    expect(ambientPhase(AMBIENT_TICKS_PER_FRAME - 1)).toBe(0);
    expect(ambientPhase(AMBIENT_TICKS_PER_FRAME)).toBe(1);
    expect(ambientPhase(AMBIENT_TICKS_PER_FRAME * 2)).toBe(0);
  });

  it('등록부에 적힌 시설이 전부 실재하고, 구현도 전부 있다', () => {
    for (const [id, name] of Object.entries(AMBIENT_FACILITIES)) {
      expect(facilityDef(id), id).toBeTruthy();
      expect(AMBIENT_REGISTRY[name], id).toBeTypeOf('function');
    }
  });

  it('소수만이다 — 계획이 "10종 안팎"으로 못박았다', () => {
    expect(Object.keys(AMBIENT_FACILITIES).length).toBeLessThanOrEqual(10);
  });

  it('⚠ 워터슬라이드는 안 들어간다 — 파란 활강로는 물이 아니다', () => {
    for (const id of ['slide_small', 'slide_large', 'slide_tube']) {
      expect(AMBIENT_FACILITIES[id], id).toBeUndefined();
    }
  });
});
