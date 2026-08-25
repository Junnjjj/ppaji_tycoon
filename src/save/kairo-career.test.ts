import { describe, expect, it } from 'vitest';
import {
  CAREER_PROFILE_VERSION,
  CareerProfile,
  migrateCareerProfile,
} from './kairo-career.js';

describe('Phase 7 별도 커리어 프로필', () => {
  it('판 세이브와 섞지 않고 완료 맵·시나리오·엔딩·코스 기록만 저장한다', () => {
    const profile = new CareerProfile();
    profile.clear('bukhan', 'inherited');
    profile.recordEnding('bukhan:inherited:first');
    profile.recordCourse({
      mapId: 'bukhan',
      scenarioId: 'inherited',
      presetId: 'circle',
      equipmentId: 'banana',
      thrill: 81,
      week: 38,
    });

    const snapshot = profile.toSnapshot();
    expect(Object.keys(snapshot).sort()).toEqual([
      'clearedMaps',
      'clearedScenarios',
      'courseRecords',
      'endings',
      'version',
    ]);
    expect(snapshot.clearedMaps).toEqual(['bukhan']);
    expect(snapshot.clearedScenarios).toEqual(['inherited']);
    expect(snapshot.endings).toEqual(['bukhan:inherited:first']);
    expect(snapshot.courseRecords[0]?.thrill).toBe(81);
  });

  it('같은 맵·시나리오·프리셋·장비 기록은 최고 스릴만 남긴다', () => {
    const profile = new CareerProfile();
    const base = {
      mapId: 'valley',
      scenarioId: 'rush',
      presetId: 'slalom',
      equipmentId: 'wakeboard',
    };
    profile.recordCourse({ ...base, thrill: 72, week: 20 });
    profile.recordCourse({ ...base, thrill: 68, week: 21 });
    profile.recordCourse({ ...base, thrill: 90, week: 25 });
    expect(profile.toSnapshot().courseRecords).toEqual([{ ...base, thrill: 90, week: 25 }]);
  });

  it('맵 엔딩과 시나리오 승리를 따로 기록해 진행 중 시나리오를 클리어로 오인하지 않는다', () => {
    const profile = new CareerProfile();
    expect(profile.clearMap('bukhan')).toBe(true);
    expect(profile.toSnapshot().clearedMaps).toEqual(['bukhan']);
    expect(profile.toSnapshot().clearedScenarios).toEqual([]);
    expect(profile.clearScenario('inherited')).toBe(true);
    expect(profile.toSnapshot().clearedScenarios).toEqual(['inherited']);
  });

  it('v1 이름을 v2의 제한된 필드로 마이그레이션하고 잡다한 런 상태는 버린다', () => {
    const migrated = migrateCareerProfile({
      version: 1,
      maps: ['bukhan'],
      scenarios: ['inherited'],
      endingIds: ['first'],
      records: [],
      cash: 99_000_000,
      facilities: ['shop'],
    });
    expect(migrated.version).toBe(CAREER_PROFILE_VERSION);
    expect(migrated).not.toHaveProperty('cash');
    expect(migrated).not.toHaveProperty('facilities');
    expect(migrated.clearedMaps).toEqual(['bukhan']);
  });
});
