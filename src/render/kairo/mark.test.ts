import { describe, it, expect, afterEach } from 'vitest';
import { entryFaces, marksEntry } from './mark.js';
import {
  PlacementGrid,
  facilityDef,
  allFacilityDefs,
  setEntryFaultForTest,
  type FacilityFacing,
} from '../../sim/kairo/placement.js';

afterEach(() => setEntryFaultForTest(false));

/** 표식은 **입구 칸에서** 유도한다 — 그래서 sim 의 정본 함수를 그대로 태워서 잰다 */
const facesOf = (defId: string, i: number, j: number, facing: FacilityFacing) => {
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
    expect(entryFaces({ i: 3, j: 3, w: 2, d: 2 }, [])).toEqual({
      chains: [],
      front: null,
      arrows: [],
    });
  });

  it('발자국에 안 닿는 칸은 무시한다 — 변이 없으면 그을 것도 없다', () => {
    // (9,9) 는 발자국 [10,12)×[10,12) 의 대각이라 공유 변이 없다
    expect(entryFaces({ i: 10, j: 10, w: 2, d: 2 }, [[9, 9]]).chains).toEqual([]);
  });
});

describe('바닥 화살표 (K54)', () => {
  /** 발자국 안인가 — "꼬리는 밖, 촉은 경계 위"를 재려면 이 술어가 필요하다 */
  const inFoot = (
    f: { i: number; j: number; w: number; d: number },
    p: readonly [number, number],
  ): boolean => p[0] > f.i && p[0] < f.i + f.w && p[1] > f.j && p[1] < f.j + f.d;

  it('★ 면마다 **하나**다 — 발자국이 커져도 개수가 안 는다', () => {
    /*
     * 화살표를 입구 **칸**마다 찍으면 `turtle_island 8×6` 에서 14개가 된다 (앞 두 면의
     * 바깥 이웃 수). K51/K52 가 마름모 14개를 피한 것과 같은 이유로 여기서도 피한다 —
     * 그래서 이 검사는 "개수가 발자국 크기와 무관하다"를 직접 잰다.
     */
    const small = facesOf('pyeongsang_row', 10, 10, 0); // 4×1 → 입구 칸 5
    const big = facesOf('turtle_island', 10, 10, 0); // 8×6 → 입구 칸 14
    expect(small.arrows).toHaveLength(2);
    expect(big.arrows).toHaveLength(2);
    // 표본이 정말 큰가 — 입구 칸이 안 늘었으면 이 검사는 아무것도 안 잰다
    const bigTiles = PlacementGrid.entryTilesOf(facilityDef('turtle_island')!, 10, 10, 0);
    expect(bigTiles.length).toBeGreaterThan(10);
  });

  it('★ 방향은 **바깥 → 안**이다 — 꼬리가 발자국 밖, 촉이 경계 변 위', () => {
    const foot = { i: 10, j: 10, w: 4, d: 1 };
    const { arrows } = facesOf('pyeongsang_row', 10, 10, 0);
    for (const a of arrows) {
      // 촉은 발자국 경계 **선 위**다 (안도 밖도 아니다)
      expect(inFoot(foot, a.tip)).toBe(false);
      // 촉에서 `dir` 로 한 걸음 = 발자국 안 · 반대로 한 걸음 = 발자국 밖
      const into: [number, number] = [a.tip[0] + a.dir[0] * 0.5, a.tip[1] + a.dir[1] * 0.5];
      const out: [number, number] = [a.tip[0] - a.dir[0] * 0.5, a.tip[1] - a.dir[1] * 0.5];
      expect(inFoot(foot, into)).toBe(true);
      expect(inFoot(foot, out)).toBe(false);
      // 꼬리(다각형 3·4번 점)는 전부 밖 — 화살표가 시설 그림 위에 얹히면 안 된다
      for (const p of [a.poly[3]!, a.poly[4]!]) expect(inFoot(foot, p)).toBe(false);
      // 촉이 다각형의 첫 점이다 (씬과 하네스가 `points[0]` 을 촉으로 읽는다)
      expect(a.poly[0]).toEqual(a.tip);
      expect(a.poly).toHaveLength(7);
    }
    // facing 0 의 앞 면은 +I·+J 이므로 안쪽은 −I·−J
    expect(arrows.map((a) => a.dir).sort()).toEqual([
      [-1, 0],
      [0, -1],
    ]);
  });

  it('★ 회전하면 화살표가 같이 돈다 (자리도 방향도)', () => {
    const a = facesOf('pyeongsang_row', 10, 10, 0); // 4×1
    const b = facesOf('pyeongsang_row', 10, 10, 1); // 1×4
    // +I 면은 j 중앙, +J 면은 i 중앙 — 회전하면 두 면의 길이가 맞바뀐다
    expect(a.arrows.map((x) => x.tip)).toEqual([
      [14, 10.5], // +I 면 (x = i+w = 14), 깊이 1 의 중앙
      [12, 11], // +J 면 (y = j+d = 11), 폭 4 의 중앙
    ]);
    expect(b.arrows.map((x) => x.tip)).toEqual([
      [11, 12],
      [10.5, 14],
    ]);
    /*
     * facing 0↔1 은 전치(w↔d)라 **앞면이 그대로 앞면**이다 — 방향은 안 바뀌고 자리만
     * 옮겨간다 (면이 바뀌는 것은 아래 facing 2 검사다). 자리가 안 움직이면 실패다.
     */
    expect(a.arrows.map((x) => x.dir)).toEqual(b.arrows.map((x) => x.dir));
    expect(a.arrows.map((x) => x.tip)).not.toEqual(b.arrows.map((x) => x.tip));
  });

  it('★ `facing 2` 는 화살표가 **반대편 두 면**으로 간다 (K53 뒤돌기)', () => {
    /*
     * `+I·+J` 를 앞면으로 박으면 안 된다는 것을 고정한다 — K53 부터 facing 2·3 은
     * 입구가 −I·−J 다. 화살표 방향도 통째로 뒤집혀야 한다.
     */
    const { arrows } = facesOf('pyeongsang_row', 10, 10, 2);
    expect(arrows.map((a) => a.dir).sort()).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(arrows.map((a) => a.tip)).toEqual([
      [10, 10.5], // −I 면 (x = i)
      [12, 10], // −J 면 (y = j)
    ]);
  });

  it('★ 음성 대조군 — `setEntryFaultForTest` 를 켜면 화살표가 **네 개**로 퍼진다', () => {
    /*
     * ⚠ 면을 "세로 변/가로 변" 두 축으로 묶으면 −I 와 +I 가 같은 덩어리가 되어
     * 대조군에서도 화살표가 2개로 남는다 — 그러면 그림으로 구별이 안 되는, 아무것도
     * 안 재는 검사가 된다. 그래서 `faceArrows` 는 **직선(x 값·y 값)** 으로 묶는다.
     */
    const before = facesOf('pyeongsang_row', 10, 10, 0);
    setEntryFaultForTest(true);
    const after = facesOf('pyeongsang_row', 10, 10, 0);
    expect(before.arrows).toHaveLength(2);
    expect(after.arrows).toHaveLength(4);
    // 네 방향이 전부 다르다 — 뭉쳐서 4개가 된 것이 아니다
    expect(new Set(after.arrows.map((a) => a.dir.join(',')))).toEqual(
      new Set(['1,0', '-1,0', '0,1', '0,-1']),
    );
  });

  it('화살표는 칸 하나 안에 들어간다 — 다음 칸까지 침범하면 "어느 칸"이 흐려진다', () => {
    const { arrows } = facesOf('pyeongsang_row', 10, 10, 0);
    for (const a of arrows) {
      for (const p of a.poly) {
        // 촉에서 잰 안쪽·바깥쪽 거리 (부호 있는 스칼라)
        const u = (p[0] - a.tip[0]) * a.dir[0] + (p[1] - a.tip[1]) * a.dir[1];
        expect(u).toBeLessThanOrEqual(0); // 안쪽으로는 한 텍셀도 안 넘어간다
        expect(u).toBeGreaterThanOrEqual(-1); // 바깥으로도 한 칸 안
        const v = (p[0] - a.tip[0]) * -a.dir[1] + (p[1] - a.tip[1]) * a.dir[0];
        expect(Math.abs(v)).toBeLessThanOrEqual(0.5); // 옆 칸도 안 넘는다
      }
    }
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
