/**
 * 회전 실측 — 게이트 6 (`tools/kairo-gate.ts`).
 *
 * ## 왜 필요한가 — 4방향 한 판을 다 뽑고 나서야 없다는 걸 알았다
 *
 * 2026-08-22 에 19종 × d1·d2·d3 = 57장을 목표로 체인 참조 생성을 돌렸다
 * (118회 생성 · 69회 리롤, 기록 `assets/generated/kairo-4dir/report.md`).
 * 게이트 4(접지 기하) · 게이트 5(광원) · 팔레트를 전부 걸었고 19장이 통과했다.
 *
 * **그런데 통과한 19장 중 상당수가 돌아 있지 않았다.** 실루엣을 재 보니
 * `rent_kayak d1` 은 d0 **그대로**에 0.908, d0 을 **뒤집은 것**에 0.724 였다 —
 * 미러여야 하는 방향이 원본에 더 가깝다. `vending_in d1` 0.932/0.615 ·
 * `vending_out d1` 0.898/0.670 · `rent_pedal d1` 0.791/0.726 도 같다.
 * **모델이 "같은 물체, 카메라만 바뀐다"를 "같은 그림을 다시 그린다"로 알아들었고,
 * 그림 품질을 재는 자 셋은 전부 초록이었다.**
 *
 * 이 저장소가 아홉 번 겪은 「검사가 조용히 통과」의 열 번째다. 게이트 4·5 는 **한 장이
 * 잘 그려졌는가**를 재고, 어느 것도 **두 장이 서로 다른 방향인가**를 안 쟀다.
 *
 * ## 무엇을 재나 — 실루엣이 "기준의 뒤집은 것"에 더 가까운가
 *
 * 화면은 2:1 다이메트릭이고 물체를 세로축으로 90° 돌리면 월드 `+I` 축과 `+J` 축이
 * 맞바뀐다. 화면에서 `+I` 는 오른쪽 아래, `+J` 는 왼쪽 아래로 가므로 **90° 회전은
 * 실루엣의 좌우 반전**이다 (`footprintTileOf` 의 `facing 1` 이 전치인 것과 같은 사실).
 * 180° 는 `+I → −I`·`+J → −J` 라 **발자국 다이아몬드가 그대로**고 물체의 뒤가 보인다.
 *
 *   d1 = d0 의 미러 · d2 = d0 의 뒷면(같은 손) · d3 = d2 의 미러
 *
 * 그래서 **d1·d3 만** 이 자로 잰다. 후보 `c` 와 기준 `r` 에 대해
 * `IoU(c, flip(r)) > IoU(c, r)` 이면 돌았다.
 *
 * ⚠ **d2 는 이 자의 대상이 아니다.** 뒷면은 실루엣이 앞면과 같아야 정상이라
 * 같은 부호 규칙을 쓰면 멀쩡한 뒷면이 전부 위반이 된다. 뒷면이 앞면의 **내용**을
 * 되풀이하는 결함(실측 5건 — 뒤에서 보는데 차양·창구가 보인다)은 실루엣이 아니라
 * 그림 내용의 문제라 **사람 눈이 정본**이다. 그 5건은 `visual-rejected/` 로 갔다.
 *
 * ## 판정 못 하는 경우를 "통과"에 넣지 않는다
 *
 * 실루엣이 **자기 미러와 거의 같은** 물체(자판기·1×1 정사각 건물)는 이 자로 방향을
 * 말할 수 없다. `infirmary d0` 은 자기 미러와 IoU **0.993** 이다 — 어느 방향을 넣어도
 * 0.99 대가 나오므로 부호는 동전 던지기다.
 *
 * 그래서 **문턱을 물체마다 유도한다**: 마스크를 가로로 **1텍셀** 밀었을 때 줄어드는
 * IoU 가 그 물체의 "한 텍셀 흔들림"이다 (게이트 4 가 이음새 1텍셀에서 문턱을 유도한
 * 것과 같은 단위). 미러 판정의 여유(`IoU(c,flip r) − IoU(c,r)`)가 그 흔들림보다
 * 작으면 **`대칭`**(못 쟀음)이지 통과가 아니다.
 *
 * 상수를 안 두는 이유는 게이트 4 의 꼭짓점 문턱과 같다 — 하나로 박으면 큰 물체가
 * 무검사가 된다.
 */

