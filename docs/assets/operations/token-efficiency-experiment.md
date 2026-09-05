# 에셋 오케스트레이션 토큰 절감 운영 가이드

최종 갱신: 2026-08-27

상태: **실험 제안 / 현재 스킬·파이프라인 미적용**

이 문서의 내용은 기존 `ppaji-kairo-assets` 스킬이나 현재 제작 계약을 변경하지 않는다.
별도 실험 런에서 효과와 검증 동등성을 확인한 뒤, 채택할 경우 기존 스킬을 덮어쓰지 않고
신규 스킬로 분리한다.

## 결론

검증 항목을 줄이지 않고도 토큰 사용량을 크게 낮출 수 있다. 핵심은 긴 규칙을 에셋마다
반복해서 대화로 전달하지 않고, **한 번의 워커 작업에 여러 에셋을 순차 배정**하며, 정상
결과는 기계 판독 가능한 짧은 레코드로 남기고 예외만 자세히 보고하는 것이다.

이 문서는 신규 방식의 실험 설계서다. 아래에서 제안하는 런 매니페스트·자동 보고 도구는
아직 현재 파이프라인에 적용하지 않는다.

## 절대 줄이면 안 되는 검증

토큰 절감은 다음 게이트를 생략하거나 완화하는 근거가 될 수 없다.

- 사용자가 승인한 정확한 단일 이미지와 SHA-256
- 실제 provider task/result와 실제 비어 있지 않은 `glTF` GLB
- 원본 GLB의 SHA-256 및 읽기 전용 `0444` 보존
- Blender 전체 hierarchy import와 물리 root의 yaw/pitch/roll 계약
- 게임 카메라의 orthographic yaw `45°`, optical pitch down `30°`, roll `0°`
- 새 Blender 프로세스로 다시 열어 렌더한 decoded-pixel 동일성
- 같은 스케일 비교, 실루엣, landmark 대응 증거
- 모든 필수 입력·계약·도구·산출물의 provenance
- 사용자 승인 전 `DENSE_BASELINE_UNREVIEWED` 정지
- d0 거절 시에만 계약에 따라 d1과 비교하며, 승인 없이 d1–d3·채색·런타임 채택 금지

API 키, 전체 provider 응답, 비밀값은 대화·보고서·provenance에 기록하지 않는다.

## 현재 토큰이 많이 드는 이유

1. 에셋 하나마다 같은 스킬, reference, 카메라 계약, 렌더 계약, 도구를 다시 길게 읽는다.
2. 에셋 하나마다 새 작업을 만들면 작업 지시와 규칙 설명도 똑같이 반복된다.
3. `worker_done` payload에 산출물 수십 개를 모두 열거해 완료 메시지만으로도 길어진다.
4. 상태 확인 때 전체 transcript나 전체 worker 목록을 다시 받아 이미 처리한 내용까지 읽는다.
5. 정상 에셋도 예외 에셋과 같은 길이의 자연어 분석을 작성한다.
6. provenance와 `REPORT.md`를 사람이 매번 비슷하게 작성해 문맥과 오류 수정이 반복된다.
7. 스키마 이름 차이를 에셋마다 즉석에서 해석해 같은 호환 작업을 되풀이한다.

## 권장 작업 단위

| 단위 | 한 번만 수행할 것 | 반복할 것 |
|---|---|---|
| 런 시작 | 필수 스킬·reference 완독, SHA 계산, 계약 동결, 공용 도구 검사 | 파일이 바뀌었을 때만 런 재시작 또는 무효화 |
| 워커 작업 | 적용 스킬 완독, 웨이브 계약 이해, 공용 환경 검사 | 한 작업 안에서 담당 에셋 3–5개를 순차 처리 |
| 에셋 | 승인 입력/GLB/hash 확인, 렌더, reopen, 증거, 상태 기록 | 에셋마다 독립 폴더와 독립 PASS/FAIL 유지 |
| 예외 | 실패 원인과 재현 자료 상세 기록 | 정상 케이스에는 반복하지 않음 |
| 런 종료 | 집계 보드, 승인 대기 목록, 워커 release | 사용자 승인 전 다음 단계 금지 |

플랫폼이나 스킬이 “현재 작업에서 `SKILL.md` 전체를 읽으라”고 요구하면 그 읽기는 생략할
수 없다. 따라서 가장 효과적인 방법은 **짧은 새 작업을 에셋마다 생성하지 않고**, 한 워커
작업이 작은 웨이브를 끝까지 처리하게 하는 것이다. 새 작업·새 턴에서 스킬이 다시 적용되면
그 작업의 규칙에 따라 다시 완독한다.

## 목표 구조

