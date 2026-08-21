/**
 * 4방 이음새 QA — **에셋을 생산하기 전에 있어야 하는 절차**.
 *
 *   npm run seam                # 절차적 플레이스홀더 검사
 *   npm run seam -- --json      # 기계 판독
 *   npm run seam -- --selftest  # 검사가 위반을 실제로 잡는지 (음성 대조군)
 *
 * 개발 서버(npm run dev)가 떠 있어야 한다.
 *
 * ## 왜 필요한가 (적대적 리뷰 CONFIRMED 항목)
 *
 * 스프라이트 한 장이 예뻐도 격자로 깔면 이음새가 보인다. 지금 플레이스홀더는 정수
 * 스캔라인 마스크라 수학적으로 겹침 0·틈 0 이 보장되지만(면적 논증), **AI 픽셀아트로
 * 갈면 그 보장이 사라진다.** 그때 "눈으로 봐서 괜찮다"로 넘어가면 40~50장을 다 뽑은
 * 뒤에 전부 다시 뽑아야 한다. 그래서 절차를 먼저 만든다.
 *
 * `AtlasProvider` 로 바뀌어도 이 도구는 그대로 돈다 — 프로바이더 인터페이스만 쓴다.
 *
 * ## 무엇을 재는가
 *
 * ### 지면 — 틈·겹침·이음새 대비
 *
 * 5×5 격자로 깔고 픽셀별 기록 횟수를 센다.
 *   · **틈**: 사방이 덮인 픽셀인데 자기는 안 덮였다 → 구멍
 *   · **겹침**: 기록 횟수 2 이상 → 두 타일이 같은 픽셀을 그렸다
 *   · **이음새 대비**: 타일 경계를 넘는 인접 픽셀쌍의 밝기차 vs 타일 내부 쌍의 밝기차.
 *     비율이 크면 이웃 타일이 안 맞물린다는 뜻이다
 *   · **경계 밝기 편향**: 경계 밴드의 평균 밝기 − 내부의 평균 밝기 (σ 로 정규화).
 *     ⚠ 대비만으로는 부족하다 — 가장자리 링을 어둡게 하면 경계 양쪽이 둘 다 어두워져
 *     **대비가 오히려 내려간다** (대조군 실측 0.18). 랩 블렌드가 가장자리를 어둡게 만들어
 *     잔디에 16px 리듬의 밴딩이 보였던 그 사고가 정확히 이 모양이라, 편향을 따로 잰다.
 *
 * ### 방향 런 (벽·문·다리) — 알파 구멍이 아니라 **주기성**
 *
 * ⚠ **유리벽에 알파 구멍 검사를 쓰면 안 된다.** 스티플(50% 체커)이 설계상 투명 픽셀을
 * 절반 뚫어 놓아서, 구멍 검사는 전부 실패로 나온다.
 *
 * ⚠ **인접 열의 최상단 y 를 비교하는 것도 틀렸다.** 난간 기둥·멀리온처럼 세로로 튀는
 * 내부 요소가 있으면 정상 에셋이 실패로 나온다 (실측: 다리가 난간 기둥 때문에 8px).
 *
 * 런의 진짜 질문은 하나다 — **한 칸 옆 스프라이트가 정확히 (Δx, Δy) 만큼 밀린 같은
 * 모양인가.** i-런은 (+16, +8), j-런은 (−16, +8) 이다. 그래서:
 *   · **열별 커버리지 0**: 진짜 구멍
 *   · **주기 최상단 오차**: `top[x+Δx] − top[x]` 가 Δy 와 다른 최대치. 이웃과 높이가 안 맞는다
 *   · **주기 커버리지 불일치**: `cov[x+Δx] ≠ cov[x]` 인 열 수. 실루엣이 안 맞물린다
 *
 * 이 검사는 내부 디테일에 **무관**하고 이음새만 본다 — 손으로 그린 에셋이 실패할 지점이다.
 *
 * ## 함정 (실측)
 *
 * - `page.evaluate` 에 넘기는 코드는 **문자열 리터럴**로 쓴다. 함수로 쓰면 tsx(esbuild)가
 *   `__name` 헬퍼를 주입하는데 페이지 쪽엔 없어서 ReferenceError 가 난다.
 * - **런을 절대 좌표(tileCenter 기준)로 깔면 스프라이트가 잘린다.** 벽은 40px 인데
 *   타일 기준 오프셋은 위로 24px 넘고 i-런 첫 칸은 왼쪽으로 14px 넘었다. 잘린 걸 모르고
 *   재면 **정상 에셋이 주기 오차 8px 로 나온다.** 이음새는 상대 기하만의 문제이므로
 *   첫 칸을 (2,2) 에 놓고 상대로만 깐다. 넘침은 에러로 올린다.
 * - `--selftest` 가 **음성 대조군**이다. 이 프로젝트에서 "검증이 조용히 통과"를 다섯 번
 *   겪었다. 지표를 `window.__seam` 라이브러리로 빼서 대조군이 **같은 코드**를 태운다 —
 *   대조군이 별도 구현이면 그 구현만 맞는지 재는 셈이 된다.
 */
