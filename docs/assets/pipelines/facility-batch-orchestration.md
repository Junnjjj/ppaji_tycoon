# 고정 시설 물리 에셋 병렬 제작 운영 정본

최종 갱신 2026-08-27. 이 문서는 승인된 실내시설을 `$ppaji-kairo-assets` 절차로 시설별
격리 생산하고, Orca orchestration으로 감독하는 방법을 고정한다. 제트스키·견인보트처럼
경로를 따라 움직이는 기구는 이 문서가 아니라 `docs/assets/pipelines/watercraft.md`를 쓴다.

현재 상태: `BATCH_TECHNICAL_COMPLETE_USER_REVIEW_REQUIRED`. 20종 모두 실제 Meshy GLB와
Blender 물리 d0–d3, 새 프로세스 재오픈과 물리 알파 잠금 검증을 통과했다. 원시 ImageGen
채색 geometry gate는 `PASS 30 / FAIL 46`, 최종 제작 승인과 라이브 채택은 0종이다.

실행 정본은
`artifacts/asset-concept-sheets/indoor-facilities-v1/physical-direction-color-wave-v1/FINAL-VALIDATION.json`,
런타임 크기 검토는 `artifacts/asset-concept-sheets/indoor-facilities-v1/runtime-fit-map-v1/`다.

## 정본과 검증된 파일럿

- 승인·거절 이력과 20종 목록:
  `artifacts/asset-concept-sheets/indoor-facilities-v1/four-direction-manifest.json`
- 시설 크기·슬롯 정본: `src/data/kairo-facilities.json`
- 캔버스·카메라 정본: `src/assets/kairo-render-contract.json`
- 축·회전 정본: `docs/assets/contracts/camera-direction.md`
- 스킬 상세:
  `/Users/jangjunpyo/.codex/skills/ppaji-kairo-assets/references/runtime-fit-and-batch-orchestration.md`
- 검증된 파일럿:
  `assets/generated/kairo-v4-simple-pilot/changing_row/physical-meshy-v1/`

`changing_row` 파일럿은 실제 Meshy GLB, 전체 Blender hierarchy, 고정 카메라 물리 d0–d3,
동일 시점 d0 실패 후 검증된 d1 참조, d2/d3 인접 방향 교정, 물리 알파 잠금, 게임 격자
크기 비교까지 실행했다. 이는 재사용할 작업자 계약의 근거이며 아직 라이브 생산 승인은 아니다.
후속 병렬 웨이브에서 `changing_row`는 기존 해시를 재검증하는 audit/reuse Task로만 다루며,
사용자가 명시적으로 재생성을 요청하지 않는 한 새 Meshy 요청을 보내지 않는다. 따라서 신규
provider 대상은 최대 19종이다.

## 대상 20종

| ID | 이름 | d0/d2 | d1/d3 | 접근 종류 |
|---|---|---:|---:|---|
| `shower_row` | 샤워실 연립 | 4×1 | 1×4 | portal |
| `changing_row` | 탈의실 연립 | 3×1 | 1×3 | portal |
| `locker_row` | 코인락커 열 | 4×1 | 1×4 | service-face |
| `washbasin_row` | 세면대 열 | 3×1 | 1×3 | service-face |
| `toilet` | 화장실 | 2×2 | 2×2 | portal |
| `nursing` | 수유실 | 2×1 | 1×2 | portal |
| `sikhye` | 식혜·계란 코너 | 2×1 | 1×2 | service-face |
| `shop` | 매점 | 2×2 | 2×2 | service-face |
| `snackbar` | 분식 | 2×2 | 2×2 | service-face |
| `chicken` | 치킨 | 2×2 | 2×2 | service-face |
| `icecream` | 아이스크림 | 1×2 | 2×1 | service-face |
| `cafe` | 카페 | 3×2 | 2×3 | service-face |
| `vending_in` | 자판기(실내) | 1×1 | 1×1 | service-face |
| `arcade` | 오락기 | 1×1 | 1×1 | service-face |
| `karaoke` | 노래방 | 2×2 | 2×2 | portal |
| `pingpong` | 탁구대 | 2×2 | 2×2 | two-sided |
| `info` | 안내소 | 2×2 | 2×2 | service-face |
| `infirmary` | 의무실 | 2×2 | 2×2 | portal |
| `office` | 사무실 | 2×2 | 2×2 | staff-only |
| `storage` | 창고 | 2×2 | 2×2 | staff-only |

승인 크롭 SHA-256, 위 풋프린트, 시설 데이터, 렌더 계약 존재 여부는 현재 20/20 일치한다.
prompt-only 4방향 실패본은 방향 권위로 재사용하지 않는다.

## 작업 웨이브

한 시설을 처음부터 라이브 채택까지 독주시키지 않는다. 같은 단계의 시설만 병렬로 처리하고
사용자 검토 뒤 다음 웨이브를 만든다.

