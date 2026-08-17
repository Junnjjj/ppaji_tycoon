import { FACILITY_DEFS, EQUIPMENT_DEFS, type FacilityDef, type EquipmentDef } from '../../src/sim/index.js';

/**
 * DOM HUD — quality-bar 의 UI 문법을 따른다: 상단 다크 네이비 칩(아이콘+숫자),
 * 하단 크림 라운드 버튼. 캔버스가 아니라 DOM 이라 어느 해상도에서도 선명하고 에셋이 0장이다.
 *
 * 조작 흐름 (폰에서 실수하지 않게):
 *   건설 → 팔레트에서 고름 → 고스트가 화면에 뜸 → 끌어서 위치 → [확정] 눌러야 지어짐
 *   철거 → 시설 탭 → 즉시 철거(절반 환급)
 */

export type Mode = 'view' | 'place' | 'demolish';

export interface HudCallbacks {
  onPick: (defId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRotate: () => void;
  onMode: (m: Mode) => void;
  onSpeed: (s: 0 | 1 | 2 | 3) => void;
  onDemolishSelected: () => void;
  onCloseSheet: () => void;
}

export interface HudState {
  money: number;
  day: number;
  guests: number;
  queued: number;
  happiness: number;
  facilities: number;
  speed: number;
  canAfford: boolean;
  canPlace: boolean;
  hint: string;
  income: number;
}

/** 시설 탭 시 뜨는 상세 */
export interface SheetInfo {
  icon: string;
  name: string;
  desc: string;
  rows: Array<[string, string]>;
}

export const ICONS: Record<string, string> = {
  tent: '⛺',
  gate: '🎫', shop: '🏪', cafe: '☕',
  banana: '🍌', jetski: '🛥️', flyfish: '🐟', wakeboard: '🏄', restroom: '🚻', shower: '🚿', changing: '🚪',
  shade: '⛱️', path: '🟫', deck: '🟦', dock: '🛶', slide: '🛝', trampoline: '🤸', pool: '🏊',
};

const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.hud{position:fixed;inset:0;pointer-events:none;font:600 13px/1.25 -apple-system,system-ui,sans-serif;z-index:10}
.hud button{font:inherit;border:0;cursor:pointer;pointer-events:auto}
.top{position:absolute;top:calc(6px + env(safe-area-inset-top));left:8px;right:8px;display:flex;gap:6px;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:5px;background:rgba(24,38,56,.9);color:#f4e9cf;
  border:2px solid #0f1b28;border-radius:11px;padding:6px 9px;box-shadow:0 2px 0 #0f1b28}
.chip b{color:#ffd98a;font-size:14px;letter-spacing:.2px}
.hint{position:absolute;top:calc(46px + env(safe-area-inset-top));left:8px;right:8px;
  background:rgba(24,38,56,.86);color:#e8f0f4;border-radius:9px;padding:6px 10px;font-weight:600}
.bottom{position:absolute;left:0;right:0;bottom:0;padding:8px 8px calc(8px + env(safe-area-inset-bottom));
  display:flex;flex-direction:column;gap:7px}
.row{display:flex;gap:7px}
.btn{flex:1;min-height:46px;border-radius:12px;background:#f6ecd6;color:#3b2c1a;
  border:2px solid #7f663b;box-shadow:0 3px 0 #7f663b;display:flex;align-items:center;justify-content:center;gap:5px}
.btn:active{transform:translateY(2px);box-shadow:0 1px 0 #7f663b}
.btn.on{background:#ffd98a}
.btn.wide{flex:2}
.btn.go{background:#7fd07f;border-color:#3f7a3f;box-shadow:0 3px 0 #3f7a3f}
.btn.no{background:#efa9a2;border-color:#8b4038;box-shadow:0 3px 0 #8b4038}
.btn:disabled{opacity:.45;filter:grayscale(.5)}
.pal{display:flex;gap:6px;padding:2px;flex-wrap:wrap;justify-content:flex-start}
.tabs{display:flex;gap:6px}
.tab{flex:1;min-height:34px;border-radius:9px;background:#e6dcc6;color:#5c4a30;
  border:2px solid #7f663b;box-shadow:0 2px 0 #7f663b;font-size:12px}
.tab.on{background:#ffd98a;color:#3b2c1a}
.card{flex:0 0 auto;min-width:78px;min-height:60px;border-radius:12px;background:#f6ecd6;color:#3b2c1a;
  border:2px solid #7f663b;box-shadow:0 3px 0 #7f663b;padding:5px 8px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1px;pointer-events:auto}
.card .ico{font-size:17px;line-height:1}
.card .cost{font-size:11px;color:#7a6242}
.card:disabled{opacity:.42}
.spd{flex:0 0 46px;min-height:46px;border-radius:12px;background:#e6dcc6;color:#3b2c1a;
  border:2px solid #7f663b;box-shadow:0 3px 0 #7f663b}
.spd.on{background:#ffd98a}
.sheet{position:absolute;left:8px;right:8px;bottom:calc(66px + env(safe-area-inset-bottom));
  background:#f6ecd6;color:#3b2c1a;border:2px solid #7f663b;border-radius:14px;
  box-shadow:0 4px 0 #7f663b;padding:10px 12px;pointer-events:auto;display:none}
.sheet h4{margin:0 0 6px;font-size:15px;display:flex;align-items:center;gap:6px}
.sheet .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-size:12px;color:#5c4a30}
.sheet .grid b{color:#3b2c1a}
.sheet .acts{display:flex;gap:6px;margin-top:8px}
.sheet .acts button{flex:1;min-height:40px;border-radius:10px;border:2px solid #7f663b;
  background:#e6dcc6;color:#3b2c1a;box-shadow:0 2px 0 #7f663b}
.sheet .acts .del{background:#efa9a2;border-color:#8b4038;box-shadow:0 2px 0 #8b4038}
`;

export function makeHud(cb: HudCallbacks): {
  update: (s: HudState) => void;
  setMode: (m: Mode) => void;
  setPlacing: (defId: string | null) => void;
  showSheet: (info: SheetInfo | null) => void;
} {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'hud';
  document.body.appendChild(root);

  // ── 상단 칩 ──
  const top = document.createElement('div');
  top.className = 'top';
  const chip = (icon: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'chip';
    el.innerHTML = `<span>${icon}</span><b></b>`;
    top.appendChild(el);
    return el.querySelector('b')!;
  };
  const cMoney = chip('🪙');
  const cGuest = chip('🧍');
  const cHappy = chip('😊');
  const cDay = chip('☀️');
  const cIncome = chip('💰');
  root.appendChild(top);

  const hint = document.createElement('div');
  hint.className = 'hint';
  root.appendChild(hint);

  // ── 시설 상세 시트 ──
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  const sTitle = document.createElement('h4');
  const sDesc = document.createElement('div');
  sDesc.style.cssText = 'font-size:12px;color:#6b5637;margin-bottom:6px';
  const sGrid = document.createElement('div');
  sGrid.className = 'grid';
  const acts = document.createElement('div');
  acts.className = 'acts';
  const bDel = document.createElement('button');
  bDel.className = 'del';
  bDel.textContent = '⛏ 철거 (절반 환급)';
  bDel.onclick = () => cb.onDemolishSelected();
  const bClose = document.createElement('button');
  bClose.textContent = '닫기';
  bClose.onclick = () => cb.onCloseSheet();
  acts.append(bDel, bClose);
  sheet.append(sTitle, sDesc, sGrid, acts);
  root.appendChild(sheet);

  // ── 하단 ──
  const bottom = document.createElement('div');
  bottom.className = 'bottom';
  root.appendChild(bottom);

  // 팔레트 — 가로 스크롤은 폰에서 잘 안 잡힌다. 카테고리 탭으로 나눠 **스크롤을 없앤다**.
  const CATS: Array<{ key: string; label: string; ids: string[] }> = [
    // 카테고리당 5개 이하 (가로 스크롤이 폰에서 안 잡힌다) — 넘치면 탭을 늘린다
    { key: 'land', label: '🏠 육상', ids: ['gate', 'shop', 'cafe', 'restroom', 'shower'] },
    { key: 'way', label: '🚶 동선', ids: ['path', 'deck', 'dock'] },
    { key: 'rest', label: '⛱ 휴식', ids: ['shade', 'tent', 'changing'] },
    { key: 'water', label: '🌊 수상', ids: ['slide', 'trampoline', 'pool'] },
    // 코스는 시설이 아니다 — 경로+차량이라 카드 클릭이 '그리기 모드' 로 들어간다
    { key: 'course', label: '🚤 코스', ids: EQUIPMENT_DEFS.map((e: EquipmentDef) => e.id) },
  ];
  let cat = 'land';
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.style.display = 'none';
  const tabBtns: HTMLButtonElement[] = [];
  for (const c of CATS) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = c.label;
    b.onclick = () => { cat = c.key; renderPal(); };
    tabBtns.push(b);
    tabs.appendChild(b);
  }
  const pal = document.createElement('div');
  pal.className = 'pal';
  pal.style.display = 'none';
  const cards = new Map<string, HTMLButtonElement>();
  const ORDER = CATS.flatMap((c) => c.ids);
  for (const id of ORDER) {
    const fac = FACILITY_DEFS.find((d: FacilityDef) => d.id === id);
    const eq = EQUIPMENT_DEFS.find((e: EquipmentDef) => e.id === id);
    const def = fac ?? (eq ? { id: eq.id, name: eq.name, cost: eq.vehicleCost } : null);
    if (!def) continue;
    const b = document.createElement('button');
    b.className = 'card';
    b.dataset.id = id;
    const cost = def.cost >= 10000 ? `${Math.round(def.cost / 10000)}만` : '무료';
    b.innerHTML = `<span class="ico">${ICONS[id] ?? '🏗'}</span><span>${def.name}</span><span class="cost">${cost}</span>`;
    b.onclick = () => cb.onPick(id);
    cards.set(id, b);
    pal.appendChild(b);
  }
  bottom.append(tabs, pal);

  function renderPal(): void {
    const active = CATS.find((c) => c.key === cat)!;
    for (const [id, b] of cards) b.style.display = active.ids.includes(id) ? 'flex' : 'none';
    for (const [i, b] of tabBtns.entries()) b.classList.toggle('on', CATS[i]!.key === cat);
  }
  renderPal();

  // 확정 바 (배치 중에만)
  const confirmRow = document.createElement('div');
  confirmRow.className = 'row';
  confirmRow.style.display = 'none';
  const bCancel = document.createElement('button');
  bCancel.className = 'btn no';
  bCancel.textContent = '취소';
  bCancel.onclick = cb.onCancel;
  const bRot = document.createElement('button');
  bRot.className = 'btn';
  bRot.textContent = '↻ 회전';
  bRot.onclick = cb.onRotate;
  const bOk = document.createElement('button');
  bOk.className = 'btn go wide';
  bOk.textContent = '✔ 확정';
  bOk.onclick = cb.onConfirm;
  confirmRow.append(bCancel, bRot, bOk);
  bottom.appendChild(confirmRow);

  // 모드 + 속도
  const modeRow = document.createElement('div');
  modeRow.className = 'row';
  const bBuild = document.createElement('button');
  bBuild.className = 'btn wide';
  bBuild.textContent = '🔨 건설';
  const bDemo = document.createElement('button');
  bDemo.className = 'btn';
  bDemo.textContent = '⛏ 철거';
  modeRow.append(bBuild, bDemo);
  const spdBtns: HTMLButtonElement[] = [];
  for (const [i, label] of (['⏸', '▶', '▶▶', '⏩'] as const).entries()) {
    const b = document.createElement('button');
    b.className = 'spd';
    b.textContent = label;
    b.onclick = () => cb.onSpeed(i as 0 | 1 | 2 | 3);
    spdBtns.push(b);
    modeRow.appendChild(b);
  }
  bottom.appendChild(modeRow);

  let mode: Mode = 'view';
  // silent: 초기 세팅에서 콜백을 부르면 아직 대입되지 않은 hud 를 참조해 TDZ 로 죽는다
  const setMode = (m: Mode, silent = false): void => {
    mode = m;
    bBuild.classList.toggle('on', m === 'place');
    bDemo.classList.toggle('on', m === 'demolish');
    pal.style.display = m === 'place' ? 'flex' : 'none';
    tabs.style.display = m === 'place' ? 'flex' : 'none';
    if (!silent) cb.onMode(m);
  };
  bBuild.onclick = () => setMode(mode === 'place' ? 'view' : 'place');
  bDemo.onclick = () => setMode(mode === 'demolish' ? 'view' : 'demolish');

  const setPlacing = (defId: string | null): void => {
    confirmRow.style.display = defId ? 'flex' : 'none';
    pal.style.display = defId ? 'none' : mode === 'place' ? 'flex' : 'none';
    tabs.style.display = pal.style.display;
    for (const [id, b] of cards) b.classList.toggle('on', id === defId);
  };

  const won = (v: number): string =>
    v >= 100000000 ? `${(v / 100000000).toFixed(1)}억` : `${Math.round(v / 10000).toLocaleString()}만`;

  const update = (s: HudState): void => {
    cMoney.textContent = won(s.money);
    cGuest.textContent = `${s.guests}${s.queued ? ` (대기 ${s.queued})` : ''}`;
    cHappy.textContent = `${Math.round(s.happiness)}%`;
    cDay.textContent = `${s.day + 1}일차`;
    cIncome.textContent = `+${Math.round(s.income / 10000)}만`;
    hint.textContent = s.hint;
    hint.style.display = s.hint ? 'block' : 'none';
    // ⚠ 라벨을 상태에 따라 바꾸지 말 것 — 버튼이 말을 바꾸면 눈도 자동화도 흔들린다.
    // 이유는 힌트 줄이 이미 말해준다 (거부 사유·자금 부족). 여기선 활성만 토글한다.
    bOk.disabled = !s.canPlace || !s.canAfford;
    for (const [id, b] of cards) {
      const fac = FACILITY_DEFS.find((d: FacilityDef) => d.id === id);
      const eq = EQUIPMENT_DEFS.find((e: EquipmentDef) => e.id === id);
      const cost = fac?.cost ?? eq?.vehicleCost;
      b.disabled = cost !== undefined && cost > s.money;
    }
    for (const [i, b] of spdBtns.entries()) b.classList.toggle('on', i === s.speed);
  };

  const showSheet = (info: SheetInfo | null): void => {
    if (!info) { sheet.style.display = 'none'; return; }
    sTitle.textContent = `${info.icon} ${info.name}`;
    sDesc.textContent = info.desc;
    sGrid.innerHTML = info.rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
    sheet.style.display = 'block';
  };

  setMode('view', true);
  return { update, setMode, setPlacing, showSheet };
}
