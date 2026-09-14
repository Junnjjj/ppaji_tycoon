/**
 * attraction 도트 — docs/pixel-style.md 계약. 템플릿은 `TEMPLATES`, id → 그림은 `ART`.
 */
import type { FacTemplate, FacArt } from './types.js';
import { BLUE, YELLOW, PINK, ORANGE, WOOD, GRAY, AQUA } from './types.js';

const tub: FacTemplate = {
  rows: [
    '......kkkkkkkkkkkkkk......',
    '....kk11111111111111kk....',
    '...k111111111111111111k...',
    '..k11CCCCCCCCCCCCCCCC11k..',
    '..k1CCwCCCCCwCCCCwCCCC1k..',
    '..k1CCCCCCwCCCCCCCCCwC1k..',
    '..k11CCCCCCCCCCCCCCCC11k..',
    '..k1111111111111111111ekx.',
    '..k1111111111111111111ekx.',
    '...k111111111111111111kx..',
    '....kkkkkkkkkkkkkkkkkkx...',
  ],
};

const archShower: FacTemplate = {
  rows: [
    '......kkkkkkkkkk......',
    '....kk1111111111kk....',
    '...k11kkkkkkkkkk11k...',
    '...k1k..........k1k...',
    '...k1k.C.C..C.C.k1k...',
    '...k1k..C.C..C..k1k...',
    '...k1k.C..C.C.C.k1k...',
    '...k1k..C.C..C..k1k...',
    '...k1k.C.C..C.C.k1k...',
    '...k1k..........k1k...',
    '..kkkkk........kkkkk..',
    '..k111k........k111k..',
    '..kkkkk........kkkkk..',
  ],
};

const statueFountain: FacTemplate = {
  rows: [
    '..........C...........',
    '.........CkC..........',
    '........C.k.C.........',
    '.........kkk..........',
    '........k111k.........',
    '.......k11w11k........',
    '.......k11111k........',
    '........k111k.........',
    '.........k1k..........',
    '.......kkk1kkk........',
    '.....kk11111111kk.....',
    '....k111111111111k....',
    '...kkkkkkkkkkkkkkkk...',
    '..kSCCCCCCCCCCCCCCSk..',
    '..kSSSSSSSSSSSSSSSSk..',
    '...kkkkkkkkkkkkkkkk...',
  ],
};

const merlion: FacTemplate = {
  rows: [
    '.............kkkk.....................',
    '............kSSSSk........C...........',
    '...........kSSwSSSk......C............',
    '...........kSSSSSSkkkCCCC.............',
    '............kSSSSSSSk.................',
    '.............kSSSSSk..................',
    '............kSSSSSSSk.................',
    '...........kSSSSSSSSSk................',
    '..........kSSSSSSSSSSSk...............',
    '..........kSSSSSSSSSSSk...............',
    '...........kSSSSSSSSSk................',
    '........kkkkkkkkkkkkkkkkkkk...........',
    '.....kkkCCCCCCCCCCCCCCCCCCCkkk........',
    '...kkCCCCCCCCCCCCCCCCCCCCCCCCCkk......',
    '..kSSSSSSSSSSSSSSSSSSSSSSSSSSSSSk.....',
    '...kkkkkkkkkkkkkkkkkkkkkkkkkkkkk......',
  ],
  dy: 4,
};

const cabin: FacTemplate = {
  rows: [
    '..............kkkkkkkkkkkkkkkkkkkk..............',
    '............kk1111111111111111111kk.............',
    '..........kk111111111111111111111111kk..........',
    '........kk11111111111111111111111111111kk.......',
    '......kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.....',
    '......kMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMkx....',
    '......kmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmkx....',
    '......kMMMMkkkkkkMMMMMMMMMMMMMMMMkkkkkkMMMkx....',
    '......kmmmmkOOOOkmmmmmmmmmmmmmmmmkOOOOkmmmkx....',
    '......kMMMMkOOOOkMMMMMMkkkkkkMMMMkOOOOkMMMkx....',
    '......kmmmmkkkkkkmmmmmmkeeeekmmmmkkkkkkmmmkx....',
    '......kMMMMMMMMMMMMMMMMkeeyekMMMMMMMMMMMMMkx....',
    '......kmmmmmmmmmmmmmmmmkeeeekmmmmmmmmmmmmmkx....',
    '......kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkx....',
  ],
  dy: 6,
};