| 웨이브 | 작업 | 시설별 정지 상태 |
|---:|---|---|
| 0 | 입력 해시, 정본 크기, 접근 종류, geometry lane 확정 | `PREFLIGHT_READY` |
| 1 | scripted root 또는 실제 Meshy GLB와 물리 d0 비교 | `SEMANTIC_BLOCKOUT_UNREVIEWED` / `DENSE_BASELINE_UNREVIEWED` |
| 2 | 승인된 한 루트의 d0–d3 물리 회전·투영·랜드마크 | `PHYSICAL_DIRECTIONS_USER_REVIEW` |
| 3 | 방향별 ImageGen 컬러 가이드와 fail-closed fallback | `COLOR_GUIDE_USER_REVIEW` |
| 4 | 네이티브 크기·게임 격자·NPC 접점·입구 오버레이 | `RUNTIME_FIT_USER_REVIEW` |
| 5 | 승인 시설만 원자적 채택, atlas·runtime·build 검증 | `PRODUCTION_REVIEW` |

웨이브 1의 geometry lane은 작업자가 유료 호출 전에 기록한다. 반복형 stall·locker·세면대·
cabinet·table·단순 room shell은 scripted Blender가 우선이며, 불규칙하거나 조형 관계가 중요한
경우만 dense image-to-mesh를 쓴다. 이미 검증된 `changing_row` dense 파일럿은 예외로 보존한다.

## 런타임 크기 규칙

메시를 옛 캔버스 높이에 맞추지 않는다. 먼저 한 타일 변 `22.627417` Blender units로 지면
풋프린트에 균일 스케일을 맞추고, 남는 폭·깊이 오차를 기록한다. 이후 고정 카메라 투영 높이로
`bodyH`, canvas height, anchor 후보를 계산한다.

`changing_row` 실측:

- 시뮬 정본 `3×1`, 회전 `1×3`
- 물리 지면 `3.000×0.938`타일
- 현행 `64×52` 전신 fit 시 피사체 폭 `57.525/64`texels
- 지면 fit 시 전체 높이 약 `57.853`texels
- 검토 후보 `64×58`, `bodyH 26`, anchor `(32,58)`
- 방향별 contact delta `±1px`; 자동 이동·잘라내기 없이 측정값으로 보존

이 후보는 전역 기본값이 아니다. 모든 시설은 자체 물리 루트로 다시 계산한다.

## Orca 작업자 계약

- 한 Run 안에 현재 웨이브의 시설별 Task를 먼저 모두 만든다.
- 비용·rate-limit 보호를 위해 Meshy와 ImageGen 단계의 기본 동시 실행 수는 3이다.
- 현재 승인 크롭과 생성물이 이 작업공간에 있으므로 작업자는 `--worktree current`를 사용한다.
- 각 작업자는 자기 시설의
  `assets/generated/kairo-v4-simple-pilot/<id>/<run-id>/`만 수정한다.
- 전역 batch manifest와 review board는 coordinator만 수정한다.
- 작업자는 live data, accepted pack, atlas, 다른 시설 폴더를 수정하지 않는다.
- provider 실패·quota·auth·잘못된 GLB는 typed failure로 종료한다. 유료 자동 재시도는 없다.
- 완료 작업자는 정확한 task/dispatch ID로 `worker_done`을 한 번만 보내고 멈춘다.
- coordinator는 완료된 worker를 다음 Task에 즉시 재사용하거나 `worker-release`한다.

작업자 Task에는 반드시 다음이 들어간다.

```text
asset id / approved crop absolute path / exact SHA-256
simulation footprint / access kind / fixed component inventory
geometry lane and justification / allowed stage / exact stop gate
skill and reference absolute paths to hash
provider adapter path and credential source name, never credential value
forbidden: prompt-only geometry authority, fabricated GLB, live edits, silent retry
required evidence and worker_done report path
```

## 프리플라이트 재실행

```bash
python3 /Users/jangjunpyo/.codex/skills/ppaji-kairo-assets/scripts/preflight_facility_batch.py \
  --workspace /Users/jangjunpyo/orca/workspaces/ppaji_tycoon/에셋만들기_스킬 \
  --manifest artifacts/asset-concept-sheets/indoor-facilities-v1/four-direction-manifest.json \
  --adapter /Users/jangjunpyo/Documents/jet-ski-skill-full-pilot-01/codex-output/provider-pipeline/provider_pipeline.py \
  --output artifacts/asset-concept-sheets/indoor-facilities-v1/physical-batch-preflight.json
```

이 검사는 provider 요청을 하지 않고 자격증명 값도 읽거나 기록하지 않는다. 현재 로컬 검사는
Blender 5.2, adapter, `ppaji-meshy-api` Keychain service, Orca CLI, 20개 입력을 PASS했다.
coordinator는 별도 read-only `orca status --json`에서 runtime과 graph가 모두 `ready`임을
확인했다.

## 시작·정지 권한

현재 다음 행동은 `USER_AUTHORIZATION_TO_CREATE_ORCA_RUN_AND_START_WAVE_0`이다. 사용자가 병렬
실행을 지시하기 전에는 Run/Task/worker를 만들지 않는다. 웨이브 0 뒤에도 비용 호출이 포함된
웨이브 1 범위와 동시 실행 수를 coordinator가 다시 명시한다.

웨이브 5는 병렬 제작의 연장이 아니다. 공유 데이터·atlas 경계는 승인 시설만 순차 반영하고
`verify-kairo-v4 --strict`, atlas bake, game runtime harness, gate/verify/build를 모두 통과시킨다.
