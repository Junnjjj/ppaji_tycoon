/**
 * 입구 표식의 **기하** (K52) — 순수 함수만. Phaser 도 씬 상태도 안 본다.
 *
 * ## 왜 씬에서 뺐나
 *
 * 씬은 그리기 부수효과 덩어리라 노드에서 못 돈다. 이 파일의 계산은 "입구 칸 목록 →
 * 그을 선"이고, 그건 `setEntryFaultForTest` 대조군을 **단위 검사로** 잡을 수 있는
 * 유일한 형태다 (화면 검사는 하네스가 따로 한다 — 둘 다 필요하다).
 */

/** 격자 **꼭지점** (타일이 아니라 타일의 모서리) */
export type GridVert = [number, number];

/** 발자국 사각형 — `PlacementGrid.sizeOf` 가 회전을 이미 반영한 값이 들어온다 */
export interface FootRect {
  i: number;
  j: number;
  w: number;
  d: number;
}

export interface EntryFaces {
  /**
   * 이어 붙인 폴리라인들. 조각(단위 변)이 아니라 **사슬**인 이유는 이음매 때문이다 —
   * 단위 변을 따로 그으면 45° 꺾임마다 butt cap 이 톱니로 남는다.
   */
  chains: GridVert[][];
  /**
   * 글씨를 얹을 **앞 꼭지점**. 아이소에서 화면 y ∝ `(i+j)` 이므로 `i+j` 가 최대인
   * 꼭지점이 카메라에 가장 가까운 모서리다. 동점은 `i` 가 큰 쪽 — 결정론이 필요해서다
   * (프레임마다 좌우로 튀면 그것만으로 버그로 읽힌다).
   */
  front: GridVert | null;
}

/**
 * 이 시설에 `입구` 표식을 그리나 — **판정은 여기 한 곳**이다 (K52).
 *
 * 표식의 값은 그것이 손님의 실제 동선과 **같은 집합**이라는 데서 나온다. 아무도 안
 * 들어오는 곳에 `입구` 를 그리면 표식 전체가 못 믿을 것이 된다. 그래서 둘을 뺀다:
 *
 * - **`walkOn`** (플로팅덱·선착장 2종) — 발자국 전체가 길이다. 손님은 들어가는 게
 *   아니라 **지나간다**. 앞 두 면만 긋는 것은 "나머지로는 못 들어온다"는 거짓말이고,
 *   네 면을 긋는 것은 음성 대조군(`setEntryFaultForTest`)의 그림과 똑같아진다 —
 *   대조군이 그림으로 구별되지 않으면 그 검사는 아무것도 안 재는 검사다
 * - **`capacity <= 0`** (화단·DJ 부스·펜션·주차장 등 14종) — 슬롯이 0개라 손님이
 *   **목적지로 삼지 않는다** (`pickTarget` 이 정원 0 을 안 고른다)
 *
 * ⚠ 슬라이드류(`ride`)는 이 판정보다 **먼저** 걸러진다 — 데이터가 이미 칸 하나를
 * 골라 놨고 그건 면이 아니라 칸이다.
 */
export function marksEntry(def: { walkOn?: boolean; capacity: number }): boolean {
  return def.walkOn !== true && def.capacity > 0;
}

const vkey = (x: number, y: number): number => x * 4096 + y;

/**
 * 입구 칸 목록 → 발자국과 **맞닿은 변**들의 폴리라인.
 *
 * ⚠ 발자국 크기로 "오른쪽 변·아래쪽 변"을 바로 그리면 안 된다. 그러면 화면이
 * `PlacementGrid.entryTilesOf` 를 **안 읽는** 상태가 되어, 손님이 들어오는 칸이 바뀌어도
 * 선은 그대로다. 표식이 조용히 거짓말하는 형태이고, 무엇보다 음성 대조군
 * (`setEntryFaultForTest` — 네 면 전부)이 그림에 **아무 변화도 안 만든다** = 그 검사가
 * 아무것도 안 재게 된다.
 *
 * 그래서 입구 칸에서 유도한다: 입구 칸 하나가 발자국 칸 하나와 공유하는 변이 곧 그 면의
 * 한 조각이다. 네 방향을 다 보므로 입구가 어느 면에 있든 답이 나온다.
 */
export function entryFaces(foot: FootRect, tiles: readonly (readonly [number, number])[]): EntryFaces {
  const { i: fi, j: fj, w, d } = foot;
  const inFoot = (ti: number, tj: number): boolean =>
    ti >= fi && ti < fi + w && tj >= fj && tj < fj + d;

  const segs: [number, number, number, number][] = [];
  const segSeen = new Set<string>();
  const addSeg = (x1: number, y1: number, x2: number, y2: number): void => {
    const k = `${x1},${y1},${x2},${y2}`;
    if (segSeen.has(k)) return;
    segSeen.add(k);
    segs.push([x1, y1, x2, y2]);
  };
  for (const [ti, tj] of tiles) {
    // 입구 칸의 +I 쪽이 발자국이면 공유 변은 `x = ti+1` 의 세로 변이다 (이하 같은 규칙)
    if (inFoot(ti + 1, tj)) addSeg(ti + 1, tj, ti + 1, tj + 1);
    if (inFoot(ti - 1, tj)) addSeg(ti, tj, ti, tj + 1);
    if (inFoot(ti, tj + 1)) addSeg(ti, tj + 1, ti + 1, tj + 1);
    if (inFoot(ti, tj - 1)) addSeg(ti, tj, ti + 1, tj);
  }
  if (segs.length === 0) return { chains: [], front: null };

  const verts = new Map<number, GridVert>();
  const adj = new Map<number, number[]>();
  segs.forEach((s, idx) => {
    for (const [x, y] of [
      [s[0], s[1]],
      [s[2], s[3]],
    ] as const) {
      const k = vkey(x, y);
      if (!verts.has(k)) verts.set(k, [x, y]);
      const list = adj.get(k);
      if (list) list.push(idx);
      else adj.set(k, [idx]);
    }
  });

  const used = segs.map(() => false);
  const chains: GridVert[][] = [];
  /*
   * **홀수 차수 꼭지점부터** 시작한다 — 그것이 열린 사슬의 끝이다. 가운데에서 출발하면
   * 한 사슬이 둘로 쪼개져 이음매가 도로 생긴다. 닫힌 고리(대조군의 네 면 윤곽)는 전부
   * 짝수 차수라 뒤의 전체 목록이 받아 준다.
   */
  const starts = [...verts.keys()]
    .filter((k) => (adj.get(k)?.length ?? 0) % 2 === 1)
    .concat([...verts.keys()]);
  for (const start of starts) {
    for (;;) {
      if ((adj.get(start) ?? []).every((idx) => used[idx])) break;
      let cur = start;
      const chain: GridVert[] = [verts.get(cur)!];
      for (;;) {
        const idx = (adj.get(cur) ?? []).find((n) => !used[n]);
        if (idx === undefined) break;
        used[idx] = true;
        const s = segs[idx]!;
        const a = vkey(s[0], s[1]);
        const next = a === cur ? vkey(s[2], s[3]) : a;
        chain.push(verts.get(next)!);
        cur = next;
      }
      chains.push(chain);
    }
  }

  let front: GridVert | null = null;
  for (const chain of chains) {
    for (const v of chain) {
      if (
        !front ||
        v[0] + v[1] > front[0] + front[1] ||
        (v[0] + v[1] === front[0] + front[1] && v[0] > front[0])
      ) {
        front = v;
      }
    }
  }
  return { chains, front };
}
