import { describe, it, expect } from 'vitest';
import { bodyWithReward } from './game.js';

/** G56 — 후반 재플레이 후속 */
describe('G56', () => {
  it('달력 본문은 대사가 이미 말한 보상을 두 번 붙이지 않는다', () => {
    expect(bodyWithReward('반환점이에요. 지원금 8,000G — 큰 슬라이드에 투자해 보세요.', '8,000G 획득')).toBe('반환점이에요. 지원금 8,000G — 큰 슬라이드에 투자해 보세요.');
    expect(bodyWithReward('봄에는 플로럴 향이 인기라 라벤더를 보냅니다.', '라벤더 해금')).toBe('봄에는 플로럴 향이 인기라 라벤더를 보냅니다.');
    expect(bodyWithReward('첫날 밤이에요.', '장미 해금')).toBe('첫날 밤이에요. — 장미 해금');
  });
});