### 1. 런 매니페스트

코디네이터가 긴 계약을 읽고 확인한 뒤 `run-contract.json`을 한 번 만든다. 이 파일은 긴
문서의 대체물이 아니라, 워커가 동일한 버전으로 작업하는지 빠르게 검사하는 잠금 장치다.

최소 필드:

```json
{
  "run_id": "...",
  "geometry_stop_gate": "DENSE_BASELINE_UNREVIEWED",
  "camera": {"projection": "ORTHO", "yaw_deg": 45, "pitch_down_deg": 30, "roll_deg": 0},
  "required_files": [
    {"absolute_path": "/abs/path/SKILL.md", "sha256": "..."}
  ],
  "tool_hashes": [
    {"absolute_path": "/abs/path/render-tool.py", "sha256": "..."}
  ],
  "forbidden": ["provider_rerun", "geometry_repair", "d1_d3", "imagegen", "live_game_edit"]
}
```

런 도중 필수 파일 SHA가 달라지면 조용히 계속하지 말고 그 런을 중지해 계약을 다시
확정한다.

### 2. 에셋 작업 매니페스트

에셋별 긴 프롬프트 대신 작은 `asset-job.json`을 사용한다.

```json
{
  "asset_id": "toilet",
  "approved_image": {"absolute_path": "/abs/toilet-approved.png", "sha256": "..."},
  "provider_result": "/abs/provider-result.json",
  "immutable_glb": {"absolute_path": "/abs/toilet.glb", "sha256": "..."},
  "footprint": "2x2",
  "access_semantics": "entrance",
  "output_root": "/abs/dense-d0-v1",
  "required_stop_gate": "DENSE_BASELINE_UNREVIEWED"
}
```

워커 지시는 “런 계약 확인 → 목록의 에셋을 순서대로 처리 → 각 에셋을 독립 검증 → 예외를
기록하고 다음 에셋 계속 → 승인 게이트에서 정지” 정도로 제한한다.

### 3. 웨이브형 장수 워커

- 동시 워커는 보통 2–3개만 유지한다.
- 워커 하나에 서로 독립적인 에셋 3–5개를 배정한다.
- 워커는 에셋마다 산출물 폴더를 분리하고, 하나가 실패해도 다른 에셋을 계속한다.
- 같은 단계에서는 새 터미널을 늘리지 않는다.
- 마지막 담당 에셋을 검증한 직후 `worker-release`로 터미널을 닫는다.
- 디버깅 증거가 있을 때만 `worker-retain`을 사용한다.

에셋별 사용자 승인처럼 중간 결정을 반드시 기다려야 하는 단계는 하나의 웨이브에 섞지
않는다. 예를 들어 d0 생성 웨이브와 승인 후 d1–d3 웨이브는 별도다.

## 대화와 오케스트레이션 출력 규칙

### 완료 메시지

정상 완료 메시지는 다음 네 항목만 보낸다.

```text
asset=<id> state=DENSE_BASELINE_UNREVIEWED result=PASS
glb_sha256=<sha> reopen=PASS
output_root=<absolute path>
report=<absolute path>
```

`filesModified`에는 파일 수십 개를 나열하지 말고 `output_root`와 `report`만 넣는다. 전체
목록은 산출물 폴더의 `result-manifest.json`에 기록한다. 실패·계약 위반·시각적 결함만
완료 메시지에 한 문단으로 추가한다.

### 상태 확인

- 정상 진행 중에는 `orca orchestration check --wait`로 `worker_done`, `escalation`,
  `question`만 기다린다.
- transcript는 장애 조사 때만 `worker-read --cursor ... --limit ...`로 다음 페이지만 읽는다.
- 이미 읽은 transcript 첫 페이지를 반복 요청하지 않는다.
- 전체 `worker-list` 결과를 대화 문맥에 넣지 않는다. 필요한 active/released/count 필드만
  필터링한다.
- delivery를 모두 처리한 뒤에만 ack한다. ack 전 재조회로 같은 delivery를 반복 출력하지
  않는다.

## 보고서와 provenance 자동화

에셋마다 자연어 문서를 처음부터 쓰지 않고 공용 종료 도구가 다음을 생성하게 한다.

- `result-manifest.json`: 전체 산출물 경로·SHA·크기·상태
- `SKILL-PROVENANCE.json`: 런 계약의 공용 레코드 참조와 에셋별 추가 레코드
- `REPORT.md`: 고정 템플릿, 측정값, stop gate, 예외 목록
- `batch-summary.json`: 전체 에셋 PASS/FAIL/UNREVIEWED 집계

