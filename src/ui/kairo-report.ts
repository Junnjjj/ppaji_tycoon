import { el, button } from './dom.js';
import { cssVar } from './tokens.js';
import type {
  WeekReport,
  WeekSummary,
  NeedKind,
  InvestmentBreakdown,
} from '../sim/kairo/week.js';
// 병목 처방이 시설 **이름**을 부른다 — 계약은 sim 소유, 문자열만 여기서 쓴다
import { facilityDef } from '../sim/kairo/placement.js';
import type { ActiveCombo, ActiveConflict, ComboResult } from '../sim/kairo/combos.js';
import type { SwimZone } from '../sim/kairo/swim.js';
import { panelHost } from './panels.js';
import { recipeDef } from '../sim/kairo/menu.js';
import { WISH_CHARACTERS } from '../sim/kairo/wishes.js';

/**
 * 주간 결산 화면 — K54/Phase 5.
 *
 * ## 왜 결론이 먼저인가
 *
 * v4의 히트맵 우선 계약은 96×72 맵에서 거의 한 화면을 차지해 핵심 결과를 폴드 아래로
 * 밀었다. K54는 이를 의도적으로 폐기하고 **3 KPI → 처방 하나 → 132px 히트맵 → 분석**
 * 순서로 바꿨다. 히트맵을 없애지는 않는다. 숫자 결론 뒤에 시각적 원인을 바로 붙인다.
 *
 * ## 왜 DOM 인가
 *
 * 캔버스가 아니라 DOM/CSS 다 — 에셋 0장, 선명, 다크모드 공짜, 폰 텍스트 크기 정책을
 * 그대로 따른다 (CLAUDE.md 의 `ui/` 결정).
 */

/** 심사 확인 화면(K48)도 같은 이름을 쓴다 — 두 벌이면 "위생"과 "청결"이 갈린다 */
export const NEED_NAME: Record<NeedKind, string> = {
  food: '먹거리',
  rest: '쉼터',
  warm: '온열',
  play: '놀이',
  thrill: '스릴',
  scenery: '경관',
  hygiene: '위생',
  service: '운영',
  stay: '숙박',
};

/** 손님 유형 — 표시 순서·이름·색. 색은 팔레트 계열에서 골라 히트맵과 안 부딪히게 */
const GROUP_ORDER = ['family', 'couple', 'friends', 'company'] as const;
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  family: '가족',
  couple: '커플',
  friends: '친구',
  company: '단체',
};
/*
 * 색은 `style.css` 의 `--group-*` 이 정본이다 (K34). 여기서는 클래스 이름만 고른다 —
 * 캔버스가 아니라 DOM 이라 CSS 로 칠할 수 있다.
 */
const GROUP_CLASS: Record<(typeof GROUP_ORDER)[number], string> = {
  family: 'family',
  couple: 'couple',
  friends: 'friends',
  company: 'company',
};

const WEATHER_ICON: Record<string, string> = {
  clear: '☀',
  cloudy: '☁',
  rain: '☂',
  heat: '🔥',
  cold: '❄',
};

function won(n: number): string {
  const sign = n < 0 ? '−' : '';
  const v = Math.abs(Math.round(n));
  if (v >= 100_000_000) return `${sign}${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${sign}${Math.round(v / 10_000).toLocaleString('ko-KR')}만`;
  return `${sign}${v.toLocaleString('ko-KR')}`;
}

export interface ReportKpi {
  id: 'visitors' | 'profit' | 'satisfaction';
  label: string;
  value: number;
  /** `null`이면 저장된 이전 주가 없는 첫 주다. */
  delta: number | null;
  /** 방문객만 전주 대비 비율을 함께 낸다. 전주 0명이면 계산하지 않는다. */
  percent: number | null;
}

/** 전주 비교는 저장 요약에 실제로 있는 동일 정의 셋만 사용한다. */
export function reportKpis(report: WeekReport, previous: WeekSummary | null): ReportKpi[] {
  const visitorDelta = previous === null ? null : report.visitors - previous.visitors;
  return [
    {
      id: 'visitors',
      label: '방문객',
      value: report.visitors,
      delta: visitorDelta,
      percent:
        visitorDelta === null || previous === null || previous.visitors === 0
          ? null
          : Math.round((visitorDelta / previous.visitors) * 100),
    },
    {
      id: 'profit',
      label: '영업 손익',
      value: report.profit,
      delta: previous === null ? null : report.profit - previous.profit,
      percent: null,
    },
    {
      id: 'satisfaction',
      label: '퇴장 만족',
      value: report.exitSatisfaction,
      delta: previous === null ? null : report.exitSatisfaction - previous.exitSatisfaction,
      percent: null,
    },
  ];
}

export interface ReportLedger {
  income: { admission: number; sales: number; course: number; total: number };
  operatingCosts: { maintenance: number; staff: number };
  /** WeekRunner가 낸 정본 `profit`. UI에서 수입-비용으로 재계산하지 않는다. */
  operatingProfit: number;
  investment: InvestmentBreakdown & { total: number };
}