const igloo: FacTemplate = {
  rows: [
    '..................kkkkkkkkkk..................',
    '..............kkkkwwwwwwwwwwkkkk..............',
    '...........kkkwwwwwwSwwwwwwwwwwwkkk...........',
    '.........kkwwwwSwwwwwwwwwwSwwwwwwwwkk.........',
    '.......kkwwwwwwwwwwwwwwwwwwwwwwSwwwwwkk.......',
    '.....kkwwwSwwwwwwwwwwwwwwwwwwwwwwwwwwwkk......',
    '....kwwwwwwwwwwwwwwkkkkkkwwwwwwwwSwwwwwwk.....',
    '...kwwwwwwwwSwwwwwkCCCCCCkwwwwwwwwwwwwwwwk....',
    '...kwwwwwwwwwwwwwwkCCCCCCkwwwwwwwSwwwwwwwk....',
    '...kwwwwwSwwwwwwwwkCCCCCCkwwwwwwwwwwwwwwwk....',
    '....kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk....',
  ],
  dy: 6,
};

const soaker: FacTemplate = {
  rows: [
    '......kkkkkkkk......',
    '.....k11111111k.....',
    '.....k1CCCCCC1k.....',
    '.....k11111111k.....',
    '......kkkkkkkk......',
    '......C.kxxk..C.....',
    '.....C..kxxk...C....',
    '........kxxk........',
    '........kxxk........',
    '........kxxk........',
    '........kxxk........',
    '......kkkkkkkk......',
    '.....kSSSSSSSSk.....',
    '.....kkkkkkkkkk.....',
  ],
};

const robot: FacTemplate = {
  rows: [
    '.......kk.......',
    '......k11k......',
    '....kkkkkkkk....',
    '...k11111111k...',
    '...k1kk11kk1k...',
    '...k1kw11wk1k...',
    '...k11111111k...',
    '...k1k1111k1k...',
    '...kkkkkkkkkk...',
    '..kkk111111kkk..',
    '..k1k111111k1k..',
    '..k1k1kkkk1k1k..',
    '..kkk1k22k1kkk..',
    '....k1kkkk1k....',
    '....k111111k....',
    '....kkkkkkkk....',
    '...k11k..k11k...',
    '...kkkk..kkkk...',
  ],
};

const smallSlide: FacTemplate = {
  rows: [
    '........kkkkkkkk........',
    '.......k11111111k.......',
    '.......k1kkkkkk1k.......',
    '.......k1kCCCCk1kkkk....',
    '.......k1kCCCCk1kCCCkk..',
    '.......k1kkkkkk1kkCCCCk.',
    '.......k11111111k.kkkkk.',
    '.......kk111111kk.......',
    '.......kekkkkkkek.......',
    '.......kekkkkkkek.......',
    '.......kekkkkkkek.......',
    '.......kkk....kkk.......',
  ],
  dy: 2,
};

export const TEMPLATES: Record<string, FacTemplate> = { tub, archShower, statueFountain, merlion, cabin, igloo, soaker, robot, smallSlide };

export const ART: Record<string, FacArt> = {
  jetted_pool: { tpl: 'tub', slots: BLUE }, hot_tub: { tpl: 'tub', slots: WOOD }, mini_slide: { tpl: 'smallSlide', slots: BLUE }, mini_shower: { tpl: 'archShower', slots: GRAY },
  flowery_shower: { tpl: 'archShower', slots: PINK }, fish_fountain: { tpl: 'statueFountain', slots: ORANGE }, merlion: { tpl: 'merlion' }, sauna: { tpl: 'cabin', slots: WOOD },
  igloo: { tpl: 'igloo' }, surprise_soaker: { tpl: 'soaker', slots: YELLOW }, performing_kairobot: { tpl: 'robot', slots: { '1': 'S', '2': 'r' } },
  castle_slide: { tpl: 'smallSlide', slots: GRAY }, coral_slide: { tpl: 'smallSlide', slots: PINK }, ice_slide: { tpl: 'smallSlide', slots: AQUA }, three_lane_slide: { tpl: 'smallSlide', slots: YELLOW },
};
