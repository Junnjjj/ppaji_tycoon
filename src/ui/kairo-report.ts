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
    this.root = document.createElement('div');
    this.root.id = 'kairo-report';
    /**
     * ⚠ `display` 를 인라인으로 박아 두면 **`hidden` 속성을 이긴다** — 화면에 안 보이는
     * 전면 오버레이가 모든 터치를 가로막는다 (검증에서 캔버스를 못 눌러 잡혔다).
     * 그래서 `display` 는 `show()`/`hide()` 에서만 바꾼다.
     */
    this.root.hidden = true;
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:20;display:none;flex-direction:column;gap:10px;' +
      'padding:14px;overflow-y:auto;background:rgba(12,20,28,.94);color:#e8f4ff;' +
      'font:13px/1.5 system-ui,-apple-system,sans-serif';
    parent.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
    this.root.style.display = 'none';
  }

  /**
   * 히트맵을 캔버스로 그린다 — 격자 다이아몬드가 아니라 **직사각 격자**로 압축한다.
   * 결산은 "어디가 붐볐나"를 읽는 화면이므로 정확한 투영보다 한눈에 보이는 게 낫다.
   */
  private heatCanvas(rep: WeekReport): HTMLCanvasElement {
    const cell = 6;
    const c = document.createElement('canvas');
    c.width = rep.heatW * cell;
    c.height = rep.heatH * cell;
    c.style.cssText = `width:100%;max-width:${rep.heatW * cell}px;image-rendering:pixelated;border-radius:6px`;
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
        g.fillStyle = v === 0 ? '#0e1a24' : `rgb(${r},${gg},${b})`;
        g.fillRect(i * cell, j * cell, cell, cell);
      }
    }
    if (rep.hotspot) {
      g.strokeStyle = '#fff';
      g.lineWidth = 1;
      g.strokeRect(rep.hotspot.i * cell - 1, rep.hotspot.j * cell - 1, cell + 2, cell + 2);
    }
    return c;
  }

  private dayBars(rep: WeekReport): HTMLElement {
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;gap:6px;align-items:flex-end;height:110px';
    // 막대는 **오려는 손님**(수요) 기준이고, 만석으로 돌려보낸 만큼을 위에 빗금으로 얹는다.
    // 들어온 손님만 그리면 정원이 찬 날이 "인기 없는 날"처럼 보인다 (실제로 그렇게 보였다).
    const max = Math.max(1, ...rep.days.map((d) => d.arrivals));
    for (const d of rep.days) {
      const col = document.createElement('div');
      col.style.cssText =
        'flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;' +
        'justify-content:flex-end';
      const bar = document.createElement('div');
      const hAll = Math.max(3, Math.round((d.arrivals / max) * 74));
      const hIn = Math.max(0, Math.round((d.visitors / max) * 74));
      const weekend = d.day >= 5;
      const inColor = weekend ? '#f0a03c' : '#4a9ad0';
      bar.style.cssText =
        `width:100%;height:${hAll}px;border-radius:3px 3px 0 0;display:flex;` +
        'flex-direction:column;justify-content:flex-end;' +
        // 위쪽 = 돌려보낸 손님 (빨강 반투명), 아래 = 들어온 손님
        `background:repeating-linear-gradient(45deg,rgba(224,80,60,.85) 0 3px,rgba(150,40,30,.85) 3px 6px)`;
      const inner = document.createElement('div');
      inner.style.cssText = `width:100%;height:${hIn}px;background:${inColor};border-radius:0 0 3px 3px`;
      bar.append(inner);
      bar.title =
        `${d.name} 수요 ${d.arrivals}명 · 입장 ${d.visitors}명` +
        (d.turnedAway ? ` · 만석 ${d.turnedAway}명` : '') +
        ` · ${won(d.revenue)}`;
      const num = document.createElement('div');
      num.textContent = d.turnedAway > 0 ? `${d.visitors}/${d.arrivals}` : String(d.visitors);
      num.style.cssText = 'font-size:10px;opacity:.75';
      const label = document.createElement('div');
      label.textContent = `${d.name}\n${WEATHER_ICON[d.weather] ?? '?'}`;
      label.style.cssText = 'font-size:11px;white-space:pre;text-align:center;line-height:1.2';
      col.append(num, bar, label);
      box.append(col);
    }
    return box;
  }

  private numbers(rep: WeekReport): HTMLElement {
    const box = document.createElement('div');
    box.style.cssText =
      'display:grid;grid-template-columns:repeat(2,1fr);gap:6px 12px;font-size:13px';
    const rows: [string, string, string | undefined][] = [
      ['입장', `${rep.visitors}명`, undefined],
      [
        '만석으로 돌려보냄',
        `${rep.turnedAway}명`,
        rep.turnedAway > 0 ? '#f08a8a' : undefined,
      ],
      ['매출', won(rep.revenue), undefined],
      ['유지비', won(-rep.upkeep), undefined],
      ['손익', won(rep.profit), rep.profit >= 0 ? '#8fe08f' : '#f08a8a'],
      ['퇴장 만족도', rep.exitSatisfaction.toFixed(0), undefined],
      ['헛걸음', `${rep.gaveUp}명`, rep.gaveUp > 0 ? '#f0c060' : undefined],
    ];
    for (const [k, v, color] of rows) {
      const key = document.createElement('div');
      key.textContent = k;
      key.style.cssText = 'opacity:.65';
      const val = document.createElement('div');
      val.textContent = v;
      val.style.cssText = `text-align:right;font-variant-numeric:tabular-nums${
        color ? `;color:${color}` : ''
      }`;
      box.append(key, val);
    }
    return box;
  }

  show(rep: WeekReport, handlers: ReportHandlers): void {
    this.handlers = handlers;
    this.root.replaceChildren();

    const h1 = document.createElement('div');
    h1.textContent = `${rep.week}주차 결산`;
    h1.style.cssText = 'font-size:18px;font-weight:700';
    this.root.append(h1);

    // ① 혼잡 히트맵 — 병목을 먼저 눈으로
    const heatLabel = document.createElement('div');
    heatLabel.textContent = rep.hotspot
      ? `혼잡 — 가장 붐빈 곳 (${rep.hotspot.i}, ${rep.hotspot.j})`
      : '혼잡 — 손님이 없었다';
    heatLabel.style.cssText = 'opacity:.7;font-size:12px';
    this.root.append(heatLabel, this.heatCanvas(rep));

    // ② 요일 막대
    const barLabel = document.createElement('div');
    barLabel.textContent = '요일별 수요 (주말 주황 · 빗금 = 만석으로 돌려보냄)';
    barLabel.style.cssText = 'opacity:.7;font-size:12px;margin-top:4px';
    this.root.append(barLabel, this.dayBars(rep));

    // ③ 숫자
    this.root.append(this.numbers(rep));

    // 병목 — 다음에 무엇을 지을까
    if (rep.bottleneck) {
      const b = document.createElement('div');
      const name = NEED_NAME[rep.bottleneck.need] ?? rep.bottleneck.need;
      b.textContent = `부족한 것: ${name} (공급 ${rep.bottleneck.supply})`;
      b.style.cssText =
        'margin-top:6px;padding:8px 10px;border-radius:8px;background:rgba(240,160,60,.16);' +
        'border:1px solid rgba(240,160,60,.4)';
      this.root.append(b);
    }

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;margin-top:8px';
    if (handlers.onReplay) {
      const replay = document.createElement('button');
      replay.textContent = '다시 보기';
      replay.style.cssText =
        'flex:1;min-height:48px;border-radius:8px;border:1px solid #3a5566;' +
        'background:#20303c;color:#dceaf4;font-size:14px';
      replay.addEventListener('click', () => this.handlers?.onReplay?.());
      btns.append(replay);
    }
    const close = document.createElement('button');
    close.id = 'kairo-report-close';
    close.textContent = '계속';
    close.style.cssText =
      'flex:2;min-height:48px;border-radius:8px;border:none;background:#2f7fc0;' +
      'color:#fff;font-size:15px;font-weight:600';
    close.addEventListener('click', () => {
      this.hide();
      this.handlers?.onClose();
    });
    btns.append(close);
    this.root.append(btns);

    this.root.hidden = false;
    this.root.style.display = 'flex';
  }
}
