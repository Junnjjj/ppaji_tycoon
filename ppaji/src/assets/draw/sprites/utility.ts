/**
 * utility 도트 — docs/pixel-style.md 계약. 템플릿은 `TEMPLATES`, id → 그림은 `ART`.
 */
import type { FacTemplate, FacArt } from './types.js';
import { BLUE } from './types.js';

const toilet: FacTemplate = {
  rows: [
    '......kkkkkkkkkkkk......',
    '.....k111111111111k.....',
    '....k11111111111111k....',
    '...kkkkkkkkkkkkkkkkkk...',
    '...kSSSSSSSSSSSSSSSSk...',
    '...kSSkkkSSSSSSkkkSSk...',
    '...kSSkbkSSSSSSkpkSSk...',
    '...kSSkkkSSSSSSkkkSSk...',
    '...kSSSSSSSSSSSSSSSSk...',
    '...kSSkkkkSSSSkkkkSSkx..',
    '...kSSkxxkSSSSkxxkSSkx..',
    '...kSSkxxkSSSSkxxkSSkx..',
    '...kSSkxxkSSSSkxxkSSkx..',
    '...kSSkxxkSSSSkxxkSSkx..',
    '...kkkkkkkkkkkkkkkkkkx..',
  ],
};

const shower: FacTemplate = {
  rows: [
    '.......kkkk.....',
    '......kSSSSk....',
    '......kkkkkk....',
    '.....C.kxxk.C...',
    '....C..kxxk..C..',
    '.....C.kxxk.C...',
    '....C..kxxk..C..',
    '.....C.kxxk.C...',
    '.......kxxk.....',
    '....kkkkkkkkkk..',
    '...kSSSSSSSSSSk.',
    '..kSCCCCCCCCCCSk',
    '..kkkkkkkkkkkkkk',
  ],
};

const fountainBasin: FacTemplate = {
  rows: [
    '.......kk.......',
    '......kCCk......',
    '.....kC.CCk.....',
    '......kkkk......',
    '.......kk.......',
    '.......kk.......',
    '...kkkkkkkkkk...',
    '..kSSSSSSSSSSk..',
    '..kSCCCCCCCCSk..',
    '..kSSSSSSSSSSk..',
    '...kkkkkkkkkk...',
  ],
};

export const TEMPLATES: Record<string, FacTemplate> = { toilet, shower, fountainBasin };

export const ART: Record<string, FacArt> = {
  toilet: { tpl: 'toilet', slots: BLUE }, shower: { tpl: 'shower' }, water_fountain: { tpl: 'fountainBasin' },
};
