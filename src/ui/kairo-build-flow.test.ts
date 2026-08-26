import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BuildSession, type BuildSessionHost } from './kairo-build-flow.js';

/**
 * 건설 상태 머신 — **1회 설치가 기본**이다 (UI v3 Task 5).
 *
 * ⚠ 여기서 재는 것은 규칙이지 화면이 아니다. "확정 뒤 지도를 눌러도 돈이 안 나간다"를
 * 실제 픽셀로 재는 것은 `tools/verify-kairo.ts` 의 one-shot 절이다 — 단위 검사에서
 * DOM 을 흉내 내면 "규칙은 맞는데 화면은 그대로"를 놓친다 (저장소 규칙: 「검사가 조용히
 * 통과」). 그래서 아래 마지막 describe 가 **main·HUD·하네스 배선까지** 대조한다.
 */

const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const hudSource = readFileSync(new URL('./kairo-hud.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const harnessSource = readFileSync(new URL('../../tools/verify-kairo.ts', import.meta.url), 'utf8');

/**
 * 게임을 아주 얇게 흉내 낸 판 — 세션이 진짜 판에서 하는 일을 그대로 시킨다.
 *
 * · `tap` 은 `main.tapTile` 처럼 **붓이 없으면 아무 일도 안 한다**
 * · `confirm` 은 확정 바처럼 **콜백이 살아 있을 때만** 돈을 쓴다
 *   (`closeAim` 이 콜백을 지운다 — `hud.hideConfirm()` 과 같은 뜻)
 */
function makeBoard(): {
  session: BuildSession;
  tap: (i: number, j: number) => void;
  confirm: () => void;
  spends: number[];
  labels: (string | null)[];
  receipts: string[];
  effects: string[];
} {
  const spends: number[] = [];
  const labels: (string | null)[] = [];
  const receipts: string[] = [];
  const effects: string[] = [];
  /** 확정 바의 콜백 — 조준이 살아 있을 때만 존재한다 */
  let onConfirm: (() => void) | null = null;

  const price = (brush: string): number => (brush === 'erase' ? -5 : 10);

  const host: BuildSessionHost = {
    label: (text) => {
      labels.push(text);
      effects.push(`label:${text ?? '-'}`);
    },
    openAim: () => {
      effects.push('openAim');
      session.aimTo(5, 5);
      onConfirm = arm;
    },
    reaim: () => {
      effects.push('reaim');
      onConfirm = arm;
    },
    closeAim: () => {
      effects.push('closeAim');
      onConfirm = null;
    },
    receipt: (text) => {
      receipts.push(text);
      effects.push(`receipt:${text}`);
    },
  };

  const arm = (): void => {
    const brush = session.brush;
    if (brush === null) throw new Error('붓 없이 확정이 살아 있다');
    spends.push(price(brush));
    session.finish(`${brush} 완료`);
  };

  const session = new BuildSession(host);

  return {
    session,
    spends,
    labels,
    receipts,
    effects,
    tap: (i, j) => {
      if (!session.usesAim) return; // main.tapTile 의 `if (!brush)` 조기 반환과 같은 문
      session.aimTo(i, j);
    },
    confirm: () => onConfirm?.(),
  };
}

/** 세션이 완전히 비었나 — 원자적 종료의 정의를 한 곳에만 적는다 */
function expectIdle(session: BuildSession): void {
  expect(session.mode).toBe('idle');
  expect(session.brush).toBeNull();
  expect(session.facilityId).toBe('');
  expect(session.aim).toBeNull();
  expect(session.move).toBeNull();
  expect(session.repeat).toBe(false);
  expect(session.usesAim).toBe(false);
}

describe('1회 설치가 기본이다', () => {
  it('시설 확정 한 번이 붓·조준·확정 콜백을 원자적으로 지운다', () => {
    const b = makeBoard();
    b.session.pick('facility', '화장실', { facilityId: 'toilet' });
    expect(b.session.mode).toBe('aiming');
    expect(b.session.facilityId).toBe('toilet');
    b.confirm();
    expect(b.spends).toEqual([10]);
    expectIdle(b.session);
    // 붓 라벨은 마지막에 반드시 null 로 돌아온다 — 티커에 유령 붓이 남으면 안 된다
    expect(b.labels.at(-1)).toBeNull();
    // 조준 해제는 정확히 한 번, 그리고 영수증 **뒤**다
    expect(b.effects.filter((e) => e === 'closeAim')).toHaveLength(1);
    expect(b.effects.indexOf('receipt:facility 완료')).toBeLessThan(b.effects.lastIndexOf('closeAim'));
  });

  it('바닥·건물 블록도 확정 한 번으로 끝난다 (연속 배치가 기본이 아니다)', () => {
    const b = makeBoard();
    b.session.pick('path_stone@3', '석재 보도 3×3');
    b.confirm();
    expect(b.spends).toEqual([10]);
    expectIdle(b.session);
    expect(b.effects).not.toContain('reaim');
  });

  it('철거도 확정 한 번으로 끝난다 — 연속 철거는 기본이 아니다', () => {
    const b = makeBoard();
    b.session.pick('erase', '철거');
    b.confirm();
    expect(b.spends).toEqual([-5]);
    expectIdle(b.session);
  });

  it('이동은 대상 지정 → 조준 → 확정 뒤 대상까지 놓는다', () => {
    const b = makeBoard();
    b.session.pick('move', '이동');
    // 1단계는 조준이 아니다 — 옮길 시설을 지목하는 탭이다
    expect(b.session.usesAim).toBe(false);
    expect(b.session.mode).toBe('selecting');
    b.session.beginMove({ handle: 7, defId: 'ping_pong', i: 3, j: 4, facing: 0 }, '이동: 탁구대');
    expect(b.session.usesAim).toBe(true);
    expect(b.session.move?.handle).toBe(7);
    b.confirm();
    expect(b.spends).toEqual([10]);
    expectIdle(b.session);
  });

  it('확정 뒤 지도를 다시 눌러도 배치가 시작되지 않고 돈도 안 나간다', () => {
    const b = makeBoard();
    b.session.pick('facility', '화장실', { facilityId: 'toilet' });
    b.confirm();
    b.tap(9, 9);
    b.confirm();
    expect(b.spends).toEqual([10]);
    expect(b.session.aim).toBeNull();
    expect(b.receipts).toHaveLength(1);
  });
});

describe('취소와 화면 전환은 세션을 확실히 끝낸다', () => {
  it('취소는 붓까지 놓고 조준을 내린다 — 남은 핸들이 없다', () => {
    const b = makeBoard();
    b.session.pick('facility', '화장실', { facilityId: 'toilet' });
    b.session.cancel();
    expectIdle(b.session);
    b.confirm(); // 확정 콜백이 지워졌으므로 아무 일도 없다
    expect(b.spends).toEqual([]);
    expect(b.receipts).toEqual([]);
  });

  it('메뉴·패널·코스를 열면 세션이 통째로 끝난다', () => {
    const b = makeBoard();
    b.session.pick('path_stone@3', '석재 보도 3×3');
    b.session.setRepeat(true);
    b.session.abandon();
    expectIdle(b.session);
    b.confirm();
    expect(b.spends).toEqual([]);
  });

  it('탭 붓(출입구)도 화면 전환에서 같이 놓인다', () => {
    const b = makeBoard();
    b.session.pick('door', '출입구');
    expect(b.session.mode).toBe('selecting');
    expect(b.effects).not.toContain('openAim'); // 출입구는 조준을 안 쓴다
    b.session.abandon();
    expectIdle(b.session);
  });

  it('붓을 다시 고르면 이전 세션이 먼저 끝난다 — 옛 조준이 남지 않는다', () => {
    const b = makeBoard();
    b.session.pick('facility', '화장실', { facilityId: 'toilet' });
    b.session.setRepeat(true);
    b.session.pick('erase', '철거');
    expect(b.session.brush).toBe('erase');
    expect(b.session.facilityId).toBe('');
    // 연속 설치는 세션마다 다시 고른다 — 붓을 바꿔도 켜진 채로 따라오면 안 된다
    expect(b.session.repeat).toBe(false);
  });

  it('idle 에서 abandon 을 불러도 붓 라벨을 다시 지우지 않는다 (무해한 no-op)', () => {
    const b = makeBoard();
    b.session.abandon();
    expect(b.effects).toEqual([]);
    expectIdle(b.session);
  });
});

describe('연속 설치는 사용자가 켤 때만 켜진다', () => {
  it('기본값은 꺼짐이고 모드 라벨이 그것을 말한다', () => {
    const b = makeBoard();
    b.session.pick('facility', '화장실', { facilityId: 'toilet' });
    expect(b.session.repeat).toBe(false);
    expect(b.session.mode).toBe('aiming');
    expect(b.session.modeLabel).toBe('배치 중 · 화장실');
    expect(b.session.repeatLabel).toBe('연속 설치 끔');
  });

  it('켜면 확정 뒤에도 붓과 조준이 남고 두 번째 설치가 정확히 한 번 더 나간다', () => {
    const b = makeBoard();
    b.session.pick('facility', '화장실', { facilityId: 'toilet' });
    b.session.setRepeat(true);
    expect(b.session.mode).toBe('repeating');
    expect(b.session.modeLabel).toBe('연속 설치 중 · 화장실');
    expect(b.session.repeatLabel).toBe('연속 설치 켬');
    b.confirm();
    // 붓·조준이 살아 있다
    expect(b.session.brush).toBe('facility');
    expect(b.session.aim).not.toBeNull();
    expect(b.effects).toContain('reaim');
    b.tap(6, 6);
    b.confirm();
    expect(b.spends).toEqual([10, 10]); // 정확히 두 번
    expect(b.receipts).toHaveLength(2);
    // 끄면 다음 확정에서 끝난다
    b.session.setRepeat(false);
    b.confirm();
    expect(b.spends).toEqual([10, 10, 10]);
    expectIdle(b.session);
  });

  it('연속 설치를 켠 채로도 라벨은 항상 글자다 — 아이콘만 남기지 않는다', () => {
    const b = makeBoard();
    b.session.pick('path_stone@3', '석재 보도 3×3');
    b.session.setRepeat(true);
    expect(b.labels.at(-1)).toBe('연속 설치 중 · 석재 보도 3×3');
  });

  it('이동은 연속 설치를 못 켠다 — 옮길 시설을 다시 고르는 것부터가 다음 이동이다', () => {
    const b = makeBoard();
    b.session.pick('move', '이동');
    b.session.beginMove({ handle: 7, defId: 'ping_pong', i: 3, j: 4, facing: 0 }, '이동: 탁구대');
    expect(b.session.canRepeat).toBe(false);
    b.session.setRepeat(true);
    expect(b.session.repeat).toBe(false);
    b.confirm();
    expectIdle(b.session);
  });
});

describe('조준 좌표는 세션이 소유한다', () => {
  it('탭은 자리를 옮기되 회전은 유지한다', () => {
    const b = makeBoard();
    b.session.pick('facility', '화장실', { facilityId: 'toilet' });
    b.session.setAim(2, 3, 1);
    b.session.aimTo(8, 9);
    expect(b.session.aim).toEqual({ i: 8, j: 9, facing: 1 });
  });

  it('조준이 없으면 회전도 없다 — 유령 상태를 만들지 않는다', () => {
    const b = makeBoard();
    b.session.pick('door', '출입구');
    b.session.aimTo(1, 1);
    expect(b.session.aim).toBeNull();
  });
});

describe('한 경계로 통합됐다 — 정리 코드가 복제되지 않는다', () => {
  it('main 이 성공·취소·전환을 세션 경계로만 끝낸다', () => {
    // 성공은 `finish`, 취소는 `cancel`, 화면 전환은 `abandon` 하나뿐이다
    expect(mainSource).toContain('build.finish(');
    expect(mainSource).toContain('build.cancel()');
    expect(mainSource).toContain('build.abandon()');
    // 예전의 흩어진 정리 — `moveSel = null` · `aim = null` 지역 변수는 사라졌다
    expect(mainSource).not.toMatch(/^\s*let brush: string \| null = null;/m);
    expect(mainSource).not.toMatch(/^\s*moveSel = null;/m);
    expect(mainSource).not.toMatch(/^\s*aim = null;/m);
  });

  it('패널·시트·코스가 열리면 세션을 끝낸다', () => {
    expect(mainSource).toMatch(/panelHost\.onChange\(\(open\) => \{[^}]*build\.abandon\(\)/s);
  });

  it('바닥·철거의 옛 "연속 배치 기본" 꼬리가 사라졌다', () => {
    /*
     * 옛 계약: 바닥·철거는 확정 직후 `refreshAim()` 으로 바를 되살려 **기본이 연속**
     * 이었다. 지금 `refreshAim` 은 실패 복구와 세션의 `reaim` 에만 남는다.
     */
    expect(mainSource).not.toContain('연속 배치 — 바를 닫지 않는다');
    expect(mainSource).not.toContain('연속 철거 — 붓이 그대로니');
    expect(mainSource).not.toContain('확정 후 바를 닫지 않는다');
  });
});

describe('확정 바가 연속 설치를 글자로 보여 준다', () => {
  it('HUD 가 이름 있는 토글을 만든다 — 기본 꺼짐', () => {
    expect(hudSource).toContain("id = 'kairo-place-repeat'");
    expect(hudSource).toMatch(/aria-pressed/);
    expect(hudSource).toMatch(/repeat\?:\s*RepeatToggle/);
  });

  it('토글은 확정·취소와 같은 줄에 넣지 않는다 — 377px 에 44px 넷은 안 들어간다', () => {
    // K47-③ 실측. 모드 줄이 따로 있고 그 줄이 토글을 갖는다.
    expect(hudSource).toContain('kconfirm-mode');
    expect(cssSource).toMatch(/\.kconfirm-mode\s*\{/);
  });

  it('색은 style.css 가 소유한다 — 토글에 하드코딩 hex 가 없다', () => {
    const block = cssSource.slice(cssSource.indexOf('.kconfirm-mode'), cssSource.indexOf('.kconfirm-mode') + 1200);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('연속 설치 영수증은 조작 바를 덮지 않고 지도 위에 뜬다', () => {
    expect(cssSource).toMatch(/\[data-ui-surface='aiming'\]\s+\.ktoast\s*\{[^}]*top:/s);
    expect(cssSource).toMatch(/\[data-ui-surface='aiming'\]\s+\.ktoast\s*\{[^}]*bottom:\s*auto/s);
  });

  it('확정은 진한 면 위 흰 글씨이고 카드 정보는 13px 아래로 내려가지 않는다', () => {
    const confirm = cssSource.slice(
      cssSource.indexOf('.kconfirm .place-btn.confirm'),
      cssSource.indexOf('.kconfirm .place-btn.confirm') + 300,
    );
    expect(confirm).toContain('color: var(--text-on-solid)');
    expect(confirm).toContain('text-shadow: var(--sk-emboss-on-solid)');
    expect(cssSource).toMatch(/\.kconfirm-name\s*\{[^}]*font-size:\s*15px/s);
    expect(cssSource).toMatch(/\.kconfirm-cost\s*\{[^}]*font-size:\s*13px/s);
    expect(cssSource).toMatch(/\.kconfirm-check\s*\{[^}]*font-size:\s*13px/s);
    expect(cssSource).toMatch(/\.kconfirm \.place-btn\s*\{[^}]*font-size:\s*16px/s);
  });

  it('조준 중에는 홈 입력층이 화면을 안 가진다 (mode ownership)', () => {
    expect(hudSource).toMatch(/setGoalSurface\('aiming'\)/);
  });
});

describe('브라우저 게이트가 옛 연속 배치 기대를 버렸다', () => {
  it('"확정 뒤에도 바가 남는다"는 계약이 하네스에서 사라졌다', () => {
    expect(harnessSource).not.toContain('바닥·건물은 확정 뒤에도 바가 남는다');
    expect(harnessSource).not.toContain('groundBarAfter === true');
  });

  it('one-shot 을 하네스가 직접 잰다 — 붓·바·현금 셋 다', () => {
    expect(harnessSource).toContain('1회 설치가 기본이다');
    expect(harnessSource).toContain('oneShotCashAfterTap');
  });

  it('연속 설치를 켠 경우만 두 번 나간다 — 하네스가 두 번의 지출을 센다', () => {
    expect(harnessSource).toContain('kairo-place-repeat');
    expect(harnessSource).toContain('연속 설치를 켠 경우에만 두 번째 배치가 일어난다');
  });
});
