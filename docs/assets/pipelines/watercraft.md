# 이동형 수상기구 에셋 제작 파이프라인

> 상태: **프로젝트 정본(살아 있는 문서)**
> 최초 검증: 2026-08-26, Jet-Ski C 파일럿
> 대응 스킬: `$ppaji-watercraft-pipeline`
> 마지막 갱신: 2026-08-26

이 문서는 제트스키, 견인 보트, 바나나보트, 플라이피쉬처럼 **경로를 따라 여러 각도로
회전하는 수상기구**를 빠지타이쿤 에셋으로 만드는 기준이다. 앞으로 파이프라인이나 스킬을
고도화하면 이 문서도 같은 작업에서 갱신한다. 채팅 기록이나 특정 런 폴더보다 이 문서가
프로젝트의 장기 정본이다.

## 1. 적용 범위와 다른 에셋 파이프라인의 경계

| 대상 | 기본 방향 수 | 사용할 기준 |
|---|---:|---|
| 방향성이 약한 고정 시설 | 1~2 | 현 카이로 시설 계약 |
| 창구·무대·탑승구가 회전하는 고정 시설 | 4 | `docs/assets/contracts/four-direction.md`, `$ppaji-kairo-assets` |
| 경로를 따라 회전하는 제트스키·보트·견인기구 | **16 권장** | 이 문서, `$ppaji-watercraft-pipeline` |
| 완전한 실시간 3D 기구 | 연속 회전 | 별도 3D 런타임 트랙; 이 문서의 메시 승인 단계까지만 공유 |

고정 시설의 4방향과 이동 기구의 16방향을 섞지 않는다. 고정 시설은 배치 방향을 읽기
위한 것이고, 이동 기구는 경로 접선이 계속 변할 때 각도 점프를 줄이기 위한 것이다.
두 트랙의 카메라·월드축·회전 부호 정본은 공통으로
`docs/assets/contracts/camera-direction.md`를 사용한다.

## 2. 정본을 세 층으로 나눈다

1. **컨셉 정본** — 사용자가 승인한 단일 이미지. 색, 재질, 정체성의 기준이다.
2. **물리 정본** — 승인 이미지만으로 만든 실제 GLB와 Blender 렌더. 카메라, 방향,
   실루엣, 가림, 부품 위치의 기준이다.
3. **아트 정본 후보** — 물리 렌더를 방향 기준으로 삼아 채색한 4/16방향 이미지. 게임용
   외형 후보이며, 물리 메시 보존을 자동으로 의미하지 않는다.

어느 층도 다음 층의 성공을 대신 증명하지 않는다. 예쁜 컨셉이 실제 메시 생성을 증명하지
않고, Dense GLB가 16방향 채색의 일관성을 증명하지 않으며, 게임 화면 합성이 실제 런타임
연결을 증명하지 않는다.

## 3. 승인 상태와 중단 지점

| 상태 | 의미 | 다음 작업 전 필요한 것 |
|---|---|---|
| `CONCEPT_SET_UNREVIEWED` | 고품질 컨셉 후보 세트만 존재 | 사용자가 한 장 선택 |
| `CONCEPT_SINGLE_APPROVED` | 단일 컨셉 정본 고정 | 제공자 실행 승인·자격 증명 |
| `PROVIDER_PREFLIGHT_PASS` | 어댑터·응답 스키마·출력 경로 점검 | 실제 제출 |
| `DENSE_BASELINE_UNREVIEWED` | 실제 비어 있지 않은 GLB와 d0 렌더 존재 | 사용자 형상 검토 |
| `DENSE_BASELINE_APPROVED` | 수리 전 기준 메시 승인 | 방향 렌더 생성 |
| `PHYSICAL_4_UNREVIEWED` | h00/h04/h08/h12 물리 렌더 존재 | 방향·가림 검토 |
| `PHYSICAL_16_UNREVIEWED` | h00~h15 물리 렌더 존재 | 연속성 검토 |
| `COLORED_4_UNREVIEWED` | 네 기준 방향 채색 후보 존재 | 스타일·방향 검토 |
| `COLORED_16_UNREVIEWED` | 16방향 채색 후보 존재 | 전체 회전 검토 |
| `GAME_FEEL_COMPOSITE_UNREVIEWED` | 실제 게임 캡처 위 합성 영상 존재 | 크기·속도·읽힘 검토 |
| `PRODUCTION_READY` | 크기·앵커·팔레트·런타임 검증 통과 | 사용자 최종 채택 |

