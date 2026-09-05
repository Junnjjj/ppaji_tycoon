/**
 * restaurant 도트 — docs/pixel-style.md 계약. 템플릿은 `TEMPLATES`, id → 그림은 `ART`.
 */
import type { FacTemplate, FacArt } from './types.js';
import { RED, BLUE, GREEN, YELLOW, PINK, ORANGE, PURPLE, WOOD } from './types.js';

const stall: FacTemplate = {
  rows: [
    '......kkkkkkkkkkkk......',
    '.....k121212121212k.....',
    '....k12121212121212k....',
    '...k1212121212121212k...',
    '...k2121212121212121k...',
    '...kkkkkkkkkkkkkkkkkk...',
    '....kWWWWWWWWWWWWWWk....',
    '....kWWWWW......WWWk....',
    '....kWWWWW......WWWk....',
    '....kWWWWW......WWWk....',
    '....kWWWWW......WWWk....',
    '....kWWWWW......WWWk....',
    '....kWWWWW......WWWk....',
    '....kkkkkkkkkkkkkkkk....',
    '....kMMMMMMMMMMMMMMkx...',
    '....kmmmmmmmmmmmmmmkx...',
    '....kmemememememeemkx...',
    '....kmmmmmmmmmmmmmmkx...',
    '....kkkkkkkkkkkkkkkkx...',
  ],
  icon: { x: 10, y: 7 },
};

const shop: FacTemplate = {
  rows: [
    '......kkkkkkkkkkkkkk......',
    '.....k11111111111111k.....',
    '....k1111111111111111k....',
    '...k111111111111111111k...',
    '..kkkkkkkkkkkkkkkkkkkkkk..',
    '..kWWWWWWWWWWWWWWWWWWWWk..',
    '..kWWkkkkkkWW......WWWWk..',
    '..kWWkBBBBkWW......WWWWk..',
    '..kWWkBwBBkWW......WWWWk..',
    '..kWWkBBBBkWW......WWWWk..',
    '..kWWkkkkkkWW......WWWWk..',
    '..kWWWWWWWWWW......WWWWk..',
    '..kWWWWWWWWWWWWWWWWWWWWk..',
    '..kWWWWWWWkkkkkkWWWWWWWkx.',
    '..kWWWWWWWk3333kWWWWWWWkx.',
    '..kWWWWWWWk3333kWWWWWWWkx.',
    '..kWWWWWWWk33y3kWWWWWWWkx.',
    '..kWWWWWWWk3333kWWWWWWWkx.',
    '..kWWWWWWWk3333kWWWWWWWkx.',
    '..kkkkkkkkkkkkkkkkkkkkkkx.',
  ],
  icon: { x: 13, y: 6 },
};

const kiosk: FacTemplate = {
  rows: [
    '...kkkkkkkkkk...',
    '..k1111111111k..',
    '..k1wwwwwww11k..',
    '..k1wBBBBBw11k..',
    '..k1wBrBrBw11k..',
    '..k1wByByBw11k..',
    '..k1wBgBgBw11k..',
    '..k1wwwwwww11k..',
    '..k1111111111k..',
    '..k11kkkk1111k..',
    '..k11kSSk1111k..',
    '..k1111111111k..',
    '..k1111111111kx.',
    '..kkkkkkkkkkkkx.',
  ],
};

const van: FacTemplate = {
  rows: [
    '....kkkkkkkkkkkkkk........',
    '...k11111111111111k.......',
    '..kWWWWWWWWWWWWWWWWkkkk...',
    '..kWkkkkkkWW......WWkBBk..',
    '..kWkPPPPkWW......WWkBBk..',
    '..kWkPPPPkWW......WWkkkk..',
    '..kWkkkkkkWW......WWWWWWk.',
    '..kWWWWWWWWW......WWWWWWk.',
    '..kWWWWWWWWWWWWWWWWWWWWWk.',
    '..kkkkkkkkkkkkkkkkkkkkkkk.',
    '....kxxk..........kxxk....',
    '....kxxk..........kxxk....',
    '.....kk............kk.....',
  ],
  icon: { x: 12, y: 3 },
};

export const TEMPLATES: Record<string, FacTemplate> = { stall, shop, kiosk, van };

export const ART: Record<string, FacArt> = {
  vending_machine: { tpl: 'kiosk', slots: RED }, snow_cone_shop: { tpl: 'stall', slots: PINK, icon: 'snow' }, juice_stand: { tpl: 'stall', slots: ORANGE, icon: 'juice' },
  creperie: { tpl: 'stall', slots: YELLOW, icon: 'crepe' }, cafe: { tpl: 'shop', slots: WOOD, icon: 'coffee' }, sushi_bar: { tpl: 'shop', slots: BLUE, icon: 'fish' },
  ice_cream_van: { tpl: 'van', slots: PINK, icon: 'cone' }, cake_shop: { tpl: 'shop', slots: PINK, icon: 'cake' }, popcorn_stall: { tpl: 'stall', slots: RED, icon: 'popcorn' },
  donut_shop: { tpl: 'shop', slots: PURPLE, icon: 'donut' }, salad_bar: { tpl: 'stall', slots: GREEN, icon: 'salad' }, curry_restaurant: { tpl: 'shop', slots: ORANGE, icon: 'curry' },
  bakery: { tpl: 'shop', slots: YELLOW, icon: 'bread' }, taqueria: { tpl: 'stall', slots: YELLOW, icon: 'taco' }, burger_joint: { tpl: 'shop', slots: RED, icon: 'burger' },
  corn_dog_shop: { tpl: 'stall', slots: ORANGE, icon: 'corndog' }, dim_sum_stall: { tpl: 'stall', slots: RED, icon: 'dumpling' }, rice_ball_shop: { tpl: 'stall', slots: GREEN, icon: 'riceball' },
  octopus_fritter_stall: { tpl: 'stall', slots: RED, icon: 'octo' }, bbq_restaurant: { tpl: 'shop', slots: WOOD, icon: 'skewer' }, pizzeria: { tpl: 'shop', slots: GREEN, icon: 'pizza' },
  fried_noodle_stall: { tpl: 'stall', slots: YELLOW, icon: 'noodle' }, kebab_stall: { tpl: 'stall', slots: ORANGE, icon: 'skewer' }, noodle_stall: { tpl: 'stall', slots: BLUE, icon: 'noodle' },
  hot_pot_stall: { tpl: 'stall', slots: RED, icon: 'hotpot' }, ramen_stall: { tpl: 'stall', slots: RED, icon: 'bowl' },
};
