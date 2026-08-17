// 배경 벽 윗변 계약 검사 — node tools/check-farbank-sky.mjs   (dev 서버 필요)
//
// 벽 텍스처는 맨 위 줄이 **하늘 단색**이고, three.js 의 ClampToEdge 가 그 줄을 위로
// 무한히 늘린다. 그래서 `farbank.ts` 의 `sky` 값이 PNG 최상단 색과 다르면
// 벽이 끝나는 자리에서 하늘이 두 색으로 갈라져 **가로 선**이 보인다.
// (옛 두 장 구성에서는 farbank-village.png 아래 6줄이 순수 검정이라 그게 선이었다 — 실측)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const src = readFileSync(new URL('../src/farbank.ts', import.meta.url), 'utf8');
const declared = Object.fromEntries(
  [...src.matchAll(/(river|mountain|lake):\s*\{[^}]*sky:\s*'(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]),
);

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('http://localhost:5175/', { waitUntil: 'domcontentloaded' });

let fail = 0;
for (const map of ['river', 'mountain', 'lake']) {
  // ⚠ page.evaluate 안에서는 이름 있는 함수를 쓰지 말 것 (tsx 의 __name 헬퍼 사고).
  const info = await page.evaluate(`(async () => {
    const img = new Image();
    img.src = '/sprites/bg-${map}.png';
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);
    const d = cv.getContext('2d').getImageData(0, 0, img.width, 1).data;
    let flat = true;
    for (let x = 1; x < img.width; x++) {
      for (let c = 0; c < 3; c++) if (d[x * 4 + c] !== d[c]) flat = false;
    }
    const hex = '#' + [0, 1, 2].map((c) => d[c].toString(16).padStart(2, '0')).join('');
    return { w: img.width, h: img.height, flat, hex };
  })()`);
  const ok = info.flat && info.w === 197 && info.h === 117 && declared[map] === info.hex;
  if (!ok) fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${map}: ${info.w}×${info.h}  top-row ${info.flat ? 'flat' : 'NOT FLAT'} ` +
    `${info.hex}  farbank.ts=${declared[map]}`,
  );
}
await browser.close();
console.log(fail ? `${fail} FAIL` : 'all sky contracts hold');
process.exit(fail ? 1 : 0);
