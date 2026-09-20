# 공연무대 단계 확장 + 번지 포즈 수정

2026-09-20, Orca run `run_ae71959c298b`. 제작·시연 준비 완료, 미술/부지/roof/남은 투영 검토 전 **메인 미채택**. 원본/후보를 유지하고 실제 게임의 업그레이드 경제·주변칸검사·저장마이그레이션은 이번에 바꾸지 않았다.

| 단계 | 후보 ID | 부지 | 관객 | 별도 공연자 | 디자인 |
|---|---|---|---|---|---|
|1|stage_river|4×3|4|1|기존 목재 벤치·천 배경막|
|2|stage_river_lv2|5×4|8|1|개별 의자 2×4, 크림 차양, 철제 기둥·조명·스피커|
|3|stage_river_lv3|6×5|12|1|의자 3×4, 확장 무대·기울어진 차양, 더 큰 스피커·모니터·조명|

실제 legacy stage_river는 여전히3×2/capacity0이므로 표의1단계 후보를 이미 live인 것으로 해석하지 않는다. `stage-upgrade-contract.json`에 단계/부지/정원/연결조건 기록. 확대 시 전체 회전부지 점유검사 후 이용자퇴장/정원교체가 필요하며 예전 저장을 묵시적으로 확대하지 않는다. 가격/해금은 미정이고0으로 채우지 않았다.

`runtime/`62127: 위쪽 단계비교는 같은 world scale의 만석3종, 아래 개별카드는 출입→즉시착석→관람→기립·별도퇴장. 1/2/4배 시연 재생속도(기본2배)는 실제 경제/이용시간 규칙이 아니다. 2단계/3단계 admissionOrder를 계약대로 존중하고 exitOrder도 그대로 적용한다. 시연 일반 배열 순서일 때2단계 통로0.31tile 간격이 발견되어 안쪽우선 계약순서로 수정했고, 이후 두 단계 전체주기 검사에서 배우간0.35tile 최소간격을 통과했다. 의자 접점에서 pose를 즉시 바꾸며 앉은 몸을 미끄러뜨리지 않는다. 순차입장 전체주기는약129초/202초(기본2배로 절반); 만석비교에서는 기다릴 필요가 없다.

## 번지 변경

사용자가 기존 idle 직립의 매달린 인상을 거절한 기록은 `integration/bungee-revision-v2/visual-review.json`에 FAIL_USER_VISUAL_REJECTION으로 보존했다. 기존V8 `cheer_jump` 앞/뒤/거울 포즈를 하강·반동·공중회수에 적용했다. 준비는idle, 출입은walk, 내부상승은명시구간숨김. 새래스터/새메시/유료호출은 없고NPCatlas3파일은 이전pack과 바이트동일하다.

줄 끝은 feet기준 `[.38,0,.48]`의 허리 옆 연결고리. 허리띠/허벅지 스트랩은 별도 월드 오버레이, 시설깊이가림 유지. 줄은 청색 `[43,135,181]`, 하네스는 밝은청록 `[38,205,215]`로 피부색/갈색옷과 구분한다. 독립검수의 주황하네스 저대비 지적 후 색을 수정했으며 그 원보고서를 덮지 않았다. 실제 목부착은 아니지만 후면에서 줄이 머리근처에 투영될 수 있다는 시각적 잔여판단도 보존한다. 네방향 동일변환, 최고탄성/윈치길이는 새 연결점에서 재계산. 단일 점프keypose 사용이며 별도 연속팔동작을 만든 것은 아니다.

검수: `integration/bungee-revision-v2/independent-review.md`의216pose셀/108정확거울쌍/10001시간샘플은 초기청색변경 전 snapshot이다. 최종 대비수정의 실제browser자료는 `contrast-four-facing.png`, `contrast-detail.png`, `motion-sequence.png`, 전체 `integration/upgrades-browser-qa.json`가 정본. 시간순 정지프레임 검토는 연속영상 지각 검수와 구분한다.

## 검증 및 열린 항목

- Node13테스트 통과: 모든 기존시설 회귀, 번지포즈/줄접점, 추가2단계 정원·실제좌석·출구·전체이용주기·좌석제자리·점유간격·4방향부지.
- 두 새Blender원본: 각각8/8독립reopen RGBA동일, clipping0, fixed60/0/45 camera/root4rotations, 256logical/ortho로32×16tile와22px사람 유지. Lv2 `review-final/`, Lv3 `review/`가 정본.
- ego-browser1040프레임:54외형 만석4방향 +205초전체주기1초간격4방향. 신규두무대+번지의 총18116배우샘플, 클리핑0/JS오류0. Lv2최대9, Lv3최대13배우. 후면차양/타워에 가려진 인물은 잘림과 별도로 계수. Lv3 d2audience7/d3audience4는 만석에서완전가림 가능.
- 단계별4방향 비교 `integration/stage-levels-d0..d3.png`, 각단계 점유이미지 및 `stage-upgrades-final-preview.png`. 모든native방향을 실제사람과 함께 육안검토했다.
- Raw projection: Lv2 d1FAIL; Lv3 d0FAIL/d1WARN/d2PASS/d3FAIL. 정확카메라/정상바닥축과 별개로 globalvertical검출 경고를 보존하며 자동PASS로바꾸지 않았다. 외형/부지/차양사용자판단과 미해결 raster진단은 채택 전열린검토다.

사용 스킬: ppaji-kairo-assets의 authored sharedB 모델/재질/4방향runner, ppaji-npc-assets의 기존pose·외형/원점/거울검사, 실제Orca3workers(stage2,stage3,번지독립감사), ego-browser실제시연. 세worker 모두정산후release, reclaimable0. 서버62127유지.

이 파일이 아래 README의 이전5종/idle번지 설명보다 우선한다. 이번후속에서main5189게임파일은 변경하지 않았다.