/** 정본 장부의 항목을 화면 구획으로만 묶는다. */
export function reportLedger(report: WeekReport): ReportLedger {
  return {
    income: {
      admission: report.admission,
      sales: report.sales,
      course: report.courseRevenue,
      total: report.revenue,
    },
    operatingCosts: { maintenance: report.upkeep, staff: report.wages },
    operatingProfit: report.profit,
    investment: {
      ...report.investment,
      total:
        report.investment.building +
        report.investment.upgrades +
        report.investment.menuDevelopment,
    },
  };
}

export interface ReportPrescription {
  text: string;
  button: string;
  action: 'build' | 'course' | 'manage';
  target?: string;
}

/** 상충하는 조언을 여러 줄 늘어놓지 않고 지금 할 한 동작만 고른다. */
export function reportPrescription(report: WeekReport): ReportPrescription {
  if (report.noTicket > 0) {
    return {
      text: `${report.noTicket}명이 표를 못 샀습니다 — 입구 길과 매표소를 먼저 고치세요`,
      button: '매표소 건설 열기',
      action: 'build',
      target: 'ticket',
    };
  }
  if (report.admissionCap?.capped) {
    return {
      text: admissionCappedLine(report.admissionCap),
      button: '심사·개선 보기',
      action: 'manage',
    };
  }
  if (report.bottleneck) {
    return {
      text: bottleneckLine(report.bottleneck),
      button: '건설 열기',
      action: 'build',
      ...(report.bottleneck.example ? { target: report.bottleneck.example } : {}),
    };
  }
  if (report.courseDemand > report.coursePotentialRiders) {
    return {
      text: `코스 수요 ${report.courseDemand}명, 처리 ${report.coursePotentialRiders}명 — 대기 수요를 놓치고 있습니다`,
      button: '코스 조정',
      action: 'course',
    };
  }
  if (report.profit < 0) {
    return {
      text: '영업 적자입니다 — 요금·직원·시설 개선을 한 번에 점검하세요',
      button: '경영 보기',
      action: 'manage',
    };
  }
  return {
    text: '운영이 안정적입니다 — 견인 코스 기록을 한 단계 더 높여 보세요',
    button: '코스 기록 도전',
    action: 'course',
  };
}

/**
 * 병목 한 줄 (P3-B) — **처방은 방법까지 말한다** (이 저장소 규칙: 거절 메시지가 이미 그렇다).
 *
 * 두 문장이 갈린다:
 * · **하나도 없다** — 처음 짓는 것이라 무엇을 고르는지까지 말해야 행동이 된다.
 *   "스릴 0개" 는 사실이지 조언이 아니었다
 * · **모자란다** — 이미 있으니 종류와 현재 공급이면 충분하다
 *
 * `example` 은 시뮬이 고른다 (지금 지을 수 있는 것 중 가장 싼 것) — 여기서 고르면
 * "결산이 권한 것을 건설 시트가 안 보여준다"가 될 수 있다. 이름만 여기서 푼다.
 */
export function bottleneckLine(b: NonNullable<WeekReport['bottleneck']>): string {
  const name = NEED_NAME[b.need] ?? b.need;
  const pick = b.example === null ? undefined : facilityDef(b.example);
  const how = pick ? ` — 건설 ▸ ${pick.name}` : '';
  if (!b.missing) return `부족한 것: ${name} (공급 ${b.supply})${how}`;
  return `${name} 시설이 하나도 없습니다${how !== '' ? how : ' — 건설에서 지어 보세요'}`;
}

/**
 * 정원이 찼을 때의 한 줄 (P3-C) — **병목 대신** 나간다.
 *
 * 입장은 `min(등급 상한, 공급×1.5)` 라, 공급이 등급 천장을 넘으면 시설을 더 지어도
 * 손님은 한 명도 안 늘고 유지비만 는다. 그 구간에서 "부족한 것: 놀이 — 건설 ▸ …" 는
 * **틀린 처방**이다: 시키는 대로 하면 손해만 는다.
 *
 * 처방은 **방법까지** 말한다 (이 저장소 규칙). 상한 구간의 정답은 둘뿐이다:
 * · **심사** — 등급을 올리면 천장 자체가 올라간다 (돈으로는 못 산다 — 만족도로만)
 * · **개선/특화** — 정원을 안 올리면서 만족·요금을 올린다. 그래서 이 구간의 정답이다
 */
export function admissionCappedLine(a: NonNullable<WeekReport['admissionCap']>): string {
  return (
    `정원이 찼습니다 (등급 상한 ${a.gradeMax}명) — 시설을 더 지어도 손님은 안 늘고 ` +
    '유지비만 늡니다. 심사로 등급을 올리거나, 경영 ▸ 개선으로 있는 시설을 키우세요'
  );
}

