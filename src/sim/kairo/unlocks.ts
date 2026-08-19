/**
 * 해금 집합 (K41) — **사건으로 열린 시설**의 상태.
 *
 * 해금은 두 갈래다:
 * · 골격 — 등급에서 파생된다 (`requiredGrade(id) <= grade`). 상태가 아니라서 여기 없다
 * · 사건 — 의뢰 보상(지금), 소원·발견·입고(K43). **상태다** — 등급에서 다시 만들 수
 *   없으므로 세이브 v7 에 들어간다
 *
 * 게임의 "지을 수 있나"는 `isUnlocked` 하나로 묻는다 — UI 와 봇이 갈라지면
 * 헤드리스가 다른 게임을 잰다 (봇은 K41 전까지 등급조차 안 보고 있었다 — 실측).
 */
import { requiredGrade } from './progress.js';

export interface UnlockSnapshot {
  granted: string[];
}

export class UnlockStore {
  private readonly granted = new Set<string>();

  /** 골격(등급) 또는 사건으로 열렸나 */
  isUnlocked(defId: string, grade: number): boolean {
    return requiredGrade(defId) <= grade || this.granted.has(defId);
  }

  /** 사건 해금. 이미 열려 있으면 false — 셀레브레이션을 두 번 띄우지 않기 위해서다 */
  grant(defId: string): boolean {
    if (this.granted.has(defId)) return false;
    this.granted.add(defId);
    return true;
  }

  get grantedIds(): readonly string[] {
    return [...this.granted];
  }

  toSnapshot(): UnlockSnapshot {
    return { granted: [...this.granted] };
  }

  static fromSnapshot(s: UnlockSnapshot | undefined): UnlockStore {
    const u = new UnlockStore();
    for (const id of s?.granted ?? []) u.granted.add(id);
    return u;
  }
}
