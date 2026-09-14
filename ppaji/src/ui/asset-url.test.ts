import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * P57-c — 인라인 CSS 변수에 넣는 public 에셋 URL 은 `assetUrl()` 을 지나야 한다.
 * 상대 경로 `url("assets/…")` 를 그대로 넣으면 dist(CSS 가 `assets/` 안)에서 `/assets/assets/…` 404 — 그림 396·장면 4 가 배포본에서만 사라졌다(2026-09-15 실측).
 * dev 서버만 재는 게이트는 못 잡으므로 소스를 정적으로 센다.
 */
function walk(dir: string, out: string[] = []): string[] { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p); } return out; }

describe('P57-c 에셋 URL', () => {
  it('src/ui 의 인라인 url("assets/…") 리터럴 0 · --pic-sheet/--scene-bg 는 assetUrl 을 지난다', () => {
    const files = walk(join(__dirname));
    const bare: string[] = [], raw: string[] = [];
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/url\(\\?["']?(\.\/)?assets\//g)) bare.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
      for (const line of s.split('\n')) if (/setProperty\('--(pic-sheet|scene-bg)'/.test(line) && !/assetUrl\(/.test(line)) raw.push(`${f}: ${line.trim().slice(0, 80)}`);
    }
    expect(bare, 'url("assets/…") 리터럴').toEqual([]);
    expect(raw, 'assetUrl 없는 setProperty').toEqual([]);
  });
});
