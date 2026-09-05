/**
 * HUD — PSS 세로 문법 그대로: 상단 남색 띠 두 조각(좌 시간·우 돈) · 우측 정사각 열 5 ·
 * 핑크 목표 티커 · 하단 바(SAVE · 정보 캡슐 · MENU). 헤더에는 버튼이 0개다(엄지 사각지대).
 *
 * 홈의 상시 컨트롤 정체: `#hud-save` · `#hud-info` · `#hud-menu` · `#hud-right .ksquare` ×5 ·
 * `#hud-ticker`(role=button, 띠 28px + hit 44px). 하네스는 **개수가 아니라 이 이름들**로 잰다.
 */
import { el } from './dom.js';
import { drawPortrait } from '../assets/draw/portrait.js';
import { iconEl, type IconName } from './icons.js';
import { setUiSurface, type UiSurface } from './panels.js';

/** P0 (빠지 스토리): 건설 · 수역 · 코스 · SNS · 장날 — 요리는 MENU 로 */
export type HudCell = 'build' | 'zone' | 'course' | 'sns' | 'market';
export type HudButton = 'save' | 'info' | 'menu' | 'ticker';

export const HUD_CELLS: readonly { id: HudCell; label: string; icon: IconName }[] = [
  { id: 'build', label: '건설', icon: 'build' },
  { id: 'zone', label: '수역', icon: 'pool' },
  { id: 'course', label: '코스', icon: 'slide' },
  { id: 'sns', label: 'SNS', icon: 'sns' },
  { id: 'market', label: '장날', icon: 'shop' },
];

export interface TimeView {
  year: number;
  /** 0 봄 · 1 여름 · 2 가을 · 3 겨울 (G29 아이콘) */
  season: number;
  /** clear · cloudy · rain · snow */
  weather: string;
  seasonName: string;
  weatherName: string;
  tempC: number;
  daypart: string;
  clock: string;
}

export class Hud {
  private readonly year = el('span', 'num', '1');
  private readonly season = el('span', undefined, '봄');
  private readonly seasonIcon = el('span', 'kseason-ic');
  private readonly weatherIcon = el('span', 'kweather-ic');
  private readonly weather = el('span', 'sub', '맑음');
  private seasonShown = -1;
  private weatherShown = '';
  private readonly temp = el('span', 'sub', '16°C');
  private readonly daypart = el('span', 'daypart', '평일 1/3');
  private readonly clock = el('span', undefined, 'AM 08:00');
  private readonly money = el('span', undefined, '0');
  private readonly tickerText = el('span', undefined, '');
  private readonly eventTag = el('div', 'kevent-tag');
  private readonly goals = el('div', 'kgoals');
  private readonly goalEls = new Map<string, { root: HTMLElement; label: HTMLElement; fill: HTMLElement }>();
  private goalBar(id: 'rank' | 'cert'): HTMLElement {
    const root = el('div', 'kgoal');
    root.dataset['goal'] = id;
    const label = el('span', 'kgoal-label ksr', '');
    root.append(iconEl(id === 'rank' ? 'star' : 'check'));
    const bar = el('span', 'kgoal-bar');
    const fill = el('span', 'kgoal-fill');
    bar.append(fill);
    root.append(label, bar);
    root.addEventListener('click', (e) => { e.stopPropagation(); this.handlers.get(`goal:${id}`)?.(); });
    this.goalEls.set(id, { root, label, fill });
    return root;
  }
  private readonly infoBadge = el('span', 'kbadge');
  private readonly visitor = el('span', 'kvisitor');
  private visitorName = '';
  private readonly popularity = el('span', 'num', '0');
  private readonly stars = el('span', 'stars');
  private readonly starIcons: HTMLSpanElement[] = [];
  private readonly cells = new Map<HudCell, HTMLButtonElement>();
  private readonly badges = new Map<HudCell, HTMLElement>();
  private readonly handlers = new Map<string, () => void>();
  private readonly toast = el('div');
  private toastTimer: number | null = null;
  readonly debug: HTMLDivElement;

