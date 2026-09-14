/**
 * 세이브 fixture 생성기 (P48-a, §14 D177) — `npx tsx tools/dump-save.ts --seed 1 --days 4 --out src/save/__fixtures__/v3-p48a.json`
 * 봇으로 N일 돌린 판의 스냅샷을 그대로 쓴다. 뒤 페이즈가 스냅샷 모양을 바꾸면 **같은 명령이 같은 모양을 못 만든다** —
 * fixture 는 커밋 산출물이고 다시 만들지 말고 지킨다(save.test 가 왕복을 잰다).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Game } from '../src/sim/game.js';
import { runBot } from '../src/sim/bot.js';

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? (process.argv[i + 1] ?? d) : d; };
const seed = Number(arg('--seed', '1')), days = Number(arg('--days', '4')), out = arg('--out', 'src/save/__fixtures__/snapshot.json');
const g = new Game(seed);
if (days > 0) runBot(g, days);
const s = g.toSnapshot();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(s));
console.log(`wrote ${out} — seed ${seed} · ${days}일 · grid ${s.grid.w}×${s.grid.h} · natural ${s.grid.natural ? 'yes' : 'no'} · money ${s.money}`);
