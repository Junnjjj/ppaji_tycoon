// P52-c — 봇 128일 검사(20~30초 동기)가 여럿이라 threads 풀은 워커 RPC 가 굶어 「Timeout calling onTaskUpdate」(전부 통과했는데 게이트 빨강)를 냈다.
// 프로세스 풀 + 동시 6 으로 잰다(10코어). 값을 올리면 같은 오류가 돌아온다.
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { maxForks: 6, minForks: 1 } },
    testTimeout: 60000,
  },
}));
