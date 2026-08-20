/* P4 — 도감의 상성 감점 참조표 (전체 보기에서만 보인다) */
import { chromium } from 'playwright';

const URL = 'http://localhost:5173/?kairo=1&px=1&debug=1';
const SHOT = '/private/tmp/claude-501/-Users-jangjunpyo-orca-workspaces-ppaji-tycoon------/d615a1bb-adfa-4c39-bac7-680a49c721d6/scratchpad';

const main = async (): Promise<void> => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const cx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const pg = await cx.newPage();
  await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
  await pg.goto(URL, { waitUntil: 'load' });
  await pg.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 20000 },
  );
  const view = (await pg.evaluate(`(() => {
    document.getElementById('kairo-menu-open').click();
    document.getElementById('kairo-catalog-open').click();
    const panel = document.getElementById('kairo-catalog');
    const before = [...panel.querySelectorAll('[data-entry]')].filter((r) => r.dataset.found === '1').length;
    document.getElementById('kairo-catalog-filter').click(); // 전체 보기
    const rows = [...panel.querySelectorAll('[data-entry]')].slice(0, 6).map((r) => r.textContent);
    return { foundInDefault: before, rows: rows };
  })()`)) as { foundInDefault: number; rows: string[] };
  console.log(JSON.stringify(view, null, 1));
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: `${SHOT}/p4-clash-catalog.png` });
  await browser.close();
};
void main();
