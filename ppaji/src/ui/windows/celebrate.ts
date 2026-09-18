/**
 * 축하 팝업 (G46) — 카이로 문법: 랭크업·합격·지역 개방 같은 「모달」 사건은 토스트가 아니라 큰 아이콘 + 한 줄 + 확인.
 * 모달 예산(분당 1)은 main 이 지킨다 — 여기는 그리기만.
 */
import { el } from '../dom.js';
import { assetUrl } from '../asset-url.js';
import { iconEl, type IconName } from '../icons.js';
import { WindowPanel } from '../window.js';
import { rewardArt, type SpriteFn } from '../reward-art.js';

export class CelebrateWindow {
  private readonly win: WindowPanel;
  private readonly icon = el('div', 'kcele-icon kpaper-photo');
  private readonly title = el('div', 'kcele-title kpaper-headline');
  private readonly body = el('div', 'kcele-body kpaper-lede');
  private readonly date = el('div', 'kpaper-date', '');
  private readonly stamp = el('div', 'kstamp kpaper-stamp', '속보');
  private readonly ok: HTMLButtonElement;

  constructor(parent: HTMLElement, private readonly onClosed: () => void = () => undefined, private readonly sprite?: SpriteFn) {
    this.win = new WindowPanel(parent, 'win-celebrate', '축하', 'gold', { modal: true });
    this.win.root.classList.add('kcompact');
    this.ok = el('button', 'kbtn primary', '확인');
    this.ok.type = 'button';
    this.ok.id = 'win-celebrate-ok';
    this.ok.addEventListener('click', () => this.win.hide());
    // G52: 신문 한 면 — 제호 · 날짜 줄 · 헤드라인 · 사진(아이콘) · 리드 · 「속보」 도장
    const paper = el('div', 'kpaper');
    const head = el('div', 'kpaper-head');
    head.append(el('div', 'kpaper-mast', '빠지 타임스'), this.date);
    paper.append(this.stamp, head, this.title, this.icon, this.body);
    this.win.body.append(paper, this.ok);
    this.win.onClose = () => this.onClosed();
  }

  get visible(): boolean { return this.win.visible; }

  /** 제목으로 아이콘을 고른다 — sim 은 아이콘을 모른다 */
  static iconFor(title: string): IconName {
    if (title.includes('랭크')) return 'star';
    if (title.includes('세트 발견')) return 'attraction'; // P60-c D72 B: 첫 세트 성립 — `pic`(첫 멤버 시설)이 오면 그 그림이 우선
    if (title.includes('합격!') || title.includes('통과')) return 'check';
    if (title.includes('불합격')) return 'close';
    if (title.includes('지역')) return 'friends';
    if (title.includes('요리')) return 'cook';
    if (title.includes('버스')) return 'friends';
    if (title.includes('해태')) return 'star';
    return 'gift';
  }

  /** `date` — 「3년차 여름 · 주말」 같은 날짜 줄 (main 이 시계에서 만든다). `pic` — P56-a2 D8: 받은 물건 그림이 사진 자리에 선다(사장 편지 = 장면 위 물건) */
  show(ev: { title: string; body: string; pic?: { kind: string; id: string } }, date = ''): boolean {
    this.date.textContent = date;
    this.stamp.textContent = ev.title.includes('불합격') ? '아쉽' : '속보';
    this.win.setTitle(ev.title.includes('랭크') ? '랭크 업!' : ev.title.includes('합격') ? '심사 결과' : ev.title.includes('지역') ? '새 지역' : ev.title.includes('세트 발견') ? '세트 발견' : '소식');
    if (ev.pic) { const art = rewardArt(ev.pic, this.sprite); art.classList.add('kcele-pic'); art.dataset['celePic'] = `${ev.pic.kind}/${ev.pic.id}`; this.icon.replaceChildren(art); this.icon.dataset['bg'] = 'letter'; this.icon.style.setProperty('--scene-bg', `url("${assetUrl('assets/scenes/scene_letter.png')}")`); } // P56-b2: 사장 편지 = 장면 위 물건(원작 gift-letter)
    else { this.icon.replaceChildren(iconEl(CelebrateWindow.iconFor(ev.title), 'xl')); delete this.icon.dataset['bg']; this.icon.style.removeProperty('--scene-bg'); }
    this.title.textContent = ev.title;
    this.body.textContent = ev.body;
    return this.win.show();
  }
}
