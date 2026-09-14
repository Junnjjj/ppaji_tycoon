/**
 * **성장 목록 넷** — 의뢰 · 소원 · 인증 · 단골이 각자 자기 화면을 갖는다.
 *
 * ## 왜 (IA 재설계 §4.1 · UX 감사 P0-2 · P1-10)
 *
 * 셋이 메뉴 시트의 **꼬리**에 직렬로 붙어 있었다 (실측: 의뢰 6행 + 소원 + 인증 12행 =
 * 900px = 메뉴 본문 1,893px 의 48%). 메뉴 버튼 `의뢰`·`인증` 은 화면을 여는 게 아니라
 * 같은 시트를 1,000px 가까이 **점프**시켰고, `단골` 은 **아무 일도 안 했다** —
 * `#kairo-regular-list` 앵커가 "열린 소원이 있을 때만" 만들어졌기 때문이다.
 * 온보딩 6·7단계(`equip-menu`·`regular-purchase`)가 그 버튼을 Today 주버튼으로 띄우므로
 * **비차단 8단 온보딩의 두 단계가 화면에서 진행 불가능**했다.
 *
 * ## 규칙
 *
 * · **행 모델은 순수 함수**가 만든다 — DOM 없는 단위 검사가 문구·주어·보상을 직접 잰다.
 * · 조건 주어는 `kairo-terms.ts` 하나에서 온다. 여기서 한글 표를 새로 만들지 않는다.
 * · **빈 상태는 언제나 있다** (§8.1 규격): 사실 한 줄 + 방법 한 줄 + (막다른 길이 아니면)
 *   그 방법으로 가는 버튼. `없음` 한 단어나 빈 상자를 내지 않는다.
 * · **잘라내지 않는다** — 옛 의뢰 목록은 `slice(0, 6)` 이었다 (16종 중 6종). 자기 화면을
 *   가졌으니 전량을 낸다.
 * · **잠긴 것을 회색으로 죽이지 않는다** (K48): 자격이 없을수록 더 보여야 한다.
 */
import type { QuestCondition } from '../sim/kairo/progress.js';
import { conditionLine, rewardLine } from './kairo-terms.js';
import { won } from './money.js';

/** 네 목록이 공유하는 한 행. 새 표면을 만들지 않으므로 모양이 같아야 한다 */
export interface GrowthRow {
  id: string;
  icon: string;
  name: string;
  /** 조건 줄 — **주어를 포함한다** (`선착장 1 / 3개`) */
  lines: readonly string[];
  /** 보상 한 줄. 없으면 빈 문자열 */
  reward: string;
  /** 0~100 정수 */
  percent: number;
  done: boolean;
  /**
   * 행을 누르면 뜨는 **삽화 사건 상자**의 내용.
   *
   * 목록은 훑는 곳이고, 하나를 고르면 카이로처럼 장면 + 인물 + 이야기 + 아래 선택지로
   * 읽는다 — 발견(아직 못 한 것) · 수락(무엇을 하면 되나) · 완료(무엇을 받았나)가 전부
   * 같은 상자다. 목록 자체는 **화면에 남는다** (한 사건을 두 채널에 넣지 않는다는 규칙은
   * 알림 채널의 것이지, 목록과 상세는 같은 채널의 두 깊이다).
   */
  event: GrowthEvent;
}

export interface GrowthEvent {
  /** 상자 머리의 작은 근거 줄 — `진행 중인 의뢰` · `딴 인증` */
  kicker: string;
  title: string;
  /** 본문 — 이야기 한 줄 + 조건 줄들 */
  body: string;
  mood: 'quest' | 'celebrate';
  figure: string;
}

export interface GrowthEmpty {
  /** 무엇이 없다 — 15px */
  fact: string;
  /** 무엇을 하면 생긴다 — 13px, 수치 포함 */
  how: string;
  /** 그 방법으로 가는 버튼. **막다른 길이면 만들지 않는다** */
  actionLabel?: string;
}

