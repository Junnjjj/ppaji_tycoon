/**
 * 결정론적 난수 생성기 (mulberry32).
 *
 * 아키텍처 불변식 2: sim/ 은 Math.random() 을 쓰지 않는다.
 * 같은 시드 + 같은 조작 = 항상 같은 결과여야, 헤드리스 밸런싱(npm run sim)과
 * 골든 시나리오 회귀 테스트가 의미를 갖는다.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, maxExclusive) 정수 */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** [min, max] 정수 (양끝 포함) */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** [min, max) 실수 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** 확률 p 로 true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: 빈 배열');
    return items[this.int(items.length)] as T;
  }

  /**
   * 독립적인 하위 스트림을 만든다.
   *
   * 서브시스템마다 forked RNG 를 쓰면, 손님을 하나 더 뽑아도 날씨 시퀀스가
   * 밀리지 않는다. 밸런싱 실험에서 변수를 하나만 바꾸려면 필수.
   */
  fork(salt: number): Rng {
    let h = (this.s ^ Math.imul(salt >>> 0, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return new Rng((h ^ (h >>> 16)) >>> 0);
  }

  /** 세이브용 내부 상태 */
  get state(): number {
    return this.s;
  }

  /**
   * 상태를 제자리에서 덮어쓴다.
   *
   * 복원할 때 Rng 객체를 새로 만들어 갈아끼우면, 이 객체를 이미 참조하고 있는
   * 서브시스템(GuestStore 등)은 옛 객체를 계속 쓰게 되어 복원이 조용히 깨진다.
   */
  setState(state: number): void {
    this.s = state >>> 0;
  }

  static fromState(state: number): Rng {
    const r = new Rng(0);
    r.s = state >>> 0;
    return r;
  }
}
