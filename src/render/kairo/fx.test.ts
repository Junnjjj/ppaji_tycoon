/**
 * K48 연출 등록부 — `docs/plan-live-unlock.md` §1-2 의 첫 구현이 계약을 지키나.
 *
 * 브라우저 없이 잰다. `fx.ts` 가 Phaser 를 **타입으로만** 가져오기 때문에 가능하고,
 * 그게 이 파일이 존재하는 이유다 — 합치기·상한 같은 정책이 브라우저 검사에서만
 * 확인되면 회귀를 놓친다 (`kairo-camera.ts` 와 같은 판단).
 */
import { describe, expect, it } from 'vitest';
import {
  FX_REGISTRY,
  IncomeFx,
  MAX_LIVE_FLOATS,
  MERGE_WINDOW_MS,
  playFx,
  wonLabel,
  type FxHandle,
  type FxHost,
  type FxTarget,
} from './fx.js';
import { depthKey, Z_BAND, Z_FLOAT } from './iso.js';

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
