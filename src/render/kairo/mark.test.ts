import { describe, it, expect, afterEach } from 'vitest';
import { entryFaces, marksEntry } from './mark.js';
import {
  PlacementGrid,
  facilityDef,
  allFacilityDefs,
  setEntryFaultForTest,
} from '../../sim/kairo/placement.js';

afterEach(() => setEntryFaultForTest(false));

/** 표식은 **입구 칸에서** 유도한다 — 그래서 sim 의 정본 함수를 그대로 태워서 잰다 */
const facesOf = (defId: string, i: number, j: number, facing: 0 | 1) => {
  const def = facilityDef(defId)!;
  const [w, d] = PlacementGrid.sizeOf(def, facing);
  return entryFaces({ i, j, w, d }, PlacementGrid.entryTilesOf(def, i, j, facing));
};

/** 사슬을 단위 변 집합으로 되돌린다 — "몇 개를 그었나"를 세려면 조각으로 봐야 한다 */
const segsOf = (chains: readonly (readonly [number, number])[][]): string[] => {
  const out: string[] = [];
  for (const c of chains) {
    for (let k = 1; k < c.length; k++) out.push(`${c[k - 1]!.join(',')}-${c[k]!.join(',')}`);
  }
  return out;
};

describe('입구 표식 기하 (K52)', () => {
  it('앞 두 면이 **사슬 하나**로 이어진다 (조각이 아니다)', () => {
    // 평상 연립 4×1 — 비정사각이라 회전이 눈에 보이는 종이다
    const { chains, front } = facesOf('pyeongsang_row', 10, 10, 0);
    expect(chains).toHaveLength(1);
    // +I 면 1조각(d=1) + +J 면 4조각(w=4)
    expect(segsOf(chains)).toHaveLength(5);
    // 열린 사슬이다 — 양 끝이 다르다 (닫힌 고리는 네 면일 때뿐)
    const c = chains[0]!;
    expect(c[0]).not.toEqual(c[c.length - 1]);
    // 사슬은 실제로 이어져 있다 — 이웃 꼭지점 사이 거리가 언제나 1
    for (let k = 1; k < c.length; k++) {
      expect(Math.abs(c[k]![0] - c[k - 1]![0]) + Math.abs(c[k]![1] - c[k - 1]![1])).toBe(1);
    }
    // 앞 꼭지점 = 발자국의 (i+w, j+d) 모서리
    expect(front).toEqual([14, 11]);
  });

  it('★ 회전하면 표식이 **반대 두 면**으로 옮겨간다', () => {
    const a = facesOf('pyeongsang_row', 10, 10, 0); // 4×1
    const b = facesOf('pyeongsang_row', 10, 10, 1); // 1×4
    expect(segsOf(a.chains).sort()).not.toEqual(segsOf(b.chains).sort());
    // 회전 전 앞 면은 i 방향으로 길고, 회전 뒤는 j 방향으로 길다
    expect(a.front).toEqual([14, 11]);
    expect(b.front).toEqual([11, 14]);
    // 조각 수는 보존된다 (`sizeOf` 가 w↔d 를 맞바꿀 뿐이다)
    expect(segsOf(b.chains)).toHaveLength(5);
  });

  it('뒤 두 면(−I·−J)에는 아무것도 안 긋는다', () => {
    const { chains } = facesOf('pyeongsang_row', 10, 10, 0);
    // 발자국은 [10,14)×[10,11) — 뒤 면은 x=10 세로변과 y=10 가로변이다
    for (const s of segsOf(chains)) {
      const [x1, y1, x2, y2] = s.split(/[-,]/).map(Number) as [number, number, number, number];
      const backI = x1 === 10 && x2 === 10; // −I 면
      const backJ = y1 === 10 && y2 === 10; // −J 면
      expect(backI || backJ).toBe(false);
    }
  });

  it('음성 대조군 — `setEntryFaultForTest` 를 켜면 네 면으로 퍼진다', () => {
    const before = facesOf('pyeongsang_row', 10, 10, 0);
    setEntryFaultForTest(true);
    const after = facesOf('pyeongsang_row', 10, 10, 0);
    // 둘레 전체 = 2(w+d) = 10 조각. 앞 두 면만일 때의 5조각과 갈린다
    expect(segsOf(after.chains)).toHaveLength(10);
    expect(segsOf(before.chains)).toHaveLength(5);
    // 닫힌 고리라 사슬 하나의 양 끝이 같다
    expect(after.chains).toHaveLength(1);
    const c = after.chains[0]!;
    expect(c[0]).toEqual(c[c.length - 1]);
    // 글씨는 그래도 하나 — 앞 꼭지점은 그대로다
    expect(after.front).toEqual(before.front);
  });

  it('입구 칸이 없으면 아무것도 안 그린다 (빈 배열에 안전)', () => {
    expect(entryFaces({ i: 3, j: 3, w: 2, d: 2 }, [])).toEqual({ chains: [], front: null });
  });

  it('발자국에 안 닿는 칸은 무시한다 — 변이 없으면 그을 것도 없다', () => {
    // (9,9) 는 발자국 [10,12)×[10,12) 의 대각이라 공유 변이 없다
    expect(entryFaces({ i: 10, j: 10, w: 2, d: 2 }, [[9, 9]]).chains).toEqual([]);
  });
});

