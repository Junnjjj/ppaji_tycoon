import { describe, it, expect } from 'vitest';
import { KairoTerrain } from './terrain.js';
import { BusRunner, BUS_DEFAULT, busStateAt, type BusConfig } from './bus.js';

/**
 * K36-B③ — **정류장에 서는 버스.**
 *
 * 버스는 "손님이 어디서 오나"의 답이라 시뮬 상태다. 그래서 재는 것도 그림이 아니라
 * 시간표다 — 주기·정차 길이·도착 모서리·스냅샷.
 *
 * 이 파일의 검사는 전부 **음성 대조군**을 같이 둔다. 이 프로젝트에서 "검증이 조용히
 * 통과"를 여러 번 겪었다 — 같은 값끼리 비교해 놓고 통과했다고 읽은 경우가 대부분이었다.
 */

const P = BUS_DEFAULT.period;

function run(ticks: number, cfg?: Partial<BusConfig>): BusRunner {
  const b = new BusRunner(cfg);
  for (let i = 0; i < ticks; i++) b.tick();
  return b;
}

describe('결정론 — 같은 tick 수면 같은 버스', () => {
  it('따로 굴린 두 대가 tick 마다 같은 위치·같은 정차 상태다', () => {
    const a = new BusRunner();
    const b = new BusRunner();
    for (let t = 0; t < P * 5; t++) {
      expect(a.state).toEqual(b.state);
      a.tick();
      b.tick();
    }
  });

  it('음성 대조군 — 한 대만 한 tick 더 굴리면 위치가 갈라진다', () => {
    // 위 검사가 "항상 같은 값"을 비교하는 게 아님을 보인다
    const diverged: boolean[] = [];
    for (let t = 0; t < P; t++) {
      diverged.push(JSON.stringify(busStateAt(t)) !== JSON.stringify(busStateAt(t + 1)));
    }
    // 정차 구간 안쪽은 t 와 t+1 이 같아도 맞다. 한 주기에서 대부분은 달라야 한다
    expect(diverged.filter(Boolean).length).toBeGreaterThan(P / 2);
  });

  /*
   * ⚠ 여기에 "Math.random 을 부수고 같은 결과가 나오나"를 넣으려다 뺐다 — **ESLint 가
   * 이미 막는다** (`no-restricted-properties`, 불변식 2). 검사 코드 자체가 그 규칙에
   * 걸려서, 규칙을 끄지 않으면 쓸 수가 없다. 규칙을 끄고 검사를 넣는 것은 자물쇠를 풀어
   * 자물쇠가 있는지 확인하는 짓이다.
   *
   * 대신 상태가 `t` 하나뿐임을 아래 스냅샷 검사가 지킨다 — 숨길 난수 상태가 없다.
   */

  it('시간을 안 읽는다 — 상태는 흘려보낸 tick 하나로만 정해진다', () => {
    // 실제 경과 시간이 끼어들면 같은 tick 수에서 다른 답이 나온다
    const a = run(23);
    const b = run(23);
    expect(a.toSnapshot()).toEqual(b.toSnapshot());
    expect(a.state).toEqual(busStateAt(23));
  });
});

describe('주기 — 시간표는 매일 같다', () => {
  it('한 주기 뒤 상태가 정확히 같다', () => {
    for (let t = 0; t < P; t++) expect(busStateAt(t + P)).toEqual(busStateAt(t));
  });

  it('음성 대조군 — 주기가 아닌 간격이면 상태가 어긋난다', () => {
    const off = Array.from({ length: P }, (_, t) => busStateAt(t + P + 1));
    const base = Array.from({ length: P }, (_, t) => busStateAt(t));
    expect(JSON.stringify(off)).not.toBe(JSON.stringify(base));
  });

  it('하루 tick(120)의 약수라 매일 같은 시각에 온다 — 요일 비교가 가능해진다', () => {
    const TICKS_PER_DAY = 120; // week.ts 의 값. 여기서 import 하면 주 루프에 묶인다
    expect(TICKS_PER_DAY % P).toBe(0);
    const b = new BusRunner();
    const day0 = b.arrivalsIn(0, TICKS_PER_DAY);
    const day1 = b.arrivalsIn(TICKS_PER_DAY, TICKS_PER_DAY * 2).map((t) => t - TICKS_PER_DAY);
    expect(day1).toEqual(day0);
    expect(day0).toHaveLength(TICKS_PER_DAY / P);
  });

  it('구간 길이의 합이 주기다 — 안 맞으면 조용히 버스가 두 번 뛴다', () => {
    const c = BUS_DEFAULT;
    expect(c.approach + c.dwell + c.depart).toBeLessThanOrEqual(c.period);
  });
});