import { chromium } from 'playwright';

const BASE = process.env['PPAJI_URL'] ?? 'http://localhost:5173';
const URL = `${BASE}/?kairo=1&px=1`;
const JSON_OUT = process.argv.includes('--json');
const SELFTEST = process.argv.includes('--selftest');

/** 판정 문턱 — 넘으면 실패. 근거는 각 항목 주석에 */
const LIMITS = {
  /** 틈은 하나도 허용 안 된다 — 배경색이 새어 보인다 */
  gaps: 0,
  /**
   * 겹침도 0. 아이소 다이아몬드는 평면을 정확히 덮으므로 겹칠 이유가 없다.
   * 겹치면 반투명 에셋에서 색이 진해지고, 그리기 순서에 따라 결과가 달라진다.
   */
  overlaps: 0,
  /**
   * 이음새 대비 비율. 경계 밝기차가 내부의 2.5배를 넘으면 격자 무늬로 읽힌다.
   * 단, 경계 밝기차 자체가 작으면(≤3/255) 눈에 안 보이므로 비율을 묻지 않는다.
   */
  seamRatio: 2.5,
  seamAbsFloor: 3,
  /**
   * 경계 밝기 편향 (σ 배수). 경계 밴드가 내부보다 계통적으로 밝거나 어두우면 격자로 읽힌다.
   *
   * 문턱의 근거는 실측이다 — 플레이스홀더 20종이 최소 0.023 · 중앙 0.222 · 최대 0.778
   * (최대는 `path_stone`, 포장 이음선을 일부러 타일 경계에 그린다). 의도한 경계 처리는
   * 통과하고 랩 블렌드급 밴딩은 잡히도록 1.2 로 둔다. 대조군의 링 주입이 이걸 넘는다.
   */
  bias: 1.2,
  /** 런에서 커버리지 0 인 열 = 실루엣에 구멍 */
  emptyColumns: 0,
  /**
   * 주기 최상단 오차 — 한 칸 옆이 정확히 Δy 만큼 내려가야 한다.
   * 정수 격자라 0 이 정답이지만, AI 에셋의 1px 재량은 눈에 안 보이므로 1 까지 둔다.
   */
  periodTop: 1,
  /** 주기 커버리지가 안 맞는 열 수 — 0 이어야 실루엣이 맞물린다 */
  periodCov: 0,
} as const;

interface GroundResult {
  id: string;
  gaps: number;
  overlaps: number;
  crossMean: number;
  sameMean: number;
  ratio: number;
  /** 경계 밴드와 내부의 밝기차 / 표준편차 — 격자 밴딩을 잡는다 */
  bias: number;
  /** 같은 밝기차의 **원값** (0~255). σ 정규화가 과장하는지 보려면 이게 필요하다 */
  absBias: number;
  sigma: number;
}

interface RunResult {
  id: string;
  emptyColumns: number;
  periodTop: number;
  periodCov: number;
  columns: number;
}