describe('입구 표식은 손님이 실제로 가는 시설에만 (K52)', () => {
  it('★ 정원 0 인 분위기·기반 시설에는 안 그린다 — 아무도 안 들어온다', () => {
    /*
     * 표식의 값은 손님의 실제 동선과 **같은 집합**이라는 데서 나온다. 화단·DJ 부스·펜션은
     * 슬롯이 0개라 `pickTarget` 이 고르지 않는데, 거기 `입구` 가 뜨면 표식 전체가 못 믿을
     * 것이 된다. ⚠ 시설 id 를 박지 않는다 — 데이터에서 유도한다 (불변식 3).
     */
    const zero = allFacilityDefs().filter((d) => d.capacity <= 0 && d.walkOn !== true);
    expect(zero.length).toBeGreaterThan(5); // 표본이 마르면 아무것도 안 재는 검사가 된다
    for (const d of zero) expect(marksEntry(d)).toBe(false);
  });

  it('★ 표식 대상 = 슬롯 있는 시설 **빼기 `walkOn`** — 정확히 선착장 하나가 빠진다', () => {
    /*
     * 슬롯 수 == capacity 는 계약이 이미 강제하므로 "슬롯 있는 시설"과 "정원 있는 시설"은
     * 같은 집합이다. 거기서 `walkOn` 만 빠진다 — 그리고 그게 **선착장 하나**뿐이라는 것이
     * 이 검사의 값이다 (플로팅덱은 정원 0 이라 애초에 안 들어온다).
     * ⚠ 두 축(`capacity`·`walkOn`)이 서로를 덮지 않는다는 뜻이라, 하나만 봐서는 못 가른다.
     */
    const marked = allFacilityDefs().filter((d) => marksEntry(d)).map((d) => d.id);
    const withSlots = allFacilityDefs().filter((d) => (d.slots?.length ?? 0) > 0).map((d) => d.id);
    const dropped = withSlots.filter((id) => !marked.includes(id));
    expect(dropped).toEqual(['dock']);
    expect(marked.length).toBe(withSlots.length - 1);
  });

  it('`walkOn` 은 정원이 있어도 안 그린다 — 들어가는 게 아니라 지나간다', () => {
    const walkOn = allFacilityDefs().filter((d) => d.walkOn === true);
    expect(walkOn.length).toBe(2); // 플로팅덱·선착장
    for (const d of walkOn) expect(marksEntry(d)).toBe(false);
    // 선착장은 정원이 있는데도 빠진다 — 그래서 `capacity` 만으로는 못 가른다
    expect(walkOn.some((d) => d.capacity > 0)).toBe(true);
  });
});
