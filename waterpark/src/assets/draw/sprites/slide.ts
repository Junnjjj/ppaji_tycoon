/**
 * slide 도트 — docs/pixel-style.md 계약. 템플릿은 `TEMPLATES`, id → 그림은 `ART`.
 */
import type { FacTemplate, FacArt } from './types.js';

const bigSlide: FacTemplate = {
  rows: [
    '..........kkkkkkkkkk..........',
    '.........k1111111111k.........',
    '.........k1kkkkkkkk1k.........',
    '.........k1k222222k1k.........',
    '.........k1k222222k1kkkkk.....',
    '.........k1k222222k1kCCCCkk...',
    '.........k1kkkkkkkk1kkCCCCCk..',
    '.........k1111111111k.kkCCCCk.',
    '.........kk11111111kk...kkkkk.',
    '.........kekkkkkkkkek.........',
    '.........kekMMMMMMkek.........',
    '.........kekkkkkkkkek.........',
    '.........kekMMMMMMkek.........',
    '.........kekkkkkkkkek.........',
    '.........kekMMMMMMkek.........',
    '.........kekkkkkkkkek.........',
    '.........kekMMMMMMkek.........',
    '.........kekkkkkkkkek.........',
    '.........kkk......kkk.........',
  ],
  dy: 2,
};

export const TEMPLATES: Record<string, FacTemplate> = { bigSlide };

export const ART: Record<string, FacArt> = {
  stripy_slide: { tpl: 'bigSlide', slots: { '1': 'r', '2': 'w' } }, blue_slide: { tpl: 'bigSlide', slots: { '1': 'b', '2': 'B' } },
  tree_house_slide: { tpl: 'bigSlide', slots: { '1': 'm', '2': 'G' } }, rocket_slide: { tpl: 'bigSlide', slots: { '1': 'S', '2': 'r' } },
};