export interface GrowthList {
  id: 'quests' | 'wishes' | 'certs' | 'regulars';
  title: string;
  /** 머리의 `N/M` — 언제나 전량 기준이다 */
  count: string;
  rows: readonly GrowthRow[];
  /** 행이 0개일 때만 쓰인다. **언제나 계산해 둔다** — "빈 상태가 없는 화면"을 막는다 */
  empty: GrowthEmpty;
}

const pct = (p: number): number => Math.round(Math.max(0, Math.min(1, p)) * 100);

export interface QuestInput {
  id: string;
  name: string;
  desc: string;
  detail: string;
  cond: QuestCondition;
  progress: number;
  done: boolean;
  reward: number;
  claimed: boolean;
}

/**
 * 의뢰 — **전량**이다. 완료분은 아래로 내려가되 사라지지 않는다
 * (인증과 같은 규칙: 보상이 어디서 왔는지 화면에 남아야 한다).
 */
export function questList(items: readonly QuestInput[], nextGradeName: string): GrowthList {
  const rows: GrowthRow[] = [...items]
    .sort((a, b) => Number(a.claimed) - Number(b.claimed) || b.progress - a.progress)
    .map((q) => ({
      id: q.id,
      icon: q.claimed || q.done ? '✓' : '📜',
      name: q.name,
      lines: [q.desc, conditionLine(q.cond, q.detail)].filter((line) => line.length > 0),
      reward: q.reward > 0
        ? q.done && !q.claimed ? `주말 보상 ${won(q.reward)}` : `보상 ${won(q.reward)}`
        : '',
      percent: q.claimed ? 100 : pct(q.progress),
      done: q.claimed || q.done,
      event: {
        kicker: q.claimed ? '끝낸 의뢰' : q.done ? '조건 달성 · 주말에 보상' : '진행 중인 의뢰',
        title: q.name,
        body: q.claimed
          ? `${q.desc}\n끝냈습니다 — 보상 ${won(q.reward)}을 받았습니다.`
          : `${q.desc}\n조건 — ${conditionLine(q.cond, q.detail)}` +
            (q.reward > 0 ? `\n보상 — ${won(q.reward)}` : ''),
        mood: q.claimed || q.done ? ('celebrate' as const) : ('quest' as const),
        figure: q.claimed || q.done ? '✓' : '📜',
      },
    }));
  const doneCount = items.filter((q) => q.claimed || q.done).length;
  return {
    id: 'quests',
    title: '의뢰',
    count: `${doneCount} / ${items.length}`,
    rows,
    empty: {
      fact: '지금 열린 의뢰가 없습니다',
      how: `다음 의뢰는 ${nextGradeName}에서 열립니다`,
      actionLabel: '심사 보기',
    },
  };
}

export interface WishInput {
  id: string;
  character: string;
  line: string;
  detail: string;
  progress: number;
}

/** 소원 — 인물의 말이 곧 조건 설명이다 (K43). 여기서 문장을 다시 쓰지 않는다 */
export function wishList(items: readonly WishInput[]): GrowthList {
  return {
    id: 'wishes',
    title: '소원',
    count: `${items.length}건`,
    rows: items.map((w) => ({
      id: w.id,
      icon: '💬',
      name: w.character,
      lines: [`“${w.line}”`, w.detail].filter((line) => line.length > 0),
      reward: '',
      percent: pct(w.progress),
      done: false,
      event: {
        kicker: '손님의 소원',
        title: w.character,
        body: `“${w.line}”\n${w.detail}`,
        mood: 'quest' as const,
        figure: '💬',
      },
    })),
    empty: {
      fact: '아직 들어온 소원이 없습니다',
      how: '손님이 늘면 인물이 찾아와 소원을 말합니다',
    },
  };
}

export interface CertInput {
  id: string;
  name: string;
  desc: string;
  reqs: readonly { detail: string; done: boolean; cond: QuestCondition }[];
  progress: number;
  earned: boolean;
  reward: { capacity?: number; permitArea?: number };
}

