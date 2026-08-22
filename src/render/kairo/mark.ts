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

/**
 * 바닥 화살표 하나 (K54) — **면마다 하나**다.
 *
 * 좌표는 전부 **격자 단위(분수 허용)**다. 씬은 `gridToScreen` 으로 옮기기만 한다 —
 * 그래서 화살표가 자동으로 **아이소 지면 위에 눕는다**. 화면 좌표에서 삼각형을 그리면
 * (예: 위쪽을 향한 ▲) 지면과 각이 안 맞아 "바닥에 그린 표시"가 아니라 "화면에 붙인
 * 아이콘"으로 읽힌다 — 사용자가 요청한 것은 전자다.
 */
export interface EntryArrow {
  /** 화살촉 끝 — 발자국 경계 변 위의 점 (면의 가운데) */
  tip: GridVert;
  /** **바깥 → 안** 단위 벡터. 손님이 실제로 걸어 들어가는 방향이다 */
  dir: GridVert;
  /** 그릴 다각형 7점 (격자 단위). 꼬리는 발자국 **밖**, 촉은 경계 변 위 */
  poly: GridVert[];
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
  /**
   * 바닥 화살표 — **면 하나에 하나**다 (K54). 보통 2개, 음성 대조군에서 4개.
   *
   * ⚠ **칸마다 찍지 않는다.** `turtle_island 8×6` 의 앞 두 면 바깥 이웃은 14칸이라
   * 칸마다 찍으면 화살표 14개가 시설을 덮는다 — K51 이 "네 채짜리 워터파크가 표식
   * 여덟 개로 덮인다"고 적어 둔 그 상태이고, K52 가 마름모 14개를 피한 이유와 같다.
   * 면은 한 문장("이쪽으로 들어옵니다")이므로 화살표도 하나면 그 문장을 다 말한다.
   */
  arrows: EntryArrow[];
}

/**
 * 화살표 치수 (격자 단위). 칸 깊이가 1.0 이므로 전장 0.86 은 **바깥 이웃 칸 하나
 * 안에 들어간다** — 넘치면 그 다음 칸까지 침범해 "어느 칸에서 들어가나"가 흐려진다.
 *
 * 화면 크기로 환산하면 전장 `0.86 × |(16,8)| ≈ 15텍셀`, 촉 폭 `0.8 × |(16,−8)| ≈ 14텍셀`.
 * 32×16 타일 위에서 눈에 띄되 칸을 덮지 않는 크기다 (정수 업스케일 2~3배면 30~46px).
 */
const ARROW_LEN = 0.86;
const ARROW_HEAD = 0.34; // 촉 길이 — 전장의 40%. 더 길면 삼각형 하나로 뭉개진다
const ARROW_HEAD_HW = 0.4; // 촉 반폭. 0.5 를 넘으면 옆 칸을 침범한다
/**
 * 자루 반폭. ⚠ 처음 값 `0.115` 는 화면에서 자루 폭이 **4텍셀**이었는데 테두리가
 * 양쪽 2텍셀이라 **속이 한 픽셀도 안 남았다** — 화살표가 실뜨기처럼 보였다 (실측 크롭).
 * 테두리 굵기를 아는 값이므로 씬의 `lineStyle(2, …)` 를 바꾸면 여기도 같이 볼 것.
 */
const ARROW_SHAFT_HW = 0.17;

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
  if (segs.length === 0) return { chains: [], front: null, arrows: [] };

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
  return { chains, front, arrows: faceArrows(foot, segs) };
}