각 상태에서 사용자가 승인하기 전에는 다음 상태로 자동 진행하지 않는다. 특히
`DENSE_BASELINE_UNREVIEWED`에서는 메시를 수리하거나 방향·라이더 작업으로 넘어가지 않는다.

## 4. 전체 제작 흐름

### A. 컨셉 후보 세트와 단일 이미지 승인

1. 기구의 역할, 크기, 재질, 색, 전후 구분 표식을 먼저 적는다.
2. 고품질 컨셉 후보는 built-in ImageGen으로 만들 수 있다. 후보마다 호출과 원본을 분리한다.
3. 사용자가 한 장을 명시적으로 선택할 때까지 메시 입력을 만들지 않는다.
4. 선택된 파일을 바이트 그대로 보존하고 SHA-256을 기록한다.

**금지:** 승인된 단일 이미지를 대신할 GPT 멀티뷰를 만들어 메시 제공자에 넣지 않는다.
멀티뷰 그림은 서로 다른 물체를 그릴 수 있어 3D 기하의 출처를 오염시킨다.

### B. 이미지→메시 제공자 실행

1. 자격 증명은 환경변수나 기존 제공자 어댑터로만 전달한다. 문서·로그·명령 기록에 키를
   남기지 않는다.
2. 제공자에는 **승인된 단일 이미지 한 장만** 제출한다.
3. 요청 ID, 원본 응답의 비밀 제거본, 다운로드 URL의 출처, 바이트 수, SHA-256을 기록한다.
4. 다운로드된 GLB는 실제로 비어 있지 않고 디코드 가능해야 한다. 제공자 성공이나 Dense
   GLB를 추정하거나 꾸며 쓰지 않는다.
5. 최초 GLB는 읽기 전용 원본으로 취급한다. 정리·수리·재저장은 복사본에서만 한다.

### C. Blender Dense 기준선

1. GLB의 전체 hierarchy를 Blender에 가져온다. 보이는 메시 하나만 골라 가져오지 않는다.
2. 노드·메시·재질·텍스처·바운딩박스·삼각형 수를 기록한다.
3. 물체 중심, 수면 접점 프록시, 공통 카메라와 조명을 고정한다.
4. 첫 물리 렌더 d0는 `docs/assets/contracts/camera-direction.md`의 정확한 계약을 쓴다:
   orthographic, 게임 yaw 45°, optical pitch down 30°, roll 0°, Blender Euler XYZ
   `(60°,0°,45°)`, 축 `I=+X/J=−Y/height=+Z`.
5. 승인 컨셉과 d0를 같은 스케일로 비교하고, 선수·선미·핸들·좌석·노즐 같은 landmark를
   표시한다.
6. `DENSE_BASELINE_UNREVIEWED`에서 멈춘다. 사용자가 형상을 보고 승인하기 전에는 수리하지
   않는다.

### D. 물리 4방향과 16방향

Dense 기준선 승인 후 같은 Blender 파일, 같은 카메라, 같은 조명, 같은 캔버스와 앵커로
렌더한다.

먼저 source-axis normalization 아래에서 선수/진행 방향 landmark를 canonical game local
`+J`(`Blender −Y`)에 맞춘다. 이 정규화는 asset root 회전과 섞지 않고 별도 노드와 수치로
기록한다.

| ID | root Euler XYZ | 진행 landmark 화면 | 게임 기준 |
|---|---|---|---|
| h00 | `(0,0,0)` | 좌하 | `+J` |
| h04 | `(0,0,90)` | 우하 | `+I` |
| h08 | `(0,0,180)` | 우상 | `−J` |
| h12 | `(0,0,270)` | 좌상 | `−I` |

