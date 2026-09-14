/**
 * 보상 그림 하나 (P56-a2 D8) — 소원·인증·달력·랭크 보상과 사장 편지가 같은 함수로 「무엇을 받나」를 그림으로 낸다.
 *   시설 → 스프라이트(`sprite(id)`), 부품·선물·재료·아이템·팔찌 → 등록부 `pictureEl`(그림이 오기 전엔 계열 아이콘 폴백), 돈 → 코인 아이콘.
 */
import { iconEl, type IconName } from './icons.js';
import { canvasPictureEl, pictureEl, pictureId, type PictureKind } from './pictures.js';

export interface RewardLike { kind: string; id?: string; amount?: number }
export type SpriteFn = (facId: string) => HTMLCanvasElement | null;

/** 보상 종류 → 등록부 종류·폴백 아이콘 */
const KIND: Record<string, { pic: PictureKind; fb: IconName }> = {
  rigPart: { pic: 'part', fb: 'build' },
  part: { pic: 'part', fb: 'build' },
  gift: { pic: 'gift', fb: 'gift' },
  ingredient: { pic: 'ingredient', fb: 'fruit' },
  item: { pic: 'item', fb: 'pool' },
  band: { pic: 'band', fb: 'check' },
  recipe: { pic: 'recipe', fb: 'cook' },
  gear: { pic: 'gear', fb: 'attraction' },
};

export function rewardArt(r: RewardLike, sprite?: SpriteFn): HTMLElement {
  if (r.kind === 'facility' && r.id) return canvasPictureEl(sprite ? sprite(r.id) : null, 'build');
  const k = KIND[r.kind];
  if (k && r.id) return pictureEl(pictureId(k.pic, r.id), k.fb);
  if (r.kind === 'money') return iconEl('coin', 'kpic-fb');
  if (r.kind === 'tool') return iconEl('build', 'kpic-fb');
  if (r.kind === 'unlock') return iconEl('cook', 'kpic-fb');
  return iconEl('gift', 'kpic-fb');
}
