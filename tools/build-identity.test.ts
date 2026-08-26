import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBuildIdentity, sourceDigest } from './build-identity.js';

describe('shared-source content identity', () => {
  it('같은 상대 경로·내용은 위치와 무관하게 같은 digest이고 내용 변경은 다른 digest다', () => {
    const first = mkdtempSync(join(tmpdir(), 'ppaji-source-a-'));
    const second = mkdtempSync(join(tmpdir(), 'ppaji-source-b-'));
    for (const root of [first, second]) {
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src', 'main.ts'), 'export const value = 1;\n');
    }
    const paths = ['src/main.ts'];
    expect(sourceDigest(first, paths)).toBe(sourceDigest(second, paths));
    writeFileSync(join(second, 'src', 'main.ts'), 'export const value = 2;\n');
    expect(sourceDigest(first, paths)).not.toBe(sourceDigest(second, paths));
  });

  it('git 실행 파일이 없어도 Vite가 쓸 수 있는 일관된 fallback identity를 만든다', () => {
    const root = mkdtempSync(join(tmpdir(), 'ppaji-no-git-'));
    writeFileSync(join(root, 'index.html'), '<main>offline source</main>');
    const identity = createBuildIdentity(root, {
      startedAt: '2026-08-25T12:00:00.000Z',
      git: () => null,
      env: {},
    });
    expect(identity).toMatchObject({ sha: 'unversioned', branch: '(no-git)' });
    expect(identity.shortSha).toBe(identity.sourceDigest.slice(0, 12));
    expect(identity).not.toHaveProperty('worktree');
  });

  it('vite config는 git hard dependency와 공개 worktree 필드를 직접 만들지 않는다', () => {
    const source = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('execFileSync');
    expect(source).not.toMatch(/worktree\s*:/);
  });

  it('기본 verify:kairo가 shell/course/scene v2 집중 게이트를 전부 먼저 실행한다', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const command = pkg.scripts['verify:kairo'] ?? '';
    for (const flag of ['--shell-v2', '--course-v2', '--scene-v2']) expect(command).toContain(flag);
    expect(command.indexOf('--scene-v2')).toBeLessThan(command.lastIndexOf('tools/verify-kairo.ts'));
  });
});