interface ControlCase {
  name: string;
  metric: string;
  got: number;
  extra?: number;
}

/**
 * 지표 라이브러리. 실측 경로와 음성 대조군이 **같은 코드**를 타야 대조군이 의미를 갖는다.
 *
 * 입력은 `{ w, h, data }` (RGBA) 다. 프로바이더 캔버스든 대조군이 조작한 픽셀이든 같은
 * 형태로 넣는다 — 그래서 대조군이 지표를 우회할 수 없다.
 */
const LIB_JS = `(() => {
  const TW = 32, TH = 16, SX = 16, SY = 8;

  const ground = (img, N) => {
    const W = 2 * N * SX, H = 2 * N * SY + TH;
    const count = new Int32Array(W * H);
    const lum = new Float32Array(W * H);
    const owner = new Int32Array(W * H).fill(-1);
    const sd = img.data;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const ox = SX * (i - j) - SX + N * SX;
        const oy = SY * (i + j);
        for (let y = 0; y < img.h; y++) {
          for (let x = 0; x < img.w; x++) {
            const k4 = (y * img.w + x) * 4;
            if (sd[k4 + 3] === 0) continue;
            const px = ox + x, py = oy + y;
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            const k = py * W + px;
            count[k]++;
            lum[k] = 0.299 * sd[k4] + 0.587 * sd[k4 + 1] + 0.114 * sd[k4 + 2];
            owner[k] = i * 100 + j;
          }
        }
      }
    }
    let gaps = 0, overlaps = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const k = y * W + x;
        if (count[k] >= 2) overlaps++;
        if (count[k] !== 0) continue;
        if (count[k - 1] > 0 && count[k + 1] > 0 && count[k - W] > 0 && count[k + W] > 0) gaps++;
      }
    }
    let cs = 0, cn = 0, ss = 0, sn = 0;
    // 경계 밴드 vs 내부 밝기. ⚠ 아래 crossMean/sameMean 만으로는 **부족하다** —
    // 가장자리 링을 어둡게 하면 경계 양쪽이 둘 다 어두워져 경계차가 오히려 작아진다
    // (대조군 실측: 링을 65% 어둡게 했는데 비율 0.18). 랩 블렌드 밴딩이 정확히 이 모양이라
    // 편향을 따로 잰다.
    let bs = 0, bn = 0, is = 0, iN = 0, gs2 = 0, gs1 = 0, gn = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (count[k] === 0) continue;
        gs1 += lum[k]; gs2 += lum[k] * lum[k]; gn++;
        let onBoundary = false;
        for (const dk of [1, W]) {
          if (dk === 1 && x === W - 1) continue;
          if (dk === W && y === H - 1) continue;
          const k2 = k + dk;
          if (count[k2] === 0) continue;
          const d = Math.abs(lum[k] - lum[k2]);
          if (owner[k] === owner[k2]) { ss += d; sn++; } else { cs += d; cn++; onBoundary = true; }
        }
        for (const dk of [-1, -W]) {
          const k2 = k + dk;
          if (k2 < 0 || count[k2] === 0) continue;
          if (owner[k2] !== owner[k]) onBoundary = true;
        }
        if (onBoundary) { bs += lum[k]; bn++; } else { is += lum[k]; iN++; }
      }
    }
    const crossMean = cn > 0 ? cs / cn : 0;
    const sameMean = sn > 0 ? ss / sn : 0;
    const mean = gn > 0 ? gs1 / gn : 0;
    const sd2 = gn > 0 ? Math.max(0, gs2 / gn - mean * mean) : 0;
    const sigma = Math.sqrt(sd2);
    const bMean = bn > 0 ? bs / bn : 0;
    const iMean = iN > 0 ? is / iN : 0;
    // 표준편차로 정규화 — 밝은 지면과 어두운 지면을 같은 문턱으로 볼 수 있다
    const bias = sigma > 0.01 ? Math.abs(bMean - iMean) / sigma : 0;
    return {
      gaps: gaps, overlaps: overlaps,
      crossMean: Math.round(crossMean * 100) / 100,
      sameMean: Math.round(sameMean * 100) / 100,
      ratio: sameMean > 0.01 ? Math.round((crossMean / sameMean) * 100) / 100 : 0,
      bias: Math.round(bias * 1000) / 1000,
      absBias: Math.round(Math.abs(bMean - iMean) * 100) / 100,
      sigma: Math.round(sigma * 100) / 100
    };
  };

  /**
   * imgs[n] = n 번째 칸에 놓을 스프라이트. 전부 같으면 정상 런,
   * 하나만 조작하면 "이웃과 안 맞는 에셋" 이 된다.
   */
  const run = (imgs, di, dj) => {
    const N = imgs.length;
    const dx = SX * (di - dj), dy = SY * (di + dj);
    let maxW = 0, maxH = 0;
    for (const im of imgs) { if (im.w > maxW) maxW = im.w; if (im.h > maxH) maxH = im.h; }
    const W = Math.abs(dx) * (N - 1) + maxW + 4;
    const H = dy * (N - 1) + maxH + 4;
    const alpha = new Uint8Array(W * H);
    for (let n = 0; n < N; n++) {
      const im = imgs[n];
      const ox = dx * n + (dx < 0 ? -dx * (N - 1) : 0) + 2;
      const oy = dy * n + 2;
      for (let y = 0; y < im.h; y++) {
        for (let x = 0; x < im.w; x++) {
          if (im.data[(y * im.w + x) * 4 + 3] === 0) continue;
          const px = ox + x, py = oy + y;
          if (px < 0 || py < 0 || px >= W || py >= H) throw new Error('런 캔버스를 넘었다');
          alpha[py * W + px] = 1;
        }
      }
    }
    const cov = [], top = [];
    let minX = W, maxX = -1;
    for (let x = 0; x < W; x++) {
      let n = 0, t = -1;
      for (let y = 0; y < H; y++) { if (alpha[y * W + x]) { n++; if (t < 0) t = y; } }
      cov.push(n); top.push(t);
      if (n > 0) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    // 양 끝 스프라이트는 이웃이 없다 — 가장자리 maxW 를 뺀 내부만 판정한다
    const lo = minX + maxW, hi = maxX - maxW;
    let empty = 0, pTop = 0, pCov = 0, cnt = 0;
    for (let x = lo; x <= hi; x++) {
      if (cov[x] === 0) empty++;
      const x2 = x + dx;
      if (x2 < lo || x2 > hi) continue;
      cnt++;
      if (top[x] >= 0 && top[x2] >= 0) {
        const e = Math.abs(top[x2] - top[x] - dy);
        if (e > pTop) pTop = e;
      }
      if (cov[x2] !== cov[x]) pCov++;
    }
    return { emptyColumns: empty, periodTop: pTop, periodCov: pCov, columns: cnt };
  };

  const read = (id) => {
    const c = window.__kairo.provider.get(id);
    const g = c.getContext('2d');
    return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
  };

  const clone = (img) => ({ w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) });

  window.__seam = { ground: ground, run: run, read: read, clone: clone, TW: TW, TH: TH };
  return true;
})()`;

