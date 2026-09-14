/**
 * 풀 심사 창 — PSS 무대 창 문법: 계열 탭 · 인증마다 조건 행(진행률·현재값) · **예상 점수 / 합격선** · 신청.
 * 자격 미달이어도 표는 보여 준다 — 「지금 몇 점」이 곧 다음 목표다 (부정 리뷰 1 처방).
 * P56-a D8: 심사위원 셋이 **말풍선으로 자기 조건을 말한다**(조건 라벨에서 파생, 데이터 0줄) · 조건 옆에 대상 그림 · 합격 보상은 그림 카드.
 */
import { el } from '../dom.js';
import { confirmDialog } from '../dialog.js';
import { portraitEl, JUDGE_IDS } from '../portraits.js'; // P56-b2: 심사위원 셋은 그림 초상(없으면 코드 초상)
import { WindowPanel } from '../window.js';
import { canvasPictureEl, pictureEl, pictureId } from '../pictures.js';
import { iconEl, type IconName } from '../icons.js';
import { rewardLabel } from './sns.js';
import { rewardArt } from '../reward-art.js';
import type { Game } from '../../sim/game.js';
import type { CertDef, CertFamily, Condition } from '../../data/schema.js';

/** 계열 8 (P6 재편, 키는 코드·id 호환을 위해 그대로): 물놀이(수역) · 경관(물빛·장식) · 핫플(분위기·좋아요) · 사철(온수·실내) · 맛집(요리) · 스릴(코스) · 안전(해경) · 청결(위생) */
const FAMILY_KO: Record<CertFamily, string> = { grade: '물놀이', color: '경관', scent: '핫플', spa: '사철', fruit: '맛집', stream: '스릴', fun: '안전', cutesy: '청결' };
const GRADE_ORDER = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
/** 심사위원 셋 — 초상 팔레트와 말투 (원작: 셋이 각자 기준을 말한다) */
const JUDGES: readonly { pal: number; say: (label: string, met: boolean) => string }[] = [
  { pal: 1, say: (l, met) => met ? `「${l}」 — 됐네요, 통과!` : `「${l}」 이면 좋겠는데요.` },
  { pal: 4, say: (l, met) => met ? `${l}, 확인했습니다.` : `${l}… 아직이군요.` },
  { pal: 6, say: (l, met) => met ? `${l}! 문제없어요.` : `${l}까지 가 봅시다.` },
];

/** 조건의 대상 그림 — 시설 id 는 스프라이트, 재료·아이템은 등록부, 나머지는 종류 아이콘 */
function condArt(c: Condition, sprite: (id: string) => HTMLCanvasElement | null): HTMLElement {
  const leaf = (c.kind === 'all' || c.kind === 'any') ? c.of[0] : c;
  if (!leaf) return iconEl('star', 'kpic-fb');
  const kind = leaf.kind as string;
  const id = (leaf as { id?: string }).id;
  if (kind === 'facility' && id) return canvasPictureEl(sprite(id), 'build');
  if (kind === 'item' && id) return pictureEl(pictureId('item', id), 'pool');
  const icon: IconName = /^rig/.test(kind) ? 'attraction' : kind === 'pool' ? 'pool' : kind === 'recipe' || kind === 'menu' ? 'restaurant' : kind === 'likes' ? 'heart' : kind === 'course' || kind === 'courseThrill' ? 'slide' : 'star';
  return iconEl(icon, 'kpic-fb');
}

export class CertWindow {
  private readonly win: WindowPanel;
  private readonly tabs = el('div', 'ktabs kwin-tabs');
  private readonly body = el('div', 'krows');
  private family: CertFamily = 'grade';

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly host: { toast(t: string, ok: boolean): void; onChanged(): void; sprite(facId: string): HTMLCanvasElement | null }) {
    this.win = new WindowPanel(parent, 'win-cert', '빠지 심사', 'purple');
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

  /** P56-a2 — 보상 그림은 `reward-art.ts` 하나(소원·달력·편지와 같은 함수) */
  private rewardArt(def: CertDef): HTMLElement {
    return rewardArt(def.reward as { kind: string; id?: string }, this.host.sprite);
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
      JUDGES.forEach((j, k) => { const f = el('span', 'kportrait'); f.append(portraitEl(JUDGE_IDS[k] ?? 'judge', 'calm', { palette: j.pal, hair: j.pal % 5 })); stage.append(f); });
      card.append(stage);
    }
    const head = el('div', 'krow');
    head.append(el('span', 'krow-name', `${def.grade} · ${def.name}${passes ? ` (통과 ${passes})` : ''}`), el('span', 'krow-v', `합격선 ${def.pass}`));
    card.append(head);
    const ex = g.expectedCert(def.id);
    if (ex && compact) {
      card.append(el('div', 'krow-sub', `재수상 = 재료 3 · 예상 ${ex.base}/30`));
    } else if (ex) {
      let judgeIx = 0;
      ex.parts.forEach((p, k) => {
        // 심사위원 한 명 = 조건 한 줄. 가중치 2 는 같은 조건을 둘이 말한다(원작 표)
        for (let w = 0; w < p.weight; w++) {
          const judge = JUDGES[judgeIx % JUDGES.length] as (typeof JUDGES)[number];
          judgeIx++;
          const r = el('div', 'krow kcond');
          r.dataset['judge'] = String(judgeIx);
          const face = el('span', 'kportrait small'); face.append(portraitEl(JUDGE_IDS[(judgeIx - 1) % JUDGES.length] ?? 'judge', p.verdict.met ? 'happy' : 'calm', { palette: judge.pal, hair: judge.pal % 5 }));
          const bubble = el('span', 'kcond-say', judge.say(p.verdict.label, p.verdict.met));
          bubble.dataset['line'] = '1';
          const art = el('span', 'kcond-art'); art.append(condArt(def.conditions[k]?.cond ?? { kind: 'all', of: [] } as Condition, this.host.sprite));
          r.append(face, bubble, art, el('span', 'krow-v', p.verdict.met ? '충족' : `${Math.round(p.verdict.progress * 100)}%`));
          card.append(r);
        }
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
      // 합격 보상 — 그림 카드 (원작 「합격 상품 미리 표시」)
      const rew = el('div', 'krow kreward');
      const art = el('span', 'kreward-art'); art.append(this.rewardArt(def));
      rew.append(el('span', 'krow-k', '합격 상품'), art, el('span', 'krow-v', rewardLabel(g, def.reward)));
      card.append(rew);
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
