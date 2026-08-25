import { describe, it, expect } from 'vitest';
import { Rng } from '../sim/rng.js';
import { KairoTerrain, groundIndex } from '../sim/kairo/terrain.js';
import { WallGrid, EDGE_SOLID, DIR_J_MINUS } from '../sim/kairo/walls.js';
import { PlacementGrid, facilityDef, SPECIALTY_LEVEL } from '../sim/kairo/placement.js';
import { GuestStore } from '../sim/kairo/guests.js';
import {
  WeekRunner,
  forkWeekRngStreams,
  snapshotWeekRngStreams,
  summarizeWeek,
} from '../sim/kairo/week.js';
import { ProgressStore, questStatuses } from '../sim/kairo/progress.js';
import { CertStore, certStatuses, type CertContext, type CertStatus } from '../sim/kairo/certs.js';
import {
  packKairo,
  restoreKairo,
  migrateKairo,
  KairoSaveError,
  KAIRO_SAVE_VERSION,
  type KairoSaveInput,
} from './kairo.js';

/**
 * 카이로 세이브 왕복 — **세이브 없이 기본 씬이 되면 폰에서 새로고침마다 다 날아간다.**
 *
 * 이 테스트가 못박는 것은 두 가지다:
 *   1. 저장 → JSON 문자열 → 복원이 같은 상태를 낸다 (JSON 을 실제로 거친다 —
 *      객체를 그대로 넘기면 직렬화 불가능한 값을 못 잡는다)
 *   2. 복원한 요약으로 등급·의뢰 판정이 그대로 돈다
 */

const GRID_W = 40;
const GRID_H = 32;
const GATE = { i: 2, j: 2 };
/** 인증 문맥 — 세이브 검사는 조건 판정을 안 본다 (certs.test.ts 소관) */
const EMPTY_CERT_CTX: CertContext = { zones: [], courses: 0, questsDone: 0 };

function build(): KairoSaveInput {
  const rng = new Rng(4242);
  const terrain = KairoTerrain.generate(GRID_W, GRID_H, rng.fork(1));
  /* 육지를 포장한다 — K32-B 부터 잔디는 손님이 못 지나간다 (길 규칙은 별도 테스트가 본다) */
  for (let j = 0; j < GRID_H; j++) {
    for (let i = 0; i < GRID_W; i++) if (terrain.isWalkable(i, j)) terrain.paint(i, j, 'path_stone');
  }
  const walls = new WallGrid(GRID_W, GRID_H);
  const placement = new PlacementGrid(GRID_W, GRID_H);
  // 벽부착 시설을 놓을 수 있게 경계를 준다 (K25: 벽은 타일이 아니라 경계에 있다)
  for (let i = 10; i < 20; i++) walls.setEdge(i, 5, DIR_J_MINUS, EDGE_SOLID);
  placement.place(terrain, walls, GATE, 'ticket', 4, 2);
  placement.place(terrain, walls, GATE, 'shop', 8, 3);
  placement.place(terrain, walls, GATE, 'pyeongsang_row', 8, 8);

  const guests = new GuestStore(terrain, walls, placement, GATE);
  const week = new WeekRunner(terrain, placement, guests);
  const weekRng = new Rng(31337);
  const weekRngStreams = forkWeekRngStreams(weekRng);
  const rep = week.run(weekRngStreams, { season: 'summer' });
  /*
   * ⚠ 한 주 수입보다 **큰** 금액을 쓴다. 100만이면 입장료(K36-B②)가 들어온 뒤로
   * 그 주 손익이 그걸 넘어서서, 아래 "잔액이 줄었다" 검사가 통과할 수 없다 —
   * 검사의 뜻은 "건설비가 반영됐다"이지 "매출이 적다"가 아니다.
   */
  week.spend(3_000_000);

  const progress = new ProgressStore();
  const summary = summarizeWeek(rep);
  progress.claim(questStatuses(placement, summary));

  return {
    seed: 4242,
    gate: GATE,
    terrain,
    walls,
    placement,
    progress,
    week: week.toSnapshot(),
    weekRngState: weekRng.state,
    weekRngStreams: snapshotWeekRngStreams(weekRngStreams),
    season: 'summer',
    lastSummary: summary,
  };
}

