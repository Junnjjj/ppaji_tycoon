/**
 * **카이로식 삽화 사건 상자** — 사건 표면 하나로 통일한다.
 *
 * ## 왜 (레퍼런스 실측 · 사용자 요구)
 *
 * 카이로 계열은 사건을 언제나 같은 모양으로 낸다: **큰 장면 무대**(배경 + 인물/아이콘) 위에
 * 제목과 본문이 얹히고, **선택지는 아래쪽 버튼 줄**이다. 우리 화면은 그 모양이 세 벌이었다 —
 * 해금 축하(`.kunlock`: 제목·썸네일·이름·부제·버튼), 주간 카드(`.kcard-dialog`:
 * 카운트·시각 슬롯·제목·설명·선택지), 그리고 새 게임의 **브라우저 네이티브 `confirm`**
 * (게임 밖 표면이라 크림 팔레트·44px·한국어 계약이 하나도 안 걸린다).
 *
 * 셋을 한 상자로 모으면 사건이 **같은 문법**으로 읽히고, 나중에 실제 배경 아트가 들어올 때
 * 붙일 자리가 **한 곳**이 된다.
 *
 * ## 배경 슬롯은 **상태를 명시한다** — 지금은 그림이 없다
 *
 * 이 머신에는 사건 배경 아트가 없고 이번 작업은 에셋을 만들지 않는다. 그래서 무대는
 * `data-stage-state` 로 자기 상태를 **말한다**:
 *
 * | 값 | 뜻 |
 * |---|---|
 * | `art` | 실제 그림이 얹혔다 (`kairo-event-art.ts` 가 합성한 캔버스 등) |
 * | `placeholder` | 그림이 아직 없다 — **절차적 CSS 무대**가 대신 선다 |
 *
 * 자리표시는 "빈 상자"가 아니다. `--sk-*` 토큰만으로 하늘 띠 · 지면 띠 · 소품 실루엣 ·
 * 비네트를 겹쳐 **무대처럼** 보이게 한다 (색은 전부 `style.css` 소유 — 여기 hex 0).
 * 나중에 그림이 오면 `art` 상태만 켜면 되고 레이아웃·문구·터치 계약은 안 바뀐다.
 *
 * ## 채널 계약은 그대로다 (K47-①)
 *
 * 이 상자는 **표면**이지 채널이 아니다. 축하는 여전히 모달 하나, 뉴스는 티커, 내 행동의
 * 대답은 토스트다. 한 사건을 두 채널에 넣지 않는다 — 상자를 공유한다고 채널이 늘지 않는다.
 *
 * ## 규칙
 *
 * · 새 버튼 클래스를 만들지 않는다 — 선택지는 `.kbtn`/`.primary`/`.danger` 다.
 * · 표면 셋(시트·전면·떠 있는 것)을 안 늘린다 — 상자는 `.kover.dialog` **안**에 산다.
 * · 구성은 순수 함수(`eventShellPlan`)가 정하고 DOM 조립은 한 곳(`renderEventShell`)이다.
 * · 선택지 라벨에 **효과를 다시 적지 않는다** — 값은 `meta` 슬롯이 낸다.
 */
import { el } from './dom.js';

/** 사건의 성격 — 무대 자리표시의 분위기와 배지 문구를 가른다 */
export type EventShellMood = 'celebrate' | 'quest' | 'decision' | 'alert';

export type EventStageState = 'art' | 'placeholder';

export interface EventShellChoice {
  id: string;
  label: string;
  /** 라벨 옆 작은 값 — 비용·지속 주수처럼 **숫자**. 라벨에 섞지 않는다 */
  meta?: string;
  /** 주버튼(첫 선택지)인가 — 없으면 첫 번째가 주버튼이다 */
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** 못 고르는 이유 — 회색으로 죽이는 대신 말한다 (K48 규칙) */
  blockedReason?: string;
  run: () => void;
}