import type { Raster } from './png.js';

export const ALPHA_SOLID = 128;

/** 불투명 마스크 — 게이트 4·5 와 같은 알파 문턱을 쓴다 */
export interface Mask {
  readonly w: number;
  readonly h: number;
  readonly bits: Uint8Array;
}

export function maskOf(r: Raster): Mask {
  const bits = new Uint8Array(r.w * r.h);
  for (let i = 0; i < r.w * r.h; i++) bits[i] = r.data[i * 4 + 3]! >= ALPHA_SOLID ? 1 : 0;
  return { w: r.w, h: r.h, bits };
}

export function flipMask(m: Mask): Mask {
  const bits = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) bits[y * m.w + x] = m.bits[y * m.w + (m.w - 1 - x)]!;
  return { w: m.w, h: m.h, bits };
}

/** 가로로 `dx` 텍셀 민 마스크 — 문턱 유도용 (캔버스는 그대로, 밖으로 나간 것은 버린다) */
export function shiftMask(m: Mask, dx: number): Mask {
  const bits = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= m.w) continue;
      bits[y * m.w + x] = m.bits[y * m.w + sx]!;
    }
  return { w: m.w, h: m.h, bits };
}

/**
 * 마스크 둘의 IoU. 캔버스가 다르면 **왼쪽 위 정렬**로 큰 쪽에 맞춘다 —
 * 회전은 캔버스를 안 바꾸므로(`(w+d)` 가 교환에 불변) 정상 경로에서는 항상 같은 크기다.
 */
export function maskIoU(a: Mask, b: Mask): number {
  const w = Math.max(a.w, b.w);
  const h = Math.max(a.h, b.h);
  let inter = 0;
  let uni = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const va = x < a.w && y < a.h ? a.bits[y * a.w + x] === 1 : false;
      const vb = x < b.w && y < b.h ? b.bits[y * b.w + x] === 1 : false;
      if (va && vb) inter++;
      if (va || vb) uni++;
    }
  return uni === 0 ? 0 : inter / uni;
}

/**
 * 그 물체의 "한 텍셀 흔들림" — 1텍셀 좌·우 이동이 IoU 에서 깎는 양의 **작은 쪽**.
 * 작은 쪽을 쓰는 이유: 문턱은 **넘기 쉬워야 안전한 방향**이 아니라 **못 넘으면
 * 판정을 포기하는 자리**이므로, 보수적으로 잡으면 멀쩡한 회전을 대칭으로 버린다.
 */
export function texelWobble(m: Mask): number {
  const self = maskIoU(m, m);
  const l = self - maskIoU(m, shiftMask(m, -1));
  const r = self - maskIoU(m, shiftMask(m, 1));
  return Math.min(l, r);
}

export type RotationVerdict = 'mirrored' | 'not-rotated' | 'symmetric';

export interface RotationMeasure {
  /** 후보 vs 기준 그대로 */
  same: number;
  /** 후보 vs 기준을 뒤집은 것 */
  flipped: number;
  /** `flipped − same` */
  margin: number;
  /** 기준의 1텍셀 흔들림 — 이 값보다 여유가 작으면 판정을 포기한다 */
  wobble: number;
}

export function measureRotation(cand: Raster, ref: Raster): RotationMeasure {
  const c = maskOf(cand);
  const r = maskOf(ref);
  const same = maskIoU(c, r);
  const flipped = maskIoU(c, flipMask(r));
  return { same, flipped, margin: flipped - same, wobble: texelWobble(r) };
}

export function rotationVerdict(m: RotationMeasure): RotationVerdict {
  if (Math.abs(m.margin) < m.wobble) return 'symmetric';
  return m.margin > 0 ? 'mirrored' : 'not-rotated';
}

