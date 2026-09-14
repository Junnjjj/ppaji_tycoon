#!/usr/bin/env tsx
/**
 * UI 아이콘·사건 배경 게이트 (P1.5-B) — **그림보다 먼저 만든다.**
 *
 * ## 왜 게이트가 먼저인가
 *
 * 4방향 1차 생성이 118회 돌고 **한 장도 못 건졌다** (2026-08-22). 자가 없으면 받은 그림이
 * 쓸 만한지 눈으로만 판단하게 되고, 눈은 지친다. 그래서 이 저장소의 규칙은 **계약 → 게이트
 * → 지시서 → 생성**이고, 이 파일이 그 두 번째다.
 *
 * ⚠ **파일 0장에서도 정직하게 돈다.** 「계약 44개 중 0개 반입」을 낸다 — ⬜ 미측정이 아니라
 * **0/44** 다. 반입이 0 이어도 계약↔등록부 양방향 검사는 지금 당장 값을 낸다: 그림이 없어도
 * **절차 폴백이 총체적인지**(모든 id 에 떨어질 자리가 있는지)는 오늘 잴 수 있다.
 *
 * ## ⚠ `.mjs` 가 아니라 `.ts` 인 이유
 *
 * 계획은 `tools/check-ui-icons.mjs` 라고 적었지만, PNG 를 읽으려면 `tools/png.ts` 의
 * `decodePng` 가 필요하고 `.mjs` 는 그것을 import 할 수 없다. PNG 디코더를 한 벌 더 쓰는
 * 것보다 `kairo-gate.ts` 와 같은 자리(tsx)로 가는 편이 낫다 — **디코더가 둘이 되면 언젠가
 * 갈라진다.**
 *
 * ## 재는 것
 *
 * | # | 무엇 | 왜 |
 * |---|---|---|
 * | ① | 계약 ↔ 등록부 **양방향** | 한쪽만 보면 「계약에 있는데 코드가 모르는 id」가 조용히 생긴다 |
 * | ② | 반입 현황 (n/N) | 0 을 0 이라고 말한다 |
 * | ③ | 크기가 계약과 같다 | 다르면 그 id 만 버리고 도형이 덮는다 (Phase G 규칙) |
 * | ④ | 투명 배경 | 크림 패널 위에 흰 사각형이 앉으면 안 된다 |
 * | ⑤ | 팔레트 이탈 0 | 게임 아트 39색 + HUD 잉크. 딴 세계에서 온 그림이 섞이면 한 게임으로 안 보인다 |
 * | ⑥ | 크림 위에서 3:1 | **아이콘이 안 보이면 아이콘이 아니다.** 크림 아이콘은 크림 바에서 사라진다 |
 * | ⑦ | 계약에 없는 파일 0 | 어디서 왔는지 모르는 그림이 화면에 뜨면 안 된다 |
 *
 * `--selftest` 는 위 규칙마다 위반을 **합성해서** 넣고 잡히는지 본다
 * (`seam --selftest` · `check-ui-surface --selftest` 와 같은 모양).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodePng, type Raster } from './png.js';

interface IconEntry {
  id: string;
  name: string;
  size: [number, number];
  source: 'ai' | 'procedural';
  prompt?: string;
  note?: string;
}
interface Contract {
  iconDir: string;
  artDir: string;
  icons: IconEntry[];
  art: IconEntry[];
}

const CONTRACT = 'src/assets/ui-icons.json';
const SELFTEST = process.argv.includes('--selftest');

const fails: string[] = [];
const pass: string[] = [];
const check = (ok: boolean, label: string, detail = ''): void => {
  (ok ? pass : fails).push(`${label}${detail ? ` — ${detail}` : ''}`);
};

/**
 * 허용 색 = **게임 아트 39색 + HUD 잉크·크림**.
 *
 * ⚠ 아이콘은 게임 스프라이트와 **같은 세계**의 그림이지만 **HUD 위에 앉는다**. 그래서 두
 * 출처를 합친다 — 39색만 쓰면 윤곽·글씨색이 없고, HUD 토큰만 쓰면 사물 색이 없다.
 * ⚠ 정확 일치가 아니라 **가장 가까운 팔레트 색과의 거리**로 판정한다. PNG 저장·리사이즈에서
 * 1~2 정도는 어차피 흔들리는데, 정확 일치로 잡으면 멀쩡한 그림이 통째로 떨어진다.
 */
