/**
 * 앱 아이콘을 **코드로 굽는다**.
 *
 *   npm run icons
 *
 * ## 왜 AI 아트가 아닌가
 *
 * 에셋 생산은 이 골 밖이다. 하지만 아이콘이 없으면 홈 화면에 추가했을 때 **회색 사각형**이
 * 뜨고, 그건 "폰에서 돌아간다"가 절반만 참인 상태다. 아이콘은 에셋이 아니라 **포장**이다.
 *
 * 게임의 절차적 스프라이트와 같은 방식으로 그린다 — 아이소 타일 위에 물과 데크.
 * 나중에 실물 아트로 바꿔도 이 스크립트만 지우면 된다.
 *
 * ## 왜 브라우저에서 그리나
 *
 * Node 에는 캔버스가 없다. 새 의존성(`canvas`, `sharp`)을 붙이는 대신 이미 있는
 * Playwright 로 그려서 PNG 로 받는다 — **의존성을 늘리지 않는다**는 결정과 같은 방향이다.
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

/** 홈 화면·스플래시가 요구하는 크기들 */
const SIZES = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  // maskable 은 원형으로 잘려도 남도록 안쪽 80% 안에만 그린다
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  // iOS 는 apple-touch-icon 을 따로 본다 (180)
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

const DRAW = `(size, maskable) => {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  // 배경 — 게임의 하늘색
  g.fillStyle = '#7ab8d4';
  g.fillRect(0, 0, size, size);

  const s = maskable ? size * 0.8 : size;
  const off = (size - s) / 2;
  const px = s / 16; // 16칸 격자로 그린다 — 어떤 크기에서도 도트가 딱 떨어진다

  // 물
  g.fillStyle = '#2f7fa8';
  g.fillRect(off, off + px * 9, s, px * 7);
  g.fillStyle = '#3f96c0';
  for (let k = 0; k < 4; k++) {
    g.fillRect(off + px * (1 + k * 4), off + px * (10 + (k % 2)), px * 2, px);
  }

  // 아이소 데크 (2:1 다이아몬드) — 게임의 투영과 같은 비율
  const cx = off + s / 2, cy = off + px * 8;
  const dw = px * 6, dh = px * 3;
  const diamond = (ox, oy, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(ox, oy - dh);
    g.lineTo(ox + dw, oy);
    g.lineTo(ox, oy + dh);
    g.lineTo(ox - dw, oy);
    g.closePath();
    g.fill();
  };
  diamond(cx, cy + px * 0.6, '#8a5f36');   // 그림자
  diamond(cx, cy, '#c08b52');              // 데크 상판
  diamond(cx, cy - px * 0.5, '#d8a86e');   // 하이라이트

  // 파라솔 — 실루엣이 읽히도록 크게
  g.fillStyle = '#2b1d12';
  g.fillRect(cx - px * 0.3, cy - px * 4, px * 0.6, px * 4);
  g.fillStyle = '#e05a4a';
  g.beginPath();
  g.moveTo(cx, cy - px * 6.2);
  g.lineTo(cx + px * 3.4, cy - px * 3.8);
  g.lineTo(cx - px * 3.4, cy - px * 3.8);
  g.closePath();
  g.fill();
  g.fillStyle = '#f4d06a';
  g.beginPath();
  g.moveTo(cx, cy - px * 6.2);
  g.lineTo(cx + px * 1.1, cy - px * 3.8);
  g.lineTo(cx - px * 1.1, cy - px * 3.8);
  g.closePath();
  g.fill();

  return c.toDataURL('image/png');
}`;

async function main(): Promise<void> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank');
  await mkdir('public/icons', { recursive: true });

  for (const { file, size, maskable } of SIZES) {
    const url = (await page.evaluate(`(${DRAW})(${size}, ${maskable})`)) as string;
    const b64 = url.split(',')[1] ?? '';
    const bytes = Buffer.from(b64, 'base64');
    // 빈 PNG 를 조용히 쓰지 않는다 — 회색 사각형이 뜨는 것과 같은 실패다
    if (bytes.length < 200) throw new Error(`${file} 이 비었습니다 (${bytes.length} 바이트)`);
    await writeFile(`public/icons/${file}`, bytes);
    console.log(`  ${file.padEnd(26)} ${size}×${size}  ${(bytes.length / 1024).toFixed(1)}KB`);
  }
  await browser.close();
  console.log(`✅ 아이콘 ${SIZES.length}장`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