export interface EventShellView {
  /** 무엇의 사건인가 — `data-event-kind` 로 남아 검사와 CSS 가 읽는다 */
  kind: string;
  mood: EventShellMood;
  title: string;
  /** 본문 한두 줄. 없으면 줄 자체를 안 만든다 (빈 상자 금지) */
  body?: string;
  /** 제목 위 작은 근거 줄 — `3주차 결정` · `의뢰 보상` */
  kicker?: string;
  /** 무대의 주인공 — 이모지 한 글자 또는 캔버스 (썸네일) */
  figure?: string | HTMLCanvasElement | null;
  /** 실제 장면 그림. 있으면 무대 상태가 `art` 가 된다 */
  art?: HTMLCanvasElement | null;
  /** 무대 분위기 세부 — 카드 테마처럼 데이터가 가진 이름 (`crowd`·`weather`…) */
  scene?: string;
  /** 아래 버튼 줄. 비면 셸이 만들지 않는다 (선택 필수 모달은 호출자가 항상 준다) */
  choices: readonly EventShellChoice[];
  /** 선택지 아래 작은 주석 — `시간이 멈춰 있습니다` 같은 규칙 안내 */
  note?: string;
  /**
   * 무대에 글리프 주인공을 세울지. 카드처럼 무대 자체가 테마 그림인 경우는 `false` 다 —
   * 안 그러면 테마 위에 뜻 없는 이모지가 하나 더 뜬다.
   */
  showFigure?: boolean;
  /**
   * 선택지 줄을 **호출자가 소유**할 때 넣는 노드 (주간 카드).
   *
   * ⚠ 카드의 선택지는 **한 줄에 N열**이라는 계약이 있다 (게이트 두 곳이 `oneRow` 를
   * 잰다 — 393px 에서 2~3개가 나란히 서야 한다). 셸의 기본 격자는 폭 조건으로 접히므로
   * 그 계약과 안 맞는다. 그래서 카드만 자기 줄을 넣고 나머지는 셸이 만든다.
   */
  choicesNode?: HTMLElement;
}

export interface EventShellPlan {
  kind: string;
  mood: EventShellMood;
  stage: EventStageState;
  scene: string;
  kicker: string;
  title: string;
  body: string;
  note: string;
  figureText: string;
  choices: readonly (EventShellChoice & { primary: boolean })[];
}

/** 무대에 그림이 없을 때 세우는 기본 주인공. 분위기마다 다른 글리프다 */
const MOOD_FIGURE: Record<EventShellMood, string> = {
  celebrate: '🎁',
  quest: '📜',
  decision: '❓',
  alert: '⚠',
};

/**
 * 구성 결정을 **한 순수 함수**에 모은다 — DOM 없이 단위 검사가 직접 잰다.
 *
 * 특히 `stage` 가 중요하다: "그림이 있다고 주장하는데 실제로는 없다"가 이 프로젝트가
 * 반복해서 밟은 함정이라(에셋 검사가 "그림을 안 잃었다"까지 재는 이유), 상태를 **계획에서**
 * 정하고 DOM 은 그 값을 그대로 쓰기만 한다.
 */
export function eventShellPlan(view: EventShellView): EventShellPlan {
  const choices = view.choices.map((choice, index) => ({
    ...choice,
    primary: choice.primary ?? index === 0,
  }));
  return {
    kind: view.kind,
    mood: view.mood,
    stage: view.art ? 'art' : 'placeholder',
    scene: view.scene ?? view.mood,
    kicker: view.kicker ?? '',
    title: view.title,
    body: view.body ?? '',
    note: view.note ?? '',
    figureText: typeof view.figure === 'string' && view.figure.length > 0
      ? view.figure
      : MOOD_FIGURE[view.mood],
    choices,
  };
}

export interface EventShellNodes {
  root: HTMLDivElement;
  stage: HTMLDivElement;
  artSlot: HTMLDivElement;
  figure: HTMLDivElement;
  kicker: HTMLDivElement;
  title: HTMLDivElement;
  body: HTMLDivElement;
  note: HTMLDivElement;
  choices: HTMLDivElement;
}

