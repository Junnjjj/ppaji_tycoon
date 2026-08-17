import type { KairoScene } from '../render/scenes/KairoScene.js';

/**
 * 감상 화면 — 스펙 §15 "최대 축소 = 감상 화면" (v4 신규).
 *
 * ## 왜 있는가
 *
 * **이 게임의 가장 큰 보상은 "내가 만든 리조트가 살아 움직이는 광경"이다.**
 * 10시간 뒤의 리조트가 **스크린샷 찍고 싶은 화면**이어야 한다. 그러려면 UI 를 걷어내고
 * 전체가 한 화면에 들어오는 상태가 필요하다 — 그게 없으면 플레이어는 자기가 만든 것을
 * 통째로 본 적이 한 번도 없이 게임을 끝낸다.
 *
 * ## 손님은 계속 움직인다
 *
 * 정지 화면이 아니다. 축소 상태에서도 손님·배가 움직여야 "살아 있다"가 된다 —
 * 그래서 씬을 멈추지 않고 **UI 만** 감춘다.
 *
 * ## 공유는 캔버스를 그대로 쓴다
 *
 * 별도 렌더러로 다시 그리면 화면과 다른 그림이 나온다. 지금 보이는 캔버스에 이름·등급·
 * 방문객만 얹어 PNG 로 만든다.
 *
 * ⚠ 저장(다운로드)은 여기서 하지 않는다 — 뷰어 환경에 따라 막히고, 막힌 걸 모른 채
 * "저장했다"고 말하게 된다. **새 탭으로 띄우고** 사용자가 길게 눌러 저장하게 한다.
 */

export interface ShowcaseInfo {
  name: string;
  grade: number;
  visitors: number;
  week: number;
  facilities: number;
}