describe('정차 — 서 있어야 손님이 내린다', () => {
  it('한 주기에 정차 tick 이 정확히 dwell 개다', () => {
    let n = 0;
    for (let t = 0; t < P; t++) if (busStateAt(t).atStop) n++;
    expect(n).toBe(BUS_DEFAULT.dwell);
  });

  it('서 있는 동안 위치가 안 움직이고, 그 자리가 정류장 칸이다', () => {
    const stop = KairoTerrain.busStop();
    for (let t = 0; t < P; t++) {
      const s = busStateAt(t);
      if (!s.atStop) continue;
      expect(s.pos.x).toBe(stop.i);
    }
  });

  it('도착은 주기당 **한 tick** 뿐이다 — 레벨로 읽으면 한 차에 여덟 번 태운다', () => {
    let n = 0;
    for (let t = 0; t < P * 3; t++) if (busStateAt(t).arrived) n++;
    expect(n).toBe(3);
  });

  it('음성 대조군 — 도착을 "서 있다"로 세면 주기당 dwell 번이 된다', () => {
    let n = 0;
    for (let t = 0; t < P * 3; t++) if (busStateAt(t).atStop) n++;
    expect(n).toBe(3 * BUS_DEFAULT.dwell);
    expect(n).not.toBe(3);
  });

  it('도착 tick 에 실제로 서 있고, 직전 tick 은 아직 안 섰다', () => {
    const t = new BusRunner().arrivalsIn(0, P)[0] as number;
    expect(busStateAt(t).atStop).toBe(true);
    expect(busStateAt(t - 1).atStop).toBe(false);
    expect(busStateAt(t - 1).phase).toBe('approach');
  });

  it('출발 모서리도 한 tick 이고 그 tick 엔 이미 안 서 있다', () => {
    let n = 0;
    for (let t = 0; t < P; t++) {
      if (!busStateAt(t).departed) continue;
      n++;
      expect(busStateAt(t).atStop).toBe(false);
      expect(busStateAt(t).phase).toBe('depart');
    }
    expect(n).toBe(1);
  });

  it('ticksToArrival 이 실제 도착 tick 을 가리킨다', () => {
    for (let t = 0; t < P * 2; t++) {
      const b = run(t);
      const dt = b.ticksToArrival;
      expect(dt).toBeGreaterThanOrEqual(0);
      expect(busStateAt(t + dt).arrived).toBe(true);
    }
  });
});

describe('주행 — 차도 위를 지나간다', () => {
  it('차도 줄 위에 있고, 그 줄은 정류장에 붙은 아래 차선이다', () => {
    const lane = BUS_DEFAULT.lane;
    expect(KairoTerrain.ROAD_ROWS).toContain(lane);
    // 정류장 보도 바로 위 차선이라야 손님이 차도를 가로지르지 않는다
    expect(lane).toBe(KairoTerrain.STOP_ROW - 1);
    for (let t = 0; t < P; t++) expect(busStateAt(t).pos.y).toBe(lane);
  });

  it('보이는 동안 x 는 뒤로 안 간다 — 접근·정차·퇴장이 이어진다', () => {
    let prev = -Infinity;
    for (let t = 0; t < P; t++) {
      const s = busStateAt(t);
      if (!s.visible) break;
      expect(s.pos.x).toBeGreaterThanOrEqual(prev);
      prev = s.pos.x;
    }
  });

  it('좌표가 튀는 순간은 버스가 없는 구간에 있다 — 화면 안에서 순간이동하지 않는다', () => {
    for (let t = 0; t < P * 2; t++) {
      const a = busStateAt(t);
      const b = busStateAt(t + 1);
      if (Math.abs(b.pos.x - a.pos.x) <= BUS_DEFAULT.runTiles / BUS_DEFAULT.approach + 1e-9) {
        continue;
      }
      expect(a.visible && b.visible).toBe(false);
    }
  });

  it('주행 폭이 폰 화면 반 폭보다 넓다 — 안 그러면 없어지는 순간이 화면에 보인다', () => {
    // 격자 한 걸음의 가로 이동 16px (render/kairo/iso.ts 의 STEP_X). 폰 393px
    const HALF_SCREEN_TILES = 393 / 2 / 16;
    expect(BUS_DEFAULT.runTiles).toBeGreaterThan(HALF_SCREEN_TILES);
  });

  it('언제나 격자 안이다 — 밖으로 나가면 렌더가 좌표를 못 만든다', () => {
    for (let t = 0; t < P; t++) {
      const x = busStateAt(t).pos.x;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(KairoTerrain.WIDTH);
    }
  });
});

describe('스냅샷 왕복', () => {
  it('복원한 버스가 이후 tick 에서 원본과 같은 길을 간다', () => {
    const a = run(17);
    const b = BusRunner.fromSnapshot(JSON.parse(JSON.stringify(a.toSnapshot())));
    for (let i = 0; i < P * 2; i++) {
      expect(b.state).toEqual(a.state);
      a.tick();
      b.tick();
    }
  });

  it('음성 대조군 — 다른 tick 으로 복원하면 갈라진다', () => {
    // 정차 구간(12~19)은 t 가 달라도 위치가 같으니, 달리는 구간에서 잰다
    const a = run(5);
    const wrong = BusRunner.fromSnapshot({ t: 6 });
    expect(wrong.state).not.toEqual(a.state);
  });

  it('빈 스냅샷·깨진 값도 0 에서 시작한다 — 옛 세이브가 NaN 으로 굳지 않게', () => {
    expect(BusRunner.fromSnapshot(undefined).elapsed).toBe(0);
    expect(BusRunner.fromSnapshot({ t: NaN }).elapsed).toBe(0);
    expect(BusRunner.fromSnapshot({ t: -5 }).elapsed).toBe(0);
    expect(BusRunner.fromSnapshot({ t: 3.7 }).elapsed).toBe(3);
  });

  it('시간표는 스냅샷에 없다 — 밸런싱이 바꾼 값이 옛 판에 굳으면 안 된다', () => {
    expect(Object.keys(new BusRunner().toSnapshot())).toEqual(['t']);
  });
});

describe('시간표를 주입할 수 있다 — RNG 는 부르는 쪽에 둔다', () => {
  it('주기를 바꾸면 도착 수가 따라 바뀐다', () => {
    const b = new BusRunner({ period: 20, approach: 6, dwell: 4, depart: 6 });
    expect(b.arrivalsIn(0, 120)).toHaveLength(6);
    expect(new BusRunner().arrivalsIn(0, 120)).toHaveLength(3);
  });

  it('음수 tick 도 감긴다 — 되감기가 조용히 NaN 이 되지 않게', () => {
    expect(busStateAt(-P)).toEqual(busStateAt(0));
    expect(busStateAt(-1)).toEqual(busStateAt(P - 1));
  });
});
