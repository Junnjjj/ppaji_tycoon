/**
 * P51 measure — 빠지 축 네 지표를 8시드×128일 중앙값으로 잰다: 재탑승 비율(≤ 0.3 · 같은 손님이 같은 기구를 그날 다시 타는 몫 — 사슬을 건너는 것은 아니다) · 기구 이용 몫 · 빠지 지출 몫 · 개조 수.
 * 밴드와 달리 「비율이 어디로 움직이나」를 보는 자다 — `--json` 이면 기계가 읽는다. 재탑승 비율이 0.3 을 넘으면 exit 1(기구가 손님을 도는 쳇바퀴가 됐다는 뜻).
 */
import { Game } from '../src/sim/game.js';
import { runBot, BOT_DEFAULTS } from '../src/sim/bot.js';
/** P57-c — 봇·골든·계측은 플레이어가 받는 판(main 승인 배치 + 옛 킷 출입동)으로 돈다. `layout=reference` 옛 킷은 하네스 고정물 전용 */
const ARRIVAL = { arrival: true } as const;

const arg = (name: string, def: string): string => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? (process.argv[at + 1] ?? def) : def; };
const seeds = Number(arg('seeds', '8')), days = Number(arg('days', '128'));
const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? (s[(s.length - 1) / 2] as number) : (((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2); };
const runs = [];
for (let s = 1; s <= seeds; s++) runs.push(runBot(new Game(s, undefined, ARRIVAL), days, BOT_DEFAULTS));
const out = {
  rigRepeatRatio: median(runs.map((r) => r.rigRepeatRatio)),
  rigUseShare: median(runs.map((r) => r.rigUseShare)),
  ppajiSpendShare: median(runs.map((r) => r.ppajiSpendShare)),
  rigUpgrades: median(runs.map((r) => r.rigUpgrades)),
};
if (process.argv.includes('--json')) console.log(JSON.stringify(out));
else {
  console.log(`measure ${seeds}×${days} — 재탑승 비율 ${out.rigRepeatRatio.toFixed(3)} (≤ 0.3) · 기구 이용 몫 ${out.rigUseShare.toFixed(2)} · 빠지 지출 몫 ${out.ppajiSpendShare.toFixed(3)} · 개조 ${out.rigUpgrades}`);
}
if (out.rigRepeatRatio > 0.3) { console.error('❌ 재탑승 비율 > 0.3 — 기구가 손님을 도는 쳇바퀴다'); process.exit(1); }
console.log('✅ measure');
