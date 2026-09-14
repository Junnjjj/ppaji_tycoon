/**
 * 결과 장면 카드 (P56-a D4) — 원작 「아이템 투입 효과」 문법: 위에 장면(대상 그림 + 손님 둘 + 총점), 아래 축 카드 셋(값 + 5칸 게이지).
 * 새 그림 0 — 대상 그림(등록부·스프라이트)과 있는 초상으로 합성한다. 요리(맛·외관·인기) · 기구(스릴·외관·인기) · 개조(스릴·정원·안전) · 수역(수온·인기·등급)이 같이 쓴다.
 */
import { el } from './dom.js';
import { assetUrl } from './asset-url.js';
import { drawPortrait } from '../assets/draw/portrait.js';
import { iconEl, type IconName } from './icons.js';
import { gaugeEl } from './picture-grid.js';

export interface SceneAxis {
  label: string;
  icon: IconName;
  /** 큰 값 글자(「24°C」·「스릴 3」) */
  value: string;
  /** 게이지 0~max (없으면 안 그린다) */
  gauge?: number;
  gaugeMax?: number;
  /** 값 아래 한 줄(「딱 좋아요」·「+2 UP」) */
  note?: string;
}

export interface SceneCardSpec {
  /** 장면의 주인공 — 그림 자리(등록부·캔버스) */
  art: HTMLElement;
  /** 「전 → 후」 이면 둘째 그림 */
  artAfter?: HTMLElement;
  title: string;
  /** 오른쪽 아래 총점 알약(「인기 24」) */
  score?: { label: string; value: string };
  axes: readonly SceneAxis[];
  /** 장면에 세울 손님 초상 팔레트 둘 — 없으면 기본 둘 */
  guests?: readonly [number, number];
  mood?: 'calm' | 'happy';
  /** 카드 `data-outcome` 등 훅 */
  data?: Record<string, string>;
  /** P56-b2 — 무대 뒤 장면 배경(`public/assets/scenes/scene_<bg>.png`, 192×64). 없으면 그라데이션 */
  bg?: string;
}

export function sceneCard(spec: SceneCardSpec): HTMLDivElement {
  const root = el('div', 'kscene');
  if (spec.data) for (const [k, v] of Object.entries(spec.data)) root.dataset[k] = v;
  const stage = el('div', 'kscene-stage');
  if (spec.bg) { stage.dataset['bg'] = spec.bg; stage.style.setProperty('--scene-bg', `url("${assetUrl(`assets/scenes/scene_${spec.bg}.png`)}")`); } // 경로는 데이터 — 색·크기는 style.css
  const [a, b] = spec.guests ?? [1, 4];
  const gl = el('span', 'kportrait'); gl.append(drawPortrait(a, a % 5, spec.mood ?? 'happy'));
  const gr = el('span', 'kportrait'); gr.append(drawPortrait(b, b % 5, spec.mood ?? 'happy'));
  const center = el('span', 'kscene-art');
  center.append(spec.art);
  if (spec.artAfter) {
    center.append(el('span', 'kscene-arrow', '→'), spec.artAfter);
    center.classList.add('pair');
  }
  stage.append(gl, center, gr);
  if (spec.score) {
    const pill = el('span', 'kscene-score');
    pill.append(el('span', 'kscene-score-k', spec.score.label), el('span', 'kscene-score-v', spec.score.value));
    stage.append(pill);
  }
  root.append(el('div', 'kscene-title', spec.title), stage);
  const axes = el('div', 'kscene-axes');
  for (const ax of spec.axes) {
    const c = el('div', 'kaxis');
    const head = el('div', 'kaxis-head');
    head.append(iconEl(ax.icon), el('span', undefined, ax.label));
    c.append(head, el('div', 'kaxis-value', ax.value));
    if (ax.note) c.append(el('div', 'kaxis-note', ax.note));
    if (ax.gauge !== undefined) c.append(gaugeEl(ax.gauge, ax.gaugeMax ?? 5));
    axes.append(c);
  }
  root.append(axes);
  return root;
}
