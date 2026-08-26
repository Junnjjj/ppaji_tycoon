import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CARD_THEMES } from '../sim/kairo/cards.js';
import { kairoSpriteIndex } from '../assets/kairo-contract.js';
import {
  EVENT_SCENE_TEXELS,
  composeEventScene,
  eventScenePlan,
  type EventSceneCtx,
  type EventSceneLayer,
  type EventSceneSurface,
} from './kairo-event-art.js';

const artSource = readFileSync(new URL('./kairo-event-art.ts', import.meta.url), 'utf8');
const cardSource = readFileSync(new URL('./kairo-card.ts', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

const GUEST_ID = /^guest\/[0-7]\/(idle|walk|sit)\/[+-][XZ]$/;

/** 그리기 호출만 기록하는 가짜 캔버스 — node 에는 2d 컨텍스트가 없다 */
function fakeSurface(): {
  make: (w: number, h: number) => EventSceneSurface<{ width: number; height: number }>;
  calls: { id: string; x: number; y: number }[];
  size: [number, number];
} {
  const calls: { id: string; x: number; y: number }[] = [];
  const size: [number, number] = [0, 0];
  const make = (w: number, h: number): EventSceneSurface<{ width: number; height: number }> => {
    size[0] = w;
    size[1] = h;
    const ctx: EventSceneCtx = {
      imageSmoothingEnabled: true,
      fillStyle: '',
      globalAlpha: 1,
      save: () => undefined,
      restore: () => undefined,
      setTransform: () => undefined,
      fillRect: () => undefined,
      drawImage: (src: { width: number; height: number }, x: number, y: number) => {
        calls.push({ id: (src as unknown as { __id: string }).__id, x, y });
      },
    };
    return { canvas: { width: w, height: h }, ctx };
  };
  return { make, calls, size };
}

/** 계약 크기를 그대로 흉내내는 가짜 스프라이트 */
function fakeSprites(
  missing: string[] = [],
): (id: string) => { __id: string; width: number; height: number } | null {
  const index = kairoSpriteIndex();
  return (id: string) => {
    if (missing.includes(id)) return null;
    const spec = index.get(id);
    const w = spec ? spec.size[0] : 14;
    const h = spec ? spec.size[1] : 24;
    return { __id: id, width: w, height: h };
  };
}

const subjects = (theme: (typeof CARD_THEMES)[number]): EventSceneLayer[] =>
  eventScenePlan(theme).layers.filter((layer) => layer.role === 'subject');

describe('사건 카드 미니 장면 (Task 6)', () => {
  it('테마 8종이 서로 다른 구성 계획을 낸다', () => {
    const keys = CARD_THEMES.map((theme) =>
      eventScenePlan(theme)
        .layers.filter((layer) => layer.role === 'subject' || layer.role === 'support')
        .map((layer) => layer.id)
        .join('+'),
    );
    expect(new Set(keys).size).toBe(CARD_THEMES.length);
    for (const theme of CARD_THEMES) {
      const plan = eventScenePlan(theme);
      expect(plan.theme).toBe(theme);
      // 장면이라면 최소 배경·주역·조역이 함께 있어야 한다 — 표지 한 장은 장면이 아니다
      expect(plan.layers.length).toBeGreaterThanOrEqual(4);
      expect(subjects(theme).length).toBeGreaterThanOrEqual(1);
      expect(plan.layers.some((layer) => layer.role === 'figure')).toBe(true);
    }
  });

  it('새 아트 팩을 만들지 않는다 — 전부 이미 있는 논리 ID 다', () => {
    const index = kairoSpriteIndex();
    for (const theme of CARD_THEMES) {
      for (const layer of eventScenePlan(theme).layers) {
        if (layer.id.startsWith('guest/')) {
          expect(layer.id).toMatch(GUEST_ID);
          continue;
        }
        expect(index.has(layer.id), `${theme}: ${layer.id}`).toBe(true);
      }
    }
  });

  it('모든 층이 장면 캔버스 안에 앉는다 (바닥중심 앵커)', () => {
    const index = kairoSpriteIndex();
    const [W, H] = EVENT_SCENE_TEXELS;
    for (const theme of CARD_THEMES) {
      for (const layer of eventScenePlan(theme).layers) {
        const spec = index.get(layer.id);
        const w = spec ? spec.size[0] : 14;
        const h = spec ? spec.size[1] : 24;
        /*
         * 바닥은 **가장자리를 덮어야** 하므로 한 칸까지 흘러 나가도 된다 (지도 바깥
         * 굽기와 같은 이유 — 뒤가 비면 카드 배경색이 샌다). 물체는 잘리면 안 된다.
         */
        const slack = layer.role === 'ground' ? w : w / 3;
        expect(layer.x - w / 2, `${theme}:${layer.id} 왼쪽`).toBeGreaterThanOrEqual(-slack);
        expect(layer.x + w / 2, `${theme}:${layer.id} 오른쪽`).toBeLessThanOrEqual(W + slack);
        expect(layer.y, `${theme}:${layer.id} 아래`).toBeLessThanOrEqual(H);
        expect(layer.y - h, `${theme}:${layer.id} 위`).toBeGreaterThanOrEqual(-h / 3);
      }
    }
  });

  it('순수 함수다 — 같은 테마는 언제나 같은 계획이고 난수가 없다', () => {
    for (const theme of CARD_THEMES) {
      expect(eventScenePlan(theme)).toEqual(eventScenePlan(theme));
    }
    expect(artSource.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('Math.random');
    expect(artSource.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('Date.now');
  });

  it('계획 순서대로 바닥중심 앵커로 합성한다', () => {
    const surface = fakeSurface();
    const plan = eventScenePlan('market');
    const canvas = composeEventScene(plan, fakeSprites(), surface.make);
    expect(canvas).not.toBeNull();
    expect(surface.size).toEqual([
      EVENT_SCENE_TEXELS[0] * plan.scale,
      EVENT_SCENE_TEXELS[1] * plan.scale,
    ]);
    const drawn = surface.calls.map((call) => call.id);
    expect(drawn).toEqual(plan.layers.map((layer) => layer.id));
    const index = kairoSpriteIndex();
    plan.layers.forEach((layer, k) => {
      const spec = index.get(layer.id);
      const w = spec ? spec.size[0] : 14;
      const h = spec ? spec.size[1] : 24;
      expect(surface.calls[k]!.x).toBe(Math.round(layer.x - w / 2));
      expect(surface.calls[k]!.y).toBe(Math.round(layer.y - h));
    });
  });

  it('주역 그림이 없으면 null 을 내서 CSS 폴백에 넘긴다', () => {
    const subjectId = subjects('safety')[0]!.id;
    const surface = fakeSurface();
    expect(composeEventScene(eventScenePlan('safety'), fakeSprites([subjectId]), surface.make)).toBeNull();
  });

  it('조역·인물이 빠져도 장면은 그린다 — 한 장이 없다고 화면이 깨지지 않는다', () => {
    const plan = eventScenePlan('crowd');
    const optional = plan.layers.filter((layer) => layer.role !== 'subject').map((layer) => layer.id);
    const surface = fakeSurface();
    const canvas = composeEventScene(plan, fakeSprites(optional), surface.make);
    expect(canvas).not.toBeNull();
    expect(surface.calls.map((call) => call.id)).toEqual(
      plan.layers.filter((layer) => layer.role === 'subject').map((layer) => layer.id),
    );
  });

  it('카드 뷰가 장면을 붙이고 CSS 테마 슬롯은 폴백으로 남는다', () => {
    expect(cardSource).toContain('composeEventScene');
    expect(cardSource).toContain('eventScenePlan');
    // 폴백 정체 — 기호·라벨·테마 데이터셋은 그대로 있어야 한다
    expect(cardSource).toContain("dataset['theme']");
    expect(cardSource).toContain("dataset['sprite']");
    expect(cardSource).toContain('kcard-visual-mark');
    expect(cardSource).toContain('kcard-scene');
    expect(cssSource).toMatch(/\.kcard-scene\s*\{[^}]*image-rendering:\s*pixelated/s);
    // 장면이 붙은 카드에서는 CSS 표지가 겹쳐 보이지 않는다
    expect(cssSource).toMatch(/\.kcard-visual\.has-scene[^{]*\{[^}]*display:\s*none/s);
  });

  it('색은 style.css 가 소유한다 — 장면도 토큰으로 그린다', () => {
    const body = artSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(body).toContain('cssVar');
  });
});