  constructor(parent: HTMLElement) {
    // 세로 고정 안내 (G32) — CSS 가 가로에서만 보인다
    const rotate = el('div', undefined, '폰을 세로로 돌려 주세요');
    rotate.id = 'krotate';
    rotate.setAttribute('role', 'status');
    parent.append(rotate);
    // 상단 띠
    const top = el('div');
    top.id = 'hud-top';
    const left = el('div', 'kstrip');
    left.id = 'hud-time';
    left.append(this.year, el('span', undefined, '년'), this.seasonIcon, this.season, this.weatherIcon, this.weather, this.temp, this.daypart, this.clock);
    const right = el('div', 'kstrip');
    right.id = 'hud-money';
    right.append(iconEl('coin'), this.money, el('span', undefined, 'G'));
    top.append(left, right);

    // 우측 열
    const column = el('div');
    column.id = 'hud-right';
    for (const cell of HUD_CELLS) {
      const b = el('button', 'ksquare');
      b.type = 'button';
      b.dataset['cell'] = cell.id;
      b.setAttribute('aria-label', cell.label);
      const badge = el('span', 'kbadge', '');
      badge.hidden = true;
      b.append(iconEl(cell.icon, 'lg'), el('span', undefined, cell.label), badge);
      b.addEventListener('click', () => {
        const surf = document.documentElement.dataset['uiSurface'];
        if (surf === 'build' || surf === 'pool') { this.showToast('먼저 배치를 마치세요 — 취소 또는 확정', 2200); return; }
        this.handlers.get(cell.id)?.();
      });
      this.cells.set(cell.id, b);
      this.badges.set(cell.id, badge);
      column.append(b);
    }

    // 티커 — div + role=button (button 이면 28px 띠가 44px 감사에 걸린다)
    const ticker = el('div');
    ticker.id = 'hud-ticker';
    ticker.setAttribute('role', 'button');
    ticker.setAttribute('aria-label', '현재 목표');
    ticker.tabIndex = 0;
    const face = el('span', 'kportrait');
    face.append(drawPortrait(5, 2, 'happy')); // 이 사장 (story.json 의 president)
    const line = el('div', 'kticker-line');
    line.append(face, this.tickerText);
    // R5 (G50): 목표 3슬롯 동시 노출 — 첫 줄 A(즉시), 둘째 줄 B(랭크)·C(인증) 진행바. 탭하면 그 창
    this.goals.append(this.goalBar('rank'), this.goalBar('cert'));
    ticker.append(line, this.goals);
    ticker.addEventListener('click', () => this.handlers.get('ticker')?.());

    // 예고 태그 (G47, 원작 「휴일 3시 심사」) — 하단 바 위 왼쪽
    this.eventTag.id = 'hud-event';
    this.eventTag.classList.add('khide');
    parent.append(this.eventTag);
    // 하단 바
    const bottom = el('div');
    bottom.id = 'hud-bottom';
    const save = el('button', 'kbtn', '');
    save.id = 'hud-save';
    save.type = 'button';
    save.append(iconEl('save'), el('span', undefined, ' SAVE'));
    save.addEventListener('click', () => this.handlers.get('save')?.());
    const info = el('button');
    info.id = 'hud-info';
    info.type = 'button';
    info.setAttribute('aria-label', '인기와 랭크');
    for (let k = 0; k < 5; k++) {
      const s = iconEl('star');
      s.dataset['on'] = '0';
      this.starIcons.push(s);
      this.stars.append(s);
    }
    this.visitor.classList.add('khide');
    this.infoBadge.hidden = true;
    info.append(this.visitor, el('span', 'kpop-label', '인기'), this.popularity, this.stars, this.infoBadge);
    info.addEventListener('click', () => this.handlers.get('info')?.());
    const menu = el('button', 'kbtn', '');
    menu.id = 'hud-menu';
    menu.type = 'button';
    menu.append(iconEl('menu'), el('span', undefined, ' MENU'));
    menu.addEventListener('click', () => this.handlers.get('menu')?.());
    bottom.append(save, info, menu);

    this.toast.id = 'hud-toast';
    this.toast.hidden = true;

    this.debug = el('div');
    this.debug.id = 'wp-debug';
    this.debug.hidden = true;

    parent.append(top, column, ticker, bottom, this.toast, this.debug);
    setUiSurface('home');
  }

  on(what: HudCell | HudButton | 'goal:rank' | 'goal:cert', cb: () => void): void {
    this.handlers.set(what, cb);
  }

