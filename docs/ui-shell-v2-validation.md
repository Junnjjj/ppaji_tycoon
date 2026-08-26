# UI 셸 v2 최종 통합 검증

최초 외부 통합 검증 시각은 **2026-08-25 22:32~22:48 KST**, post-fix 로컬 집중 재검증은
**2026-08-25 23:38~23:40 KST**다. 이 문서는 홈·메뉴·코스·온보딩·사건 장면·주변 장식
복구 계획의 실행 결과를 기록한다. 자동 검증, 에이전트 화면 확인, 사람 검수를 같은 완료로
취급하지 않는다.

## 외부 소스 정체 — 최초 통합 기록

- 외부 URL: `https://injection-training-collaboration-lions.trycloudflare.com`
- Git HEAD / 외부 `window.__kairo.build.sha` / 외부 `/__ppaji_build.sha`:
  `1464895a54b0bac6138cb83063736ac2a5338ce6`
- branch: `Junnjjj/게임시스템업데이트`
- source digest: 서버 시작 시 계산한 dirty-tree 내용 해시를 health/DOM/검증기에서 동일하게 확인
- server start: `2026-08-25T13:32:37.865Z`
- strict port: `5188`; Cloudflare Tunnel도 정확히 `127.0.0.1:5188`을 가리킨다.
- identity 집중 검증은 부팅까지 포함해 **7/7 통과**, 콘솔 오류 0, 요청 실패 0, HTTP 200.

이 URL은 계정 없는 Cloudflare Quick Tunnel이라 영구 주소나 가용성 보장이 아니다. 또한 이번
지시가 commit을 금지했으므로 worktree는 dirty다. SHA가 같은 다른 diff를 오인하지 않도록
상대 경로와 파일 내용을 결정론적으로 해시하며, 공개 build identity에는 절대 worktree 경로를
싣지 않는다.

## post-fix 외부 기준점 기록

- 검증 시각: **2026-08-26 00:03 KST**
- 실행 당시 외부 URL: `https://tape-analysis-msgstr-revised.trycloudflare.com`
- strict port: `5198`
- Git HEAD: `1464895a54b0bac6138cb83063736ac2a5338ce6`
- dirty-tree source digest는 외부 `window.__kairo.build`, `/__ppaji_build`, 현재 worktree에서
  같은 실행 중 일치시켰다. 문서가 digest 입력에 포함되므로 값을 이 문서 안에 자기참조로
  고정하지 않고 검증기 출력과 endpoint를 증거로 삼는다.
- fresh Chrome 393×852 검증은 부팅·SHA·digest·DOM·캡처·콘솔·요청을 포함해
  **7/7 통과**했다.

위 URL도 Quick Tunnel이라 세션 프로세스가 종료되면 사라진다. 완료 판정에는 URL 문자열이
아니라 같은 실행에서 확인한 SHA와 source digest를 함께 쓴다.

## 393×852 DPR3 캡처

홈·메뉴·소스 정체 파일은 post-fix strict 로컬 URL(`127.0.0.1:5197`)의 fresh browser
context에서 다시 만들었다. 나머지 파일은 위 최초 외부 통합 기록의 캡처다. PNG는 DPR3이므로
세로 파일은 1179×2556, 가로 파일은 2556×1179이며 검증 하네스의 부팅 증거를 위해
`debug=1` 오버레이가 포함된다.