/*
 * 방향 런 케이스. 벽 변형은 **경계 방향**이다 (K25): a0=I+ · a1=J+ · a2=I− · a3=J−.
 *
 * ⚠ 경계 방향과 런 방향은 **어긋난다.** `I+` 경계는 (i,j)|(i+1,j) 사이라 이어 붙이려면
 * **j** 를 늘려야 한다 (같은 열의 오른쪽 면이 아래로 이어진다). 반대도 마찬가지다.
 * 여기를 뒤집으면 이음새를 재는 게 아니라 서로 안 닿는 벽 여섯 장을 재게 된다.
 */
const RUN_CASES_JS = `[
  { name: 'i-런 (J+ 경계)', id: 'wall/edge:a1', di: 1, dj: 0 },
  { name: 'j-런 (I+ 경계)', id: 'wall/edge:a0', di: 0, dj: 1 },
  { name: '문 i-런', id: 'wall/door:a1', di: 1, dj: 0 },
  { name: '문 j-런', id: 'wall/door:a0', di: 0, dj: 1 },
  { name: '다리 x-런', id: 'ground/bridge_x', di: 1, dj: 0 },
  { name: '다리 z-런', id: 'ground/bridge_z', di: 0, dj: 1 }
]`;

const MEASURE_JS = `(() => {
  const S = window.__seam;
  const prov = window.__kairo.provider;
  // 다리는 물 위로 들린 **방향 런**이라 4방 타일이 아니다 → 런 검사로 보낸다
  const ids = prov.ids.filter((s) => s.indexOf('ground/') === 0 && s.indexOf('bridge') < 0);
  const results = [], skipped = [];
  for (const id of ids) {
    const img = S.read(id);
    if (img.w !== S.TW || img.h !== S.TH) { skipped.push(id + ' (' + img.w + '×' + img.h + ')'); continue; }
    results.push(Object.assign({ id: id }, S.ground(img, 5)));
  }
  const runs = [];
  for (const c of ${RUN_CASES_JS}) {
    if (!prov.has(c.id)) {
      runs.push({ id: c.name, emptyColumns: 0, periodTop: -1, periodCov: 0, columns: 0 });
      continue;
    }
    const img = S.read(c.id);
    const imgs = [];
    for (let n = 0; n < 6; n++) imgs.push(img);
    runs.push(Object.assign({ id: c.name + ' (' + c.id + ')' }, S.run(imgs, c.di, c.dj)));
  }
  return { results: results, skipped: skipped, runs: runs };
})()`;

