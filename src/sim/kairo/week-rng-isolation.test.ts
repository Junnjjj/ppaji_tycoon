import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';
import { GuestStore, OPEN_GATE_DEFAULTS, type Guest } from './guests.js';
import type { RegularVisit } from './menu.js';
import { PlacementGrid } from './placement.js';
import { KairoTerrain } from './terrain.js';
import { WallGrid } from './walls.js';
import {
  WeekRunner,
  forkWeekRngStreams,
  restoreWeekRngStreams,
  snapshotWeekRngStreams,
  type WeekRngStreams,
} from './week.js';

const SIZE = 30;
const GATE = { i: 0, j: 0 };
const REGULAR: RegularVisit = {
  characterId: 'minji',
  group: 'friends',
  requestedRecipeId: 'shop_can_drink',
  prefer: ['cool'],
  avoid: ['warm'],
};

function pavedTerrain(): KairoTerrain {
  const terrain = new KairoTerrain(SIZE, SIZE);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) terrain.paint(i, j, 'path_stone');
  }
  return terrain;
}

function guests(): GuestStore {
  const terrain = pavedTerrain();
  return new GuestStore(
    terrain,
    new WallGrid(SIZE, SIZE),
    new PlacementGrid(SIZE, SIZE),
    GATE,
    OPEN_GATE_DEFAULTS,
  );
}

function world(): { runner: WeekRunner; streams: WeekRngStreams } {
  const terrain = pavedTerrain();
  const placement = new PlacementGrid(SIZE, SIZE);
  const store = new GuestStore(
    terrain,
    new WallGrid(SIZE, SIZE),
    placement,
    GATE,
    OPEN_GATE_DEFAULTS,
  );
  return {
    runner: new WeekRunner(terrain, placement, store),
    streams: forkWeekRngStreams(new Rng(20260825)),
  };
}

function signature(guest: Guest): object {
  return {
    group: guest.group,
    wallet: guest.wallet,
    thrill: guest.thrill,
    palette: guest.palette,
    i: guest.i,
    j: guest.j,
    state: guest.state,
  };
}

describe('주 RNG 독립 스트림', () => {
  it('단골 한 명을 끼워도 다음 일반 손님 뽑기와 일반 스트림 상태가 같다', () => {
    const plain = guests();
    const named = guests();
    named.scheduleRegularVisits([REGULAR], 1);

    const a = forkWeekRngStreams(new Rng(73));
    const b = forkWeekRngStreams(new Rng(73));
    const plainGuest = plain.spawn({ general: a.guests, regular: a.regular }, 'summer');
    const namedGuest = named.spawn({ general: b.guests, regular: b.regular }, 'summer');
    const nextGeneral = named.spawn({ general: b.guests, regular: b.regular }, 'summer');

    expect(namedGuest?.characterId).toBe('minji');
    expect(plainGuest?.characterId).toBeUndefined();
    expect(nextGeneral?.characterId).toBeUndefined();
    expect(signature(nextGeneral as Guest)).toEqual(signature(plainGuest as Guest));
    expect(b.guests.state).toBe(a.guests.state);
  });

  it('단골 방문 여부가 날씨 스트림과 7일 날씨를 밀지 않는다', () => {
    const base = world();
    const regular = world();
    const without = base.runner.run(base.streams, { season: 'summer', arrivalBaseTicks: 1 });
    const withRegular = regular.runner.run(regular.streams, {
      season: 'summer',
      arrivalBaseTicks: 1,
      regularVisits: [REGULAR],
    });

    expect(withRegular.days.map((day) => day.weather)).toEqual(
      without.days.map((day) => day.weather),
    );
    expect(regular.streams.weather.state).toBe(base.streams.weather.state);
  });

  it('독립 스트림 상태를 평문 스냅샷으로 남겨 다음 세이브가 이어진다', () => {
    const streams = forkWeekRngStreams(new Rng(99));
    streams.weather.next();
    streams.guests.next();
    streams.regular.next();
    streams.accident.next();

    const snapshot = snapshotWeekRngStreams(streams);
    expect(snapshot).toEqual({
      weather: streams.weather.state,
      guests: streams.guests.state,
      regular: streams.regular.state,
      accident: streams.accident.state,
    });
    const restored = restoreWeekRngStreams(snapshot);
    for (const key of ['weather', 'guests', 'regular', 'accident'] as const) {
      expect(restored[key].next()).toBe(streams[key].next());
    }
  });
});
