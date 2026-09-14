import { describe, expect, it } from 'vitest';
import {
  ENDING_CERT_THRESHOLD,
  ENDING_GRADE_THRESHOLD,
  MANAGEMENT_GROUPS,
  OnboardingStore,
  endingMilestone,
  managementWarnings,
  migrateOnboardingSnapshot,
  observeOnboardingBuild,
  observeOnboardingMenu,
  todayRecommendation,
} from './meta.js';
import { menuFacilityOperability } from './menu.js';
import { facilityDef } from './placement.js';
import { requiredGrade } from './progress.js';

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

  it('첫 온보딩 Today는 상속 코스 시험 운행 문구와 production 코스 이동을 함께 보존한다', () => {
    expect(todayRecommendation({
      onboardingStep: 'open-course',
      reportUnread: false,
      staffShortages: 0,
      risk: 'safe',
      endingReady: false,
      examReady: false,
      regularReady: false,
    })).toMatchObject({
      action: 'course',
      label: '물려받은 코스 시험 운행',
      detail: '물려받은 코스를 열어 보세요',
      source: 'onboarding',
    });
  });
});

describe('Phase 7 실행형 온보딩', () => {
  it('먹거리 안내는 1등급 매점을 가리키고 craft 메뉴 시설 완공만 다음 단계로 보낸다', () => {
    const onboarding = new OnboardingStore('build-food');
    expect(requiredGrade('shop')).toBe(1);
    expect(facilityDef('shop')?.menuMode).toBe('craft');
    expect(todayRecommendation({
      onboardingStep: 'build-food',
      reportUnread: false,
      staffShortages: 0,
      risk: 'safe',
      endingReady: false,
      examReady: false,
      regularReady: false,
    }).detail).toContain('매점');
    expect(todayRecommendation({
      onboardingStep: 'build-food',
      reportUnread: false,
      staffShortages: 0,
      risk: 'safe',
      endingReady: false,
      examReady: false,
      regularReady: false,
    }).detail).not.toContain('카페');

    expect(observeOnboardingBuild(onboarding, facilityDef('snackbar'))).toBe(false);
    expect(observeOnboardingBuild(onboarding, facilityDef('vending_out'))).toBe(false);
    expect(onboarding.step).toBe('build-food');
    expect(observeOnboardingBuild(onboarding, facilityDef('shop'))).toBe(true);
    expect(onboarding.step).toBe('equip-menu');
  });

  it('건설·메뉴 진행은 need 분류가 아니라 같은 craft/operability 경계로 shop과 cafe를 받는다', () => {
    for (const [facilityId, menuId] of [
      ['shop', 'shop_can_drink'],
      ['cafe', 'cafe_americano'],
    ] as const) {
      const def = facilityDef(facilityId);
      const build = new OnboardingStore('build-food');
      expect(observeOnboardingBuild(build, def), facilityId).toBe(true);
      expect(build.step, facilityId).toBe('equip-menu');

      const equip = new OnboardingStore('equip-menu');
      const operability = menuFacilityOperability(facilityId, def?.menuMode, [menuId]);
      expect(observeOnboardingMenu(equip, def, operability), facilityId).toBe(true);
      expect(equip.step, facilityId).toBe('regular-purchase');
    }
  });

  it('고정 판매 snackbar와 vending은 operable이어도 craft 온보딩을 전진시키지 않는다', () => {
    for (const facilityId of ['snackbar', 'vending_out'] as const) {
      const def = facilityDef(facilityId);
      const build = new OnboardingStore('build-food');
      expect(observeOnboardingBuild(build, def), facilityId).toBe(false);
      expect(build.step, facilityId).toBe('build-food');

      const equip = new OnboardingStore('equip-menu');
      const operability = menuFacilityOperability(facilityId, def?.menuMode, []);
      expect(operability.operable, facilityId).toBe(true);
      expect(observeOnboardingMenu(equip, def, operability), facilityId).toBe(false);
      expect(equip.step, facilityId).toBe('equip-menu');
    }
  });

  it('먹거리 건설 뒤 메뉴 확인→이름 있는 단골 구매→첫 결산 열기까지 순서대로 전진한다', () => {
    const onboarding = new OnboardingStore();
    expect(onboarding.step).toBe('open-course');
    expect(onboarding.observe('trial-started')).toBe(false);

    for (const [event, step] of [
      ['course-opened', 'drag-route'],
      ['route-dragged', 'test-run'],
      ['trial-started', 'apply-course'],
      ['course-applied', 'build-food'],
      ['food-built', 'equip-menu'],
      ['menu-equipped', 'regular-purchase'],
      ['regular-purchased', 'open-report'],
      ['report-opened', 'done'],
    ] as const) {
      expect(onboarding.observe(event)).toBe(true);
      expect(onboarding.step).toBe(step);
    }
    expect(onboarding.toSnapshot()).toEqual({ version: 2, step: 'done' });
  });

  it('안내는 자유 플레이를 막지 않고 순서 밖 구매·결산으로 중간 단계를 건너뛰지 않는다', () => {
    const onboarding = new OnboardingStore();
    onboarding.observe('course-opened');
    onboarding.observe('route-dragged');
    expect(onboarding.observe('regular-purchased')).toBe(false);
    expect(onboarding.observe('report-opened')).toBe(false);
    expect(onboarding.blocks('build-anything')).toBe(false);
    expect(OnboardingStore.fromSnapshot(onboarding.toSnapshot()).step).toBe('test-run');
  });

  it('v1 완료자는 완료를 보존하고 v1 미완료자는 대응 v2 단계에서 이어진다', () => {
    expect(migrateOnboardingSnapshot({ version: 1, step: 'done' })).toEqual({
      version: 2,
      step: 'done',
    });
    expect(migrateOnboardingSnapshot({ version: 1, step: 'build-food' })).toEqual({
      version: 2,
      step: 'build-food',
    });
    expect(migrateOnboardingSnapshot({ version: 1, step: 'apply-course' })).toEqual({
      version: 2,
      step: 'apply-course',
    });
  });

  it('확장 단계의 Today는 메뉴 확인→단골 구매→결산의 실제 경영 목적지를 가리킨다', () => {
    const state = (step: 'equip-menu' | 'regular-purchase' | 'open-report') => ({
      onboardingStep: step,
      reportUnread: false,
      staffShortages: 0,
      risk: 'safe' as const,
      endingReady: false,
      examReady: false,
      regularReady: true,
    });
    expect(todayRecommendation(state('equip-menu'))).toMatchObject({
      action: 'regular',
      label: '기본 메뉴 확인',
    });
    expect(todayRecommendation(state('regular-purchase'))).toMatchObject({
      action: 'regular',
      label: expect.stringContaining('구매'),
    });
    expect(todayRecommendation(state('open-report'))).toMatchObject({
      action: 'report',
      label: '첫 결산 열기',
    });
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