/**
 * 음성 대조군 — 위반을 **주입해서** 검사가 잡는지 본다.
 *
 * 통과만 보고 "검사가 있다"고 하면 안 된다. 이 프로젝트에서 검증이 조용히 통과하던 것을
 * 다섯 번 잡았다. 주입은 실측 경로와 같은 `window.__seam` 함수를 태운다.
 */
const SELFTEST_JS = `(() => {
  const S = window.__seam;
  const out = [];
  const tile = S.read('ground/lawn:a0');

  // 1) 틈 — 타일 내부 한 픽셀을 지운다
  const holed = S.clone(tile);
  holed.data[(8 * tile.w + 16) * 4 + 3] = 0;
  out.push({ name: '틈 주입 (타일 내부 1px 삭제)', metric: 'gaps', got: S.ground(holed, 5).gaps });

  // 2) 겹침 — 마스크의 각 행을 양쪽으로 1px 넓힌다
  const wide = S.clone(tile);
  for (let y = 0; y < tile.h; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < tile.w; x++) {
      if (tile.data[(y * tile.w + x) * 4 + 3] > 0) { if (x0 < 0) x0 = x; x1 = x; }
    }
    if (x0 < 1 || x1 > tile.w - 2) continue;
    const pairs = [[x0, x0 - 1], [x1, x1 + 1]];
    for (const pr of pairs) {
      const s4 = (y * tile.w + pr[0]) * 4, d4 = (y * tile.w + pr[1]) * 4;
      for (let c = 0; c < 4; c++) wide.data[d4 + c] = tile.data[s4 + c];
    }
  }
  out.push({ name: '겹침 주입 (마스크 행을 1px 넓힘)', metric: 'overlaps', got: S.ground(wide, 5).overlaps });

  // 3) 이음새 대비 — 타일 가장자리 링을 어둡게 (랩 블렌드가 만들던 밴딩과 같은 모양)
  const ringed = S.clone(tile);
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < tile.h; y++) {
    for (let x = 0; x < tile.w; x++) {
      const k = (y * tile.w + x) * 4;
      if (tile.data[k + 3] === 0) continue;
      let edge = false;
      for (const d of nb) {
        const nx = x + d[0], ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= tile.w || ny >= tile.h) { edge = true; break; }
        if (tile.data[(ny * tile.w + nx) * 4 + 3] === 0) { edge = true; break; }
      }
      if (edge) for (let c = 0; c < 3; c++) ringed.data[k + c] = Math.round(ringed.data[k + c] * 0.35);
    }
  }
  const rg = S.ground(ringed, 5);
  /*
   * ⚠ 이 주입은 ratio 로는 **안 잡힌다** (실측 0.18). 링을 어둡게 하면 경계 양쪽이
   * 둘 다 어두워져 경계차가 작아지고, 내부는 링-비링 차이가 커져 오히려 비율이 내려간다.
   * 그래서 bias (경계 밴드 vs 내부 밝기) 를 잰다. 지표를 두 개 두는 이유가 이것이다.
   * (이 파일 안에서는 백틱을 쓸 수 없다 — 템플릿 리터럴이 끊긴다)
   */
  out.push({ name: '이음새 대비 주입 (가장자리 링 65% 어둡게)', metric: 'bias', got: rg.bias, extra: rg.ratio });

  // 4) 주기 오차 — 런의 3번째 칸만 4px 내려 그린다 (이웃과 높이가 안 맞는 에셋)
  const wall = S.read('wall/edge:a1');
  const sunk = S.clone(wall);
  sunk.data.fill(0);
  for (let y = 0; y < wall.h - 4; y++) {
    for (let x = 0; x < wall.w; x++) {
      const s4 = (y * wall.w + x) * 4, d4 = ((y + 4) * wall.w + x) * 4;
      for (let c = 0; c < 4; c++) sunk.data[d4 + c] = wall.data[s4 + c];
    }
  }
  const mr = S.run([wall, wall, sunk, wall, wall, wall], 1, 0);
  out.push({ name: '주기 최상단 오차 주입 (3번째 칸만 4px 내림)', metric: 'periodTop', got: mr.periodTop });
  out.push({ name: '주기 커버리지 불일치 주입 (같은 조작)', metric: 'periodCov', got: mr.periodCov });

  /*
   * 5) 실루엣 구멍. ⚠ 구멍은 **런 간격(16px)보다 넓어야** 위반이 된다 —
   * 벽 스프라이트는 32px 인데 간격이 16px 이라 절반이 겹친다. 8열을 지웠더니
   * 이웃 스프라이트가 그대로 메워 빈 열이 0 이었다 (대조군 실측). 20열을 지운다.
   */
  const punched = S.clone(wall);
  for (let y = 0; y < wall.h; y++) {
    for (let x = 6; x < 26; x++) punched.data[(y * wall.w + x) * 4 + 3] = 0;
  }
  const pr = S.run([punched, punched, punched, punched, punched, punched], 1, 0);
  out.push({ name: '실루엣 구멍 주입 (가운데 20열 삭제 — 간격 16보다 넓게)', metric: 'emptyColumns', got: pr.emptyColumns });

  return out;
})()`;

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__kairo', undefined, { timeout: 20000 });
  await page.evaluate(LIB_JS);

  const m = (await page.evaluate(MEASURE_JS)) as {
    results: GroundResult[];
    skipped: string[];
    runs: RunResult[];
  };
  const control = SELFTEST ? ((await page.evaluate(SELFTEST_JS)) as ControlCase[]) : [];
  await browser.close();

  const gs = m.results;
  const ws = m.runs;
  const fails: string[] = [];
  for (const r of gs) {
    if (r.gaps > LIMITS.gaps) fails.push(`${r.id} — 틈 ${r.gaps}px`);
    if (r.overlaps > LIMITS.overlaps) fails.push(`${r.id} — 겹침 ${r.overlaps}px`);
    if (r.crossMean > LIMITS.seamAbsFloor && r.ratio > LIMITS.seamRatio) {
      fails.push(`${r.id} — 이음새 대비 ${r.ratio}배 (경계 ${r.crossMean} vs 내부 ${r.sameMean})`);
    }
    if (r.bias > LIMITS.bias) {
      fails.push(`${r.id} — 경계 밝기 편향 ${r.bias}σ (격자 밴딩으로 읽힌다)`);
    }
  }
  for (const r of ws) {
    if (r.periodTop < 0) {
      fails.push(`${r.id} — 스프라이트가 없다`);
      continue;
    }
    if (r.emptyColumns > LIMITS.emptyColumns) fails.push(`${r.id} — 실루엣 구멍 ${r.emptyColumns}열`);
    if (r.periodTop > LIMITS.periodTop) {
      fails.push(`${r.id} — 주기 최상단 오차 ${r.periodTop}px (이웃과 높이가 안 맞는다)`);
    }
    if (r.periodCov > LIMITS.periodCov) {
      fails.push(`${r.id} — 주기 커버리지 불일치 ${r.periodCov}열 (실루엣이 안 맞물린다)`);
    }
  }

  /** 대조군 — 주입한 위반을 지표가 잡아야 한다. 못 잡으면 그게 진짜 실패다 */
  const controlFails: string[] = [];
  for (const c of control) {
    const caught =
      c.metric === 'bias'
        ? c.got > LIMITS.bias
        : c.metric === 'periodTop'
          ? c.got > LIMITS.periodTop
          : c.got > 0;
    if (!caught) controlFails.push(`${c.name} — 지표 ${c.metric}=${c.got} 로 **안 잡혔다**`);
  }

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          ground: gs,
          runs: ws,
          skipped: m.skipped,
          control,
          fails,
          controlFails,
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
    process.exit(fails.length + controlFails.length > 0 ? 1 : 0);
  }

  console.log('4방 이음새 QA');
  console.log(`\n지면 ${gs.length}종 — 5×5 격자`);
  for (const r of [...gs].sort((a, b) => b.bias - a.bias).slice(0, 5)) {
    console.log(
      `  ${r.id.padEnd(22)} 틈 ${r.gaps} · 겹침 ${r.overlaps} · ` +
        `이음새 ${r.ratio}배 · 경계 편향 ${r.bias}σ (원값 ${r.absBias}/255 · σ ${r.sigma})`,
    );
  }
  console.log(
    `  (편향 상위 5종만 표시 — 전체 틈 최대 ${Math.max(...gs.map((r) => r.gaps))} · ` +
      `겹침 최대 ${Math.max(...gs.map((r) => r.overlaps))} · ` +
      `편향 최대 ${Math.max(...gs.map((r) => r.bias))}σ / 문턱 ${LIMITS.bias}σ)`,
  );
  if (m.skipped.length > 0) {
    console.log(`  격자 검사에서 뺀 것 (타일 크기가 아니다): ${m.skipped.join(', ')}`);
  }

  console.log(`\n방향 런 ${ws.length}종 — 6칸 직선 (벽·문·다리)`);
  for (const r of ws) {
    console.log(
      `  ${r.id.padEnd(30)} 구멍 ${r.emptyColumns}열 · 주기 최상단 오차 ${r.periodTop}px · ` +
        `주기 커버리지 불일치 ${r.periodCov}열 (${r.columns}열 판정)`,
    );
  }

  if (SELFTEST) {
    console.log(`\n음성 대조군 ${control.length}건 — 위반을 주입해 지표가 잡는지`);
    for (const c of control) {
      const bad = controlFails.some((f) => f.startsWith(c.name));
      console.log(`  ${bad ? '✕' : '✓'} ${c.name} → ${c.metric} = ${c.got}`);
    }
  }

  if (errors.length > 0) console.log(`\n⚠ 페이지 에러 ${errors.length}건: ${errors[0]}`);

  if (controlFails.length > 0) {
    console.log(`\n✕ 대조군 실패 ${controlFails.length}건 — **검사가 위반을 못 잡는다**`);
    for (const f of controlFails) console.log(`   · ${f}`);
  }
  if (fails.length > 0) {
    console.log(`\n✕ 이음새 위반 ${fails.length}건`);
    for (const f of fails) console.log(`   · ${f}`);
  }
  if (fails.length + controlFails.length > 0) process.exit(1);
  console.log(
    `\n✅ 이음새 위반 0 — 틈·겹침 없음, 런 주기 일치` +
      (SELFTEST ? ` · 대조군 ${control.length}건 전부 잡힘` : ''),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
