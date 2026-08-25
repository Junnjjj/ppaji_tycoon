import { describe, expect, it } from 'vitest';
import { endingChoiceActions } from './kairo-ending.js';

describe('첫 엔딩 이후 선택', () => {
  it('계속 운영·새 지역·리조트 감상을 각 채널로 정확히 한 번 보낸다', () => {
    const ran: string[] = [];
    const choices = endingChoiceActions({
      continue: () => ran.push('continue'),
      newRegion: () => ran.push('new-region'),
      view: () => ran.push('view'),
    });
    expect(choices.map(({ id, label }) => [id, label])).toEqual([
      ['continue', '계속 운영'],
      ['new-region', '새 지역'],
      ['view', '리조트 감상'],
    ]);
    for (const choice of choices) choice.run();
    expect(ran).toEqual(['continue', 'new-region', 'view']);
  });
});