export const ROTATION_NAME: Record<RotationVerdict, string> = {
  mirrored: '돌았다',
  'not-rotated': '안 돌았다',
  symmetric: '대칭(판정불가)',
};

/**
 * 미러여야 하는 방향과 그 기준 — **d2 는 없다** (머리말 참조).
 *
 * 값이 `facing` **번호**인 것은 `facilitySpriteId(defId, facing)` 이 번호를 받기 때문이다.
 * 이름(`'d1'`)을 담아 두면 부르는 쪽이 `FACILITY_DIR_NAMES.indexOf` 로 되돌려야 하고,
 * 그 순간 방향 이름의 정본이 둘이 된다 (계약과 이 표).
 */
export const MIRROR_OF = [
  { dir: 1, ref: 0 },
  { dir: 3, ref: 2 },
] as const;

// ─────────────────── 대조군 ───────────────────

/**
 * 합성 스프라이트 — **대조군**. 좌우로 확실히 비대칭인 계단 모양을 그린다.
 * `symmetric: true` 면 좌우 대칭이라 `대칭(판정불가)` 이 나와야 한다.
 *
 * ⚠ 이 대조군의 요점은 **셋이 다 나오는지**다. `돌았다`/`안 돌았다` 둘만 확인하면
 * 문턱이 0 이어도 통과한다 — 그러면 자판기가 동전 던지기로 판정된다.
 */
export function synthAsymSprite(w: number, h: number, opts: { symmetric?: boolean } = {}): Raster {
  const data = new Uint8Array(w * h * 4);
  const put = (x: number, y: number): void => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const k = (y * w + x) * 4;
    data[k] = 200;
    data[k + 1] = 160;
    data[k + 2] = 120;
    data[k + 3] = 255;
  };
  // 왼쪽이 낮고 오른쪽으로 갈수록 높아지는 계단 — 미러와 겹침이 확실히 낮다
  for (let x = 0; x < w; x++) {
    const t = opts.symmetric === true ? Math.min(x, w - 1 - x) / (w / 2) : x / w;
    const top = Math.max(0, Math.round(h - 1 - t * (h - 1)));
    for (let y = top; y < h; y++) put(x, y);
  }
  return { w, h, data };
}

export function flipRaster(r: Raster): Raster {
  const data = new Uint8Array(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const s = (y * r.w + (r.w - 1 - x)) * 4;
      const t = (y * r.w + x) * 4;
      for (let k = 0; k < 4; k++) data[t + k] = r.data[s + k]!;
    }
  return { w: r.w, h: r.h, data };
}

export interface SelftestCase {
  name: string;
  want: RotationVerdict;
  got: RotationVerdict;
  m: RotationMeasure;
  ok: boolean;
}

/**
 * 음성·양성 대조군. 게이트 5 의 `광원대조군` 과 같은 결정 — **여기서 실패하면 경고가
 * 아니라 하드 실패**다. 그림이 아니라 자가 고장 난 것이므로.
 */
export function rotationSelftest(): SelftestCase[] {
  const cases: SelftestCase[] = [];
  const push = (name: string, cand: Raster, ref: Raster, want: RotationVerdict): void => {
    const m = measureRotation(cand, ref);
    const got = rotationVerdict(m);
    cases.push({ name, want, got, m, ok: got === want });
  };
  for (const [w, h] of [
    [64, 32],
    [96, 48],
    [128, 64],
  ] as const) {
    const base = synthAsymSprite(w, h);
    push(`${w}×${h} 뒤집어 넣음`, flipRaster(base), base, 'mirrored');
    push(`${w}×${h} 그대로 넣음`, base, base, 'not-rotated');
    const sym = synthAsymSprite(w, h, { symmetric: true });
    push(`${w}×${h} 좌우대칭`, sym, sym, 'symmetric');
  }
  return cases;
}

// ─────────────────── CLI ───────────────────

