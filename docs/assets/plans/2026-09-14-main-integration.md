# 에셋·입구 배치 메인 통합 계획 (2026-09-14)

## 범위와 순서

사용자 승인: 현재 에셋 작업의 호환성 문제를 보완하고 로컬 main에 반영한다.
시작 기준 main = 85019e12de1fd7cd4a9f278b1e0d2e92610c8a66, 작업 브랜치도 같은 커밋.
main 작업 폴더는 변경 없음. 현재 에셋 작업은 미커밋이었다.

1. 기존 저장 읽기 실패를 빈 슬롯과 구분한다. 실패 시 부팅/저장 중지, 원본 다운로드 제공.
2. 방향이 생략된 main 매표소를 인식한다. 입구·실내·장식 변경은 복제본에서 모두 성공해야 반영한다.
3. 배치한 출처와 당시 위치·방향이 일치하는 자동 장식만 교체한다. 기존 무표식 장식·울타리는 보존한다.
4. 기존 실내에 사용자가 놓은 시설이나 확장 위치의 시설이 있으면 원래 배치를 보존한다.
   기존 평상/탁구대도 무조건 지우지 않는다. 보류된 옛 매표소는 기존 창구 입장 방식을 유지한다. 새 게임은 승인된 대로 해당 시설 없이 시작한다.
5. 실제 main 소스로 생성한 저장 fixture, 중간 실패의 원자성, 장식 보호, 저장 실패 보호를 검증한다.
6. 타입·린트·전체 단위 테스트·빌드·정적 게이트·결정론 및 실제 브라우저 부팅을 확인한다.
7. 실행 파일을 명시적으로 스테이징해 커밋한다. main이 여전히 같은 깨끗한 기준인지 재확인하고 ff-only 병합한다.
8. clean export에서도 테스트/빌드로 누락 파일이 없는지 검증한다. 다른 워크트리와 원격은 변경하지 않는다.

## 다른 시스템 워크트리와의 경계

`게임시스템-v2`는 fae7035 기준이며 미커밋 변경이 다수 있고, 별도 `ppaji/` 게임과 기존 루트 `src/`를 모두 수정 중이다.
진행 중인 해당 작업을 커밋하거나 덮어쓰지 않는다. 이번 통합은 현재 main의 루트 게임 대상이다.
그 시스템 변경을 나중에 병합할 때 아래 공통 파일을 통째로 어느 한쪽으로 선택하면 기능이 유실된다.
입장 동선/높이/에셋 표시 어댑터는 이번 구현, 경제·진행·신규 UI 규칙은 시스템 작업을 기준으로 함수별 병합한다.

### 공통 수정 파일 (공통 조상 이후 실제 시스템 변경 기준)

- `eslint.config.js`
- `src/assets/kairo-atlas.test.ts`
- `src/assets/kairo-contract.test.ts`
- `src/assets/kairo-contract.ts`
- `src/assets/kairo-guest-sprite.test.ts`
- `src/assets/kairo-render-contract.json`
- `src/data/kairo-facilities.json`
- `src/main.ts`
- `src/render/scenes/KairoScene.ts`
- `src/save/kairo.ts`
- `src/sim/kairo/golden.test.ts`
- `src/sim/kairo/guests.ts`
- `src/sim/kairo/placement.test.ts`
- `src/sim/kairo/placement.ts`
- `src/sim/kairo/startkit.ts`
- `tools/regen-facility.ts`

### 새 ppaji 게임의 별도 연결

시스템 워크트리 `docs/ppaji-asset-contract.md`와 `ppaji/README.md`를 읽었다.
새 엔진은 `fac/<id>/<facing>`, NPC 18×32 및 별도 포즈 계약을 사용한다.
이번 루트 엔진의 NPC V8은 접지 원점을 가진 40×40 아틀라스 셀, 실루엣 높이 21이다.
파일 복사만으로 연결할 수 없으며 ID·발자국·입구·회전·NPC 접지 어댑터가 필요하다.
이 문서와 실행 아틀라스/manifest를 이후 이식의 기준으로 사용한다.

## 커밋에 넣는 것

루트 src·public/assets의 실행 데이터와 이미지, 관련 테스트, 재패킹 도구, 설정 및 현재 에셋 문서.
`codex-output/` 복구/생성 중간물 5.6GB, `artifacts/`, Python 캐시와 무관한 변경은 제외한다.
NPC 재패킹은 명시적 source 경로를 받아야 하며 실행에는 원본 생성 폴더가 필요하지 않다.

## 검증 및 결과

- 실제 main 소스로 생성한 저장: `src/save/__fixtures__/main-85019e1.json` (시드 20260818, 북한강, 원본 7시설).
- 구 저장 매표소 방향 생략, 공간 충돌의 전체 롤백, 사용자 실내 시설/장식/울타리 보존, 옛 창구 입장 유지 검증.
- 저장 파싱 실패·공간 부족 복원 실패·저장소 접근 실패의 부팅/쓰기 차단과 복구 후 재저장 검증.
- 타입·린트·전체 120개 파일: 1,624 통과, 1 건너뜀. 정적 gate/음성 대조군·결정론 통과.
- 커밋할 파일만 추출한 clean source에서도 전체 테스트 1,624 통과/1 건너뜀 및 build 통과.
  설치된 node_modules만 공유했고 codex-output/artifacts/assets/generated는 복사하지 않았다.
- clean 검증에서 기존 회전 테스트가 미커밋 생성 PNG에 의존함을 발견해 8KB 실물 회귀 fixture를 Git에 포함했다.
- 에고브라우저의 별도 포트 62119에서 새 게임 실내 104칸·매표소(46,9)·문 2개·NPC V8 확인.
- 실제 main fixture를 브라우저에 넣어 7시설/기존 매표소(44,15) 보존, 입장 후 이용 중인 손님과 V8 몸체 확인.
- 실패 저장 주입 시 __kairo 미생성, 복구 안내/다운로드 버튼 표시, 원본 문자열 보존 확인. 테스트 저장은 제거했다.
- main 재확인: 85019e1, 작업 폴더 변경 없음. 이 변경 세트를 커밋하고 fast-forward 방식으로 적용한다.
- 원격 push/배포 및 다른 게임시스템 워크트리 병합은 이번 적용에 포함하지 않는다.