16방향은 `h00`부터 `h15`까지 root Z **22.5° 간격**이다. root pitch와 roll은 전부 0°다.
먼저 네 기준 방향으로 메시의 앞·뒤와
가림이 맞는지 확인하고, 경로 이동용 기구는 16방향으로 확장한다. 모든 렌더는 공통 프레임,
공통 root/waterline 앵커와 투명 RGBA를 사용한다.

### E. 방향별 채색

1. 방향 하나당 ImageGen 호출 하나를 사용한다.
2. 해당 `physical-16/hXX.png`를 **유일한 기하·카메라·방향·실루엣·가림 기준**으로 지정한다.
3. 승인 컨셉의 팔레트와 재질은 텍스트로 설명한다. 컨셉 이미지를 함께 참조하면 모델이
   물리 방향보다 영웅 시점의 외형을 복사할 수 있으므로, 실제 파일럿처럼 방향 오류가
   발생하면 컨셉 이미지 입력을 제외한다.
4. 회전, 미러, 재중앙화, 부품 수 변경, 라이더·물보라·로고 추가를 금지한다.
5. 원본 출력을 그대로 보존하고, 후처리본과 섞지 않는다.

ImageGen은 표면만 칠하라는 지시에도 내부 패널·비율·부품을 재해석할 수 있다. 따라서
“방향 통과”와 “물리 기하 보존”은 별도 판정이다.

### F. 알파·방향·연속성 QA

각 hXX에 다음을 기록한다.

- 파일 존재, 바이트 수, SHA-256, 디코드, 캔버스 크기;
- 실제 RGBA 채널 여부와 알파 extrema;
- RGB에 구워진 체크무늬 여부;
- 선수와 선미의 화면 위치, 직접 전면/후면/측면 여부;
- 인접 방향과의 순서 및 16방향 한 바퀴 연속성;
- 물리 렌더 대비 실루엣과 내부 부품 변화;
- 원본과 후처리본의 경로 분리.

RGB 체크무늬는 투명이 아니다. 필요한 경우 검토 복사본에만 추정 마스크를 만들고
`ESTIMATED_FROM_BAKED_RGB_CHECKER`로 표시한다. 실제 알파처럼 보고하지 않는다.

### G. 게임 화면 느낌 검토

실제 게임 파일을 수정하기 전에 현재 게임 캡처 위에 축소·픽셀화한 16방향을 합성한다.
경로 접선으로 h00~h15를 선택하고 다음을 확인한다.

- 한 바퀴에서 16방향이 모두 실제로 선택되는가;
- 게임 경로의 `+J→+I→−J→−I` 접선이 `h00→h04→h08→h12`와 일치하는가;
- 이론상 최대 방향 양자화 오차가 11.25° 안인가;
- 기구가 물 영역을 벗어나거나 UI를 가리지 않는가;
- 1×/2× 화면에서 크기와 앞뒤가 읽히는가;
- 방향 전환 때 크기·앵커가 튀지 않는가.

합성물에는 `NOT LIVE MAP / NOT PRODUCTION`을 표시한다. 이 단계는 게임 느낌의 검토이지
아틀라스, 시뮬레이션, 저장 데이터 연결의 증명이 아니다.

### H. 실제 게임 채택

사용자가 게임 화면 느낌과 크기를 승인한 뒤에만 진행한다.

1. 모든 방향에 하나의 공통 표시 크기와 앵커를 결정한다.
2. 게임 팔레트·픽셀 밀도에 맞춰 축소하고, 필요하면 가장자리와 색을 결정론적으로 정리한다.
3. 16방향 ID와 경로 접선→heading 변환을 런타임 계약에 연결한다.
4. 기존 임시 코스 보트 도형을 한 번에 교체하되, 폴백을 유지한다.
5. atlas bake, typecheck, lint, test, gate, current-worktree browser harness, build를 실행한다.
6. 실제 게임 영상에서 경로 이동·일시정지·배속·카메라 줌·깊이 정렬을 확인한다.
7. 라이더, 웨이크, 스프레이, bank/pitch/roll은 각각 별도 승인 범위다.

## 5. 권장 작업 폴더

대형 생성물은 git에 넣지 않고 현재 저장소의 무시 대상인 아래에 둔다.

