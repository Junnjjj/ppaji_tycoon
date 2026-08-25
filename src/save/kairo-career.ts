/** 판 세이브와 분리된 메타 진행. 현금·시설·직원 같은 런 상태는 절대 들어오지 않는다. */

export const CAREER_PROFILE_VERSION = 2;
export const CAREER_PROFILE_KEY = 'ppaji.kairo.career.v1';

export interface CourseRecord {
  mapId: string;
  scenarioId: string;
  presetId: string;
  equipmentId: string;
  thrill: number;
  week: number;
}

export interface CareerProfileSnapshot {
  version: 2;
  clearedMaps: string[];
  clearedScenarios: string[];
  endings: string[];
  courseRecords: CourseRecord[];
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))].sort()
    : [];

const records = (value: unknown): CourseRecord[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): CourseRecord[] => {
    if (!raw || typeof raw !== 'object') return [];
    const r = raw as Record<string, unknown>;
    if (
      typeof r['mapId'] !== 'string' ||
      typeof r['scenarioId'] !== 'string' ||
      typeof r['presetId'] !== 'string' ||
      typeof r['equipmentId'] !== 'string' ||
      typeof r['thrill'] !== 'number' ||
      typeof r['week'] !== 'number'
    ) return [];
    return [{
      mapId: r['mapId'],
      scenarioId: r['scenarioId'],
      presetId: r['presetId'],
      equipmentId: r['equipmentId'],
      thrill: Math.max(0, Math.round(r['thrill'])),
      week: Math.max(0, Math.round(r['week'])),
    }];
  });
};

export function migrateCareerProfile(raw: unknown): CareerProfileSnapshot {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const version = typeof value['version'] === 'number' ? value['version'] : 1;
  if (version > CAREER_PROFILE_VERSION) throw new Error('더 새로운 커리어 프로필입니다');
  if (version <= 1) {
    return {
      version: 2,
      clearedMaps: strings(value['maps'] ?? value['clearedMaps']),
      clearedScenarios: strings(value['scenarios'] ?? value['clearedScenarios']),
      endings: strings(value['endingIds'] ?? value['endings']),
      courseRecords: records(value['records'] ?? value['courseRecords']),
    };
  }
  return {
    version: 2,
    clearedMaps: strings(value['clearedMaps']),
    clearedScenarios: strings(value['clearedScenarios']),
    endings: strings(value['endings']),
    courseRecords: records(value['courseRecords']),
  };
}

const recordKey = (record: CourseRecord): string =>
  `${record.mapId}\u0000${record.scenarioId}\u0000${record.presetId}\u0000${record.equipmentId}`;

export class CareerProfile {
  private readonly clearedMaps = new Set<string>();
  private readonly clearedScenarios = new Set<string>();
  private readonly endings = new Set<string>();
  private readonly courseRecords = new Map<string, CourseRecord>();

  constructor(snapshot?: CareerProfileSnapshot) {
    if (!snapshot) return;
    for (const id of snapshot.clearedMaps) this.clearedMaps.add(id);
    for (const id of snapshot.clearedScenarios) this.clearedScenarios.add(id);
    for (const id of snapshot.endings) this.endings.add(id);
    for (const record of snapshot.courseRecords) this.recordCourse(record);
  }

  clearMap(mapId: string): boolean {
    const before = this.clearedMaps.size;
    this.clearedMaps.add(mapId);
    return this.clearedMaps.size !== before;
  }

  clearScenario(scenarioId: string): boolean {
    const before = this.clearedScenarios.size;
    this.clearedScenarios.add(scenarioId);
    return this.clearedScenarios.size !== before;
  }

  /** 맵과 시나리오를 동시에 끝낸 승리 경로의 편의 함수. */
  clear(mapId: string, scenarioId: string): boolean {
    const mapChanged = this.clearMap(mapId);
    const scenarioChanged = this.clearScenario(scenarioId);
    return mapChanged || scenarioChanged;
  }

  recordEnding(id: string): boolean {
    const before = this.endings.size;
    this.endings.add(id);
    return this.endings.size !== before;
  }

  hasEnding(id: string): boolean {
    return this.endings.has(id);
  }

  recordCourse(record: CourseRecord): boolean {
    const normalized = { ...record, thrill: Math.round(record.thrill), week: Math.round(record.week) };
    const key = recordKey(normalized);
    const old = this.courseRecords.get(key);
    if (old && old.thrill >= normalized.thrill) return false;
    this.courseRecords.set(key, normalized);
    return true;
  }

  toSnapshot(): CareerProfileSnapshot {
    return {
      version: 2,
      clearedMaps: [...this.clearedMaps].sort(),
      clearedScenarios: [...this.clearedScenarios].sort(),
      endings: [...this.endings].sort(),
      courseRecords: [...this.courseRecords.values()].sort((a, b) => recordKey(a).localeCompare(recordKey(b))),
    };
  }

  static fromSnapshot(raw: unknown): CareerProfile {
    return new CareerProfile(migrateCareerProfile(raw));
  }
}

export function loadCareerProfile(): CareerProfile {
  try {
    const raw = localStorage.getItem(CAREER_PROFILE_KEY);
    return raw === null ? new CareerProfile() : CareerProfile.fromSnapshot(JSON.parse(raw));
  } catch {
    return new CareerProfile();
  }
}

export function saveCareerProfile(profile: CareerProfile): void {
  try {
    localStorage.setItem(CAREER_PROFILE_KEY, JSON.stringify(profile.toSnapshot()));
  } catch {
    /* Safari private mode: 메타 저장 실패가 현재 판을 멈추면 안 된다. */
  }
}
