import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import picturesJson from './pictures.json';
import ingredientsJson from './ingredients.json';
import recipesJson from './recipes.json';
import rigPartsJson from './rig-parts.json';
import gearsJson from './gears.json';
import giftsJson from './gifts.json';
import wristbandsJson from './wristbands.json';
import partsJson from './parts.json';
import campaignsJson from './campaigns.json';
import portraitsJson from './portraits.json';

const ids = (arr: unknown, kind: string): string[] => (arr as { id: string }[]).map((e) => `pic/${kind}/${e.id}`);
/** P60-a: items.json 은 지웠지만 `pic/item/*` 24 는 그림 자산이라 남는다(§10.1 미결 ⑤) — 등록부 자신의 키에서 센다(주문서 대조는 아래 it 가 한다) */
const itemPics = Object.keys((picturesJson as { entries: Record<string, unknown> }).entries).filter((k) => k.startsWith('pic/item/'));

/** P56-a D1 — 그림 등록부: 정의 id 하나에 그림 하나. 시트가 오기 전엔 비어 있고, 온 뒤에도 주문서 밖 id 는 못 든다 */
describe('pictures.json — 그림 등록부 (P56-a)', () => {
  const all = new Set([
    ...ids(ingredientsJson, 'ingredient'), ...ids(recipesJson, 'recipe'), ...ids(rigPartsJson, 'part'), ...ids(partsJson, 'part'), ...ids(gearsJson, 'gear'),
    ...itemPics, ...ids(giftsJson, 'gift'), ...ids(wristbandsJson, 'band'),
    ...ids(campaignsJson, 'campaign'), // P56-b2 캠페인 3
    ...(portraitsJson as { id: string }[]).flatMap((p) => ['calm', 'happy'].map((m) => `pic/portrait/${p.id}_${m}`)), // P56-b2 인물 초상 5×2
  ]); // P56-b: 공방 부품 41(parts.json)을 더했다 — 초안 342 는 개조 부품 13 만 세어 공방 창 카드가 전부 폴백이었다
  it('모양 — sheet 경로 · cell 24 · entries 는 주문서 id 안에서만', () => {
    const p = picturesJson as { sheet: string; cell: number; entries: Record<string, { x: number; y: number }> };
    expect(p.sheet).toMatch(/^assets\/.+\.png$/);
    expect(p.cell).toBe(24);
    for (const [id, e] of Object.entries(p.entries)) {
      expect(all.has(id), `${id} 는 주문서에 없는 그림`).toBe(true);
      expect(Number.isInteger(e.x) && Number.isInteger(e.y) && e.x >= 0 && e.y >= 0, id).toBe(true);
    }
  });
  it('주문서(docs/assets/pipelines/ppaji-picture-sheet.md)의 id 목록 = 데이터 396 (손으로 고치면 여기서 깨진다)', () => {
    const doc = readFileSync(resolve(__dirname, '../../../docs/assets/pipelines/ppaji-picture-sheet.md'), 'utf8');
    const listed = new Set([...doc.matchAll(/^\| `(pic\/[a-z]+\/[^`]+)` \|/gm)].map((m) => m[1] as string));
    expect(listed.size).toBe(all.size);
    for (const id of all) expect(listed.has(id), `주문서에 ${id} 가 없다`).toBe(true);
    expect(all.size).toBe(396);
  });
});
