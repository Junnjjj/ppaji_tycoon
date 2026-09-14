/**
 * decor 도트 — docs/pixel-style.md 계약. 템플릿은 `TEMPLATES`, id → 그림은 `ART`.
 */
import type { FacTemplate, FacArt } from './types.js';
import { RED, YELLOW, PINK, GRAY, GOLD } from './types.js';

const pottedPlant: FacTemplate = {
  rows: [
    '.....kk1k.....',
    '....k111kk....',
    '...k11k111k...',
    '...k1k1k11k...',
    '....k111k1k...',
    '.....k1k1k....',
    '......kkk.....',
    '....kkkkkkk...',
    '....k22222k...',
    '.....k222k....',
    '.....kkkkk....',
  ],
};

const flowerPot: FacTemplate = {
  rows: [
    '....k1k.k1k...',
    '...k111k111k..',
    '....k1kgk1k...',
    '...k1kgggk1k..',
    '....kkgggkk...',
    '.....kgggk....',
    '......kkk.....',
    '....kkkkkkk...',
    '....kMMMMMk...',
    '.....kmmmk....',
    '.....kkkkk....',
  ],
};

const bush: FacTemplate = {
  rows: [
    '......kkkk......',
    '....kkGGGGkk....',
    '...kGG1GGG1Gk...',
    '..kGGGGGGGGGGk..',
    '..kG1GGG1GGGGk..',
    '..kGGGGGGGG1Gk..',
    '...kgg1ggggggk..',
    '....kkkkkkkkk...',
  ],
};

const palm: FacTemplate = {
  rows: [
    '.....kk...kk.....',
    '...kkGGkkkGGkk...',
    '..kGGGGkgkGGGGk..',
    '.kGGkkGkkkGkkGGk.',
    '.kkk.kGkgkGk.kkk.',
    '......kkmkk......',
    '.......kmk.......',
    '.......kmk.......',
    '.......kmk.......',
    '.......kmk.......',
    '.......kmk.......',
    '......kkmkk......',
    '.....kkkkkkk.....',
  ],
};

const roundTree: FacTemplate = {
  rows: [
    '......kkkk......',
    '....kkGGGGkk....',
    '...kGGGGGGGGk...',
    '..kGGG1GGGG1Gk..',
    '..kGGGGGGGGGGk..',
    '..kGG1GGG1GGGk..',
    '...kgggggggggk..',
    '....kkkgggkkk...',
    '.......kmk......',
    '.......kmk......',
    '......kkmkk.....',
  ],
};

const conifer: FacTemplate = {
  rows: [
    '.......kk.......',
    '......kGGk......',
    '.....kGGGGk.....',
    '......kGGk......',
    '.....kGGGGk.....',
    '....kGGGGGGk....',
    '.....kggggk.....',
    '....kggggggk....',
    '...kggggggggk...',
    '....kkkkkkkk....',
    '.......kmk......',
    '......kkmkk.....',
  ],
};

const sunflower: FacTemplate = {
  rows: [
    '.....kkyyk......',
    '....ky1111yk....',
    '....k1qqqq1k....',
    '....ky1111yk....',
    '.....kkyykk.....',
    '.......kgk......',
    '......kgkgk.....',
    '.......kgk......',
    '.......kgk......',
    '......kkgkk.....',
  ],
};

const floatyTower: FacTemplate = {
  rows: [
    '.....kkkkkk.....',
    '....k1kkkk1k....',
    '....kkkkkkkk....',
    '...kkRRkkRRkk...',
    '...kRRRkkRRRk...',
    '...kkkkkkkkkk...',
    '..kkyyykkyyykk..',
    '..kyyyykkyyyyk..',
    '..kkkkkkkkkkkk..',
    '.kkBBBBkkBBBBkk.',
    '.kBBBBBkkBBBBBk.',
    '.kkkkkkkkkkkkkk.',
  ],
};

const pillar: FacTemplate = {
  rows: [
    '...kkkkkkkk...',
    '..kTTTTTTTTk..',
    '..kkkkkkkkkk..',
    '....kTtTtk....',
    '....kTtTtk....',
    '....kTtTtk....',
    '....kTtTtk....',
    '....kTtTtk....',
    '....kTtTtk....',
    '..kkkkkkkkkk..',
    '..kTTTTTTTTk..',
    '..kkkkkkkkkk..',
  ],
};