export class KairoShowcase {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly subEl: HTMLDivElement;
  private hidden: HTMLElement[] = [];
  private lastShot: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly scene: KairoScene,
    private readonly info: () => ShowcaseInfo,
    private readonly onRename: (name: string) => void,
  ) {
    this.root = document.createElement('div');
    this.root.id = 'kairo-showcase';
    // 화면을 덮지 않는다 — 지도가 보여야 감상이다. 위아래 띠만 얹는다
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:26;display:none;flex-direction:column;' +
      'justify-content:space-between;pointer-events:none;' +
      'font:13px/1.4 system-ui,sans-serif;color:#fff';

    const top = document.createElement('div');
    top.style.cssText =
      'pointer-events:auto;padding:14px 14px 18px;' +
      'background:linear-gradient(rgba(4,12,18,.82),rgba(4,12,18,0))';
    this.titleEl = document.createElement('div');
    this.titleEl.id = 'kairo-showcase-name';
    this.titleEl.style.cssText = 'font-size:19px;font-weight:800;letter-spacing:-.2px';
    this.subEl = document.createElement('div');
    this.subEl.style.cssText = 'font-size:12px;opacity:.85;margin-top:2px';
    top.append(this.titleEl, this.subEl);
    // 이름을 탭하면 바꾼다 — 내 리조트라는 감각의 절반은 이름이다
    top.addEventListener('click', () => {
      const cur = this.info().name;
      const next = window.prompt('리조트 이름', cur);
      if (next !== null && next.trim() !== '') {
        this.onRename(next.trim().slice(0, 20));
        this.refresh();
      }
    });

    const bottom = document.createElement('div');
    bottom.style.cssText =
      'pointer-events:auto;display:flex;gap:8px;justify-content:flex-end;padding:18px 14px 16px;' +
      'background:linear-gradient(rgba(4,12,18,0),rgba(4,12,18,.82))';
    const share = document.createElement('button');
    share.id = 'kairo-showcase-share';
    share.textContent = '📷 공유';
    share.style.cssText =
      'min-height:48px;min-width:96px;border-radius:12px;border:none;background:#2f7fc0;' +
      'color:#fff;font-size:15px;font-weight:600';
    share.addEventListener('click', () => this.share());
    const close = document.createElement('button');
    close.id = 'kairo-showcase-close';
    close.textContent = '닫기';
    close.style.cssText =
      'min-height:48px;min-width:80px;border-radius:12px;border:none;background:rgba(20,40,54,.9);' +
      'color:#eaf6ff;font-size:15px';
    close.addEventListener('click', () => this.hide());
    bottom.append(share, close);

    this.root.append(top, bottom);
    parent.append(this.root);
  }

  get visible(): boolean {
    return this.root.style.display === 'flex';
  }

  /** 마지막으로 만든 공유 이미지 (data URL) — 검증이 읽는다 */
  get lastShareImage(): string | null {
    return this.lastShot;
  }

  show(): void {
    /*
     * UI 를 걷어낸다. **씬은 멈추지 않는다** — 손님이 움직여야 "살아 있다"가 된다.
     * 요소를 지우지 않고 감췄다가 되돌린다 (지우면 상태가 날아간다).
     */
    this.hidden = [];
    for (const el of Array.from(document.body.children)) {
      if (!(el instanceof HTMLElement)) continue;
      if (el === this.root || el.id === 'game' || el.tagName === 'CANVAS') continue;
      if (el.style.display === 'none' || el.hidden) continue;
      this.hidden.push(el);
      el.dataset['showcaseHidden'] = el.style.display;
      el.style.display = 'none';
    }
    this.scene.setUpscale(1); // 최대 축소 — 전체가 한 화면에
    this.scene.fitAll();
    this.root.style.display = 'flex';
    this.refresh();
  }

  hide(): void {
    for (const el of this.hidden) {
      el.style.display = el.dataset['showcaseHidden'] ?? '';
      delete el.dataset['showcaseHidden'];
    }
    this.hidden = [];
    this.root.style.display = 'none';
  }

  refresh(): void {
    const i = this.info();
    this.titleEl.textContent = `${'★'.repeat(Math.max(1, i.grade))} ${i.name}`;
    this.subEl.textContent =
      `방문객 ${i.visitors}명 · ${i.week}주차 · 시설 ${i.facilities}개 — 이름을 탭하면 바꿉니다`;
  }

  /**
   * 지금 보이는 캔버스에 이름·등급을 얹어 PNG 를 만든다.
   *
   * ⚠ 캔버스가 WebGL 이면 `preserveDrawingBuffer` 없이는 **검은 이미지**가 나온다.
   * 그래서 결과를 검사해서 비어 있으면 그 사실을 돌려준다 — "저장했다"고 말해놓고
   * 검은 사각형을 주는 것이 최악이다 (이 프로젝트에서 readPixels 로 이미 겪었다).
   */
  share(): { ok: boolean; reason?: string } {
    const src = document.querySelector('#game canvas') as HTMLCanvasElement | null;
    if (!src) return { ok: false, reason: '캔버스를 못 찾았다' };
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const g = out.getContext('2d');
    if (!g) return { ok: false, reason: '2d 컨텍스트를 못 얻었다' };
    g.imageSmoothingEnabled = false;
    try {
      g.drawImage(src, 0, 0);
    } catch {
      return { ok: false, reason: '캔버스를 복사하지 못했다' };
    }

    const i = this.info();
    const pad = Math.round(out.width * 0.03);
    g.fillStyle = 'rgba(4,12,18,.72)';
    g.fillRect(0, 0, out.width, Math.round(out.height * 0.11));
    g.fillStyle = '#ffffff';
    g.font = `700 ${Math.round(out.height * 0.035)}px system-ui, sans-serif`;
    g.fillText(`${'★'.repeat(Math.max(1, i.grade))} ${i.name}`, pad, Math.round(out.height * 0.05));
    g.font = `${Math.round(out.height * 0.022)}px system-ui, sans-serif`;
    g.fillStyle = '#cfe6f4';
    g.fillText(
      `방문객 ${i.visitors}명 · ${i.week}주차 · 시설 ${i.facilities}개`,
      pad,
      Math.round(out.height * 0.088),
    );

    const url = out.toDataURL('image/png');
    // 비어 있는지 확인 — WebGL 버퍼가 보존 안 되면 검은 그림이 나온다
    const probe = g.getImageData(0, Math.round(out.height * 0.5), out.width, 1).data;
    let nonBlack = 0;
    for (let k = 0; k < probe.length; k += 4) {
      if ((probe[k] ?? 0) + (probe[k + 1] ?? 0) + (probe[k + 2] ?? 0) > 24) nonBlack++;
    }
    if (nonBlack < out.width * 0.05) {
      return { ok: false, reason: '캔버스가 비어 있습니다 (?px=1 로 띄우면 저장됩니다)' };
    }
    this.lastShot = url;
    // 저장은 사용자가 한다 — 다운로드는 환경에 따라 조용히 막힌다
    const w = window.open();
    if (w) w.document.write(`<img src="${url}" style="width:100%">`);
    return { ok: true };
  }
}