/**
 * 맞닿은 변들 → **면마다 바닥 화살표 하나** (K54).
 *
 * ## 면을 어떻게 세나 — 축이 아니라 **선(line)** 으로 묶는다
 *
 * "세로 변 = +I 면"으로 묶으면 안 된다. 음성 대조군(`setEntryFaultForTest`)에서는
 * `−I` 면과 `+I` 면이 **둘 다 세로 변**이라 한 덩어리로 뭉쳐 화살표가 4개가 아니라
 * 2개가 되고, 그러면 대조군이 그림으로 구별되지 않는다 — 아무것도 안 재는 검사가 된다.
 * 그래서 `x` 값(세로 변)·`y` 값(가로 변)으로 묶는다: 같은 직선 위의 변들이 한 면이다.
 *
 * ## 방향은 **발자국이 어느 쪽에 있나**로 정한다
 *
 * `+I·+J` 를 앞면으로 박으면 안 된다 — K53 부터 `facing 2·3` 은 입구가 `−I·−J` 로
 * 돌아간다 (`entryTilesOf` 주석). 변의 좌표와 발자국 경계를 비교하면 4방향이 공짜다:
 * 변이 `x = i+w` 면 안쪽은 `−I`, `x = i` 면 안쪽은 `+I`.
 *
 * ## 꼬리는 **밖**, 촉은 경계 변 위
 *
 * 손님은 바깥 칸에서 걸어 들어온다. 화살표를 발자국 **안**에 그리면 시설 스프라이트
 * (또는 고스트) 위에 얹혀 그림을 가리고, 무엇보다 "손님이 서는 칸"이 아니다.
 * 밖에 두면 표식 세 채널이 서로 안 겹친다 — 폴리라인은 경계선, 화살표는 바깥 칸,
 * 글씨는 앞 꼭지점 **위**.
 */
function faceArrows(foot: FootRect, segs: readonly [number, number, number, number][]): EntryArrow[] {
  /** 같은 직선 위의 변들: 키 `V:x` (세로) / `H:y` (가로) → 그 직선을 따라 덮은 구간 */
  const lines = new Map<string, { vert: boolean; at: number; lo: number; hi: number }>();
  for (const [x1, y1, x2, y2] of segs) {
    const vert = x1 === x2;
    const at = vert ? x1 : y1;
    const a = vert ? Math.min(y1, y2) : Math.min(x1, x2);
    const b = vert ? Math.max(y1, y2) : Math.max(x1, x2);
    const key = `${vert ? 'V' : 'H'}:${at}`;
    const cur = lines.get(key);
    if (cur) {
      cur.lo = Math.min(cur.lo, a);
      cur.hi = Math.max(cur.hi, b);
    } else lines.set(key, { vert, at, lo: a, hi: b });
  }

  const out: EntryArrow[] = [];
  /*
   * 결정론 — Map 삽입 순서는 입구 칸 순서를 타므로 **숫자로** 정렬한다.
   * ⚠ 키 문자열(`V:10`)로 정렬하면 `V:9 > V:10` 이라 격자 좌표에서 조용히 뒤집힌다.
   * 축 순서(세로 변 먼저)는 `entryTilesOf` 가 I 면을 먼저 push 하는 것과 맞췄다.
   */
  const ordered = [...lines.values()].sort((a, b) =>
    a.vert === b.vert ? a.at - b.at : a.vert ? -1 : 1,
  );
  for (const ln of ordered) {
    const mid = (ln.lo + ln.hi) / 2;
    // 안쪽(= 발자국 쪽) 단위 벡터. `>=` 가 아니라 발자국 경계와의 비교여야 4방향이 산다
    const inward = ln.vert
      ? ln.at - foot.i >= foot.w
        ? -1
        : 1
      : ln.at - foot.j >= foot.d
        ? -1
        : 1;
    const tip: GridVert = ln.vert ? [ln.at, mid] : [mid, ln.at];
    const dir: GridVert = ln.vert ? [inward, 0] : [0, inward];
    const perp: GridVert = [-dir[1], dir[0]];
    const at = (u: number, v: number): GridVert => [
      tip[0] + dir[0] * u + perp[0] * v,
      tip[1] + dir[1] * u + perp[1] * v,
    ];
    out.push({
      tip,
      dir,
      // 촉 → 오른쪽 미늘 → 자루 → 왼쪽 미늘 → 촉. `u` 가 음수여야 꼬리가 **밖**이다
      poly: [
        at(0, 0),
        at(-ARROW_HEAD, ARROW_HEAD_HW),
        at(-ARROW_HEAD, ARROW_SHAFT_HW),
        at(-ARROW_LEN, ARROW_SHAFT_HW),
        at(-ARROW_LEN, -ARROW_SHAFT_HW),
        at(-ARROW_HEAD, -ARROW_SHAFT_HW),
        at(-ARROW_HEAD, -ARROW_HEAD_HW),
      ],
    });
  }
  return out;
}