  setTime(t: TimeView): void {
    this.year.textContent = String(t.year);
    if (t.season !== this.seasonShown) { this.seasonShown = t.season; this.seasonIcon.replaceChildren(iconEl((['spring', 'summer', 'autumn', 'winter'] as const)[t.season] ?? 'spring')); }
    if (t.weather !== this.weatherShown) { this.weatherShown = t.weather; this.weatherIcon.replaceChildren(iconEl(t.weather === 'rain' ? 'rain' : t.weather === 'snow' ? 'snow' : t.weather === 'cloudy' ? 'cloud' : 'sun')); }
    this.season.textContent = t.seasonName;
    this.weather.textContent = t.weatherName;
    this.temp.textContent = `${Math.round(t.tempC)}°C`;
    this.daypart.textContent = t.daypart;
    this.clock.textContent = t.clock;
  }

  setMoney(g: number): void {
    this.money.textContent = Math.round(g).toLocaleString('ko-KR');
  }

  setPopularity(pop: number, stars: number): void {
    this.popularity.textContent = Math.round(pop).toLocaleString('ko-KR');
    const n = Math.max(0, Math.min(5, Math.round(stars)));
    this.starIcons.forEach((s, k) => { s.dataset['on'] = k < n ? '1' : '0'; });
  }

  /** 지금 파크에 있는 SNS 친구 (G23, PSS 하단 바) — 없으면 숨긴다 */
  setVisitor(v: { name: string; palette: number } | null): void {
    if (!v) { this.visitor.classList.add('khide'); this.visitor.parentElement?.classList.remove('has-visitor'); this.visitorName = ''; return; }
    this.visitor.parentElement?.classList.add('has-visitor');
    if (v.name !== this.visitorName) {
      this.visitorName = v.name;
      this.visitor.replaceChildren(drawPortrait(v.palette, v.palette % 5, 'happy'), el('span', 'kvisitor-name', v.name));
    }
    this.visitor.classList.remove('khide');
  }

  setTicker(text: string): void {
    this.tickerText.textContent = text;
  }

  /** 정보 캡슐 배지 (G48 R6) — 받을 것(안 연 상자 + 안 읽은 알림) */
  setInfoBadge(n: number): void {
    this.infoBadge.textContent = n > 99 ? '99+' : String(n); // G56: 8년차 실측 「207」 이 캡슐 밖으로 삐져나왔다
    this.infoBadge.hidden = n <= 0;
  }

  /** B·C 목표 (G50) — label 과 진행률 0..1. null 이면 숨긴다 */
  setGoal(id: 'rank' | 'cert', g: { label: string; pct: number } | null): void {
    const e = this.goalEls.get(id);
    if (!e) return;
    e.root.classList.toggle('khide', !g);
    if (!g) return;
    e.label.textContent = g.label;
    e.fill.style.width = `${Math.round(Math.max(0, Math.min(1, g.pct)) * 100)}%`;
    e.root.dataset['pct'] = String(Math.round(g.pct * 100));
  }

  setEventTag(text: string | null): void {
    this.eventTag.textContent = text ?? '';
    this.eventTag.classList.toggle('khide', !text);
  }

  setBadge(cell: HudCell, n: number): void {
    const b = this.badges.get(cell);
    if (!b) return;
    b.hidden = n <= 0;
    b.textContent = n > 99 ? '99+' : String(n);
  }

  /** 잠긴 칸은 숨기지 않고 이유를 단다 — 가림막이 아니라 예고 */
  setLocked(cell: HudCell, reason: string | null): void {
    const b = this.cells.get(cell);
    if (!b) return;
    if (reason === null) {
      delete b.dataset['locked'];
      b.setAttribute('aria-label', HUD_CELLS.find((c) => c.id === cell)?.label ?? cell);
    } else {
      b.dataset['locked'] = reason;
      b.setAttribute('aria-label', `${HUD_CELLS.find((c) => c.id === cell)?.label ?? cell} — ${reason}`);
    }
  }

  setSurface(s: UiSurface): void {
    setUiSurface(s);
  }

  /** 축하 배너 (G17) — 랭크업·인증 통과. 들어왔다 2.4초 뒤 나간다. 모달 아님 */
  showBanner(text: string): void {
    const b = el('div', 'kbanner kin', text);
    b.setAttribute('data-banner', '1');
    document.body.append(b);
    requestAnimationFrame(() => b.classList.remove('kin'));
    setTimeout(() => { b.classList.add('kout'); setTimeout(() => b.remove(), 260); }, 2400);
  }

  showToast(text: string, ms = 2400): void {
    this.toast.textContent = text;
    this.toast.hidden = false;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true;
      this.toastTimer = null;
    }, ms);
  }

  setDebug(text: string | null): void {
    this.debug.textContent = text ?? '';
  }
}
