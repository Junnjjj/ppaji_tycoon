import { el } from '../dom.js';
import { iconEl, type IconName } from '../icons.js';
import { WindowPanel } from '../window.js';
import type { Game } from '../../sim/game.js';

/** 랭킹·정보 창 — 현재 ★ · 다음 랭크 조건 진행 · 통계(엔딩 점수식 6항목) · 풀 심사 입구 */
export class RankWindow {
  private readonly win: WindowPanel;
  private readonly body = el('div', 'krows');

  constructor(parent: HTMLElement, private readonly game: () => Game, private readonly openCert: () => void) {
    this.win = new WindowPanel(parent, 'win-rank', '랭킹 · 정보', 'blue');
    this.win.body.append(this.body);
  }

  show(): void {
    this.render();
    this.win.show();
  }

  render(): void {
    const g = this.game();
    this.body.replaceChildren();
    const stars = el('div', 'krow');
    const starBox = el('span', 'kstars');
    for (let k = 0; k < 5; k++) { const ic = iconEl('star'); ic.dataset['on'] = k < g.rank ? '1' : '0'; starBox.append(ic); }
    stars.append(el('span', 'krow-k', `랭크 ${g.rank}`), starBox);
    this.body.append(stars);
    const { next, verdicts } = g.rankProgress();
    if (next) {
      const h = el('div', 'krow');
      h.append(el('span', 'krow-name', `다음: ${next.name}`));
      this.body.append(h);
      verdicts.forEach((v, k) => {
        const r = el('div', 'krow kcond');
        r.dataset['rankcond'] = String(k);
        r.append(el('span', 'krow-k', v.label), el('span', 'krow-v', v.met ? '충족' : `${v.actual} / ${v.need}`));
        this.body.append(r);
      });
    }
    const ICON: Record<string, IconName> = { '인기도': 'star', '누적 방문': 'friends', '좋아요': 'heart', 'SNS 친구': 'friends', '인증 통과': 'check', '열린 지역': 'inbox', '토지': 'build', '청결 · 직원': 'utility' };
    const row = (k: string, v: string): void => {
      const r = el('div', 'krow');
      const ic = ICON[k];
      if (ic) r.append(iconEl(ic));
      r.append(el('span', 'krow-k', k), el('span', 'krow-v knum', v));
      this.body.append(r);
    };
    row('인기도', `${g.parkPopularity().toLocaleString('ko-KR')}`);
    row('청결 · 직원', `${Math.round(g.staff.cleanliness)} · ${g.staff.all.length}명`);
    row('누적 방문', `${g.stats.visitors.toLocaleString('ko-KR')}`);
    row('좋아요', `${g.sns.totalLikes.toLocaleString('ko-KR')}`);
    row('SNS 친구', `${g.sns.unlockedFriends.length}`);
    row('인증 통과', `${g.certs.passes()}`);
    row('열린 지역', `${g.sns.areas.length} / ${g.sns.areasById.size}`);
    row('토지', `${g.land.w}×${g.land.h}`);
    // G53 (조사 D11): 수집은 분모가 있어야 수집이다 — 엔딩 점수식의 친구·인증·레시피 + 시설·타일·수영복
    // 「풀 심사」 주버튼이 접히지 않게 수집 블록은 버튼 **아래**에 둔다 (G5 실터치 절이 버튼 중심을 누른다)
    const collect = el('div', 'kcollect-block');
    const h = el('div', 'krow');
    h.append(el('span', 'krow-name', '수집'));
    collect.append(h);
    const col = (k: string, have: number, total: number): void => {
      const r = el('div', 'krow kcollect');
      r.dataset['collect'] = k;
      const bar = el('span', 'kgoal-bar kcollect-bar');
      const fill = el('span', 'kgoal-fill');
      fill.style.width = `${total > 0 ? Math.round((have / total) * 100) : 0}%`;
      bar.append(fill);
      r.append(el('span', 'krow-k', k), bar, el('span', 'krow-v knum', `${have} / ${total}`));
      collect.append(r);
    };
    col('시설 해금', g.unlocked.facilities.size, g.facilities.defsCount);
    col('풀 타일', g.unlocked.tiles.size, g.tileCount);
    col('수영복·튜브', g.unlocked.gifts.size, g.giftCount);
    col('SNS 친구', g.sns.unlockedFriends.length, g.sns.friendCount);
    col('인증 (종류)', Object.values(g.certs.state.passed).filter((n) => n > 0).length, g.certs.defs.size);
    col('레시피', g.cooking.known.size, g.cooking.recipes.size);
    const certBtn = el('button', 'kbtn primary', '풀 심사');
    certBtn.type = 'button';
    certBtn.id = 'win-rank-cert';
    certBtn.addEventListener('click', () => { this.win.hide(); this.openCert(); });
    this.body.append(certBtn, collect);
  }
}