/**
 * `npx tsx tools/rotation-check.ts --selftest`
 * `npx tsx tools/rotation-check.ts --dir <방향세트 폴더>`  (기본: 4방향 감사 작업공간)
 *
 * 폴더 안의 `facility__<id>__d{0,1,2,3}.png` 를 짝지어 잰다. 게이트 6 이 라이브 팩에
 * 대해 하는 일과 같고, 아직 팩에 4방향이 없는 동안 **감사 작업공간**을 잴 수 있게 둔다.
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) {
    const cs = rotationSelftest();
    for (const c of cs)
      console.log(
        `${c.ok ? '✅' : '❌'} ${c.name.padEnd(18)} 기대 ${ROTATION_NAME[c.want].padEnd(14)} ` +
          `실제 ${ROTATION_NAME[c.got].padEnd(14)} 여유 ${c.m.margin.toFixed(3)} · 흔들림 ${c.m.wobble.toFixed(3)}`,
      );
    const bad = cs.filter((c) => !c.ok).length;
    console.log(`대조군 ${cs.length - bad}/${cs.length}`);
    process.exit(bad === 0 ? 0 : 1);
  }

  const { readdirSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { decodePng } = await import('./png.js');
  const i = argv.indexOf('--dir');
  const dir = i >= 0 ? argv[i + 1]! : 'assets/generated/kairo-4dir/accepted';
  if (!existsSync(dir)) {
    console.error(`폴더가 없다: ${dir}`);
    process.exit(1);
  }
  const ids = [
    ...new Set(
      readdirSync(dir)
        .filter((f) => /^facility__.+__d[0-3]\.png$/.test(f))
        .map((f) => f.split('__')[1]!),
    ),
  ].sort();

  let mirrored = 0;
  let notRotated = 0;
  let symmetric = 0;
  let missing = 0;
  console.log(`${'시설'.padEnd(14)}${'방향'.padEnd(5)}${'그대로'.padStart(8)}${'뒤집기'.padStart(8)}${'여유'.padStart(8)}${'흔들림'.padStart(8)}  판정`);
  console.log('-'.repeat(72));
  for (const id of ids) {
    const NAMES = ['d0', 'd1', 'd2', 'd3'] as const;
    for (const { dir: dirN, ref: refN } of MIRROR_OF) {
      const d = NAMES[dirN]!;
      const refDir = NAMES[refN]!;
      const cp = join(dir, `facility__${id}__${d}.png`);
      const rp = join(dir, `facility__${id}__${refDir}.png`);
      if (!existsSync(cp) || !existsSync(rp)) {
        missing++;
        continue;
      }
      const m = measureRotation(decodePng(cp), decodePng(rp));
      const v = rotationVerdict(m);
      if (v === 'mirrored') mirrored++;
      else if (v === 'not-rotated') notRotated++;
      else symmetric++;
      const mark = v === 'mirrored' ? '✅' : v === 'not-rotated' ? '❌' : '⚪';
      console.log(
        `${id.padEnd(14)}${`${d}/${refDir}`.padEnd(5)}${m.same.toFixed(3).padStart(8)}` +
          `${m.flipped.toFixed(3).padStart(8)}${m.margin.toFixed(3).padStart(8)}` +
          `${m.wobble.toFixed(3).padStart(8)}  ${mark} ${ROTATION_NAME[v]}`,
      );
    }
  }
  console.log(
    `\n잰 짝 ${mirrored + notRotated + symmetric} · 돌았다 ${mirrored} · 안 돌았다 ${notRotated} · ` +
      `대칭(판정불가) ${symmetric} · 짝이 없어 못 잼 ${missing}`,
  );
  console.log('⚠ d2(뒷면)는 이 자의 대상이 아니다 — 실루엣이 앞면과 같아야 정상이다 (머리말 참조)');
}

// ⚠ `import.meta.url === file://${argv[1]}` 는 tsx 에서 안 맞는다 (argv[1] 이 원본 .ts,
// import.meta.url 은 변환본을 가리킬 수 있다). 파일명으로 본다 — 이 모듈은 게이트 6 이
// **import** 해서 쓰므로, 직접 실행일 때만 main 이 돌아야 한다.
if ((process.argv[1] ?? '').endsWith('rotation-check.ts')) void main();
