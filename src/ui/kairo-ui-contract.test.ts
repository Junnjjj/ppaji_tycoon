import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tickerFallbackText } from './kairo-ticker.js';

const hudSource = readFileSync(new URL('./kairo-hud.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

describe('카이로 홈 화면 계약', () => {
  it('헤더 버튼 0개, 하단 상시 버튼 2개를 유지한다', () => {
    const header = hudSource.slice(
      hudSource.indexOf('── 상단 2단 헤더'),
      hudSource.indexOf('의뢰 칩 (K40'),
    );
    const bottom = hudSource.slice(
      hudSource.indexOf('── 하단 바 (K47-②)'),
      hudSource.indexOf('── 시트 (건설·메뉴 공용)'),
    );

    expect(header).not.toContain("el('button'");
    expect(bottom.match(/el\('button'/g)).toHaveLength(2);
    expect(bottom).toContain("id = 'kairo-menu-open'");
    expect(bottom).toContain("id = 'kairo-build-open'");
  });

  it('직접 행동 목표의 터치 타깃은 style.css의 44px 토큰을 쓴다', () => {
    expect(cssSource).toMatch(/--tap:\s*44px/);
    expect(cssSource).toMatch(/\.kchip\.tap\s*\{[^}]*min-height:\s*var\(--tap\)/s);
  });

  it('뉴스가 없으면 자리표시자 대신 다음 즉시 행동을 안내한다', () => {
    const text = tickerFallbackText('물려받은 코스 시험 운행');
    expect(text).toContain('물려받은 코스 시험 운행');
    expect(text).not.toContain('소식이 여기 흐릅니다');
    expect(text.trim().length).toBeGreaterThan(0);
  });
});