describe('카이로 세이브', () => {
  const input = build();
  // ★ JSON 을 실제로 거친다 — 객체를 그대로 넘기면 직렬화 못 되는 값을 놓친다
  const round = restoreKairo(JSON.parse(JSON.stringify(packKairo(input, 1_700_000_000_000))));

  it('지형이 칸 단위로 같다', () => {
    for (let j = 0; j < GRID_H; j++) {
      for (let i = 0; i < GRID_W; i++) {
        expect(round.terrain.kindAt(i, j)).toBe(input.terrain.kindAt(i, j));
      }
    }
  });

  it('벽이 같다', () => {
    let same = 0;
    for (let i = 10; i < 20; i++) {
      expect(round.walls.mask(i, 5)).toBe(input.walls.mask(i, 5));
      same++;
    }
    expect(same).toBe(10);
  });

  it('시설 3개가 같은 자리에 있다', () => {
    expect(round.placement.count).toBe(3);
    for (const item of input.placement.all()) {
      const hit = round.placement.at(item.i, item.j);
      expect(hit?.defId).toBe(item.defId);
    }
  });

  it('현금·주차가 같다 — 건설비를 쓴 뒤의 잔액이어야 한다', () => {
    expect(round.week.cash).toBe(input.week.cash);
    expect(round.week.week).toBe(input.week.week);
    expect(round.week.cash).toBeLessThan(5_000_000);
  });

  it('RNG 상태가 같다 — 같은 세이브가 같은 다음 주를 낸다', () => {
    expect(round.weekRngState).toBe(input.weekRngState);
    const a = Rng.fromState(round.weekRngState);
    const b = Rng.fromState(input.weekRngState);
    expect(a.next()).toBe(b.next());
    expect(round.weekRngStreams).toEqual(input.weekRngStreams);
  });

  it('받은 의뢰가 다시 지급되지 않는다', () => {
    expect(round.progress.claimedCount).toBe(input.progress.claimedCount);
    const again = round.progress.claim(questStatuses(round.placement, round.lastSummary));
    expect(again.cash).toBe(0);
  });

  it('복원한 요약으로 의뢰 판정이 돈다 — 히트맵을 저장하지 않아도 된다', () => {
    const st = questStatuses(round.placement, round.lastSummary);
    expect(st.length).toBeGreaterThan(0);
    expect(st.some((x) => x.detail.includes('/'))).toBe(true);
  });

  it('전주 비교 요약은 소형 필드만 JSON 왕복한다 — 히트맵·장부는 저장하지 않는다', () => {
    expect(round.lastSummary).toEqual(input.lastSummary);
    expect(Object.keys(round.lastSummary ?? {}).sort()).toEqual([
      'exitSatisfaction',
      'menuPurchaseCount',
      'profit',
      'regularPurchases',
      'regularVisits',
      'turnedAway',
      'visitors',
    ]);
    expect(round.lastSummary).not.toHaveProperty('heat');
    expect(round.lastSummary).not.toHaveProperty('investment');
    expect(round.lastSummary).not.toHaveProperty('revenue');
  });

  it('복원한 시뮬로 다음 주가 계속 돈다', () => {
    const guests = new GuestStore(round.terrain, round.walls, round.placement, round.gate);
    const week = new WeekRunner(round.terrain, round.placement, guests);
    week.restore(round.week);
    const streams = round.weekRngStreams
      ? {
          weather: Rng.fromState(round.weekRngStreams.weather),
          guests: Rng.fromState(round.weekRngStreams.guests),
          regular: Rng.fromState(round.weekRngStreams.regular),
          accident: Rng.fromState(round.weekRngStreams.accident),
        }
      : forkWeekRngStreams(Rng.fromState(round.weekRngState));
    const rep = week.run(streams, { season: round.season });
    expect(rep.week).toBe(round.week.week + 1);
  });

  it('버전이 미래면 거부한다 — 조용히 열면 상태가 깨진 채로 돈다', () => {
    const future = { ...packKairo(input, 0), version: KAIRO_SAVE_VERSION + 1 };
    expect(() => migrateKairo(future)).toThrow(KairoSaveError);
  });

  it('필수 항목이 없으면 거부한다', () => {
    const broken = { ...packKairo(input, 0) } as Record<string, unknown>;
    delete broken['placement'];
    expect(() => migrateKairo(broken)).toThrow(KairoSaveError);
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────
 * K36 — 격자가 64×48 → 96×72 로 넓어졌다.
 *
 * **이 테스트의 이유:** `fromSnapshot` 셋이 전부 **저장된 크기**를 그대로 쓴다. 상수만
 * 올리고 마이그레이션을 안 하면, 새로 생긴 영역이 "잔디처럼 보이지만 영원히 죽은 칸"이
 * 된다 — `paint` 실패 · `outside` · 플로우필드 밖. 렌더는 그것도 그려 준다.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('★ 세이브 v3 → 최신 — 격자가 넓어져도 판이 살아남는다', () => {
  const BAND = KairoTerrain.CITY_BAND;

  /** 옛 64×48 세이브를 손으로 짓는다 — 실제로 나갔던 모양 */
  function oldSave(): Record<string, unknown> {
    const OW = 64;
    const OH = 48;
    const lawn = groundIndex('lawn');
    const water = groundIndex('water_edge');
    const kinds = new Array<number>(OW * OH).fill(lawn);
    // 아래 절반은 물 — 강이 이어지는지 볼 수 있어야 한다
    for (let j = 30; j < OH; j++) for (let i = 0; i < OW; i++) kinds[j * OW + i] = water;
    return {
      version: 3,
      savedAtMs: 0,
      seed: 7,
      gate: { i: 0, j: 0 },
      terrain: { w: OW, h: OH, kinds },
      walls: { w: OW, h: OH, ei: [], ej: [] },
      placement: {
        w: OW,
        h: OH,
        next: 4,
        items: [
          { handle: 1, defId: 'shop', i: 5, j: 5, level: 1 },
          { handle: 2, defId: 'ticket', i: 9, j: 5, level: 1 },
          { handle: 3, defId: 'cafe', i: 5, j: 9, level: 1 },
        ],
      },
      progress: { claimed: [], history: [] },
      week: { week: 3, cash: 4_200_000 },
      weekRngState: 1,
      season: 'summer',
      lastSummary: null,
      courses: {
        nextHandle: 2,
        courses: [
          {
            handle: 1,
            presetId: 'shuttle',
            equipId: 'peanut',
            vehicles: 1,
            dock: { x: 4, y: 31 },
            handles: [
              { x: 4, y: 35 },
              { x: 4, y: 40 },
            ],
          },
        ],
      },
    };
  }

  it('시설이 하나도 안 사라지고 상대 배치가 그대로다', () => {
    const m = migrateKairo(oldSave()) as unknown as {
      version: number;
      placement: { w: number; h: number; items: { defId: string; i: number; j: number }[] };
    };
    expect(m.version).toBe(KAIRO_SAVE_VERSION);
    expect(m.placement.items).toHaveLength(3);
    expect(m.placement.w).toBe(KairoTerrain.WIDTH);
    expect(m.placement.h).toBe(KairoTerrain.HEIGHT);
    // 가로는 그대로, 세로만 도시 띠만큼 내려간다 — 상대 배치가 보존된다
    const byId = new Map(m.placement.items.map((x) => [x.defId, x]));
    expect(byId.get('shop')).toMatchObject({ i: 5, j: 5 + BAND });
    expect(byId.get('ticket')).toMatchObject({ i: 9, j: 5 + BAND });
    expect(byId.get('cafe')).toMatchObject({ i: 5, j: 9 + BAND });
  });

  it('★ 새로 생긴 영역이 죽은 칸이 아니다 — 강이 이어지고 도시 띠가 생긴다', () => {
    const m = migrateKairo(oldSave()) as unknown as {
      terrain: { w: number; h: number; kinds: number[] };
    };
    const t = KairoTerrain.fromSnapshot({ w: m.terrain.w, h: m.terrain.h, kinds: m.terrain.kinds });
    expect(t.width).toBe(KairoTerrain.WIDTH);
    expect(t.height).toBe(KairoTerrain.HEIGHT);

    // 위 8줄은 도시 띠 — 못 짓는다
    for (let j = 0; j < BAND; j++) expect(t.isBuildable(3, j), `j=${j}`).toBe(false);
    // 입구 열은 뚫려 있다 (손님이 들어올 길)
    expect(t.isGuestWalkable(KairoTerrain.ENTRY_I, BAND - 1)).toBe(true);

    // 옛 격자 밖(오른쪽·아래)도 살아 있다 — 가장자리를 이어 붙였다
    expect(t.kindAt(90, 20)).toBe('lawn');
    expect(t.isWater(90, 60)).toBe(true); // 강이 오른쪽·아래로 이어진다
    // 그리고 실제로 칠할 수 있다 (죽은 칸이 아니다)
    expect(t.paint(90, 20, 'path_stone')).toBe(true);
  });

  it('코스도 같이 내려간다 — 안 내리면 선착장이 육지로 올라간다', () => {
    const m = migrateKairo(oldSave()) as unknown as {
      courses: { courses: { dock: { x: number; y: number }; handles: { y: number }[] }[] };
    };
    const c = m.courses.courses[0]!;
    expect(c.dock).toEqual({ x: 4, y: 31 + BAND });
    expect(c.handles.map((h) => h.y)).toEqual([35 + BAND, 40 + BAND]);
  });

  it('게이트가 새 입구로 옮겨간다 — 옛 (0,0) 은 이제 차도다', () => {
    const m = migrateKairo(oldSave()) as unknown as { gate: { i: number; j: number } };
    expect(m.gate).toEqual(KairoTerrain.parkGate());
  });

  it('⚠ 음성 대조군 — 마이그레이션이 없으면 새 영역이 죽은 칸이다', () => {
    /*
     * 옛 스냅샷을 **그대로** 복원하면 크기가 64×48 로 남는다. 새 상수(96×72)를 믿는
     * 렌더는 6,912장을 그리지만, 그중 3,840칸은 `paint` 조차 안 된다.
     */
    const old = oldSave();
    const t = KairoTerrain.fromSnapshot(
      old['terrain'] as { w: number; h: number; kinds: number[] },
    );
    expect(t.width).toBe(64);
    expect(t.paint(90, 20, 'path_stone')).toBe(false);
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────
 * P1.5 — 시설 특화가 세이브를 건넌다.
 *
 * **버전을 안 올렸다.** `PlacedFacility.specialty` 는 optional 이라 `PlacementSnapshot`
 * 이 있으면 담고 없으면 안 담는다 (`visitorsTotal` 선례). 버전을 올리면 이미 나간 v7
 * 세이브가 전부 한 칸씩 밀린다 — 여기서 재는 것이 정확히 그 "안 밀림"이다.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('★ 특화가 세이브를 건넌다 (P1.5)', () => {
  it('고른 특화가 왕복해도 남는다 — 잃으면 새로고침이 곧 선택 취소다', () => {
    const src = build();
    const handles = src.placement.all().map((it) => it.handle);
    for (const [k, h] of handles.entries()) {
      while (src.placement.levelOf(h) < SPECIALTY_LEVEL) src.placement.upgrade(h);
      // 매표소는 데이터가 회전 하나만 허용한다 — 그래서 시설마다 되는 것을 고른다
      const allowed = PlacementGrid.specialtiesFor(src.placement.all()[k]!.defId);
      expect(src.placement.chooseSpecialty(h, allowed[k % allowed.length]!)).toBe(true);
    }
    const back = restoreKairo(JSON.parse(JSON.stringify(packKairo(src, 1_700_000_000_000))));
    expect(back.placement.count).toBe(3);
    for (const h of handles) {
      expect(back.placement.specialtyOf(h)).toBe(src.placement.specialtyOf(h));
      expect(back.placement.feeOf(h)).toBe(src.placement.feeOf(h));
      expect(back.placement.capacityOf(h)).toBe(src.placement.capacityOf(h));
    }
  });

  it('⚠ 필드가 없는 옛 세이브가 그대로 열린다 — 버전도 그대로다', () => {
    const src = build();
    const raw = JSON.parse(JSON.stringify(packKairo(src, 0))) as {
      version: number;
      placement: { items: Record<string, unknown>[] };
    };
    for (const it of raw.placement.items) expect('specialty' in it).toBe(false);
    expect(raw.version).toBe(KAIRO_SAVE_VERSION);
    expect(KAIRO_SAVE_VERSION).toBe(8);
    const back = restoreKairo(raw);
    for (const it of back.placement.all()) {
      expect(back.placement.specialtyOf(it.handle)).toBeNull();
      // 특화가 없으면 예전과 완전히 같다 (음성 대조군)
      expect(back.placement.capacityOf(it.handle)).toBe(facilityDef(it.defId)?.capacity);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * ★ 도감 발견이 세이브를 건넌다 (P3-C)
 *
 * 도감의 발견 판정이 **현재 배치**를 봤다: 시설은 `placement.all()` 에 지금 서 있어야,
 * 장비는 `courses.all` 에 지금 쓰고 있어야 발견이었다. 철거하면 도감에서 사라졌고 —
 * 그건 도감이 아니라 **현황판**이다 — 코스 장비 19종은 코스를 동시에 19개 놓을 수 없어
 * **완성이 구조적으로 불가능**했다.
 *
 * **버전을 안 올렸다.** `builtEver`/`equipEver` 는 optional 이라 있으면 담고 없으면 안 담는다
 * (`visitorsTotal`·`specialty` 선례). 버전을 올리면 이미 나간 v7 세이브가 전부 한 칸씩 밀린다.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('★ 도감 발견이 세이브를 건넌다 (P3-C)', () => {
  it('한 번이라도 지은 시설·써본 장비가 왕복해도 남는다', () => {
    const src = build();
    /*
     * ⚠ **지금 배치에 없는 id 를 일부러 넣는다.** 철거한 시설·지운 코스가 그 값이다 —
     * 배치에서 다시 만들 수 있는 값이면 저장할 이유 자체가 없다.
     */
    src.builtEver = ['shop', 'ticket', 'pyeongsang_row', 'jjimjilbang'];
    src.equipEver = ['banana_boat', 'flyfish'];
    const back = restoreKairo(JSON.parse(JSON.stringify(packKairo(src, 1_700_000_000_000))));
    expect(back.builtEver).toEqual(src.builtEver);
    expect(back.equipEver).toEqual(src.equipEver);
    // 지금 서 있는 시설은 3채뿐인데 도감은 4종을 기억한다 — 이 차이가 이 필드의 존재 이유다
    expect(back.placement.count).toBe(3);
    expect(back.builtEver!.length).toBe(4);
  });

  it('⚠ 필드가 없는 옛 세이브가 그대로 열린다 — 버전도 그대로다', () => {
    const raw = JSON.parse(JSON.stringify(packKairo(build(), 0))) as Record<string, unknown>;
    expect('builtEver' in raw).toBe(false);
    expect('equipEver' in raw).toBe(false);
    expect(raw['version']).toBe(KAIRO_SAVE_VERSION);
    expect(KAIRO_SAVE_VERSION).toBe(8);
    const back = restoreKairo(raw);
    // 없으면 그냥 없다 — 부팅이 지금 배치에서 다시 채운다 (마이그레이션 없음)
    expect(back.builtEver).toBeUndefined();
    expect(back.equipEver).toBeUndefined();
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * ★ 사이드 인증이 세이브를 건넌다 (P3-E)
 *
 * 인증은 **등급에서 다시 만들 수 없는 상태**다 (등급은 gradeNo 하나이고 인증은 그 옆의
 * 병렬 목록이다). 잃으면 정원 가산 +N 이 통째로 증발해 **새로고침이 곧 상한 되돌리기**가
 * 된다 — 게다가 조건이 이미 지나간 주간 값(그 주 손익·방문객)이면 다시 딸 수도 없다.
 *
 * **버전을 안 올렸다.** `certs` 는 optional 이라 있으면 담고 없으면 안 담는다
 * (`visitorsTotal`·`builtEver` 선례). 버전을 올리면 이미 나간 v7 세이브가 한 칸씩 밀린다.
 * ─────────────────────────────────────────────────────────────────────────
 */
describe('★ 사이드 인증이 세이브를 건넌다 (P3-E)', () => {
  it('딴 인증이 왕복해도 남는다 — 그래야 정원 가산이 유지된다', () => {
    const src = build();
    const store = new CertStore();
    /*
     * 실데이터의 앞 두 종을 딴 상태로 만든다 (조건 판정은 certs.test.ts 소관).
     * ⚠ 데이터를 **비우는 것이 되돌리기 경로**라 (certs.ts 머리말) 인증 0종이어도
     * 이 검사가 죽으면 안 된다 — 그때는 왕복시킬 것이 없으니 건너뛴다.
     */
    const some = certStatuses(src.placement, null, EMPTY_CERT_CTX).slice(0, 2);
    if (some.length === 0) return;
    store.claim(some.map((s) => ({ ...(s as CertStatus), done: true })));
    src.certs = store.toSnapshot();
    const before = store.bonus();
    const back = restoreKairo(JSON.parse(JSON.stringify(packKairo(src, 1_700_000_000_000))));
    const after = CertStore.fromSnapshot(back.certs);
    expect(after.earnedIds).toEqual(store.earnedIds);
    expect(after.bonus()).toEqual(before);
    // 가산이 실제로 0 이 아니어야 이 검사가 뭔가를 지킨다 (자기검사)
    expect(before.capacity).toBeGreaterThan(0);
    expect(store.count).toBe(2);
  });

  it('⚠ 필드가 없는 옛 세이브가 그대로 열린다 — 버전도 그대로다', () => {
    const raw = JSON.parse(JSON.stringify(packKairo(build(), 0))) as Record<string, unknown>;
    expect('certs' in raw).toBe(false);
    expect(raw['version']).toBe(KAIRO_SAVE_VERSION);
    expect(KAIRO_SAVE_VERSION).toBe(8);
    const back = restoreKairo(raw);
    expect(back.certs).toBeUndefined();
    // 없으면 인증 0종 — 가산도 0 이라 예전과 완전히 같다 (음성 대조군)
    expect(CertStore.fromSnapshot(back.certs).bonus()).toEqual({ capacity: 0, permitArea: 0 });
  });

  it('⚠ 데이터에서 사라진 인증은 조용히 버린다 — 되돌리기가 세이브를 안 깬다', () => {
    const src = build();
    src.certs = { earned: ['cert_that_no_longer_exists'] };
    const back = restoreKairo(JSON.parse(JSON.stringify(packKairo(src, 0))));
    expect(CertStore.fromSnapshot(back.certs).count).toBe(0);
  });
});
