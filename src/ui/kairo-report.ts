import { el, button } from './dom.js';
import { cssVar } from './tokens.js';
import type { WeekReport, NeedKind } from '../sim/kairo/week.js';

/**
 * 주간 결산 화면 — 스펙 v4.
 *
 * ## 왜 히트맵이 먼저인가
 *
 * v3 는 결산을 숫자 표로만 뒀는데, 그러면 연출을 스킵하는 순간 **다시 엑셀 게임**이 된다.
 * 그래서 이 화면은 위에서부터 **혼잡 히트맵 → 요일 막대 → 숫자** 순서다. 병목을 눈으로
 * 먼저 보고, 숫자는 확인용이다.
 *
 * ## 왜 DOM 인가
 *
 * 캔버스가 아니라 DOM/CSS 다 — 에셋 0장, 선명, 다크모드 공짜, 폰 텍스트 크기 정책을
 * 그대로 따른다 (CLAUDE.md 의 `ui/` 결정).
 */

const NEED_NAME: Record<NeedKind, string> = {
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

export interface ReportHandlers {
  onClose: () => void;
  /** 압축 연출 다시 보기 */
  onReplay?: () => void;
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

  private numbers(rep: WeekReport): HTMLElement {
    const box = el('div', 'knums');
    const rows: [string, string, string][] = [
      ['입장', `${rep.visitors}명`, ''],
      ['만석으로 돌려보냄', `${rep.turnedAway}명`, rep.turnedAway > 0 ? 'bad' : ''],
      /*
       * 매표소를 못 지나 돌아간 손님 (K36-B②) — **만석과 갈라서** 보여준다.
       * 둘을 합치면 "시설을 늘려라"와 "매표소를 지어라"가 한 줄에 섞여, 정작 못 들어오는
       * 이유를 못 읽는다.
       */
      ['매표소를 못 지나감', `${rep.noTicket}명`, rep.noTicket > 0 ? 'bad' : ''],
      ['매출', won(rep.revenue), ''],
      // 입장료는 매출 **안에** 들어 있다. 따로 보여야 "표를 올릴까 시설을 늘릴까"가 판단이 된다
      ['ㄴ 입장료', won(rep.admission), ''],
      ['유지비', won(-rep.upkeep), ''],
      ['손익', won(rep.profit), rep.profit >= 0 ? 'good' : 'bad'],
      ['퇴장 만족도', rep.exitSatisfaction.toFixed(0), ''],
      ['헛걸음', `${rep.gaveUp}명`, rep.gaveUp > 0 ? 'warn' : ''],
    ];
    for (const [k, v, cls] of rows) {
      box.append(el('div', 'knum-key', k), el('div', `knum-val ${cls}`, v));
    }
    return box;
  }

  show(rep: WeekReport, handlers: ReportHandlers): void {
    this.handlers = handlers;
    this.root.replaceChildren();

    this.root.append(el('div', 'ksheet-title', `${rep.week}주차 결산`));

    // ① 혼잡 히트맵 — 병목을 먼저 눈으로
    const heatLabel = el(
      'div',
      'kcaption',
      rep.hotspot
        ? `혼잡 — 가장 붐빈 곳 (${rep.hotspot.i}, ${rep.hotspot.j})`
        : '혼잡 — 손님이 없었다',
    );
    this.root.append(heatLabel, this.heatCanvas(rep));

    // ② 요일 막대
    this.root.append(
      el('div', 'kcaption', '요일별 수요 (주말 주황 · 빗금 = 만석으로 돌려보냄)'),
      this.dayBars(rep),
    );

    // ③ 손님 구성 — "누가 왔나"가 "무엇을 지을까"의 근거다
    this.root.append(this.groupBar(rep));

    // ④ 숫자
    this.root.append(this.numbers(rep));

    /*
     * 매표소 경보 — 병목보다 **먼저** 띄운다. 손님이 아예 안 들어오는 판에서
     * "부족한 것: 놀이" 를 먼저 보여주면 엉뚱한 곳을 고치게 된다.
     */
    if (rep.noTicket > 0) {
      this.root.append(
        el(
          'div',
          'kcallout',
          `${rep.noTicket}명이 표를 못 사고 돌아갔습니다 — 입구 근처에 매표소를 짓고 길을 이으세요`,
        ),
      );
    }

    // 병목 — 다음에 무엇을 지을까
    if (rep.bottleneck) {
      const name = NEED_NAME[rep.bottleneck.need] ?? rep.bottleneck.need;
      this.root.append(
        el('div', 'kcallout', `부족한 것: ${name} (공급 ${rep.bottleneck.supply})`),
      );
    }

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

    this.root.hidden = false;
  }
}
