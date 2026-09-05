/**
 * 소리 — **파일 0장.** WebAudio 로 절차 생성한다 (G24). 효과음은 짧은 오실레이터 큐(단음·아르페지오),
 * BGM 은 8마디 칩튠 루프(사각파 멜로디 + 삼각파 베이스, 룩어헤드 스케줄링). iOS 는 첫 제스처 전에 소리가
 * 안 나므로 `unlockOnGesture()` 가 첫 터치에서 컨텍스트를 깨운다. 호출부는 이름만 안다.
 * 켜고 끄기는 `wp.sound`/`wp.bgm`(localStorage) 에 남는다.
 */
export type SfxName = 'tap' | 'open' | 'close' | 'coin' | 'error' | 'splash' | 'photo' | 'build' | 'wish' | 'rankup' | 'cert' | 'like';

interface Note { f: number; ms: number; type?: OscillatorType; gain?: number; to?: number }
/** 큐 = 음표 나열 (아르페지오는 순서대로) */
const CUES: Record<SfxName, Note[]> = {
  tap: [{ f: 880, ms: 40, type: 'square', gain: 0.05 }],
  open: [{ f: 520, to: 780, ms: 90, type: 'triangle', gain: 0.07 }],
  close: [{ f: 780, to: 520, ms: 90, type: 'triangle', gain: 0.07 }],
  coin: [{ f: 1046, ms: 60, type: 'square', gain: 0.06 }, { f: 1568, ms: 90, type: 'square', gain: 0.05 }],
  error: [{ f: 220, to: 160, ms: 140, type: 'sawtooth', gain: 0.06 }],
  splash: [{ f: 600, to: 200, ms: 120, type: 'sine', gain: 0.07 }, { f: 300, to: 900, ms: 80, type: 'sine', gain: 0.04 }],
  photo: [{ f: 1800, ms: 30, type: 'square', gain: 0.05 }, { f: 1200, ms: 50, type: 'square', gain: 0.04 }],
  build: [{ f: 330, ms: 60, type: 'square', gain: 0.06 }, { f: 440, ms: 60, type: 'square', gain: 0.06 }, { f: 660, ms: 90, type: 'square', gain: 0.05 }],
  wish: [{ f: 784, ms: 80, type: 'triangle', gain: 0.07 }, { f: 988, ms: 80, type: 'triangle', gain: 0.07 }, { f: 1319, ms: 160, type: 'triangle', gain: 0.07 }],
  rankup: [{ f: 523, ms: 90, type: 'square', gain: 0.07 }, { f: 659, ms: 90, type: 'square', gain: 0.07 }, { f: 784, ms: 90, type: 'square', gain: 0.07 }, { f: 1046, ms: 240, type: 'square', gain: 0.08 }],
  cert: [{ f: 659, ms: 100, type: 'triangle', gain: 0.07 }, { f: 659, ms: 100, type: 'triangle', gain: 0.07 }, { f: 880, ms: 220, type: 'triangle', gain: 0.08 }],
  like: [{ f: 1319, ms: 50, type: 'sine', gain: 0.05 }, { f: 1760, ms: 70, type: 'sine', gain: 0.04 }],
};

