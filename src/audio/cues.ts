/**
 * 오디오 큐 목록 — **슬롯 계약** (docs/plan-live-unlock.md §1-3).
 *
 * 게임 코드는 파일을 모른다. 여기 이름만 안다. 나중의 오디오 작업은 이 유니언을
 * 파일에 매핑하는 `AudioBus` 구현 하나를 붙이는 것으로 끝난다 — 호출부를 뒤지지 않는다.
 * 새 사건을 구현하며 소리 낼 자리가 생기면 **여기에 큐를 추가하고** 호출을 심는다.
 */
export type SfxCue =
  | 'sfx/tap' // UI 버튼
  | 'sfx/place' // 시설 확정
  | 'sfx/demolish' // 철거
  | 'sfx/cash' // 돈 들어옴 (의뢰 보상·결산 흑자)
  | 'sfx/day-end' // 하루 마디
  | 'sfx/card' // 주간 카드 등장
  | 'sfx/unlock' // 해금 셀레브레이션 (K41)
  | 'sfx/grade-up' // 등급 승급 (K42)
  | 'sfx/exam-pass' // 심사 통과 (K42)
  | 'sfx/exam-fail' // 심사 탈락 (K42)
  | 'sfx/discover'; // 숨은 콤보 발견 (K43)

export type MusicId = 'bgm/summer' | 'bgm/offseason';
