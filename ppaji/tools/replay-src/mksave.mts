import { writeFileSync } from 'node:fs';
import { Game } from '../../src/sim/game.js';
import { runBot } from '../../src/sim/bot.js';
const OUT = process.argv[2] as string;
for (const days of [32, 64, 127]) {
  const g = new Game(3);
  runBot(g, days);
  const snap = g.toSnapshot();
  writeFileSync(`${OUT}/save-d${days}.json`, JSON.stringify({ version: 2, savedAt: '2026-09-04T00:00:00.000Z', game: snap }));
  console.log('day', days, 'money', g.money, 'rank', g.rank, 'pools', g.pools.all.length, 'fac', g.facilities.all.length, 'certs', Object.keys(g.certs.state.passed).length, 'friends', g.sns.unlockedFriends.length, 'areas', g.sns.areas.length, 'recipes', g.cooking.known.size);
}
