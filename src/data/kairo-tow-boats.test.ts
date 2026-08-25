import { describe, expect, it } from 'vitest';
import rawTowBoats from './kairo-tow-boats.json' with { type: 'json' };

interface TowBoatRow {
  id: string;
  role: string;
  speedMult: number;
  thrillMult: number;
  thrillCap: number;
  safetyBase: number;
  sharpSafetyPenalty: number;
  upkeepMult: number;
}

describe('견인 보트 데이터', () => {
  const boats = (rawTowBoats as { boats: TowBoatRow[] }).boats;

  it('초기 역할은 작업형과 스포츠형 둘뿐이다', () => {
    expect(boats.map((boat) => boat.role).sort()).toEqual(['sport', 'work']);
    expect(new Set(boats.map((boat) => boat.id)).size).toBe(2);
  });

  it('공통 profile multiplier이며 장비×프리셋 수제 행이 아니다', () => {
    for (const boat of boats) {
      expect(boat).not.toHaveProperty('equipId');
      expect(boat).not.toHaveProperty('presetId');
      expect(boat.speedMult).toBeGreaterThan(0);
      expect(boat.upkeepMult).toBeGreaterThan(0);
    }
  });

  it('작업형은 더 안전하고 저렴하며, 스포츠형은 더 빠르고 스릴 상한이 높다', () => {
    const work = boats.find((boat) => boat.role === 'work')!;
    const sport = boats.find((boat) => boat.role === 'sport')!;
    expect(work.safetyBase).toBeGreaterThan(sport.safetyBase);
    expect(work.sharpSafetyPenalty).toBeLessThan(sport.sharpSafetyPenalty);
    expect(work.upkeepMult).toBeLessThan(sport.upkeepMult);
    expect(sport.speedMult).toBeGreaterThan(work.speedMult);
    expect(sport.thrillMult).toBeGreaterThan(work.thrillMult);
    expect(sport.thrillCap).toBeGreaterThan(work.thrillCap);
  });
});
