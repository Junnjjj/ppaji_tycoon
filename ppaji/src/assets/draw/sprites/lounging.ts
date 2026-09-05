/**
 * lounging 도트 — docs/pixel-style.md 계약. 템플릿은 `TEMPLATES`, id → 그림은 `ART`.
 */
import type { FacTemplate, FacArt } from './types.js';
import { RED, BLUE, GREEN, WOOD, BLACK } from './types.js';

const deckChair: FacTemplate = {
  rows: [
    '.........kkkkkk.....',
    '........k111111k....',
    '.......k11wwww11k...',
    '......k1111111111k..',
    '.....k111111111111k.',
    '....kkkkkkkkkkkkkkk.',
    '...k111111111111kx..',
    '..k1111111111111kx..',
    '..kkkkkkkkkkkkkkkx..',
    '..kmk.........kmk...',
    '..kkk.........kkk...',
  ],
};

const parasol: FacTemplate = {
  rows: [
    '..........kk..........',
    '.......kkk11kkk.......',
    '.....kk1111111144kk...',
    '...kk111111111144444k.',
    '..k11111111111144444kk',
    '..kkkkkkkkkkkkkkkkkkkk',
    '.........kmk..........',
    '.........kmk..........',
    '.........kmk..........',
    '.........kmk..........',
    '.........kmk..........',
    '.........kmk..........',
    '........kkkkk.........',
  ],
};

const parasolSet: FacTemplate = {
  rows: [
    '..........kk..........',
    '.......kkk11kkk.......',
    '.....kk1111111144kk...',
    '...kk111111111144444k.',
    '..k11111111111144444kk',
    '..kkkkkkkkkkkkkkkkkkkk',
    '.........kmk..........',
    '.........kmk.kkkkkk...',
    '.........kmkk2222k....',
    '.........kmk2wwww2k...',
    '.......kkkkkkkkkkkkk..',
    '......k22222222222kx..',
    '......kkkkkkkkkkkkkx..',
    '......kmk.......kmk...',
  ],
};

const table4: FacTemplate = {
  rows: [
    '.......kkkkkkkk.......',
    '......kMMMMMMMMk......',
    '.....kMMMMMMMMMMk.....',
    '.....kmmmmmmmmmmk.....',
    '......kkkkkkkkkk......',
    '..kkk...kmk....kkk....',
    '.k111k..kmk...k111k...',
    '.kkkkk..kmk...kkkkk...',
    '..kmk..kkkkk...kmk....',
    '..kmk..........kmk....',
  ],
};

const comfyChair: FacTemplate = {
  rows: [
    '....kkkkkkkk....',
    '...k11111111k...',
    '...k11111111k...',
    '...k11222211k...',
    '..kk11222211kk..',
    '.k1111222211111k',
    '.k11111111111111k',
    '.kkkkkkkkkkkkkkk',
    '..kmk.......kmk.',
  ],
};

const rattanChair: FacTemplate = {
  rows: [
    '....kkkkkkkk....',
    '...k1e1e1e1ek...',
    '...ke1e1e1e1k...',
    '...k1e1e1e1ek...',
    '..kk11222211kk..',
    '.k1111222211111k',
    '.k1e1e1e1e1e1e1k',
    '.kkkkkkkkkkkkkkk',
    '..kmk.......kmk.',
  ],
};

const sofa: FacTemplate = {
  rows: [
    '..kkkkkkkkkkkkkkkkkk..',
    '.k111111111111111111k.',
    '.k112222222222222211k.',
    'kk112222222222222211kk',
    'k1111111111111111111k',
    'k1111111111111111111k',
    'kkkkkkkkkkkkkkkkkkkkk',
    '.kmk...............kmk',
  ],
};

const roundSofa: FacTemplate = {
  rows: [
    '.....kkkkkkkkkk.....',
    '...kk1111111111kk...',
    '..k11112222221111k..',
    '.k1112222222222111k.',
    '.k1111222222221111k.',
    '.k1111111111111111k.',
    '..kk111111111111kk..',
    '....kkkkkkkkkkkk....',
  ],
};

const cabana: FacTemplate = {
  rows: [
    '......................kkkk......................',
    '..................kkkk1111kkkk..................',
    '..............kkkk111111111111kkkk..............',
    '..........kkkk1111111111111111111kkkk...........',
    '......kkkk111111111111111111111111111kkkk.......',
    '..kkkk1111111111111111111111111111111111kkkk....',
    '.k22222222222222222222222222222222222222222222k.',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
    '...kmk........kWWWWWWWWWWWWWWWWk...........kmk..',
    '...kmk........kWWWWWWWWWWWWWWWWk...........kmk..',
    '...kmk........kWWWkkkkkkkkkkWWWk...........kmk..',
    '...kmk........kWWWk22222222kWWWk...........kmk..',
    '...kmk........kWWWk2wwwwww2kWWWk...........kmk..',
    '...kmk........kkkkkkkkkkkkkkkkkk...........kmk..',
    '...kkk.....................................kkk..',
  ],
  dy: 6,
};

export const TEMPLATES: Record<string, FacTemplate> = { deckChair, parasol, parasolSet, table4, comfyChair, rattanChair, sofa, roundSofa, cabana };

export const ART: Record<string, FacArt> = {
  deck_chair: { tpl: 'deckChair', slots: { '1': 'B' } }, beach_chair: { tpl: 'deckChair', slots: { '1': 'R' } },
  parasol_set: { tpl: 'parasolSet', slots: { '1': 'r', '2': 'w', '4': 'w' } }, yellow_parasol: { tpl: 'parasol', slots: { '1': 'y', '4': 'w' } }, blue_parasol: { tpl: 'parasol', slots: { '1': 'b', '4': 'w' } },
  table_4: { tpl: 'table4', slots: RED }, cabana: { tpl: 'cabana', slots: { '1': 'w', '2': 'b' } },
  brown_wooden_chair: { tpl: 'comfyChair', slots: WOOD }, white_wooden_chair: { tpl: 'comfyChair', slots: { '1': 'W', '2': 'w' } },
  white_comfy_chair: { tpl: 'comfyChair', slots: { '1': 'w', '2': 'S' } }, green_comfy_chair: { tpl: 'comfyChair', slots: GREEN }, blue_comfy_chair: { tpl: 'comfyChair', slots: BLUE },
  black_rattan_chair: { tpl: 'rattanChair', slots: { '1': 'x', '2': 'S' } }, brown_rattan_chair: { tpl: 'rattanChair', slots: { '1': 'M', '2': 'W' } }, gray_rattan_chair: { tpl: 'rattanChair', slots: { '1': 's', '2': 'w' } },
  blue_vinyl_sofa: { tpl: 'sofa', slots: BLUE }, red_vinyl_sofa: { tpl: 'sofa', slots: RED }, green_vinyl_sofa: { tpl: 'sofa', slots: GREEN },
  brown_round_sofa: { tpl: 'roundSofa', slots: WOOD }, black_round_sofa: { tpl: 'roundSofa', slots: BLACK }, green_round_sofa: { tpl: 'roundSofa', slots: GREEN },
};