const waterfall: FacTemplate = {
  rows: [
    '.....kkkkkk.....',
    '....kxxsxsxk....',
    '...kxsCCCCsxk...',
    '..kxsCCwCCCsxk..',
    '..kxsCCCCwCsxk..',
    '..kxsCwCCCCsxk..',
    '..kxsCCCwCCsxk..',
    '..kkkCCCCCCkkk..',
    '..kCCCCCCCCCCk..',
    '..kCwCCwCCwCCk..',
    '...kkkkkkkkkk...',
  ],
};

/** P48-c — 플로팅 패드: 물 위 기구의 기본 그림. 널(WOOD) 위에 주제색(1·2·3) 상자, 가장자리에 부표 띠. 그림 계약(P55)이 오기 전 절차 폴백 */
const floatPad: FacTemplate = {
  rows: [
    '......kkkk......',
    '....kk1111kk....',
    '...k12222221k...',
    '...k12222221k...',
    '..kM13333331Mk..',
    '.kMMMMMMMMMMMMk.',
    '.kmMmMmMmMmMmMk.',
    '..kkkkkkkkkkkk..',
  ],
  dy: 2,
};
/** P55 — 탑형 폴백: 망루·다이빙대·점프 타워처럼 높은 기구. 부표 띠 위에 기둥 둘과 꼭대기 상자 */
const tower: FacTemplate = {
  rows: [
    '.....kkkkkk.....',
    '....k122221k....',
    '....k133331k....',
    '.....k1111k.....',
    '......kMMk......',
    '......kMMk......',
    '......kMMk......',
    '......kMMk......',
    '.....kkMMkk.....',
    '..kkkk1MM1kkkk..',
    '.kMMMMMMMMMMMMk.',
    '.kmMmMmMmMmMmMk.',
    '..kkkkkkkkkkkk..',
  ],
  dy: 2,
};
/** P55 — 긴 판형 폴백: 슬라이드·다리·빔처럼 가로로 긴 기구. 부표 띠 위에 낮고 긴 판 */
const plank: FacTemplate = {
  rows: [
    'kkkkkkkkkkkkkkkkkkkkkkkk',
    'k1222222222222222222221k',
    'k1333333333333333333331k',
    'kMMMMMMMMMMMMMMMMMMMMMMk',
    'kmMmMmMmMmMmMmMmMmMmMmMk',
    '.kkkkkkkkkkkkkkkkkkkkkk.',
  ],
  dy: 2,
};
export const TEMPLATES: Record<string, FacTemplate> = { pottedPlant, flowerPot, bush, palm, roundTree, conifer, sunflower, floatyTower, pillar, waterfall, floatPad, tower, plank };

export const ART: Record<string, FacArt> = {
  pothos: { tpl: 'pottedPlant', slots: { '1': 'g', '2': 'M' } }, flower_pot: { tpl: 'flowerPot', slots: RED }, hydrangea: { tpl: 'bush', slots: { '1': 'B' } }, palm_tree: { tpl: 'palm' },
  coffee_tree: { tpl: 'roundTree', slots: { '1': 'r' } }, golden_kairobot: { tpl: 'robot', slots: GOLD }, flower_bed: { tpl: 'bush', slots: { '1': 'r' } }, azalea: { tpl: 'bush', slots: { '1': 'p' } },
  sunflower: { tpl: 'sunflower', slots: YELLOW }, aloe: { tpl: 'pottedPlant', slots: { '1': 'G', '2': 't' } }, floaty_tower: { tpl: 'floatyTower', slots: PINK }, pineapple_plant: { tpl: 'flowerPot', slots: { '1': 'y' } },
  hibiscus: { tpl: 'bush', slots: { '1': 'o' } }, cypress: { tpl: 'conifer' }, monstera: { tpl: 'pottedPlant', slots: { '1': 'd', '2': 'W' } }, laceleaf: { tpl: 'flowerPot', slots: { '1': 'p' } },
  banana_tree: { tpl: 'palm' }, pine: { tpl: 'conifer' }, fountain: { tpl: 'statueFountain', slots: GRAY }, ficus: { tpl: 'roundTree', slots: { '1': 'G' } },
  antique_pillar: { tpl: 'pillar' }, waterfall: { tpl: 'waterfall' },
};
