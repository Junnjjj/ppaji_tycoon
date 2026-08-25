import { describe, expect, it } from 'vitest';
import {
  ENDING_CERT_THRESHOLD,
  ENDING_GRADE_THRESHOLD,
  MANAGEMENT_GROUPS,
  OnboardingStore,
  endingMilestone,
  managementWarnings,
  todayRecommendation,
} from './meta.js';

describe('Phase 7 경영 IA', () => {
  it('운영·성장·기록을 요구된 순서와 항목으로만 묶는다', () => {
    expect(MANAGEMENT_GROUPS.map((group) => [group.id, group.items])).toEqual([
      ['operations', ['price', 'staff', 'course']],
      ['growth', ['exam', 'regular', 'quests', 'codex']],
      ['records', ['report', 'view', 'certs', 'ending']],
    ]);
  });

  it('오늘의 추천은 정확히 하나이고 경고는 별도 보조 목록이다', () => {
    const state = {
      onboardingStep: 'drag-route' as const,
      reportUnread: true,
      staffShortages: 2,
      risk: 'danger' as const,
      endingReady: false,
      examReady: true,
      regularReady: true,
    };
    expect(todayRecommendation(state)).toMatchObject({ action: 'course', source: 'onboarding' });
    expect(managementWarnings(state)).toEqual([
      '위험도가 위험입니다',
      '직원 2개 역할이 부족합니다',
      '새 결산이 도착했습니다',
    ]);
  });
});

describe('Phase 7 실행형 온보딩', () => {
  it('코스 열기→드래그→시험 운행→적용→먹거리 건설 순으로만 전진한다', () => {
    const onboarding = new OnboardingStore();
    expect(onboarding.step).toBe('open-course');
    expect(onboarding.observe('trial-started')).toBe(false);

    for (const [event, step] of [
      ['course-opened', 'drag-route'],
      ['route-dragged', 'test-run'],
      ['trial-started', 'apply-course'],
      ['course-applied', 'build-food'],
      ['food-built', 'done'],
    ] as const) {
      expect(onboarding.observe(event)).toBe(true);
      expect(onboarding.step).toBe(step);
    }
  });

  it('안내는 자유 플레이를 막는 게이트가 아니며 저장에서 이어진다', () => {
    const onboarding = new OnboardingStore();
    onboarding.observe('course-opened');
    onboarding.observe('route-dragged');
    expect(onboarding.blocks('build-anything')).toBe(false);
    expect(OnboardingStore.fromSnapshot(onboarding.toSnapshot()).step).toBe('test-run');
  });
});

describe('Phase 7 첫 엔딩 문턱', () => {
  it('5등급·인증 6종 이상·시나리오 비실패가 모두 필요하다', () => {
    expect(ENDING_GRADE_THRESHOLD).toBe(5);
    expect(ENDING_CERT_THRESHOLD).toBe(6);
    expect(endingMilestone({ grade: 5, certs: 6, scenario: 'playing' }).ready).toBe(true);
    expect(endingMilestone({ grade: 4, certs: 12, scenario: 'won' }).ready).toBe(false);
    expect(endingMilestone({ grade: 5, certs: 5, scenario: 'won' }).ready).toBe(false);
    expect(endingMilestone({ grade: 5, certs: 12, scenario: 'lost' }).ready).toBe(false);
  });
});
