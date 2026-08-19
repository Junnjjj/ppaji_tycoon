/**
 * 해금 그래프 검사 (K41) — **막다른 길이 없는가.**
 *
 * 의뢰 보상이 시설이 되면서 의존 그래프가 생겼다: 의뢰 조건은 시설을 요구하고,
 * 그 시설이 다른 의뢰의 보상 뒤에 잠겨 있으면 교착이다. 규칙:
 * · 모든 의뢰 조건은 **골격(등급 해금)만으로** 충족 가능해야 한다 — 보상 시설은
 *   조건 충족의 재료가 될 수 없다 (사슬이 얽히면 순서가 강제되고, 순서가 강제되면
 *   언젠가 못 푸는 판이 나온다)
 * · 1등급 골격은 첫 세션(첫 의뢰들 + 시작 킷)을 덮어야 한다
 *
 * 검증기는 데이터를 인자로 받는 순수 함수다 — 음성 대조군이 위반을 주입해
 * 실제로 잡히는지 본다 (새 검사는 위반 주입이 먼저다).
 */
import { describe, expect, it } from 'vitest';
import rawFacilities from '../../data/kairo-facilities.json' with { type: 'json' };
import rawUnlocks from '../../data/kairo-unlocks.json' with { type: 'json' };
import rawQuests from '../../data/kairo-quests.json' with { type: 'json' };

interface FacilityRow {
  id: string;
  need?: string;
}
interface QuestRow {
  id: string;
  condition: { kind: string; need?: string; facility?: string; value?: number };
  reward: { cash: number; facility?: string };
}

const FACILITIES = Object.values(
  (rawFacilities as { facilities: Record<string, FacilityRow> }).facilities,
);
const SKELETON = (rawUnlocks as { facilityGrade: Record<string, number> }).facilityGrade;
const QUESTS = (rawQuests as { quests: QuestRow[] }).quests;

/** 시작 킷이 놓는 시설 — startkit.ts 와 같은 목록 (여기 어긋나면 킷이 잠긴 시설을 준다) */
const START_KIT = ['ticket', 'float_deck', 'pingpong', 'pyeongsang_row'];

function validate(
  skeleton: Record<string, number>,
  quests: readonly QuestRow[],
): string[] {
  const issues: string[] = [];
  const needOf = new Map(FACILITIES.map((f) => [f.id, f.need]));
  const rewards = quests
    .map((q) => q.reward.facility)
    .filter((f): f is string => f !== undefined);

  // 73종 = 골격 + 보상, 겹침·누락 0
  const all = new Set(FACILITIES.map((f) => f.id));
  const covered = new Set([...Object.keys(skeleton), ...rewards]);
  for (const id of all) if (!covered.has(id)) issues.push(`어디서도 안 열림: ${id}`);
  for (const id of covered) if (!all.has(id)) issues.push(`없는 시설: ${id}`);
  for (const r of rewards) {
    if (r in skeleton) issues.push(`골격과 보상 양쪽에: ${r}`);
  }
  if (new Set(rewards).size !== rewards.length) issues.push('보상 시설 중복');

  // 의뢰 조건은 골격만으로 충족 가능해야 한다
  const skeletonByNeed = new Map<string, number>();
  for (const id of Object.keys(skeleton)) {
    const n = needOf.get(id);
    if (n !== undefined) skeletonByNeed.set(n, (skeletonByNeed.get(n) ?? 0) + 1);
  }
  for (const q of quests) {
    const c = q.condition;
    if (c.kind === 'needSupply' && c.need !== undefined) {
      const have = skeletonByNeed.get(c.need) ?? 0;
      if (have < (c.value ?? 1)) {
        issues.push(`교착: ${q.id} 가 ${c.need} ${c.value}개를 원하는데 골격에 ${have}개`);
      }
    }
    if (c.kind === 'facilityCount' && c.facility !== undefined && !(c.facility in skeleton)) {
      issues.push(`교착: ${q.id} 의 대상 ${c.facility} 이 골격에 없다`);
    }
  }

  // 1등급 골격이 첫 세션을 덮는다 — 첫 의뢰(먹거리 2·위생 3·스릴 1)와 시작 킷
  const g1ByNeed = new Map<string, number>();
  for (const [id, g] of Object.entries(skeleton)) {
    if (g !== 1) continue;
    const n = needOf.get(id);
    if (n !== undefined) g1ByNeed.set(n, (g1ByNeed.get(n) ?? 0) + 1);
  }
  for (const [need, min] of [
    ['food', 2],
    ['hygiene', 3],
    ['thrill', 1],
  ] as const) {
    if ((g1ByNeed.get(need) ?? 0) < min) {
      issues.push(`1등급 골격에 ${need} 가 ${min}개 미만 — 첫 의뢰가 막힌다`);
    }
  }
  for (const id of START_KIT) {
    if (skeleton[id] !== 1) issues.push(`시작 킷 시설 ${id} 이 1등급 골격이 아니다`);
  }
  return issues;
}

describe('해금 그래프 — 막다른 길이 없다 (K41)', () => {
  it('실데이터에 교착·누락·중복이 없다', () => {
    expect(validate(SKELETON, QUESTS)).toEqual([]);
  });

  it('음성 대조군 — 위반을 주입하면 잡힌다', () => {
    // ① 조건 대상 시설을 보상 뒤로 숨긴다 → 교착
    const s1 = { ...SKELETON };
    delete s1['float_deck'];
    expect(validate(s1, QUESTS).some((x) => x.includes('float_deck'))).toBe(true);

    // ② 1등급 위생을 비운다 → 첫 의뢰가 막힌다
    const s2 = Object.fromEntries(
      Object.entries(SKELETON).map(([id, g]) => [
        id,
        FACILITIES.find((f) => f.id === id)?.need === 'hygiene' && g === 1 ? 2 : g,
      ]),
    );
    expect(validate(s2, QUESTS).some((x) => x.includes('hygiene'))).toBe(true);

    // ③ 보상을 골격에도 넣는다 → 이중 해금
    const s3 = { ...SKELETON, sikhye: 1 };
    expect(validate(s3, QUESTS).some((x) => x.includes('양쪽'))).toBe(true);
  });
});