/**
 * 결산의 콤보 줄이 쓰는 표시 자료 (P2-B).
 *
 * ## 왜 총합이 여기 없나
 *
 * 만족·매출 총합은 `WeekReport.combos` 가 갖는다 — **그 주에 실제로 적용된 값**이다.
 * 여기 있는 것은 이름·개수·면적 배율뿐이고, 그건 `week.ts` 가 알 수 없는 것이다
 * (시뮬은 숫자 둘만 받는다 — 불변식 3).
 *
 * ⚠ 그래서 이 자료도 **주가 열린 시점**에 떠 놓아야 한다. 결산을 여는 시점에 배치에서
 * 다시 계산하면 흐르는 낮 동안 지은 시설이 섞여 "목록은 13개인데 숫자는 12개 몫"이 된다.
 */
export interface ComboBreakdown {
  /** 이번 주에 발동한 콤보 수 (같은 콤보의 중복 발동을 각각 센다) */
  count: number;
  /** 기여가 큰 순 상위 몇 개. **전체 목록은 도감 소관**이다 */
  top: ComboLine[];
  /**
   * 상성 감점 (P4) — **안 보여주면 플레이어는 "왜 매출이 낮지"를 영영 모른다.**
   * 종류마다 한 줄로 묶는다 (가점 줄과 같은 규칙).
   */
  clashes: ClashLine[];
  /** 감점 발동 수 (곳 단위) */
  clashCount: number;
}

export interface ClashLine {
  name: string;
  /** 몇 곳에서 났나 */
  count: number;
  /** 어디서 났나 — 첫 곳. 히트맵 좌표와 같은 눈금이라 "거기"를 찾아갈 수 있다 */
  at: { i: number; j: number } | null;
}

export interface ComboLine {
  name: string;
  /**
   * 같은 콤보가 몇 곳에서 터졌나. **줄은 콤보 종류마다 하나**다 (발동마다가 아니다) —
   * 소형은 중복이 무제한이라 발동마다 한 줄이면 같은 이름이 세 줄 늘어선다 (실측).
   */
  count: number;
  /** 면적 배율 (P1-A). zone 콤보가 아니면 언제나 1. 여러 곳이면 **가장 큰 쪽** */
  areaScale: number;
  /** 그 구역의 칸 수 — 면적 배율이 붙은 줄에만 있다 */
  area: number | null;
  /** 콤보 원점수 합에서 이 종류가 차지한 몫 (0~1) */
  share: number;
}

/**
 * 발동 목록 → 결산 표시 자료.
 *
 * ⚠ 기여도를 **최종 효과(점·%)로는 못 잰다.** 포화 곡선이 발동 하나가 아니라 **합계**에
 * 걸리므로 (`comboEffect`), "이 콤보가 몇 점을 냈다"는 값 자체가 존재하지 않는다.
 * 그래서 원점수의 **몫**으로 보여준다 — 순위와 "얼마나 크게 기여했나"는 그대로 읽힌다.
 *
 * 두 축(만족 3~15 · 매출 4~18)은 눈금이 같아서 그냥 더해도 한쪽이 순위를 독점하지
 * 않는다 (`kairo-combos.json` 실측 범위).
 */
