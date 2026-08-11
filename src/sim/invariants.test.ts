import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

/**
 * 아키텍처 불변식이 "설정돼 있다"가 아니라 "실제로 위반을 잡는다"를 검증한다.
 *
 * 계획서 §3 에서 이 규칙들은 절대 끄지 않기로 했다. 누군가(사람이든 AI든)
 * 나중에 규칙을 완화하면 이 테스트가 깨져서 알려준다.
 *
 * lintText 에 filePath 를 주면 파일을 실제로 만들지 않아도 그 경로의 설정이 적용된다.
 */

const SIM_PATH = 'src/sim/__probe.ts';
const RENDER_PATH = 'src/render/__probe.ts';

async function lint(code: string, filePath: string): Promise<ESLint.LintResult> {
  const eslint = new ESLint();
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) throw new Error('ESLint 결과가 비었습니다');
  return result;
}

const ruleIdsOf = (r: ESLint.LintResult): string[] =>
  r.messages.map((m) => m.ruleId ?? '').filter(Boolean);

describe('불변식 1 — sim/ 은 렌더러를 모른다', () => {
  it('sim/ 에서 phaser import 를 막는다', async () => {
    const r = await lint(`import Phaser from 'phaser';\nexport const x = Phaser;\n`, SIM_PATH);
    expect(ruleIdsOf(r)).toContain('no-restricted-imports');
  });

  it('sim/ 에서 render·ui·assets import 를 막는다', async () => {
    for (const mod of ['../render/scene.js', '../ui/hud.js', '../assets/procedural.js']) {
      const r = await lint(`import x from '${mod}';\nexport const y = x;\n`, SIM_PATH);
      expect(ruleIdsOf(r), mod).toContain('no-restricted-imports');
    }
  });

  it('render/ 에서는 phaser import 가 허용된다 (의존 방향 render → sim)', async () => {
    const r = await lint(`import Phaser from 'phaser';\nexport const x = Phaser;\n`, RENDER_PATH);
    expect(ruleIdsOf(r)).not.toContain('no-restricted-imports');
  });
});

describe('불변식 2 — sim/ 은 결정론적이다', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['Math.random()', 'export const v = Math.random();', 'no-restricted-properties'],
    ['Date.now()', 'export const v = Date.now();', 'no-restricted-properties'],
    ['performance.now()', 'export const v = performance.now();', 'no-restricted-properties'],
    ['new Date()', 'export const v = new Date().getTime();', 'no-restricted-syntax'],
  ];

  for (const [label, code, rule] of cases) {
    it(`sim/ 에서 ${label} 을 막는다`, async () => {
      const r = await lint(code, SIM_PATH);
      expect(ruleIdsOf(r)).toContain(rule);
    });
  }

  it('sim/ 밖에서는 시간·난수 호출이 허용된다', async () => {
    const r = await lint(`export const v = Math.random() + Date.now();`, RENDER_PATH);
    expect(ruleIdsOf(r)).not.toContain('no-restricted-properties');
  });
});

describe('불변식 위반은 이유를 설명한다', () => {
  it('에러 메시지에 어떤 불변식인지와 대안이 들어 있다', async () => {
    const r = await lint('export const v = Math.random();', SIM_PATH);
    const msg = r.messages.map((m) => m.message).join('\n');
    expect(msg).toMatch(/불변식 2/);
    expect(msg).toMatch(/Rng/);
  });
});