// ── BGM — 계절 4곡, 각 8마디 칩튠 루프 (120bpm, 8분음표 = 250ms). 음 높이는 MIDI 번호, 0 = 쉼표 (G31) ──
interface Track { name: string; melody: number[]; bass: number[]; lead: OscillatorType }
const TRACKS: readonly Track[] = [
  { name: '봄 — 꽃길', lead: 'square',
    melody: [72, 76, 79, 76, 72, 76, 79, 81, 79, 76, 72, 74, 76, 74, 72, 0, 74, 77, 81, 77, 74, 77, 81, 83, 81, 77, 74, 76, 77, 76, 74, 0,
      72, 76, 79, 76, 72, 76, 79, 81, 79, 76, 72, 74, 76, 74, 72, 0, 69, 72, 76, 72, 69, 72, 76, 79, 77, 76, 74, 72, 71, 74, 72, 0],
    bass: [48, 0, 48, 0, 52, 0, 52, 0, 53, 0, 53, 0, 55, 0, 55, 0, 50, 0, 50, 0, 53, 0, 53, 0, 55, 0, 55, 0, 55, 0, 55, 0,
      48, 0, 48, 0, 52, 0, 52, 0, 53, 0, 53, 0, 55, 0, 55, 0, 45, 0, 45, 0, 53, 0, 53, 0, 55, 0, 55, 0, 48, 0, 48, 0] },
  { name: '여름 — 물보라', lead: 'square',
    melody: [79, 79, 83, 86, 83, 79, 81, 83, 86, 0, 86, 88, 86, 83, 81, 79, 77, 77, 81, 84, 81, 77, 79, 81, 84, 0, 84, 86, 84, 81, 79, 77,
      79, 79, 83, 86, 83, 79, 81, 83, 86, 0, 86, 88, 86, 83, 81, 79, 81, 84, 88, 84, 81, 79, 77, 76, 79, 79, 79, 0, 79, 0, 0, 0],
    bass: [55, 55, 0, 55, 55, 0, 55, 55, 60, 60, 0, 60, 60, 0, 60, 60, 53, 53, 0, 53, 53, 0, 53, 53, 55, 55, 0, 55, 55, 0, 55, 55,
      55, 55, 0, 55, 55, 0, 55, 55, 60, 60, 0, 60, 60, 0, 60, 60, 53, 53, 0, 53, 53, 0, 55, 55, 55, 0, 55, 0, 55, 0, 0, 0] },
  { name: '가을 — 낙엽', lead: 'triangle',
    melody: [69, 0, 72, 0, 76, 0, 74, 72, 71, 0, 69, 0, 67, 0, 0, 0, 65, 0, 69, 0, 72, 0, 71, 69, 67, 0, 64, 0, 67, 0, 0, 0,
      69, 0, 72, 0, 76, 0, 74, 72, 71, 0, 69, 0, 67, 0, 0, 0, 65, 0, 69, 0, 72, 0, 74, 72, 71, 0, 68, 0, 69, 0, 0, 0],
    bass: [45, 0, 0, 45, 0, 0, 45, 0, 43, 0, 0, 43, 0, 0, 43, 0, 41, 0, 0, 41, 0, 0, 41, 0, 40, 0, 0, 40, 0, 0, 40, 0,
      45, 0, 0, 45, 0, 0, 45, 0, 43, 0, 0, 43, 0, 0, 43, 0, 41, 0, 0, 41, 0, 0, 41, 0, 40, 0, 0, 40, 0, 0, 45, 0] },
  { name: '겨울 — 조명', lead: 'sine',
    melody: [76, 0, 0, 79, 0, 0, 83, 0, 0, 0, 79, 0, 0, 76, 0, 0, 74, 0, 0, 77, 0, 0, 81, 0, 0, 0, 77, 0, 0, 74, 0, 0,
      76, 0, 0, 79, 0, 0, 83, 0, 0, 0, 84, 0, 0, 83, 0, 0, 81, 0, 0, 79, 0, 0, 77, 0, 0, 0, 76, 0, 0, 0, 0, 0],
    bass: [48, 0, 0, 0, 0, 0, 52, 0, 0, 0, 0, 0, 55, 0, 0, 0, 50, 0, 0, 0, 0, 0, 53, 0, 0, 0, 0, 0, 57, 0, 0, 0,
      48, 0, 0, 0, 0, 0, 52, 0, 0, 0, 0, 0, 55, 0, 0, 0, 50, 0, 0, 0, 0, 0, 55, 0, 0, 0, 0, 0, 48, 0, 0, 0] },
];
export const TRACK_NAMES: readonly string[] = TRACKS.map((t) => t.name);
/** 징글 (G31) — 심사 결과 · 시즌/연말 결산 · 엔딩. 효과음보다 길고 BGM 을 잠깐 줄인다 */
export type JingleName = 'cert' | 'result' | 'ending';
const JINGLES: Record<JingleName, Note[]> = {
  cert: [{ f: 659, ms: 120, type: 'triangle', gain: 0.07 }, { f: 659, ms: 120, type: 'triangle', gain: 0.07 }, { f: 784, ms: 120, type: 'triangle', gain: 0.07 }, { f: 880, ms: 160, type: 'triangle', gain: 0.08 }, { f: 1046, ms: 420, type: 'triangle', gain: 0.09 }],
  result: [{ f: 523, ms: 140, type: 'square', gain: 0.06 }, { f: 659, ms: 140, type: 'square', gain: 0.06 }, { f: 784, ms: 140, type: 'square', gain: 0.06 }, { f: 659, ms: 140, type: 'square', gain: 0.06 }, { f: 784, ms: 360, type: 'square', gain: 0.07 }],
  ending: [{ f: 523, ms: 200, type: 'triangle', gain: 0.07 }, { f: 587, ms: 200, type: 'triangle', gain: 0.07 }, { f: 659, ms: 200, type: 'triangle', gain: 0.07 }, { f: 784, ms: 260, type: 'triangle', gain: 0.08 }, { f: 1046, ms: 260, type: 'triangle', gain: 0.08 }, { f: 1318, ms: 700, type: 'triangle', gain: 0.09 }],
};
const STEP_S = 0.25;
const BGM_GAIN = 0.045;
const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;
  bgmOn = true;
  private bgmStep = 0;
  private bgmNext = 0;
  private bgmTimer: number | null = null;
  private bgmGain: GainNode | null = null;
  /** 지금 도는 계절 곡 (0 봄 … 3 겨울) */
  track = 0;
  /** 효과음·BGM 공통 볼륨 0~1 (G31) — `wp.vol` */
  volume = 1;

  constructor() {
    try {
      this.muted = localStorage.getItem('pj.sound') === '0';
      this.bgmOn = localStorage.getItem('pj.bgm') !== '0';
      const v = Number(localStorage.getItem('pj.vol') ?? '1');
      if (Number.isFinite(v) && v >= 0 && v <= 1) this.volume = v;
    } catch { /* 저장소 없음 */ }
  }

  get trackName(): string { return TRACKS[this.track]?.name ?? ''; }

  /** 계절이 바뀌면 곡이 바뀐다 — 마디 경계에서 자연스럽게 (스텝 카운터는 그대로 두고 표만 바꾼다) */
  setSeason(season: number): void {
    const t = Math.max(0, Math.min(TRACKS.length - 1, season | 0));
    this.track = t;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('pj.vol', String(this.volume)); } catch { /* */ }
    this.applyBgmGain();
  }

  private applyBgmGain(): void {
    if (this.bgmGain) this.bgmGain.gain.value = this.muted || !this.bgmOn ? 0 : BGM_GAIN * this.volume;
  }

  /** 징글 — 큐보다 길고, 도는 동안 BGM 을 1/4 로 줄였다가 되돌린다 */
  jingle(name: JingleName): void {
    if (this.muted) return;
    const c = this.context();
    if (!c || c.state !== 'running') return;
    const total = this.schedule(c, JINGLES[name]);
    if (this.bgmGain) {
      const g = this.bgmGain.gain;
      const base = this.muted || !this.bgmOn ? 0 : BGM_GAIN * this.volume;
      g.setValueAtTime(base * 0.25, c.currentTime);
      g.setValueAtTime(base, c.currentTime + total);
    }
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  unlockOnGesture(target: EventTarget = window): void {
    const wake = (): void => {
      const c = this.context();
      if (c && c.state === 'suspended') void c.resume();
      if (c) this.startBgm();
      target.removeEventListener('pointerdown', wake);
      target.removeEventListener('touchstart', wake);
    };
    target.addEventListener('pointerdown', wake);
    target.addEventListener('touchstart', wake);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try { localStorage.setItem('pj.sound', m ? '0' : '1'); } catch { /* */ }
    this.applyBgmGain();
  }
  setBgm(on: boolean): void {
    this.bgmOn = on;
    try { localStorage.setItem('pj.bgm', on ? '1' : '0'); } catch { /* */ }
    this.applyBgmGain();
    if (on) this.startBgm();
  }

  play(name: SfxName): void {
    if (this.muted) return;
    const c = this.context();
    if (!c || c.state !== 'running') return;
    this.schedule(c, CUES[name]);
  }

  /** 음표 나열을 지금부터 스케줄한다 — 총 길이(초)를 돌려준다 */
  private schedule(c: AudioContext, notes: readonly Note[]): number {
    let t = c.currentTime;
    for (const n of notes) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = n.type ?? 'square';
      o.frequency.setValueAtTime(n.f, t);
      if (n.to !== undefined) o.frequency.linearRampToValueAtTime(n.to, t + n.ms / 1000);
      g.gain.setValueAtTime(Math.max(0.0001, (n.gain ?? 0.06) * this.volume), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + n.ms / 1000);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + n.ms / 1000 + 0.02);
      t += n.ms / 1000 * 0.9;
    }
    return t - c.currentTime;
  }

  /** BGM — 100ms 마다 0.3초 앞을 스케줄한다 (타이머 지터에 안 흔들린다) */
  startBgm(): void {
    const c = this.context();
    if (!c || this.bgmTimer !== null) return;
    this.bgmGain = c.createGain();
    this.applyBgmGain();
    this.bgmGain.connect(c.destination);
    this.bgmNext = c.currentTime + 0.1;
    const tick = (): void => {
      if (!this.ctx || !this.bgmGain) return;
      while (this.bgmNext < this.ctx.currentTime + 0.3) {
        const tr = TRACKS[this.track] ?? TRACKS[0]!;
        const m = tr.melody[this.bgmStep % tr.melody.length] ?? 0;
        const b = tr.bass[this.bgmStep % tr.bass.length] ?? 0;
        if (m) this.note(midi(m), this.bgmNext, STEP_S * 0.9, tr.lead, 0.35);
        if (b) this.note(midi(b), this.bgmNext, STEP_S * 1.6, 'triangle', 0.5);
        this.bgmNext += STEP_S;
        this.bgmStep++;
      }
    };
    this.bgmTimer = window.setInterval(tick, 100);
  }

  private note(f: number, at: number, len: number, type: OscillatorType, vol: number): void {
    if (!this.ctx || !this.bgmGain) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(this.bgmGain);
    o.start(at);
    o.stop(at + len + 0.02);
  }

  /** 검사용 — BGM 스케줄러가 돌고 있는가 */
  get bgmRunning(): boolean { return this.bgmTimer !== null; }
}

export const sfx = new Sfx();
export const SFX_NAMES: readonly SfxName[] = Object.keys(CUES) as SfxName[];