| 표면 | 세로 캡처 | 가로 캡처 | 판정 |
|---|---|---|---|
| 소스 정체/홈 | `tmp-shots/kairo-share-identity.png`, `tmp-shots/kairo-home-shell-v2-portrait.png` | `tmp-shots/kairo-home-shell-v2-landscape.png` | A/B/C 한 밴드, `물려받은 코스 시험 운행`, 무잘림 통과 |
| 메뉴 | `tmp-shots/kairo-menu-shell-v2-portrait.png` | `tmp-shots/kairo-menu-shell-v2-landscape.png` | Today→경고→운영/성장/기록, 목표 hidden, computed opacity/background recipe 통과; 사람 선호 승인 없음 |
| 건설 | `tmp-shots/kairo-build-phase4-세로.png` | `tmp-shots/kairo-build-phase4-가로.png` | 약 3장, 화살표 0, 그림·비용·역할·잠김 설명 통과 |
| 코스 | `tmp-shots/kairo-course-v2-info-portrait.png`, `tmp-shots/kairo-course-v2-edit-portrait.png`, `tmp-shots/kairo-course-v2-trial-portrait.png`, `tmp-shots/kairo-course-v2-review-portrait.png` | `tmp-shots/kairo-course-v2-info-landscape.png`, `tmp-shots/kairo-course-v2-edit-landscape.png`, `tmp-shots/kairo-course-v2-trial-landscape.png`, `tmp-shots/kairo-course-v2-review-landscape.png` | 실제 CDP drag→4초 시험→review→apply 통과 |
| 결산 | `tmp-shots/kairo-report.png` | Phase 7 가로 surface audit | 3 KPI→처방→히트맵→요일→구성→장부 순서 통과 |
| 사건 카드 | `tmp-shots/kairo-event-card.png` | 전체 surface audit의 2/3 선택 행 | 실제 합성 장면, 44px, overflow 0 통과 |
| 주변 장식 | `tmp-shots/kairo-surround-decor.png` | 전체 가로 하늘/경계 audit | 7종 12개, 하늘 노출 0, runtime deco object 0 |

post-fix 메뉴 캡처에서는 지도·티커가 시트와 카드에 비치지 않고 Today→운영→성장 위계가
즉시 읽힌다. 자동 게이트는 시트·Today·그룹·행의 computed opacity가 1이고 실제 배경 recipe가
불투명인지 세로·가로에서 확인한다. 이는 구현·판독성의 자동/에이전트 검증이며 사람의 시각 선호
승인이나 무라벨 A/B를 대신하지 않는다.

## 실행 결과

### 집중 게이트

- post-fix focused unit: `meta`/UI contract **24/24 통과**. shop·cafe craft 진행과
  snackbar·vending 비진행, 닫힌 홈 A의 메뉴 시트 진입, 불투명 토큰/animation 계약을 포함한다.
- 최종 로컬 source identity: 부팅·SHA·dirty-tree digest·DOM·393×852·콘솔·요청을 포함해
  **7/7 통과**했다.
- post-fix 로컬 홈/메뉴 셸: **20/20 통과**. 기존 18개 계약에 세로·가로 티커
  `elementFromPoint` 44/44 최상단 표본·목표/메뉴/건설 비침범·아래 끝 실제 CDP 터치로
  알림함 열기 두 건을 추가했다. 캡처는 위 로컬 파일로 갱신했다.
- post-fix 로컬 Phase 7/온보딩 v2: **26/26 통과**. `regular-purchase` 홈 A를 실제 CDP
  터치해 공용 메뉴 시트와 44px 단골 행동 표면이 나타나는 회귀를 추가했다.

- 관련 Vitest 12파일: **87/87 통과**. 문구 회귀 집중 게이트
  (`meta`/`goals`/`management`) 역시 **20/20 통과**했다.
- 최초 외부 홈/메뉴 셸: 수정 전 정확한 문구 수락 두 건만 실패하는 **13/15 RED**를
  재현한 뒤, 온보딩 추천 원천의 A를 `물려받은 코스 시험 운행`으로 맞춰
  source digest 검사를 더한 당시 게이트는 **16/16 통과**했다. 세로·가로 모두 A 59%,
  B/C 19%/19%, 밴드 377×64, 44px, overflow 0이고 기존 production `course` action 이동은
  유지됐다.
