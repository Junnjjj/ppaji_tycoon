/**
 * 시설 도트 (G14) — 분류별 파일(`sprites/*.ts`)의 템플릿·ART 표를 합친다. 새 시설 = 데이터 한 줄 + 그 분류 파일의 ART 한 줄.
 * 스타일 계약은 docs/pixel-style.md.
 */
import type { PixMap } from './pix.js';
import type { FacTemplate, FacArt } from './sprites/types.js';
import * as utility from './sprites/utility.js';
import * as lounging from './sprites/lounging.js';
import * as restaurant from './sprites/restaurant.js';
import * as attraction from './sprites/attraction.js';
import * as slide from './sprites/slide.js';
import * as decor from './sprites/decor.js';

export type { FacTemplate, FacArt };

export const ICONS: Record<string, PixMap> = {
  cup:      ['.kkkk.', 'kCCCCk', 'kCCCCk', '.kCCk.', '.kCCk.', '..kk..'],
  cone:     ['.kppk.', 'kPPPPk', '.kykk.', '.kyyk.', '..kyk.', '...k..'],
  cake:     ['..kk..', '.kPPk.', 'kwwwwk', 'kppppk', 'kwwwwk', '.kkkk.'],
  donut:    ['.kkkk.', 'kPPPPk', 'kPk.Pk', 'kPk.Pk', 'kPPPPk', '.kkkk.'],
  burger:   ['.kkkk.', 'kOOOOk', 'kggggk', 'krrrrk', 'kOOOOk', '.kkkk.'],
  pizza:    ['kkkkkk', 'kYrYYk', '.kYrYk', '.kYYk.', '..kYk.', '...k..'],
  bowl:     ['..kk..', '.kYYk.', 'kkkkkk', 'kwwwwk', '.kwwk.', '..kk..'],
  fish:     ['......', 'kkk..k', 'kOOkkk', 'kOwOOk', 'kOOkkk', 'kkk..k'],
  taco:     ['......', '.kkkk.', 'kgrgrk', 'kyyyyk', '.kyyk.', '..kk..'],
  popcorn:  ['.kwkw.', 'kwwwwk', 'krwrwk', 'krwrwk', 'krwrwk', '.kkkk.'],
  bread:    ['......', '.kkkk.', 'kMMMMk', 'kMmMmk', 'kMMMMk', '.kkkk.'],
  salad:    ['.kgGk.', 'kGgGgk', 'kkkkkk', 'kwwwwk', '.kwwk.', '..kk..'],
  corndog:  ['.kkk..', 'kMMMk.', 'kMrMk.', 'kMMMk.', '.kkk..', '..kk..'],
  dumpling: ['..kk..', '.kwwk.', 'kwwwwk', 'kwwwwk', '.kkkk.', '......'],
  riceball: ['..kk..', '.kwwk.', 'kwwwwk', 'kwqqwk', 'kwqqwk', '.kkkk.'],
  skewer:   ['....k.', '.kkkk.', 'krmrmk', '.kkkk.', '.k....', 'k.....'],
  curry:    ['......', 'kkkkkk', 'kOOOwk', 'kOOOwk', '.kkkk.', '......'],
  noodle:   ['k....k', 'kk..kk', 'kYYYYk', 'kkkkkk', 'kwwwwk', '.kkkk.'],
  crepe:    ['......', '.kkkk.', 'kYYYYk', 'kYpYYk', '.kYYk.', '..kk..'],
  snow:     ['.kkkk.', 'kPCPCk', 'kkkkkk', 'kwwwwk', '.kwwk.', '..kk..'],
  juice:    ['..kk..', '.kOOk.', 'kOOOOk', 'kOOOOk', '.kkkk.', '......'],
  coffee:   ['.kkkk.', 'kmmmmk', 'kmmmmkk', 'kmmmmk', '.kkkk.', '......'],
  octo:     ['.kkkk.', 'kRRRRk', 'kRwRwk', 'kRRRRk', 'kRkRRk', '.k.k..'],
  hotpot:   ['......', 'kkkkkk', 'krrrrk', 'krrrrk', 'kkkkkk', '.k..k.'],
};


const MODS = [utility, lounging, restaurant, attraction, slide, decor];
export const TEMPLATES: Record<string, FacTemplate> = Object.assign({}, ...MODS.map((m) => m.TEMPLATES));
export const ART: Record<string, FacArt> = Object.assign({}, ...MODS.map((m) => m.ART));

/** P55 — 그림 없는 기구의 폴백 실루엣 셋: 데이터 `tall` 이면 `tower` · 긴 판(max(w,d) ≥ 3 ∧ min(w,d) ≤ 1)이면 `plank` · 나머지 `floatPad`. 하나면 21종이 같은 덩어리로 보인다(H44) */
export function rigTemplate(def: { w: number; d: number; tall?: boolean }): FacArt {
  const tpl = def.tall ? 'tower' : Math.max(def.w, def.d) >= 3 && Math.min(def.w, def.d) <= 1 ? 'plank' : 'floatPad';
  return { tpl, slots: { '1': 'b', '2': 'B', '3': 'n' } };
}

export const DEFAULT_BY_CLASS: Record<string, FacArt> = {
  utility: { tpl: 'toilet', slots: { '1': 's', '2': 'S', '3': 'x' } }, lounging: { tpl: 'deckChair', slots: { '1': 'w', '2': 'w', '3': 'S' } }, restaurant: { tpl: 'stall', slots: { '1': 'r', '2': 'R', '3': '!' }, icon: 'cup' },
  attraction: { tpl: 'tub', slots: { '1': 'b', '2': 'B', '3': 'n' } }, slide: { tpl: 'bigSlide', slots: { '1': 'b', '2': 'B', '3': 'n' } }, decor: { tpl: 'bush', slots: { '1': 'r' } },
  rig: { tpl: 'floatPad', slots: { '1': 'b', '2': 'B', '3': 'n' } }, // P48-c: 그림 없는 기구는 플로팅 패드(부표 띠 + 널) 위에 주제색 상자
};
