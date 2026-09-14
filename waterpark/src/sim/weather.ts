/**
 * 날씨 — 하루 하나, 개장 때 `world` 스트림으로 딱 1회 뽑는다. 계절마다 확률이 다르고
 * 비는 유입을 깎고 야외 풀의 햇빛(SE)을 없앤다. 눈은 겨울 맑음의 별칭(연출).
 */
import type { Rng } from './rng.js';
import type { Season } from './clock.js';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow';

export const WEATHER_KO: Record<Weather, string> = { clear: '맑음', cloudy: '흐림', rain: '비', snow: '눈' };
/** 계절별 [맑음, 흐림, 비] 누적 확률 — 겨울 맑음은 눈으로 그린다 */
const TABLE: Record<Season, [number, number]> = { 0: [0.6, 0.85], 1: [0.55, 0.75], 2: [0.6, 0.85], 3: [0.5, 0.8] };
export const WEATHER_ARRIVAL: Record<Weather, number> = { clear: 1, cloudy: 0.9, rain: 0.6, snow: 0.8 };
export const WEATHER_TEMP: Record<Weather, number> = { clear: 0, cloudy: -2, rain: -4, snow: -3 };

export function rollWeather(rng: Rng, season: Season): Weather {
  const r = rng.next();
  const [a, b] = TABLE[season];
  if (r < a) return season === 3 ? 'snow' : 'clear';
  if (r < b) return 'cloudy';
  return 'rain';
}
