import { describe, expect, it } from 'vitest';
import {
  assertBuildIdentity,
  currentBuildIdentity,
  inspectSharePort,
  tunnelResolution,
  type BuildIdentity,
  type PortOwner,
} from './share-kairo.js';

const CURRENT: BuildIdentity = {
  sha: '1464895a54b0bac6138cb83063736ac2a5338ce6',
  shortSha: '1464895',
  branch: 'Junnjjj/게임시스템업데이트',
  sourceDigest: 'dirty-aabbccddeeff',
  startedAt: '2026-08-25T12:00:00.000Z',
};

const OWNER: PortOwner = { pid: 4242, command: 'node vite --port 5173' };

describe('share:kairo 포트 소유권', () => {
  it('요청 포트가 다른 빌드에 점유되면 Vite가 다음 포트로 이동하기 전에 거절한다', async () => {
    const old = { ...CURRENT, sha: 'aaaaaaaa', shortSha: 'aaaaaaa', sourceDigest: 'old-diff' };

    await expect(inspectSharePort({
      port: 5173,
      expected: CURRENT,
      findOwners: async () => [OWNER],
      readIdentity: async () => old,
    })).rejects.toThrow(/5173.*PID 4242.*aaaaaaaa/s);
  });

  it('정체 엔드포인트가 없는 옛 서버도 PID와 포트를 밝히고 거절한다', async () => {
    await expect(inspectSharePort({
      port: 5173,
      expected: CURRENT,
      findOwners: async () => [OWNER],
      readIdentity: async () => null,
    })).rejects.toThrow(/5173.*PID 4242.*build identity 없음/s);
  });

  it('같은 HEAD·branch·working-tree digest의 서버만 재사용한다', async () => {
    const running = { ...CURRENT, startedAt: '2026-08-25T11:30:00.000Z' };
    await expect(inspectSharePort({
      port: 5173,
      expected: CURRENT,
      findOwners: async () => [OWNER],
      readIdentity: async () => running,
    })).resolves.toEqual({ kind: 'reuse', identity: running, owners: [OWNER] });
  });

  it('같은 HEAD라도 다른 dirty diff를 제공하는 옛 서버는 재사용하지 않는다', async () => {
    const oldDiff = { ...CURRENT, sourceDigest: 'dirty-ffeeddccbbaa' };
    await expect(inspectSharePort({
      port: 5173,
      expected: CURRENT,
      findOwners: async () => [OWNER],
      readIdentity: async () => oldDiff,
    })).rejects.toThrow(/5173.*dirty-ffeeddccbbaa/s);
  });

  it('빈 포트만 새 Vite 시작을 허용한다', async () => {
    await expect(inspectSharePort({
      port: 5173,
      expected: CURRENT,
      findOwners: async () => [],
      readIdentity: async () => null,
    })).resolves.toEqual({ kind: 'free' });
  });
});

describe('외부 터널 build identity', () => {
  it('Quick Tunnel의 직후 NXDOMAIN 캐시를 우회해 health check와 Chrome이 같은 호스트를 본다', () => {
    expect(tunnelResolution(
      'https://fresh.trycloudflare.com',
      '104.16.230.132',
    )).toEqual({
      curlResolve: 'fresh.trycloudflare.com:443:104.16.230.132',
      chromeRule: 'MAP fresh.trycloudflare.com 104.16.230.132',
    });
  });

  it('잘못된 터널 대상의 SHA를 HTTP 200과 무관하게 거절한다', () => {
    const wrong = { ...CURRENT, sha: 'bbbbbbbb', shortSha: 'bbbbbbb' };
    expect(() => assertBuildIdentity(wrong, CURRENT, 'https://old.trycloudflare.com'))
      .toThrow(/old\.trycloudflare\.com.*bbbbbbbb.*1464895a/s);
  });

  it('SHA뿐 아니라 branch·sourceDigest·startedAt까지 정확히 같아야 외부 검증을 통과한다', () => {
    expect(() => assertBuildIdentity({ ...CURRENT, startedAt: '2026-08-25T11:00:00.000Z' }, CURRENT, 'external'))
      .toThrow(/startedAt/);
    expect(() => assertBuildIdentity({ ...CURRENT, sourceDigest: 'same-head-other-diff' }, CURRENT, 'external'))
      .toThrow(/sourceDigest/);
    expect(assertBuildIdentity(CURRENT, CURRENT, 'external')).toBeUndefined();
  });

  it('공개 build identity에는 절대 worktree 경로를 넣지 않는다', () => {
    const identity = currentBuildIdentity(process.cwd(), CURRENT.startedAt);
    expect(identity).not.toHaveProperty('worktree');
    expect(identity.sourceDigest).toMatch(/^[a-f0-9]{64}$/);
  });
});
