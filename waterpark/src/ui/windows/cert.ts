/**
 * 풀 심사 창 — PSS 무대 창 문법: 계열 탭 · 인증마다 조건 행(진행률·현재값) · **예상 점수 / 합격선** · 신청.
 * 자격 미달이어도 표는 보여 준다 — 「지금 몇 점」이 곧 다음 목표다 (부정 리뷰 1 처방).
 */
import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { drawPortrait } from '../../assets/draw/portrait.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';
import type { CertDef, CertFamily } from '../../data/schema.js';

const FAMILY_KO: Record<CertFamily, string> = { grade: '등급', color: '색', scent: '향', spa: '스파', fruit: '과일', stream: '물살', fun: '재미', cutesy: '큐트' };
const GRADE_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

export class CertWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs kwin-tabs');
  private readonly body = el('div', 'krows');
  private family: CertFamily = 'grade';

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void }) {
    this.win = new WindowPanel(parent, 'win-cert', '풀 심사', 'purple');
    const fams = [...new Set([...this.game().certs.defs.values()].map((d) => d.family))];
    for (const f of fams) {
      const b = el('button', 'ktab', FAMILY_KO[f]);
      b.type = 'button';
      b.dataset['tab'] = f;
      b.addEventListener('click', () => { this.family = f; this.render(); });
      this.tabs.append(b);
    }
    this.win.body.append(this.tabs, this.body);
  }

  show(): void {
    this.render();
    this.win.show();
  }

  render(): void {
    const g = this.game();
    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>('.ktab')) b.classList.toggle('on', b.dataset['tab'] === this.family);
    this.body.replaceChildren();
    const applied = g.certs.state.applied;
    if (applied) {
      const row = el('div', 'krow');
      row.append(el('span', 'krow-k', `신청 중: ${g.certs.defs.get(applied.id)?.name ?? applied.id}`), el('span', 'krow-v', `${applied.judgeDay - g.day}일 뒤 주말 15시`));
      this.body.append(row);
    }
    const last = g.certs.state.last;
    if (last) {
      const row = el('div', 'krow');
      row.append(el('span', 'krow-k', `최근: ${g.certs.defs.get(last.id)?.name ?? last.id}`), el('span', 'krow-v', `${last.judges.join('+')}=${last.score} · ${last.pass ? '합격' : '불합격'}`));
      this.body.append(row);
    }
    const defs = [...g.certs.defs.values()].filter((d) => d.family === this.family).sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade));
    for (const def of defs) this.body.append(this.certCard(def));
  }

  private certCard(def: CertDef): HTMLElement {
    const g = this.game();
    const card = el('div', 'kcert');
    card.dataset['cert'] = def.id;
    const passes = g.certs.state.passed[def.id] ?? 0;
    // G56: 통과한 인증은 접는다 — 8년차 실측으로 F·D 의 무대와 조건이 창 첫 화면을 다 먹어 사다리의 다음 칸이 안 보였다
    const compact = passes > 0;
    if (compact) card.classList.add('kcert-passed');
    if (!compact) {
      // 무대 — 심사위원 셋 (PSS 심사 창의 문법, G23)
      const stage = el('div', 'kstage');
      for (const pal of [1, 4, 6]) { const f = el('span', 'kportrait'); f.append(drawPortrait(pal, pal % 5, 'calm')); stage.append(f); }
      card.append(stage);
    }
    const head = el('div', 'krow');
    head.append(el('span', 'krow-name', `${def.grade} · ${def.name}${passes ? ` (통과 ${passes})` : ''}`), el('span', 'krow-v', `합격선 ${def.pass}`));
    card.append(head);
    const ex = g.expectedCert(def.id);
    if (ex && compact) {
      card.append(el('div', 'krow-sub', `재수상 = 재료 3 · 예상 ${ex.base}/30`));
    } else if (ex) {
      ex.parts.forEach((p, k) => {
        const r = el('div', 'krow kcond');
        const judge = el('span', 'kportrait small'); judge.append(drawPortrait([1, 4, 6][k % 3] as number, ([1, 4, 6][k % 3] as number) % 5, p.verdict.met ? 'happy' : 'calm'));
        r.append(judge);
        r.append(el('span', 'krow-k', `${p.verdict.label}${p.weight === 2 ? ' (×2)' : ''}`), el('span', 'krow-v', `${p.verdict.met ? '충족' : `${Math.round(p.verdict.progress * 100)}%`}`));
        card.append(r);
        if (p.verdict.full) {
          // 만점 조건 (G42) — 색·향은 농도 5칸이라야 만점
          const f = el('div', 'krow-sub kfull');
          f.dataset['full'] = String(k);
          f.textContent = `만점: ${p.verdict.full.label} ${p.verdict.full.need}/5 · 지금 ${p.verdict.full.actual}/5`;
          card.append(f);
        }
      });
      const sc = el('div', 'krow kscore');
      sc.dataset['expected'] = String(ex.base);
      sc.append(el('span', 'krow-k', '예상 점수'), el('span', 'krow-v', `${ex.base} / 30${ex.base >= def.pass ? ' — 합격권' : ` — ${def.pass - ex.base}점 부족`}`));
      card.append(sc);
    }
    const can = g.certs.canApply(def.id, g.day, g.money);
    const btn = el('button', 'kbtn primary', `신청 · ${def.fee.toLocaleString('ko-KR')}G`);
    btn.type = 'button';
    btn.dataset['apply'] = def.id;
    btn.disabled = !can.ok;
    if (!can.ok) btn.title = can.reason;
    const why = el('div', 'krow-sub', can.ok ? `신청하면 ${can.judgeDay - g.day}일 뒤 주말 15시 심사` : can.reason);
    btn.addEventListener('click', () => confirmDialog({ title: `${def.name}에 신청할까요?`, body: can.ok ? `${can.judgeDay - g.day}일 뒤 주말 15시 심사 · 예상 ${ex ? ex.base : 0}/30 (합격선 ${def.pass})` : can.reason, cost: def.fee, onYes: () => {
      const r = g.applyCert(def.id);
      this.host.toast(r.ok ? `${def.name} 신청 · −${def.fee}G` : r.reason, r.ok);
      if (r.ok) this.host.onChanged();
      this.render();
    } }));
    card.append(btn, why);
    return card;
  }
}