export function comboBreakdown(
  /**
   * 발동 목록. **`ComboResult` 를 통째로 넘기면 감점까지** 읽는다 (P4) — 배열만 넘기던
   * 예전 호출부도 그대로 돌아간다 (감점 0). ⚠ 배열만 넘기면 감점 줄이 **조용히 사라진다**:
   * `zones` 를 안 넘기면 zone 콤보가 조용히 0 이 되는 `evaluateCombos` 의 함정과 같은 계열이다.
   */
  source: readonly ActiveCombo[] | ComboResult,
  zones: readonly SwimZone[] = [],
  topN = 3,
): ComboBreakdown {
  const active: readonly ActiveCombo[] = Array.isArray(source)
    ? (source as readonly ActiveCombo[])
    : (source as ComboResult).active;
  const rawClashes: readonly ActiveConflict[] = Array.isArray(source)
    ? []
    : (source as ComboResult).conflicts;
  /*
   * 구역 첫 타일 → 면적. zone 콤보의 `at` 이 **정확히 그 좌표**다 (`combos.ts` 의
   * `findZone`: 구역엔 중심이 없어서 첫 타일을 쓴다). 다른 종류의 콤보는 `at` 이
   * 시설 중심이라 우연히 겹칠 수 있지만, `areaScale > 1` 은 zone 콤보에서만 나오므로
   * 그때만 찾는다 — 엉뚱한 칸수를 붙이지 않는다.
   */
  const areaAt = new Map<string, number>();
  for (const z of zones) {
    const t = z.tiles[0];
    if (t) areaAt.set(`${t.x},${t.y}`, z.area);
  }
  const weight = (c: ActiveCombo): number => c.satisfaction + c.revenue;
  const total = active.reduce((a, c) => a + weight(c), 0);
  // 콤보 **종류**로 묶는다 — 소형은 중복이 무제한이라 발동마다 한 줄이면 같은 이름만 늘어선다
  const byId = new Map<string, ComboLine & { weight: number }>();
  for (const c of active) {
    const line = byId.get(c.id) ?? {
      name: c.name,
      count: 0,
      areaScale: 1,
      area: null,
      share: 0,
      weight: 0,
    };
    line.count += 1;
    line.weight += weight(c);
    // 면적은 **가장 크게 터진 곳**을 보여준다 — "구역을 키운다"의 상한이 보여야 한다
    if (c.areaScale > line.areaScale) {
      line.areaScale = c.areaScale;
      line.area = c.at ? (areaAt.get(`${c.at.i},${c.at.j}`) ?? null) : null;
    }
    byId.set(c.id, line);
  }
  const top = [...byId.values()]
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
    .slice(0, topN)
    .map(({ weight: w, ...line }) => ({ ...line, share: total > 0 ? w / total : 0 }));

  // 감점도 **종류마다 한 줄** (P4). 같은 이유다 — 발동마다 한 줄이면 같은 이름만 늘어선다
  const byClash = new Map<string, ClashLine>();
  for (const c of rawClashes) {
    const line = byClash.get(c.id) ?? { name: c.name, count: 0, at: c.at };
    line.count += 1;
    byClash.set(c.id, line);
  }
  const clashes = [...byClash.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { count: active.length, top, clashes, clashCount: rawClashes.length };
}

export interface ReportHandlers {
  onClose: () => void;
  /** 압축 연출 다시 보기 */
  onReplay?: () => void;
  /** 처방 버튼은 결산을 닫은 뒤 해당 운영 표면을 직접 연다. */
  onPrescription?: (prescription: ReportPrescription) => void;
}

export class KairoReport {
  private readonly root: HTMLDivElement;
  private handlers: ReportHandlers | null = null;

  constructor(parent: HTMLElement) {
    /*
     * ⚠ 예전엔 인라인 `display:none` 과 `hidden` 을 **둘 다** 들고 있었다 — 인라인
     * `display` 가 `hidden` 을 이기기 때문에 한쪽만 풀면 안 보이는 전면 오버레이가
     * 모든 터치를 가로막았다 (검증에서 캔버스를 못 눌러 잡혔다).
     * 이제 `.kover[hidden]` 이 CSS 로 처리하므로 **`hidden` 하나**만 본다.
     */
    this.root = el('div', 'kover scrim');
    this.root.id = 'kairo-report';
    this.root.hidden = true;
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
    panelHost.closed(this);
  }

  private kpiBlock(rep: WeekReport, previous: WeekSummary | null): HTMLElement {
    const box = el('div', 'kkpis');
    box.id = 'kairo-report-kpis';
    for (const kpi of reportKpis(rep, previous)) {
      const cell = el('div', 'kkpi');
      cell.dataset['kpi'] = kpi.id;
      const value =
        kpi.id === 'visitors'
          ? `${Math.round(kpi.value).toLocaleString('ko-KR')}명`
          : kpi.id === 'profit'
            ? `${kpi.value >= 0 ? '+' : '−'}${won(Math.abs(kpi.value))}`
            : Math.round(kpi.value).toString();
      const delta =
        kpi.delta === null
          ? '첫 주'
          : `${kpi.delta >= 0 ? '▲' : '▼'}${
              kpi.id === 'profit'
                ? won(Math.abs(kpi.delta))
                : Math.abs(Math.round(kpi.delta)).toLocaleString('ko-KR')
            }${kpi.percent === null ? '' : ` / ${kpi.percent >= 0 ? '+' : ''}${kpi.percent}%`}`;
      cell.append(
        el('div', 'kkpi-label', kpi.label),
        el('div', `kkpi-value${kpi.id === 'profit' ? (kpi.value >= 0 ? ' good' : ' bad') : ''}`, value),
        el(
          'div',
          `kkpi-delta${kpi.delta === null ? '' : kpi.delta >= 0 ? ' good' : ' bad'}`,
          delta,
        ),
      );
      box.append(cell);
    }
    return box;
  }

  private prescriptionBlock(rep: WeekReport): HTMLElement {
    const prescription = reportPrescription(rep);
    const wrap = el('div', 'kreport-prescription');
    wrap.id = 'kairo-report-prescription';
    wrap.append(el('div', 'kreport-prescription-text', prescription.text));
    const action = button('kbtn primary', prescription.button, () => {
      const handler = this.handlers?.onPrescription;
      if (!handler) return;
      this.hide();
      handler(prescription);
    });
    action.id = 'kairo-report-prescription-action';
    action.disabled = this.handlers?.onPrescription === undefined;
    wrap.append(action);
    return wrap;
  }

  /**
   * 히트맵을 캔버스로 그린다 — 격자 다이아몬드가 아니라 **직사각 격자**로 압축한다.
   * 결산은 "어디가 붐볐나"를 읽는 화면이므로 정확한 투영보다 한눈에 보이는 게 낫다.
   */
  private heatCanvas(rep: WeekReport): HTMLCanvasElement {
    const cell = 6;
    const c = el('canvas', 'kheat');
    c.width = rep.heatW * cell;
    c.height = rep.heatH * cell;
    // 폭은 **데이터**다 (격자 크기에 딸린 값) — 색·질감만 클래스가 갖는다
    c.style.maxWidth = `${rep.heatW * cell}px`;
    const g = c.getContext('2d');
    if (!g) return c;
    /**
     * ⚠ 선형 정규화는 쓰지 않는다. 게이트 앞 한 칸이 나머지의 수백 배라 선형으로는
     * 그 한 칸만 밝고 **나머지가 전부 깔린다** (첫 구현에서 최고점 29,477 에 다른 칸이
     * 안 보였다). 병목을 눈으로 보는 게 이 화면의 목적이므로 감마를 강하게 준다.
     */
    const max = Math.max(1, ...rep.heat);
    const GAMMA = 0.32;
    for (let j = 0; j < rep.heatH; j++) {
      for (let i = 0; i < rep.heatW; i++) {
        const raw = (rep.heat[j * rep.heatW + i] as number) / max;
        const v = raw === 0 ? 0 : Math.pow(raw, GAMMA);
        // 0 = 짙은 남색, 1 = 노랑 — 혼잡도가 색으로 읽혀야 한다
        const r = Math.round(30 + 225 * Math.min(1, v * 1.15));
        const gg = Math.round(45 + 190 * Math.min(1, v));
        const b = Math.round(110 - 70 * v);
        // 빈 칸 색은 토큰에서 읽는다 — 팔레트를 바꾸면 히트맵도 같이 바뀐다 (K34)
        g.fillStyle = v === 0 ? cssVar('--heat-empty') : `rgb(${r},${gg},${b})`;
        g.fillRect(i * cell, j * cell, cell, cell);
      }
    }
    if (rep.hotspot) {
      g.strokeStyle = cssVar('--text-on-solid')  /* 대비값을 여기 안 적는다 — 토큰이 없으면 tokens.ts 가 경고한다 */;
      g.lineWidth = 1;
      g.strokeRect(rep.hotspot.i * cell - 1, rep.hotspot.j * cell - 1, cell + 2, cell + 2);
    }
    return c;
  }

  private dayBars(rep: WeekReport): HTMLElement {
    const box = el('div', 'kdays');
    // 막대는 **오려는 손님**(수요) 기준이고, 만석으로 돌려보낸 만큼을 위에 빗금으로 얹는다.
    // 들어온 손님만 그리면 정원이 찬 날이 "인기 없는 날"처럼 보인다 (실제로 그렇게 보였다).
    const max = Math.max(1, ...rep.days.map((d) => d.arrivals));
    for (const d of rep.days) {
      const col = el('div', 'kday');
      const bar = el('div', 'kday-bar');
      const hAll = Math.max(3, Math.round((d.arrivals / max) * 74));
      const hIn = Math.max(0, Math.round((d.visitors / max) * 74));
      // 높이는 **데이터**다. 색(빗금 = 돌려보냄, 채움 = 들어옴)은 클래스가 갖는다
      bar.style.height = `${hAll}px`;
      const inner = el('div', `kday-in${d.day >= 5 ? ' weekend' : ''}`);
      inner.style.height = `${hIn}px`;
      bar.append(inner);
      // 검증이 요일 막대만 골라 셀 수 있게 표시한다 — `div[title]` 로 세면 손님 구성
      // 막대까지 섞여 개수가 어긋난다 (실측)
      bar.dataset['day'] = String(d.day);
      /*
       * ⚠ 수요 = 입장 + 만석 + 매표소못지남 이 **딱 안 맞을 수 있다** (K36-B②).
       * 손님이 정류장에서 매표소까지 걸어오는 동안 날짜가 넘어가기 때문이다 —
       * 주 단위로는 맞는다. 그래서 셋을 다 적어 둔다: 안 적으면 막대와 숫자가
       * 어긋나 보이는데 이유를 알 길이 없다.
       */
      bar.title =
        `${d.name} 수요 ${d.arrivals}명 · 입장 ${d.visitors}명` +
        (d.turnedAway ? ` · 만석 ${d.turnedAway}명` : '') +
        (d.noTicket ? ` · 매표소 못 지남 ${d.noTicket}명` : '') +
        ` · ${won(d.revenue)}`;
      const num = el(
        'div',
        'kday-num',
        d.turnedAway > 0 ? `${d.visitors}/${d.arrivals}` : String(d.visitors),
      );
      const label = el('div', 'kday-label', `${d.name}\n${WEATHER_ICON[d.weather] ?? '?'}`);
      col.append(num, bar, label);
      box.append(col);
    }
    return box;
  }

  /**
   * 손님 유형 구성 막대 (§10.4).
   *
   * 숫자 표가 아니라 **비율 막대**다 — "가족 절반"이 한눈에 들어와야 "놀이 시설이
   * 모자란가"로 이어진다. 표로 두면 결산이 다시 엑셀이 된다 (히트맵을 넣은 이유와 같다).
   */
  private groupBar(rep: WeekReport): HTMLElement {
    const wrap = el('div', 'kstack');
    wrap.id = 'kairo-report-groups';
    wrap.style.setProperty('--stack-gap', '4px');
    const label = el('div', 'kcaption', '손님 구성');
    const bar = el('div', 'kgroups');
    const total = GROUP_ORDER.reduce((a, k) => a + (rep.byGroup[k] ?? 0), 0);
    if (total === 0) {
      bar.append(el('div', 'kgroup-empty', '손님 없음'));
    } else {
      for (const k of GROUP_ORDER) {
        const n = rep.byGroup[k] ?? 0;
        if (n === 0) continue;
        const seg = el('div', `kgroup ${GROUP_CLASS[k]}`);
        const pct = Math.round((n / total) * 100);
        // 비율은 **데이터**다
        seg.style.flex = `${n} 0 0`;
        seg.dataset['group'] = k;
        seg.title = `${GROUP_LABEL[k]} ${n}명 (${pct}%)`;
        // 좁은 칸에 글자를 우겨넣으면 오히려 안 읽힌다 — 12% 이상일 때만
        seg.textContent = pct >= 12 ? `${GROUP_LABEL[k]} ${pct}%` : '';
        bar.append(seg);
      }
    }
    wrap.append(label, bar);
    return wrap;
  }

  /** Phase 3: 일반 메뉴 판매와 이름 있는 단골의 실제 구매 기록. 0건도 기록 행은 남긴다. */
  private menuRecordBlock(rep: WeekReport): HTMLElement {
    const wrap = el('div', 'kstack');
    wrap.id = 'kairo-report-regulars';
    wrap.dataset['visits'] = String(rep.regularVisits);
    wrap.dataset['purchases'] = String(rep.menuPurchases.length);
    wrap.append(el('div', 'kcaption', '메뉴·단골 기록'));

    const byMenu = new Map<string, { count: number; amount: number }>();
    for (const purchase of rep.menuPurchases) {
      const old = byMenu.get(purchase.menuId) ?? { count: 0, amount: 0 };
      old.count += 1;
      old.amount += purchase.amount;
      byMenu.set(purchase.menuId, old);
    }
    const popular = [...byMenu.entries()].sort(
      (a, b) => b[1].count - a[1].count || b[1].amount - a[1].amount || a[0].localeCompare(b[0]),
    )[0];
    wrap.append(
      el(
        'div',
        'krow',
        popular
          ? `인기 메뉴 ${recipeDef(popular[0])?.name ?? popular[0]} · ${popular[1].count}개 · ${won(popular[1].amount)}`
          : '메뉴 구매 0건 — 음식 시설에 발견 메뉴를 장착해 보세요',
      ),
    );

    const named = rep.menuPurchases.filter((p) => p.characterId);
    if (named.length === 0) {
      wrap.append(el('div', 'kcaption', `단골 ${rep.regularVisits}명 방문 · 요청 메뉴 구매 없음`));
      return wrap;
    }
    const seen = new Set<string>();
    for (const purchase of named) {
      const key = `${purchase.characterId}:${purchase.menuId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const char = WISH_CHARACTERS.find((c) => c.id === purchase.characterId);
      const recipe = recipeDef(purchase.menuId);
      wrap.append(
        el(
          'div',
          'krow',
          `${char?.name ?? purchase.characterId} · ${recipe?.name ?? purchase.menuId} 구매 +${won(purchase.amount)}`,
        ),
      );
    }
    if (rep.regularAffinityGained > 0) {
      wrap.append(el('div', 'kcaption good', `친밀도 +${rep.regularAffinityGained}`));
    }
    return wrap;
  }

  private courseRecordBlock(rep: WeekReport): HTMLElement {
    const wrap = el('div', 'kstack');
    wrap.id = 'kairo-report-course-record';
    wrap.append(el('div', 'kcaption', '견인 코스 기록'));
    const stats = el('div', 'kstats');
    stats.style.setProperty('--stat-cols', '3');
    for (const [label, value] of [
      ['실제 탑승', `${rep.courseRiders}명`],
      ['원한 손님', `${rep.courseDemand}명`],
      ['잠재 처리', `${rep.coursePotentialRiders}명`],
    ]) {
      const cell = el('div', 'kstat');
      cell.append(el('div', 'kstat-label', label), el('div', 'kstat-value', value));
      stats.append(cell);
    }
    wrap.append(stats);
    return wrap;
  }

  private ledgerBlock(rep: WeekReport): HTMLElement {
    const ledger = reportLedger(rep);
    const wrap = el('div', 'kledger');
    wrap.id = 'kairo-report-ledger';

    const card = (title: string, rows: [string, number][], total: [string, number]): HTMLElement => {
      const section = el('section', 'kledger-card');
      section.append(el('div', 'kledger-title', title));
      const nums = el('div', 'knums');
      for (const [label, value] of rows) {
        nums.append(el('div', 'knum-key', label), el('div', 'knum-val', won(value)));
      }
      nums.append(
        el('div', 'knum-key strong', total[0]),
        el('div', 'knum-val strong', won(total[1])),
      );
      section.append(nums);
      return section;
    };

    wrap.append(
      card(
        '수익',
        [
          ['입장료', ledger.income.admission],
          ['음식·대여', ledger.income.sales],
          ['견인 코스', ledger.income.course],
        ],
        ['수익 합계', ledger.income.total],
      ),
      card(
        '운영비',
        [
          ['시설·코스 유지비', ledger.operatingCosts.maintenance],
          ['인건비', ledger.operatingCosts.staff],
        ],
        ['운영비 합계', ledger.operatingCosts.maintenance + ledger.operatingCosts.staff],
      ),
    );

    const result = el('div', `koperating-profit${ledger.operatingProfit >= 0 ? ' good' : ' bad'}`);
    result.append(
      el('span', undefined, '영업 손익'),
      el(
        'strong',
        undefined,
        `${ledger.operatingProfit >= 0 ? '+' : '−'}${won(Math.abs(ledger.operatingProfit))}`,
      ),
    );
    const operating = el('div', 'kledger-operating');
    operating.append(result, el('div', 'kcaption', '건설·개선·메뉴 개발비 제외'));
    wrap.append(operating);

    wrap.append(
      card(
        '투자 지출 · 영업 손익 제외',
        [
          ['건설', ledger.investment.building],
          ['개선', ledger.investment.upgrades],
          ['메뉴 개발', ledger.investment.menuDevelopment],
        ],
        ['투자 합계', ledger.investment.total],
      ),
    );
    return wrap;
  }

  /**
   * 콤보 줄 (P2-B) — **배선은 있는데 화면에 없던 축**을 숫자로 만든다.
   *
   * ## 표기가 사실과 어긋나면 안 된다
   *
   * 매출 배율은 `week.ts` 에서 **입장료·코스를 뺀 공원 매출**에만 곱해진다. 그래서
   * 라벨이 그냥 "매출"이면 플레이어가 `매출 × 1.045` 로 검산하다 안 맞는다고 느낀다.
   * 라벨을 `공원 매출`로 두고, 실제로 늘어난 **원 금액**을 같이 적는다 — 금액은
   * 결산이 이미 가진 값들로 되짚는다:
   *
   *   공원 매출(배율 적용 후) = revenue − admission − courseRevenue
   *   콤보가 더한 돈          = 공원 매출 × (1 − 1/배율)
   *
   * ## 0개인 주도 보여준다
   *
   * 줄을 통째로 감추면 "콤보라는 축이 있다"를 배울 자리가 사라진다 — 지금 고치려는
   * 상태가 정확히 그것이다. 0 이면 대신 **무엇을 하면 터지는지**를 적는다.
   */
  private comboBlock(rep: WeekReport, view?: ComboBreakdown): HTMLElement {
    // 옛 하네스/세이브의 null은 중립값이다. 0개 교육 행까지 숨길 이유가 되지 않는다.
    const eff = rep.combos ?? { satisfactionDelta: 0, revenueMult: 1 };
    const count = view?.count ?? 0;
    const clashCount = view?.clashCount ?? 0;
    const wrap = el('div', 'kstack');
    wrap.style.setProperty('--stack-gap', '6px');
    wrap.dataset['combo'] = String(count);
    // 검사·하네스가 감점 줄을 셀 수 있게 (가점과 같은 자리 규칙)
    wrap.dataset['clash'] = String(clashCount);
    wrap.append(el('div', 'kcaption', '콤보 — 이번 주 배치가 만든 보너스'));

    const stats = el('div', 'kstats');
    // 열 수는 **데이터**다 (색·표면만 클래스가 갖는다)
    stats.style.setProperty('--stat-cols', '3');
    const revPct = (eff.revenueMult - 1) * 100;
    /*
     * ⚠ 부호를 **찍지 말고 계산해서 붙인다** (P4). 감점 축이 생긴 뒤로 두 값은 음수가
     * 될 수 있는데, `+${…}` 로 박아 두면 `+-2.1` 이 나온다 (실제로 그렇게 나왔다).
     */
    const signed = (n: number, suffix = ''): string =>
      `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}${suffix}`;
    const tone = (n: number): string => (n > 0 ? 'good' : n < 0 ? 'bad' : '');
    const cells: [string, string, string][] = [
      ['발동', `${count}개`, ''],
      ['만족', signed(eff.satisfactionDelta), tone(eff.satisfactionDelta)],
      ['공원 매출', signed(revPct, '%'), tone(revPct)],
    ];
    for (const [k, v, cls] of cells) {
      const cell = el('div', 'kstat');
      cell.append(el('div', 'kstat-label', k), el('div', `kstat-value ${cls}`, v));
      stats.append(cell);
    }
    wrap.append(stats);

    if (count === 0 && clashCount === 0) {
      wrap.append(
        el(
          'div',
          'kcaption',
          '아직 발동한 콤보가 없습니다 — 어울리는 시설을 가까이 붙여 보세요 (조건은 도감)',
        ),
      );
      return wrap;
    }

    const park = rep.revenue - rep.admission - rep.courseRevenue;
    /*
     * 배율이 1 아래면 **잃은 돈**이다 (P4). `1 − 1/배율` 은 배율이 1 미만이면 음수라
     * 같은 식이 그대로 쓰인다 — 부호만 문구로 갈린다.
     */
    const delta = Math.round(park * (1 - 1 / eff.revenueMult));
    const money = delta > 0 ? ` · +${won(delta)}` : delta < 0 ? ` · −${won(-delta)}` : '';
    wrap.append(
      el('div', 'kcaption', `배율은 입장료·코스를 뺀 공원 매출에만 붙습니다${money}`),
    );

    if (view && view.top.length > 0) {
      const list = el('div', 'knums');
      for (const line of view.top) {
        /*
         * 면적 배율은 **이름 옆**에 붙인다 (P1-A). "풀 파티 ×1.8 (32칸)" 이 보여야
         * "구역을 키운다"가 다음 행동이 된다 — 배율만 보여주면 무엇을 키우라는 건지
         * 모르고, 칸수만 보여주면 그게 이득인지 모른다.
         */
        const area =
          line.areaScale > 1
            ? ` ×${line.areaScale.toFixed(1)}${line.area !== null ? ` (${line.area}칸)` : ''}`
            : '';
        // 몇 곳에서 터졌나는 **값 쪽**에 둔다 — 이름 옆의 `×`(면적 배율)와 안 헷갈리게
        const where = line.count > 1 ? `${line.count}곳 · ` : '';
        list.append(
          el('div', 'knum-key', `${line.name}${area}`),
          el('div', 'knum-val', `${where}기여 ${Math.round(line.share * 100)}%`),
        );
      }
      wrap.append(list);
    }

    /*
     * 상성 감점 (P4) — **안 보이면 플레이어는 "왜 매출이 낮지"를 영영 모른다.**
     *
     * 가점 목록과 **같은 표면**(`.knums`)으로 낸다. 새 컴포넌트를 만들지 않는 이유는
     * 표면 셋 규칙 그대로다 — 감점은 새 종류의 화면이 아니라 같은 표의 다른 부호다.
     * 색은 토큰(`--bad`)이 클래스로만 붙는다.
     *
     * 처방까지 적는다: 못 놓는 이유를 시트에서 미리 보여주는 규칙과 같은 계열이다.
     * 여기서는 이미 놓인 뒤라 **되돌리는 방법**("두 칸 띄우세요")이 처방이다.
     */
    if (view && view.clashes.length > 0) {
      wrap.append(
        el(
          'div',
          'kcaption bad',
          `⚠ 상성 감점 ${view.clashCount}곳 — 어울리지 않는 시설이 붙어 있습니다 (두 칸 띄우면 꺼집니다)`,
        ),
      );
      const list = el('div', 'knums');
      list.dataset['clashList'] = '1';
      for (const line of view.clashes) {
        const where = line.at ? ` (${line.at.i}, ${line.at.j})` : '';
        list.append(
          el('div', 'knum-key', line.name),
          el('div', 'knum-val bad', `${line.count}곳${where}`),
        );
      }
      wrap.append(list);
    }
    return wrap;
  }

  show(
    rep: WeekReport,
    handlers: ReportHandlers,
    combos?: ComboBreakdown,
    previous: WeekSummary | null = null,
  ): void {
    this.handlers = handlers;
    this.root.replaceChildren();

    const title = el('div', 'ksheet-title', `${rep.week}주차 결산`);
    title.id = 'kairo-report-title';
    this.root.append(title);

    // K54/Phase 5 — 결론과 다음 한 동작이 언제나 첫 두 블록이다.
    this.root.append(this.kpiBlock(rep, previous), this.prescriptionBlock(rep));

    // 시각적 원인은 없애지 않고 132px로 압축한다.
    const heat = el('div', 'kreport-heat');
    heat.id = 'kairo-report-heat';
    const heatLabel = el(
      'div',
      'kcaption',
      rep.hotspot
        ? `혼잡 — 가장 붐빈 곳 (${rep.hotspot.i}, ${rep.hotspot.j})`
        : '혼잡 — 손님이 없었다',
    );
    heat.append(heatLabel, this.heatCanvas(rep));
    this.root.append(heat);

    const days = el('div', 'kstack');
    days.id = 'kairo-report-days';
    days.append(
      el('div', 'kcaption', '요일별 수요 (주말 주황 · 빗금 = 만석으로 돌려보냄)'),
      this.dayBars(rep),
    );
    this.root.append(days);

    // "누가 왔나"가 수익/비용을 읽기 전의 수요 근거다.
    this.root.append(this.groupBar(rep));

    this.root.append(this.ledgerBlock(rep));

    // 위 장부의 원인을 설명하는 주간 기록. 0 콤보 교육 행도 이 안에 항상 남는다.
    const records = el('div', 'kstack');
    records.id = 'kairo-report-records';
    records.append(
      this.comboBlock(rep, combos),
      this.menuRecordBlock(rep),
      this.courseRecordBlock(rep),
    );
    this.root.append(records);

    const btns = el('div', 'kacts');
    if (handlers.onReplay) {
      btns.append(button('kbtn', '다시 보기', () => this.handlers?.onReplay?.()));
    }
    const close = button('kbtn primary grow', '계속', () => {
      this.hide();
      this.handlers?.onClose();
    });
    close.id = 'kairo-report-close';
    btns.append(close);
    this.root.append(btns);

    // 한 번에 하나 (K37)
    if (!panelHost.open(this)) return;
    this.root.hidden = false;
  }
}
