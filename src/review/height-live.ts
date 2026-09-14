import type { KairoHandle } from '../render/kairo/boot.js';
import { slopeAt, slopeShapeAt } from '../sim/kairo/slopes.js';

/** Camera bookmarks only. Never paint, level, place facilities, change grade or seed guests. */
export function legacyHeightBookmarks(h: Pick<KairoHandle, 'terrain' | 'gate'>): { name: string; i: number; j: number }[] {
  const points: { name: string; i: number; j: number }[] = [{ name: '기존 공원', ...h.gate }];
  const candidates: { i: number; j: number; installed: boolean; score: number }[] = [];
  for (let j = 8; j < h.terrain.height; j++) for (let i = 1; i < h.terrain.width - 1; i++) {
    if (!slopeShapeAt(h.terrain, i, j)) continue;
    const installed = !!slopeAt(h.terrain, i, j);
    candidates.push({ i, j, installed, score: Math.abs(i - h.gate.i) + Math.abs(j - h.gate.j) });
  }
  for (const side of [-1, 1]) {
    const c = candidates.filter(c => (c.i - h.gate.i) * side > 0)
      .sort((a, b) => Number(b.installed) - Number(a.installed) || a.score - b.score)[0];
    if (c) points.push({ name: `${side < 0 ? '왼쪽' : '오른쪽'} 기존 ${c.installed ? '경사로' : '단차'}`, i: c.i, j: c.j });
  }
  return points;
}

export function installHeightLiveReview(h: KairoHandle): void {
  const before = JSON.stringify({ terrain: h.terrain.toSnapshot(), placement: h.placement.toSnapshot(), walls: h.walls.toSnapshot() });
  const groups = legacyHeightBookmarks(h);
  const panel = document.createElement('div'); panel.id = 'height-live-review';
  panel.style.cssText = 'position:fixed;top:80px;left:12px;z-index:9000;padding:12px;background:#fffaf0;border:1px solid #88785c;border-radius:8px;display:flex;gap:8px;flex-wrap:wrap;max-width:90vw;color:#24362b';
  const label = document.createElement('span'); label.textContent = '기존 맵 · 높낮이 확인'; panel.append(label);
  groups.forEach(c => {
    const b = document.createElement('button'); b.textContent = c.name;
    b.onclick = () => { h.scene.setUpscale(2); h.scene.focusTile(c.i, c.j); }; panel.append(b);
  });
  const game = document.createElement('a'); game.href = '/'; game.textContent = '게임으로'; panel.append(game);
  document.body.append(panel);
  const unchanged = before === JSON.stringify({ terrain: h.terrain.toSnapshot(), placement: h.placement.toSnapshot(), walls: h.walls.toSnapshot() });
  Object.assign(window, { heightLiveReview: { ready: true, groups, mapUnchanged: unchanged, storage: 'read existing save; writes disabled', simulation: 'existing GuestStore / WeekRunner' } });
}