- 외부 코스 v2: **20/20 통과**. portrait 조작 지도 686px, dock 109px, 독/티커 교차 0,
  반응 817/1617/2417/3217ms, 영문 라벨 0.
- 외부 Phase 7/온보딩 v2: **25/25 통과**. 코스→먹거리→기본 메뉴 확인→이름 있는 민지의
  실제 구매→첫 결산→`version:2/done` 저장·재로드와 legacy v1 done/unfinished 부팅을
  실제 브라우저 표면으로 밟았다.
- 외부 사건/주변: **17/17 통과**. 사건 8테마가 8개 서로 다른 합성 서명을 내고,
  실제 4주차 카드에 그림이 뜬다. 주변은 7종 12개가 실제 bake됐다.

### 이전 전체 게이트 기록 — post-fix 재실행 전 스냅샷

- `npm run typecheck`, `npm run lint`, `npm run gate`, `npm run build`: 통과.
- HUD/에셋 정적 게이트: **27/27 통과**.
- 전체 Vitest: **96파일 중 93 통과, 3 실패; 1424 통과 / 3 실패 / 1 제외**.
- `accident.test.ts --maxWorkers=1`: **10/10 통과**.
- 외부 전체 `verify-kairo`: **354/356**. 남은 둘은 기존 K37 벽/시설 깊이 화소 표본이다.
- `npm run seam -- --selftest`: 이음새 위반 0, 음성 대조군 6/6.
- 결정론: 통과.
- 12 seed×26주: 34,089ms, 파산 0/12, 밸런스 경보 0.
- 24 seed×52주: 247,690ms, 파산 0/24, 밸런스 경보 0, 첫 엔딩 동시 달성 1/24.

### post-fix 요청 게이트

- focused ticker/UI units 8파일 **55/55 통과**.
- `npm run typecheck`, `npm run lint`, `npm run gate`, `git diff --check`: 통과.
- HUD/에셋 정적 게이트: **27/27 통과**, 대비 recipe **24쌍** 통과.
- shell-v2 **20/20**, phase7 **26/26**, identity **7/7** 통과.
- 전체 `npm test`, 전체 `verify-kairo`, PWA, 밸런스 장기 시뮬은 이번 post-fix 요청 범위에서
  재실행하지 않았다. 위 전체 수치는 명시한 이전 스냅샷이며 현재 실행으로 가장하지 않는다.

## 남은 실패와 미실행 게이트

제품/UI 복구와 섞지 않고 다음을 별도로 남긴다.

1. **기존 K37 화소 표본 2건:** 전체 브라우저 354/356의 두 실패. 벽/시설이 실제로 다투는
   표본 픽셀이 0이라 깊이 검사의 양성 표본과 앞벽 판정이 함께 실패한다.
2. **생성 PNG fixture 2장 부재:** `facility__slide_large.png`,
   `facility__shower_row.png`가 없어 전체 Vitest 두 건이 `ENOENT`다.
3. **병렬 사고 테스트 timeout 1건:** 전체 병렬 실행에서 5초를 넘었다. 단일 worker에서는
   10/10 통과했다.
4. **PWA 게이트 환경 차단:** `/private/tmp/ppaji-play`의 오래된 preview(PID 37257)가
   strict port 4173을 점유해 `verify:pwa`의 preview가 뜨지 못했다. 다른 작업의 프로세스라
   종료하지 않았으며 PWA 결과를 통과로 기록하지 않는다.
5. **사람 검수 미실행:** 라벨 없는 변경 전/후 홈·메뉴 A/B, 사건 테마 이름 가림 구분,
   설명 없이 30초 코스 조정→시험→적용, 외부 첫 화면의 주인님 승인은 수행하지 않았다.

따라서 `UI 전면 개편 완료`나 사람 사용성 완료는 주장하지 않는다. 요청된 post-fix 자동 게이트는
통과했지만 전체 제품 게이트는 이번에 재실행하지 않았고, 사람 승인은 계속 대기 상태다.