function palette(): number[][] {
  const raw = JSON.parse(
    readFileSync('art-reference/palette-proposed-39.json', 'utf8'),
  ) as Record<string, string[]>;
  const hexes = new Set<string>(Object.values(raw).flat());
  // HUD 크림·잉크 — `style.css` 의 :root 에서 읽는다 (색은 style.css 가 소유한다)
  const css = readFileSync('src/ui/style.css', 'utf8');
  const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  for (const m of root.matchAll(/#([0-9a-fA-F]{6})\b/g)) hexes.add(`#${m[1]}`);
  return [...hexes].map((h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]);
}

/** 팔레트에서 가장 가까운 색까지의 거리 (0 = 정확 일치) */
function drift(pal: number[][], r: number, g: number, b: number): number {
  let best = Infinity;
  for (const p of pal) {
    const d = Math.hypot(r - (p[0] as number), g - (p[1] as number), b - (p[2] as number));
    if (d < best) best = d;
  }
  return best;
}

/** 팔레트 이탈로 치는 거리. 24 는 크림 계열 이웃 색 간격(≈30)보다 좁다 */
const DRIFT_MAX = 24;
/** 잉크가 크림 위에서 이만큼은 떠야 한다 (보조 기준 3:1 — 대비 계약과 같은 눈금) */
const CONTRAST_MIN = 3;
/** 크림 패널 색 — 대비의 바탕 */
const CREAM: [number, number, number] = [0xf0, 0xd5, 0xa4];

const lum = (r: number, g: number, b: number): number => {
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: [number, number, number], b: [number, number, number]): number => {
  const x = lum(...a);
  const y = lum(...b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

interface Verdict {
  ok: boolean;
  why: string;
}

/**
 * 그림 한 장을 잰다. **판정을 한 함수에 모은다** — 아이콘과 배경이 다른 규칙을 쓰면
 * 언젠가 한쪽만 고쳐진다.
 */
export function judgeImage(
  raster: Raster,
  want: [number, number],
  pal: number[][],
  opaque: boolean,
): Verdict {
  if (raster.w !== want[0] || raster.h !== want[1]) {
    return { ok: false, why: `크기 ${raster.w}×${raster.h} ≠ 계약 ${want[0]}×${want[1]}` };
  }
  const d = raster.data;
  let solid = 0;
  let outside = 0;
  let darkest: [number, number, number] = [255, 255, 255];
  let darkestLum = 2;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] as number;
    if (a < 8) continue;
    solid += 1;
    const r = d[i] as number;
    const g = d[i + 1] as number;
    const b = d[i + 2] as number;
    if (drift(pal, r, g, b) > DRIFT_MAX) outside += 1;
    const L = lum(r, g, b);
    if (L < darkestLum) {
      darkestLum = L;
      darkest = [r, g, b];
    }
  }
  if (solid === 0) return { ok: false, why: '전부 투명하다 — 그림이 없다' };
  if (!opaque) {
    // 투명 배경: 네 모서리가 비어 있어야 한다. 흰 사각형이 크림 위에 앉는 것을 막는다
    const corner = (x: number, y: number): number => d[(y * raster.w + x) * 4 + 3] as number;
    const corners = [
      corner(0, 0),
      corner(raster.w - 1, 0),
      corner(0, raster.h - 1),
      corner(raster.w - 1, raster.h - 1),
    ];
    if (corners.some((a) => a >= 8)) return { ok: false, why: `배경이 안 비었다 (모서리 alpha ${corners.join(',')})` };
    const fill = solid / (raster.w * raster.h);
    if (fill > 0.92) return { ok: false, why: `화면을 다 덮는다 (${Math.round(fill * 100)}%)` };
  }
  const outShare = outside / solid;
  if (outShare > 0.02) {
    return { ok: false, why: `팔레트 이탈 ${Math.round(outShare * 100)}% (허용 2%)` };
  }
  const c = ratio(darkest, CREAM);
  if (!opaque && c < CONTRAST_MIN) {
    return { ok: false, why: `크림 위 대비 ${c.toFixed(1)}:1 (필요 ${CONTRAST_MIN})` };
  }
  return { ok: true, why: `이탈 ${(outShare * 100).toFixed(1)}% · 대비 ${c.toFixed(1)}:1` };
}

const contract = JSON.parse(readFileSync(CONTRACT, 'utf8')) as Contract;

// ── ① 계약 ↔ 등록부 양방향 ────────────────────────────────────────────────
{
  const src = readFileSync('src/ui/icons.ts', 'utf8');
  const glyph = src.slice(src.indexOf('const GLYPH'), src.indexOf('};', src.indexOf('const GLYPH')));
  const registry = new Set<string>(
    [...glyph.matchAll(/^ {2}(?:'([a-z-]+)'|([a-z-]+)):/gm)].map((m) => (m[1] ?? m[2]) as string),
  );
  const contracted = new Set(contract.icons.map((i) => i.id.replace(/^ui\//, '')));
  const missingInCode = [...contracted].filter((id) => !registry.has(id));
  const missingInContract = [...registry].filter((id) => !contracted.has(id));
  check(
    missingInCode.length === 0 && missingInContract.length === 0,
    '계약과 등록부가 양방향으로 같다 — 폴백이 총체적이다',
    missingInCode.length || missingInContract.length
      ? `코드에 없다 ${missingInCode.join(',') || '-'} · 계약에 없다 ${missingInContract.join(',') || '-'}`
      : `${contracted.size}종 일치`,
  );
}

const pal = palette();
const aiIcons = contract.icons.filter((i) => i.source === 'ai');

// ── ⑦ 계약에 없는 파일 0 ──────────────────────────────────────────────────
function stray(dir: string, ids: Set<string>): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .filter((f) => !ids.has(f.replace(/\.png$/, '')));
}

// ── ②③④⑤⑥ 반입분 판정 ────────────────────────────────────────────────────
function sweep(
  entries: IconEntry[],
  dir: string,
  prefix: string,
  opaque: boolean,
  label: string,
): void {
  const ids = new Set(entries.map((e) => e.id.replace(prefix, '')));
  const present: string[] = [];
  const bad: string[] = [];
  for (const e of entries) {
    const file = join(dir, `${e.id.replace(prefix, '')}.png`);
    if (!existsSync(file)) continue;
    present.push(e.id);
    let verdict: Verdict;
    try {
      verdict = judgeImage(decodePng(file), e.size, pal, opaque);
    } catch (err) {
      verdict = { ok: false, why: `읽기 실패 — ${(err as Error).message}` };
    }
    if (!verdict.ok) bad.push(`${e.id}: ${verdict.why}`);
  }
  /*
   * ⚠ **반입 0 은 실패가 아니다.** 「받아야 할 것을 아직 안 받았다」와 「받았는데 나쁘다」는
   * 다른 상태이고, 섞으면 위탁이 끝날 때까지 게이트가 영구 빨간불이라 아무도 안 본다.
   */
  check(true, `${label} 반입 현황`, `${present.length}/${entries.length}`);
  check(
    bad.length === 0,
    `${label} — 반입분이 계약을 지킨다 (크기·투명·팔레트·대비)`,
    bad.length ? bad.slice(0, 6).join(' · ') : `통과 ${present.length}/${present.length}`,
  );
  const extra = stray(dir, ids);
  check(extra.length === 0, `${label} — 계약에 없는 파일 0`, extra.join(',') || '없음');
}

if (!SELFTEST) {
  sweep(aiIcons, contract.iconDir, 'ui/', false, '아이콘');
  sweep(contract.art, contract.artDir, 'event/', true, '사건 배경');

  console.log('UI 아이콘·사건 배경 게이트 (P1.5-B)');
  for (const p of pass) console.log(`  ✓ ${p}`);
  for (const f of fails) console.log(`  ✕ ${f}`);
  if (fails.length > 0) {
    console.log(`\n❌ ${pass.length}/${pass.length + fails.length} 통과`);
    process.exit(1);
  }
  console.log(`\n✅ ${pass.length}/${pass.length} 통과`);
  process.exit(0);
}

// ── 음성 대조군 ───────────────────────────────────────────────────────────
/*
 * ⚠ **자를 만들었으면 위반을 넣어 봐야 한다.** 이 저장소는 「검사가 조용히 통과」를 열 번
 * 넘게 밟았고, 회전 게이트는 118회 생성이 전부 초록으로 통과한 뒤에야 드러났다.
 */
const solid = (w: number, h: number, rgba: [number, number, number, number]): Raster => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return { w, h, data };
};
/** 가운데에만 잉크가 있는 정상 아이콘 — 대조군의 기준선 */
const good = (w = 48, h = 48, ink: [number, number, number] = [0x4a, 0x2f, 0x14]): Raster => {
  const r = solid(w, h, [0, 0, 0, 0]);
  for (let y = 8; y < h - 8; y++) {
    for (let x = 8; x < w - 8; x++) {
      const i = (y * w + x) * 4;
      r.data[i] = ink[0];
      r.data[i + 1] = ink[1];
      r.data[i + 2] = ink[2];
      r.data[i + 3] = 255;
    }
  }
  return r;
};

const FAULTS: { id: string; why: string; make: () => Raster }[] = [
  { id: 'size', why: '한 장을 49×48 로 늘린다', make: () => good(49, 48) },
  { id: 'opaque-bg', why: '배경을 불투명 흰색으로 채운다', make: () => solid(48, 48, [255, 255, 255, 255]) },
  {
    id: 'off-palette',
    why: '팔레트 밖 형광색으로 그린다',
    make: () => good(48, 48, [0xff, 0x00, 0xff]),
  },
  {
    id: 'low-contrast',
    why: '크림 위에서 안 보이는 크림색으로 그린다',
    make: () => good(48, 48, [0xef, 0xd6, 0xa6]),
  },
  { id: 'empty', why: '전부 투명한 빈 장', make: () => solid(48, 48, [0, 0, 0, 0]) },
];

const caught: string[] = [];
const missed: string[] = [];
for (const fault of FAULTS) {
  const verdict = judgeImage(fault.make(), [48, 48], pal, false);
  (verdict.ok ? missed : caught).push(`${fault.id} — ${fault.why}${verdict.ok ? '' : ` (${verdict.why})`}`);
}
// 기준선: 멀쩡한 장은 통과해야 한다 — 안 그러면 자가 전부를 떨구는 것뿐이다
const baseline = judgeImage(good(), [48, 48], pal, false);
if (!baseline.ok) missed.push(`기준선 — 멀쩡한 장이 떨어진다 (${baseline.why})`);

// ⑦ 계약에 없는 파일도 실제 디렉터리로 확인한다
{
  const dir = join(contract.iconDir, '.selftest');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'nobody-asked.png'), encodePng(good()));
  const extra = stray(dir, new Set(contract.icons.map((i) => i.id.replace('ui/', ''))));
  (extra.length > 0 ? caught : missed).push('stray — 계약에 없는 파일을 넣는다');
  rmSync(dir, { recursive: true, force: true });
}

console.log('UI 아이콘 게이트 — 음성 대조군');
for (const c of caught) console.log(`  ✓ 잡힘: ${c}`);
for (const m of missed) console.log(`  ✕ 안 잡힘: ${m}`);
if (missed.length > 0) {
  console.log(`\n❌ ${caught.length}/${FAULTS.length + 1} — 안 잡히는 자는 아무것도 안 재고 있다`);
  process.exit(1);
}
console.log(`\n✅ 대조군 ${caught.length}/${FAULTS.length + 1} 전부 잡힘`);
