/**
 * 고정 timestep 시계.
 *
 * 시뮬레이션은 항상 10Hz 로 진행한다. 배속은 "한 프레임에 몇 tick 을 도느냐"이지
 * "tick 이 얼마나 크냐"가 아니다. 이래야 3배속이 물리·경제를 왜곡하지 않는다.
 */

export const TICK_HZ = 10;
export const MS_PER_TICK = 1000 / TICK_HZ;

/** 게임 내 하루 = 몇 tick 인가. 성수기 하루를 실시간 6분으로 잡는다(10Hz × 360초). */
export const TICKS_PER_DAY = 3600;

/** 빠지 영업시간(게임 내 시간). 처리량을 "명/h"로 환산할 때 쓴다. */
export const OPERATING_HOURS = 10;
export const TICKS_PER_HOUR = TICKS_PER_DAY / OPERATING_HOURS;

/** 0 = 일시정지, 1·2·3 = 배속 */
export type SpeedLevel = 0 | 1 | 2 | 3;

/** 프레임 급락(탭 전환 등) 시 따라잡기를 포기하는 한계. 죽음의 나선 방지. */
const MAX_TICKS_PER_PUMP = 60;

export class Clock {
  /** 시뮬레이션이 진행한 총 tick 수. 게임 내 시간의 유일한 출처. */
  tick = 0;
  speed: SpeedLevel = 1;

  private acc = 0;

  /**
   * 실제 경과 시간(ms)을 넣으면 이번 프레임에 실행할 tick 수를 돌려준다.
   * 호출자가 그 횟수만큼 sim.step() 을 부른다.
   */
  pump(realDeltaMs: number): number {
    if (this.speed === 0) {
      this.acc = 0;
      return 0;
    }
    this.acc += realDeltaMs * this.speed;

    let ticks = Math.floor(this.acc / MS_PER_TICK);
    this.acc -= ticks * MS_PER_TICK;

    if (ticks > MAX_TICKS_PER_PUMP) {
      ticks = MAX_TICKS_PER_PUMP;
      this.acc = 0;
    }
    return ticks;
  }

  /** 다음 tick 까지의 진행도 [0,1). 렌더 보간용. */
  get alpha(): number {
    return this.acc / MS_PER_TICK;
  }

  advance(ticks = 1): void {
    this.tick += ticks;
  }
}
