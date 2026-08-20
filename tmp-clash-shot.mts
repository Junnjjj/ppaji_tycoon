/* P4 상성 감점이 결산에 뜨는지 — 실제 브라우저로 확인하고 스크린샷을 남긴다 */
import { chromium } from 'playwright';

const URL = 'http://localhost:5173/?kairo=1&px=1&debug=1';
const SHOT = '/private/tmp/claude-501/-Users-jangjunpyo-orca-workspaces-ppaji-tycoon------/d615a1bb-adfa-4c39-bac7-680a49c721d6/scratchpad';

const DISMISS = `(() => {
  const cv = window.__kairo && window.__kairo.cardView;
  let n = 0;
  while (cv && cv.visible && n++ < 8) cv.pickForTest(0);
  return n;
})()`;

const main = async (): Promise<void> => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const cx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const pg = await cx.newPage();
  const errs: string[] = [];
  pg.on('pageerror', (e) => errs.push(String(e)));
  await pg.addInitScript(`try { localStorage.clear(); } catch {}`);
  await pg.goto(URL, { waitUntil: 'load' });
  await pg.waitForFunction(
    `(() => { const b = document.getElementById('kairo-debug'); return !!b && b.textContent.includes('FPS'); })()`,
    undefined,
    { timeout: 20000 },
  );

  // 화장실(위생) 옆에 야외 자판기(먹거리)를 붙인다 — 감점 쌍 하나를 일부러 만든다
  const setup = (await pg.evaluate(`(() => {
    const h = window.__kairo, t = h.terrain, w = h.walls, p = h.placement, sc = h.scene;
    const L = h.land();
    const I0 = L.i0 + 1, I1 = L.i0 + L.w - 1, J0 = L.j0 + 1, J1 = L.j0 + L.h - 1;
    // 육지 전체 포장 (K32-B: 잔디는 손님이 못 지난다)
    for (let j = 0; j < t.height; j++) for (let i = 0; i < t.width; i++) {
      if (!t.isWalkable(i, j) || t.isIndoor(i, j)) continue;
      if (t.kindAt(i, j) === 'path_stone') continue;
      if (t.paint(i, j, 'path_stone')) sc.refreshTile(i, j);
    }
    h.guests.invalidate();
    const free = (ww, hh) => {
      for (let j = J0; j + hh <= J1; j++) for (let i = I0; i + ww <= I1; i++) {
        let ok = true;
        const lv = t.levelAt(i, j);
        for (let di = 0; di < ww && ok; di++) for (let dj = 0; dj < hh; dj++) {
          if (!t.isWalkable(i + di, j + dj) || t.isIndoor(i + di, j + dj) ||
              !t.isBuildable(i + di, j + dj) || t.levelAt(i + di, j + dj) !== lv ||
              w.hasAnyEdge(i + di, j + dj) || p.handleAt(i + di, j + dj)) { ok = false; break; }
        }
        if (ok) return [i, j];
      }
      return null;
    };
    const out = ['시작 배치: ' + p.all().map((x) => x.defId).join('+')];
    // 실내동은 비워서 준다 (K30) — 화장실을 먼저 넣는다
    let placedToilet = null;
    for (let j = 0; j < t.height && !placedToilet; j++) {
      for (let i = 0; i < t.width; i++) {
        if (!t.isIndoor(i, j)) continue;
        const r = p.place(t, w, h.gate, 'toilet', i, j);
        if (r.ok) { sc.refreshFacility(r.placed.handle); placedToilet = [i, j]; break; }
      }
    }
    out.push('화장실:' + (placedToilet ? placedToilet.join(',') : '실패'));
    h.guests.invalidate();
    /*
     * 위생 시설은 실내 전용이라 (requiresIndoor) 감점을 만들려면 **건물 벽 하나 건너**
     * 먹거리·경관을 붙인다 — 실제 플레이에서 나는 모양 그대로다.
     */
    const hyg = p.all().filter((x) => x.defId === 'toilet' || x.defId === 'washbasin_row' ||
      x.defId === 'shower_row' || x.defId === 'locker_row');
    const ring = [];
    for (let d = -4; d <= 4; d++) for (let e = -4; e <= 4; e++) ring.push([d, e]);
    for (const [id, label] of [['shop', '매점(먹거리)'], ['lookout', '전망대(경관)']]) {
      let done = null;
      for (const hh of hyg) {
        for (const [di, dj] of ring) {
          const ni = hh.i + di, nj = hh.j + dj;
          const r = p.place(t, w, h.gate, id, ni, nj);
          if (r.ok) {
            sc.refreshFacility(r.placed.handle);
            h.guests.invalidate();
            const now = h.combos.evaluateCombos(p, undefined, h.guests.swimZones());
            if (now.conflicts.length > 0) { done = [ni, nj]; break; }
            // 감점이 안 났으면 되돌린다 — 감점을 **일부러** 만드는 것이 이 절의 목적
            p.remove(r.placed.handle);
            sc.refreshFacility(r.placed.handle);
          }
        }
        if (done) break;
      }
      out.push(label + ':' + (done ? done.join(',') : '실패'));
    }
    h.guests.invalidate();
    const now = h.combos.evaluateCombos(p, undefined, h.guests.swimZones());
    h.arrivalQueue.length = 0;
    h.week.abort();
    h.beginWeek();
    h.runWeek();
    return {
      ok: true, out: out,
      conflicts: now.conflicts.map((c) => c.id + '@' + c.at.i + ',' + c.at.j),
      pen: [now.penaltySatisfaction, now.penaltyRevenue],
      active: now.active.length,
    };
  })()`)) as Record<string, unknown>;
  console.log('setup', JSON.stringify(setup));

  await pg.waitForTimeout(500);
  await pg.evaluate(DISMISS);
  await pg.waitForTimeout(400);

  const block = (await pg.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    if (!r || r.hidden) return { open: false };
    const wrap = r.querySelector('[data-combo]');
    if (!wrap) return { open: true, block: false };
    const stats = [...wrap.querySelectorAll('.kstat')].map((c) => (
      (c.querySelector('.kstat-label') || {}).textContent + '=' +
      (c.querySelector('.kstat-value') || {}).textContent + '[' +
      (c.querySelector('.kstat-value') || {}).className + ']'));
    const caps = [...wrap.querySelectorAll('.kcaption')].map((c) => c.className + ': ' + c.textContent);
    const clashRows = [...wrap.querySelectorAll('[data-clash-list] > *')].map((c) => c.textContent);
    const badColor = (() => {
      const e = wrap.querySelector('.kcaption.bad');
      return e ? getComputedStyle(e).color : null;
    })();
    return {
      open: true, block: true, combo: wrap.getAttribute('data-combo'),
      clash: wrap.getAttribute('data-clash'), stats, caps, clashRows, badColor,
      applied: window.__kairo.lastReportForTest ? null : undefined,
    };
  })()`)) as Record<string, unknown>;
  console.log('block', JSON.stringify(block, null, 1));

  // 감점 줄이 화면 안에 들어오도록 스크롤한 뒤 찍는다
  await pg.evaluate(`(() => {
    const r = document.getElementById('kairo-report');
    const w = r && r.querySelector('[data-clash-list]');
    if (w) w.scrollIntoView({ block: 'center' });
  })()`);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: `${SHOT}/p4-clash-report.png` });
  console.log('errors', errs.slice(0, 3));
  await browser.close();
};
void main();