```text
assets/generated/watercraft-pilots/<asset-slug>/
├── source/
│   ├── approved-single.png
│   └── source-manifest.json
├── provenance/
│   └── SKILL-PROVENANCE.json
├── provider/
│   ├── request-redacted.json
│   ├── result.json
│   └── original-dense.glb
├── blender/
│   ├── dense-baseline.blend
│   └── import-and-landmark-evidence.json
├── physical-16/
│   ├── h00.png … h15.png
│   └── heading-manifest-16.json
├── colored-16/
│   ├── prompts/
│   ├── raw/
│   ├── processed/
│   └── QA-METRICS.json
├── game-preview/
│   ├── contact.png
│   ├── preview.mp4
│   └── manifest.json
└── STATUS.md
```

파일이 크더라도 승인 이미지, 원본 GLB, Blender 기준선, 방향별 원본, 프롬프트, 매니페스트,
QA를 지우지 않는다. 필요할 때 결과를 재생성할 수 있게 만든 정본이기 때문이다.

## 6. 반드시 보존할 불변식

- 사용자가 승인한 단일 이미지만 메시 입력으로 사용한다.
- 원본 GLB와 원본 ImageGen 출력은 덮어쓰지 않는다.
- 제공자 성공, 파일, 알파, 기하 보존을 추정하지 않는다.
- 네 방향만 승인됐다고 16방향이나 게임 채택까지 승인된 것으로 확대하지 않는다.
- 물리 방향 이미지는 방향·기하 정본이고, 채색 이미지는 외형 후보다.
- 숫자 IoU나 면적 유사도만으로 부품·위상 보존을 승인하지 않는다.
- 사용자 승인 전에는 live pack, atlas, 게임 데이터와 런타임을 수정하지 않는다.
- 실험 서버는 현재 워크트리에서 띄운다. 다른 워크트리의 오래된 서버를 재사용하지 않는다.
- API 키·서명 URL·비밀 응답은 기록 문서와 provenance에 남기지 않는다.

## 7. 알려진 실패와 대응

| 실패 | 실제 원인 | 대응 |
|---|---|---|
| h12가 후면 우측 대신 전면 좌측으로 생성 | 컨셉 C 영웅 시점을 물리 방향보다 강하게 복사 | 물리 h12만 이미지 입력으로 사용하고 팔레트는 텍스트로 전달 |
| 체크무늬가 보이지만 알파 채널 없음 | 배경이 RGB 픽셀로 구워짐 | 원본은 실패 사실 보존, 검토본에만 추정 마스크 |
| 방향은 맞지만 패널·노즐·레일이 달라짐 | ImageGen이 색칠 대신 재설계 | 방향 통과와 기하 보존을 분리하고 물리 렌더를 계속 정본으로 유지 |
| 방향별 화면 크기가 튐 | 각 호출이 피사체 크기와 중심을 재해석 | 원본 보존 후 검토본만 공통 bbox/표시 크기로 정규화 |
| 제공자 결과가 있다고 보고됐지만 파일 근거 없음 | 작업 상태와 산출물 상태를 혼동 | 비어 있지 않은 실제 GLB, 디코드, SHA-256으로만 성공 판정 |
| 합성 영상은 좋지만 게임에서 보장되지 않음 | 정적 게임 캡처 위 합성일 뿐 | `GAME_FEEL_COMPOSITE_UNREVIEWED`와 실제 런타임 채택을 분리 |
| Blender root yaw는 맞지만 게임 진행 방향이 좌우 반전 | Blender `I/J` 축 매핑 또는 source forward 정규화가 문서화되지 않음 | 공통 카메라 검산 실행, canonical forward=`+J`, 네 cardinal 화면 사분면과 런타임 접선을 함께 검사 |

## 8. 첫 검증 사례 — Jet-Ski C

현재 머신의 보존 루트:

```text
/Users/jangjunpyo/Documents/jet-ski-skill-full-pilot-01
```

핵심 정본:

| 산출물 | SHA-256 / 상태 |
|---|---|
| 승인 컨셉 `concepts/C.png` | `6f21401e28049c8cefc68b2b787508f35bb59faacf03b583a568952e29460250` |
| Meshy Dense GLB | `09e2c76636c008c806bb07a2db2c08e7422c5794898c46b4b2560901ad6fb687` |
| Blender Dense 기준선 | `1b35d6ba7851e8b754b2a258e826c218e309edac9f3b99a7edc10e53d918a8ef` |
| 물리 16방향 | 16/16 존재, 공통 카메라·앵커 검증 |
| 컬러 16방향 | 일반 방향 16/16 수동 통과 |
| 원본 실제 RGBA | 4/16 |
| RGB 체크 배경 | 12/16, 추정 알파로만 검토 |
| 게임 느낌 영상 | 8초, h00~h15 모두 선택, 최대 오차 11.222° |

사용자는 컬러 방향과 게임 화면 느낌을 긍정적으로 검토했고, **최종 크기 조정은 실제 채택
시점으로 미뤘다.** 기록 파일의 상태명은 아직 `COLORED_16_UNREVIEWED`와
`GAME_FEEL_COMPOSITE_UNREVIEWED`이므로, 프로덕션 통합 완료로 해석하지 않는다.

이 파일럿의 Blender 카메라는 레거시 `(+X,+Y,+Z)` 위치 프레임을 사용했다. 물리 root
회전과 화면상 선수 순환은 검증됐지만 새 게임 축 정본 `I=+X/J=−Y`를 메타데이터로 선언하지
않았다. 따라서 원본을 재렌더하거나 폐기하지는 않되, 라이브 채택 전
`h00/h04/h08/h12 = 좌하/우하/우상/좌상`과 경로 접선 매핑을 새 계약으로 다시 감사한다.

주요 증거:

```text
codex-output/SKILL-PROVENANCE.json
codex-output/DENSE-BASELINE-STATUS.json
codex-output/heading-pilot/heading-manifest-16.json
codex-output/heading-pilot/imagegen-16-continuation/QA-REPORT.md
codex-output/heading-pilot/imagegen-16-continuation/QA-METRICS.json
codex-output/heading-pilot/imagegen-16-continuation/game-preview/GAME-PREVIEW-MANIFEST.json
```

## 9. 유지보수 계약

`$ppaji-watercraft-pipeline`을 고도화하거나 이 파이프라인에서 새 실패를 발견하면 같은 작업에서
다음을 수행한다.

1. 이 문서의 관련 단계·실패 표·산출물 구조를 수정한다.
2. 문서 상단의 `마지막 갱신` 날짜를 바꾼다.
3. 아래 변경 기록에 검증된 사실만 한 줄 추가한다.
4. 스킬의 라우팅과 문서 링크가 여전히 실제 경로를 가리키는지 검사한다.
5. 새 규칙이 특정 기구만의 예외라면 일반 규칙으로 올리지 말고 검증 사례에만 적는다.

### 변경 기록

| 날짜 | 변경 | 근거 |
|---|---|---|
| 2026-08-26 | 단일 승인 이미지→Dense GLB→물리 16방향→컬러 16방향→게임 느낌 합성 흐름 최초 문서화 | Jet-Ski C 파일럿 |
| 2026-08-26 | 게임 `I/J`→Blender 축, yaw/pitch/roll, h00–h15 root 회전과 화면 방향을 수치로 고정 | `kairo-render-contract.json`, Blender 독립 카메라 검산 |

## 10. 관련 문서

- `docs/assets/README.md` — 전체 에셋 산출물 색인
- `docs/assets/contracts/camera-direction.md` — 공통 게임축·Blender 카메라·방향 부호 정본
- `docs/assets/contracts/four-direction.md` — 고정 시설 4방향 계약
- `docs/assets/maintenance/legacy-v2-regeneration.md` — 카이로 시설 재생성 순서
- `docs/assets/maintenance/legacy-sheet-prompts.md` — 기존 시설용 프롬프트 계약
- `docs/design-v5-draft.md` — 수상 코스와 3D 트랙의 설계 배경
- `src/assets/kairo-render-contract.json` — 현재 시설 렌더 계약
- `src/render/scenes/KairoScene.ts` — 현재 코스 보트 이동·임시 도형 렌더 위치