/**
 * 빈 셸을 만든다 (한 번). 내용 갱신은 `renderEventShell` 이 한다 — 사건마다 DOM 을 새로
 * 만들면 애니메이션 재시작·포커스·검사 손잡이가 전부 흔들린다.
 */
export function createEventShell(): EventShellNodes {
  const root = el('div', 'kevent');
  const stage = el('div', 'kevent-stage');
  stage.setAttribute('role', 'img');
  const artSlot = el('div', 'kevent-art');
  const figure = el('div', 'kevent-figure fx-pop');
  stage.append(artSlot, figure);
  const copy = el('div', 'kevent-copy');
  const kicker = el('div', 'kevent-kicker');
  const title = el('div', 'kevent-title');
  const body = el('div', 'kevent-body');
  copy.append(kicker, title, body);
  const choices = el('div', 'kevent-choices');
  const note = el('div', 'kevent-note');
  root.append(stage, copy, choices, note);
  return { root, stage, artSlot, figure, kicker, title, body, note, choices };
}

/**
 * 계획을 화면에 얹는다.
 *
 * ⚠ **선택지 버튼은 새 클래스를 안 만든다** — `.kbtn` + `.primary`/`.danger` 다. 새
 * 클래스를 만들면 대비 검사 쌍과 44px 하한이 그 클래스만 비껴간다.
 */
export function renderEventShell(
  nodes: EventShellNodes,
  view: EventShellView,
  onChoose?: (choice: EventShellChoice) => void,
): EventShellPlan {
  const plan = eventShellPlan(view);
  nodes.root.dataset['eventKind'] = plan.kind;
  nodes.root.dataset['eventMood'] = plan.mood;
  nodes.stage.dataset['stageState'] = plan.stage;
  nodes.stage.dataset['stageScene'] = plan.scene;
  nodes.stage.setAttribute('aria-label', `${plan.title} 장면`);

  nodes.artSlot.replaceChildren();
  if (view.art) nodes.artSlot.append(view.art);

  nodes.figure.hidden = view.showFigure === false;
  nodes.figure.replaceChildren();
  if (view.figure instanceof HTMLCanvasElement) nodes.figure.append(view.figure);
  else nodes.figure.textContent = plan.figureText;
  // 반짝 재시작 — 클래스를 뗐다 붙여야 애니메이션이 다시 돈다 (reduced-motion 은 CSS 가 막는다)
  nodes.figure.classList.remove('fx-pop');
  void nodes.figure.offsetWidth;
  nodes.figure.classList.add('fx-pop');

  nodes.kicker.textContent = plan.kicker;
  nodes.kicker.hidden = plan.kicker.length === 0;
  nodes.title.textContent = plan.title;
  nodes.body.textContent = plan.body;
  nodes.body.hidden = plan.body.length === 0;
  nodes.note.textContent = plan.note;
  nodes.note.hidden = plan.note.length === 0;

  if (view.choicesNode) {
    nodes.choices.replaceChildren(view.choicesNode);
    nodes.choices.hidden = false;
    return plan;
  }
  nodes.choices.replaceChildren(
    ...plan.choices.map((choice) => {
      const cls = `kbtn${choice.primary ? ' primary' : ''}${choice.danger ? ' danger' : ''}`;
      const button = el('button', cls) as HTMLButtonElement;
      button.dataset['eventChoice'] = choice.id;
      button.append(el('span', 'kevent-choice-label', choice.label));
      if (choice.meta) button.append(el('span', 'kevent-choice-meta', choice.meta));
      if (choice.blockedReason) {
        button.append(el('span', 'kevent-choice-why', choice.blockedReason));
      }
      if (choice.disabled) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      }
      button.setAttribute(
        'aria-label',
        [choice.label, choice.meta, choice.blockedReason].filter(Boolean).join(', '),
      );
      button.addEventListener('click', () => {
        if (choice.disabled) return;
        onChoose?.(choice);
        choice.run();
      });
      return button;
    }),
  );
  nodes.choices.hidden = plan.choices.length === 0;
  return plan;
}
