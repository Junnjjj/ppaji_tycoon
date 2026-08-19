import { describe, it, expect } from 'vitest';
import { upgradeCandidates } from './kairo-staff.js';
import { KairoTerrain } from '../sim/kairo/terrain.js';
import { WallGrid } from '../sim/kairo/walls.js';
import {
  PlacementGrid,
  FACILITY_MAX_LEVEL,
  SPECIALTY_LEVEL,
} from '../sim/kairo/placement.js';

/**
 * 개선 목록은 잘리지 않는다 (P3-C).
 *
 * 예전에는 `.slice(0, 12)` 였다. 후반 판은 시설이 100~130채인데, **확장이 등급 상한에
 * 막힌 뒤의 유일한 성장 수단**의 입구가 12칸짜리 목록이었다 — 나머지는 화면에 존재하지
 * 않았다 (`docs/research/late-game-cap-proposal.md` §1.5). 시트 본문은 이미 스크롤하므로
 * 자를 이유도 없었다.
 *
 * ⚠ 여기서 재는 것은 **무엇이 목록에 실리고 어떤 순서인가**(순수 함수)다. 실제로 눌리는지는
 * 브라우저 검사가 진짜 터치로 본다 (K33: 백도어로 좌표를 넣으면 화면 밖 핸들도 통과한다).
 */

const SIZE = 40;

/** 평평한 포장 지면에 시설 `n` 채. 격자만 있으면 되므로 지형은 최소로 만든다 */
function world(n: number): { p: PlacementGrid } {
  const t = new KairoTerrain(SIZE, SIZE);
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) t.paint(i, j, 'path_stone');
  const w = new WallGrid(SIZE, SIZE);
  const p = new PlacementGrid(SIZE, SIZE);
  const gate = { i: 0, j: 0 };
  let placed = 0;
  // 2×2 매점을 3칸 간격으로 깐다 — 겹치지 않고 개수만 늘린다
  for (let j = 2; j < SIZE - 2 && placed < n; j += 3) {
    for (let i = 2; i < SIZE - 2 && placed < n; i += 3) {
      if (p.place(t, w, gate, 'shop', i, j)) placed++;
    }
  }
  if (placed < n) throw new Error(`시설을 ${n}채 놓지 못했다 (${placed}채)`);
  return { p };
}

describe('개선 목록이 안 잘린다 (P3-C)', () => {
  it('★ 시설 20채 이상이면 20줄 이상이 나온다 — 12 에서 멈추지 않는다', () => {
    const { p } = world(24);
    const { rows, total } = upgradeCandidates(p);
    expect(p.count).toBe(24);
    expect(rows.length).toBe(24);
    expect(total).toBe(24);
    // ⚠ 옛 상한을 그대로 못박는다 — 되살아나면 이 줄이 먼저 빨개진다
    expect(rows.length).toBeGreaterThan(12);
  });

  it('★ 130채(후반 실측 규모)도 전부 실린다', () => {
    const { p } = world(130);
    expect(upgradeCandidates(p).rows.length).toBe(130);
  });

  it('⚠ 음성 대조군 — 예전처럼 자르면 118채가 화면에서 사라진다', () => {
    const { p } = world(130);
    const cut = upgradeCandidates(p).rows.slice(0, 12);
    expect(cut.length).toBe(12);
    expect(upgradeCandidates(p).rows.length - cut.length).toBe(118);
  });
});

describe('고를 수 있는 줄이 여전히 맨 위다 (P1.5 규칙 유지)', () => {
  /** `handle` 을 특화 갈림길 단계까지 올린다 */
  const toChoice = (p: PlacementGrid, handle: number): void => {
    while (p.levelOf(handle) < SPECIALTY_LEVEL) p.upgrade(handle);
  };

  it('★ 뒤쪽 시설을 3단계로 올리면 그 줄이 1위로 올라온다', () => {
    const { p } = world(24);
    const handles = p.all().map((it) => it.handle);
    const late = handles[handles.length - 1]!;
    // 대조군: 올리기 전에는 마지막 줄이다 (handle 순 정렬)
    expect(upgradeCandidates(p).rows[0]?.handle).toBe(handles[0]);
    toChoice(p, late);
    expect(p.canChooseSpecialty(late)).toBe(true);
    expect(upgradeCandidates(p).rows[0]?.handle).toBe(late);
  });

  it('★ 필터를 걸어도 순서 규칙이 유지된다 — 필터는 정렬 뒤에 건다', () => {
    const { p } = world(24);
    const handles = p.all().map((it) => it.handle);
    const late = handles[handles.length - 1]!;
    toChoice(p, late);
    for (const f of ['all', 'choose', 'afford'] as const) {
      const rows = upgradeCandidates(p, f, 100_000_000).rows;
      expect(rows[0]?.handle, f).toBe(late);
    }
  });

  it('`고를 것` 필터는 갈림길이 선 줄만 남긴다', () => {
    const { p } = world(24);
    const late = p.all()[23]!.handle;
    toChoice(p, late);
    const rows = upgradeCandidates(p, 'choose').rows;
    expect(rows.map((r) => r.handle)).toEqual([late]);
  });

  it('`살 수 있음` 필터는 지갑을 본다 — 0원이면 살 수 있는 줄이 없다', () => {
    const { p } = world(6);
    expect(upgradeCandidates(p, 'afford', 0).rows.length).toBe(0);
    expect(upgradeCandidates(p, 'afford', 100_000_000).rows.length).toBe(6);
    // 지갑을 모르는 호출자(경영 deps 미주입)는 아무것도 못 산다
    expect(upgradeCandidates(p, 'afford', null).rows.length).toBe(0);
  });

  it('최고 단계라도 고른 특화가 있으면 목록에 남는다 — 고른 것이 안 보이면 안 된다', () => {
    const { p } = world(3);
    const h = p.all()[0]!.handle;
    toChoice(p, h);
    const allowed = PlacementGrid.specialtiesFor(p.all()[0]!.defId);
    expect(p.chooseSpecialty(h, allowed[0]!)).toBe(true);
    while (p.levelOf(h) < FACILITY_MAX_LEVEL) p.upgrade(h);
    expect(upgradeCandidates(p).rows.some((r) => r.handle === h)).toBe(true);
  });
});