공용 계약 파일을 provenance에서 빼면 안 된다. 다만 대화에서 같은 절대 경로와 SHA를
수십 번 다시 풀어 쓰지 않고 파일에 보존한다.

SHA 캐시는 `(absolute path, size, mtime)` 기준으로 사용할 수 있지만 다음 시점에는 실제
파일을 다시 해시한다.

- 승인 입력을 런에 편입할 때
- provider GLB를 처음 보존할 때
- 읽기 전용 전환 직후
- 최종 패키지 검증 때
- 캐시 메타데이터와 파일이 일치하지 않을 때

## 시각 검수의 토큰 절감

정상 케이스는 체크리스트와 수치만 저장한다.

- source yaw 선택
- landmark 개수
- silhouette IoU
- width/aspect drift
- hierarchy/mesh 개수
- reopen PASS
- GLB 불변성 PASS

긴 자연어 설명은 다음 예외에만 작성한다.

- 바닥 다이아몬드·배치 매트가 메시와 융합됨
- 출입구/서비스 면이 모호하거나 뒤집힘
- 구성 요소가 소실·중복·융합됨
- hidden/rear geometry 추정이 플레이에 영향을 줌
- footprint 또는 실루엣 drift가 계약 한계를 넘음
- Blender reopen이나 hash가 불일치함

코디네이터는 에셋마다 별도의 장문 감상을 작성하지 않고, 웨이브 종료 후 한 장의 집계
보드와 **예외 목록**을 사용자에게 먼저 보여준다. 사용자가 특정 에셋을 열어 달라고 할 때
그 에셋의 상세 증거를 제시한다.

## 스킬 자체를 고도화할 때

향후 스킬 수정에서는 다음 구조가 토큰 효율적이다.

- `SKILL.md`: 짧은 라우터, 불변 게이트, 어떤 reference를 언제 읽는지만 유지
- `references/concept.md`: 콘셉트 시트 작업에만 필요
- `references/dense-d0.md`: Meshy·Blender d0 작업에만 필요
- `references/directions.md`: 승인 후 d1–d3/16방향 작업에만 필요
- `references/runtime.md`: 실제 게임 채택 때만 필요
- `schemas/`: 매니페스트와 결과 JSON Schema
- `scripts/`: provenance·report·batch summary 자동 생성

선택된 작업에 필요한 reference는 끝까지 읽되, 해당 단계와 무관한 reference를 모든
워커에게 무조건 싣지 않는다. 필수 규칙은 reference로 숨기지 말고 `SKILL.md`의 불변
게이트에도 요약한다.

## 권장 도입 순서

1. 기존 스킬과 분리된 실험 폴더·실험 런을 만든다.
2. 실험 런에서 완료 메시지를 4줄로 제한하고 `filesModified`를 output root로 축약한다.
3. 실험 런에서 에셋 1개당 작업 1개 대신 워커 1개당 d0 에셋 3–5개를 배정한다.
4. `run-contract.json`과 `asset-job.json` 스키마를 실험용으로 추가한다.
5. provenance·report·batch summary 생성기를 실험용으로 추가한다.
6. 정상 케이스는 수치형 체크리스트, 결함만 장문으로 바꾼다.
7. 세 번의 비슷한 실험 웨이브에서 입력 토큰, 재시도 횟수, 에셋당 예외 수를 기록해 실제
   절감량을 비교한다.
8. 기존 방식과 검증 결과가 동등한 경우에만 별도의 신규 스킬을 만든다.
9. 사용자가 명시적으로 승인하기 전에는 기존 스킬을 수정하거나 신규 스킬을 기본값으로
   전환하지 않는다.

정확한 절감률은 측정 전에는 주장하지 않는다. 비교 기준은 `런 시작 고정 비용 + 에셋당
변동 비용 + 예외 처리 비용`으로 나눠 기록한다.

## 실행 전 체크리스트

- [ ] 이번 웨이브의 사용자 승인 범위가 명확하다.
- [ ] 필수 스킬·reference·계약·도구가 완독되고 해시됐다.
- [ ] run contract와 asset job이 생성됐다.
- [ ] 워커당 3–5개 에셋이 독립 폴더로 배정됐다.
- [ ] provider 재호출 허용 여부가 명시됐다.
- [ ] 완료 메시지와 payload 크기 제한이 명시됐다.
- [ ] 정상/예외 보고 규칙이 명시됐다.
- [ ] 사용자 승인 stop gate가 각 에셋에 기록됐다.
- [ ] 마지막 작업 뒤 worker release가 예약됐다.
- [ ] 실험이 기존 스킬·산출물·라이브 게임 파일을 수정하지 않는다.
- [ ] 채택 전 기존 방식과 검증 동등성을 비교한다.
