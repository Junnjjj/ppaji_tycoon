/**
 * 오디오 버스 — 지금은 **무음**이다 (슬롯 계약, docs/plan-live-unlock.md §1-3).
 *
 * 호출부는 K39 부터 심는다. 나중의 오디오 작업은 `WebAudioBus` (파일 로드 +
 * iOS 제스처 언락 + 음소거 설정) 를 만들어 아래 한 줄을 바꾸는 것이 전부다.
 *
 * ⚠ sim 은 오디오를 모른다 (불변식 1) — 이 모듈은 render/ui 층에서만 import 한다.
 */
import type { SfxCue, MusicId } from './cues.js';

export interface AudioBus {
  play(cue: SfxCue): void;
  music(id: MusicId | null): void;
  setMuted(muted: boolean): void;
}

class SilentAudio implements AudioBus {
  play(): void {
    /* 무음 — 슬롯만 예약 */
  }
  music(): void {
    /* 무음 */
  }
  setMuted(): void {
    /* 무음 */
  }
}

/** 게임 전체가 쓰는 단일 버스. 구현 교체는 이 한 줄이다 */
export const audio: AudioBus = new SilentAudio();
