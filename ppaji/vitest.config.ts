// P52-c — 봇 128일 검사(20~30초 동기)가 여럿이라 threads 풀은 워커 RPC 가 굶어 「Timeout calling onTaskUpdate」(전부 통과했는데 게이트 빨강)를 냈다.
// 프로세스 풀 + 동시 6 으로 잰다(10코어). 값을 올리면 같은 오류가 돌아온다.
// P60-d(2026-09-18) — 경로 계산이 더해져 128일 봇 검사 파일이 55~65초가 되자 6 에서도 같은 오류(519 전부 통과인데 빨강)가 났다 → 4. 세 게이트에서 재발 0 이면 유지.
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { maxForks: 4, minForks: 1 } },
    testTimeout: 60000,
  },
}));