/**
 * 인증 — **주어가 붙은 조건 줄**이 이 화면의 존재 이유다.
 *
 * 실측 이전 상태: `🏅 수상레저 인증 · 1 / 3개 · 5 / 8개 → 정원 +6 · 허가 +40`.
 * 무엇이 1/3개인지 화면 어디에도 없었고, 보상어 `정원`·`허가` 도 다른 화면과 달랐다.
 */
export function certList(items: readonly CertInput[], nearestHint: string): GrowthList {
  const rows: GrowthRow[] = [...items]
    .sort((a, b) => Number(a.earned) - Number(b.earned) || b.progress - a.progress)
    .map((c) => ({
      id: c.id,
      icon: c.earned ? '✓' : '🏅',
      name: c.name,
      lines: c.earned
        ? [c.desc]
        : c.reqs.map((r) => `${r.done ? '✓' : '·'} ${conditionLine(r.cond, r.detail)}`),
      reward: rewardLine(c.reward),
      percent: c.earned ? 100 : pct(c.progress),
      done: c.earned,
      event: {
        kicker: c.earned ? '딴 인증' : '노리는 인증',
        title: c.name,
        body: c.earned
          ? `${c.desc}\n받은 것 — ${rewardLine(c.reward)}`
          : `${c.desc}\n` +
            c.reqs.map((r) => `${r.done ? '✓' : '·'} ${conditionLine(r.cond, r.detail)}`).join('\n') +
            `\n보상 — ${rewardLine(c.reward)}`,
        mood: c.earned ? ('celebrate' as const) : ('quest' as const),
        figure: c.earned ? '🎖' : '🏅',
      },
    }));
  const earned = items.filter((c) => c.earned).length;
  return {
    id: 'certs',
    title: '인증',
    count: `${earned} / ${items.length}`,
    rows,
    empty: {
      fact: '아직 딴 인증이 없습니다',
      how: nearestHint,
      actionLabel: '건설 열기',
    },
  };
}

export interface RegularInput {
  id: string;
  name: string;
  /** 아직 안 만난 인물도 **행으로 남는다** — 다음 목표가 목록에서 사라지면 안 된다 */
  met: boolean;
  stage: number;
  stages: number;
  /** 지금 무엇을 원하나 — 없으면 빈 문자열 */
  want: string;
  done: boolean;
}

/**
 * 단골 — 이름 있는 인물의 친밀도 사슬 (K57).
 *
 * ⚠ **행이 언제나 있다.** 예전에는 `#kairo-regular-list` 가 "열린 소원이 있을 때만"
 * 만들어져서 메뉴의 `단골` 버튼이 조용한 no-op 이었다 (UX 감사 P0-2). 인물 목록은
 * 데이터 상수라 판이 어떤 상태든 **셀 수 있다.**
 */
export function regularList(items: readonly RegularInput[]): GrowthList {
  const met = items.filter((r) => r.met).length;
  return {
    id: 'regulars',
    title: '단골',
    count: `${met} / ${items.length}`,
    rows: items.map((r) => ({
      id: r.id,
      icon: r.done ? '✓' : r.met ? '♥' : '·',
      name: r.met ? `${r.name} ${r.stage}/${r.stages}단계` : `${r.name} — 아직 안 만났습니다`,
      lines: [r.met ? r.want : '먹거리 시설을 지으면 찾아옵니다'].filter((l) => l.length > 0),
      reward: '',
      percent: r.stages <= 0 ? 0 : pct(r.stage / r.stages),
      done: r.done,
      event: {
        kicker: r.done ? '사슬을 끝낸 단골' : r.met ? '단골 진행 중' : '아직 안 만난 인물',
        title: r.name,
        body: r.met
          ? `친밀도 ${r.stage}/${r.stages}단계\n${r.want}`
          : '아직 안 만났습니다.\n먹거리 시설을 지어 메뉴를 갖추면 찾아옵니다.',
        mood: r.done ? ('celebrate' as const) : ('quest' as const),
        figure: r.met ? '♥' : '·',
      },
    })),
    empty: {
      fact: '아직 단골이 없습니다',
      how: '먹거리 시설을 지어 첫 손님을 단골로 만드세요',
      actionLabel: '건설 열기',
    },
  };
}
