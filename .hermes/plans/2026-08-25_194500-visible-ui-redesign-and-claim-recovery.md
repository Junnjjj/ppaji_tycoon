# 빠지 타이쿤 — 눈에 보이는 UI 전면 재설계와 미완료 계약 복구 계획

> **For Hermes:** 구현 시 작업별 RED → 최소 GREEN → 실제 393×852 터치 → 외부 URL 캡처 순서를 지킨다. 각 단계는 아키텍처/모바일 동작/문서의 독립 리뷰를 통과한 뒤 다음 단계로 간다.

## 0. 2026-08-25 최종 실행 상태

이 계획은 구현과 외부 캡처까지 실행했지만 **전체 완료가 아니다**. 실제 결과의 정본은
`docs/ui-shell-v2-validation.md`다.

| Task | 상태 | 실제 판정 |
|---|---|---|
| 0 외부 제공 | 완료 | strict 5188, 외부 identity 7/7, SHA/branch/source digest 일치 |
| 1 홈 계약 | 부분 | DOM/폭/44px 통과, 정확한 A 문구가 계획과 다름, 사람 A/B 미실행 |
| 2 홈 구현 | 부분 | 한 밴드와 모드별 hidden은 구현, 외부 첫 화면 사람 승인 없음 |
| 3 메뉴 | 구현 완료·승인 대기 | IA/터치/first fold·불투명 computed recipe 18/18 통과, 사람 선호 승인 없음 |
| 4 코스 | 자동 완료·사람 대기 | 외부 20/20, 설명 없는 30초 사람 게이트 미실행 |
| 5 온보딩 | 완료 | v2 8단계와 legacy v1 저장 부팅, post-fix 실제 터치 26/26 |
| 6 사건 장면 | 자동 완료·사람 대기 | 8테마 장면과 폴백, 외부 17/17; 이름 가림 사람 검수 미실행 |
| 7 주변 | 완료 | 7종 12개 실제 bake, 하늘 0, runtime object 0 |
| 8 문서 | 완료 | 정본·역사 계획·검증 기록을 실제 결과로 교정 |
| 9 최종 전달 | 부분 | 외부 전체 354/356 역사 기록, post-fix shell 18/18, PWA 환경 차단, 사람 승인 대기 |

**Goal:** 첫 접속 순간부터 이전 버전과 명확히 다른 홈·메뉴·핵심 코스 UI를 제공하고, 이전 Phase 0~7 완료 주장 중 실제로 누락되거나 축소된 항목을 정직하게 복구한다.

**Architecture:** 시뮬레이션·저장·데이터 계약은 유지한다. 이번 변경의 중심은 `src/ui/**`, `src/ui/style.css`, 렌더 전용 오버레이와 외부 제공 검증이며, 규칙 계산은 UI로 복제하지 않는다. 홈은 3개 목표의 의미는 유지하되 왼쪽 카드 기둥을 `주행동 1개 + 보조 목표 2개`의 새 화면 구성으로 바꾸고, 메뉴는 기존 래퍼 없이 한 번 탭으로 새 IA가 보이는 단일 시트가 된다.

**Tech Stack:** TypeScript 5.9, Phaser 3.90, DOM/CSS HUD, Vitest, Playwright/CDP 실제 터치, Vite, Cloudflare Tunnel.

---

## 1. 이번 감사의 결론

### 1.1 외부에서 예전 화면이 보인 직접 원인

배포 캐시 문제가 아니라 **포트 충돌**이었다.

- 최신 Vite 프로세스 `proc_e03b52a755b4`는 `5173`이 이미 사용 중이라 **5174**로 이동했다.
- Cloudflare Tunnel `proc_134c080e0bd3`는 계속 **127.0.0.1:5173**을 가리켰다.
- 실제 확인:
  - `http://127.0.0.1:5173/src/main.ts`에는 `KairoManagementMenu`/`kmanage`가 없음.
  - `http://127.0.0.1:5174`에는 새 A/B/C 목표, `.kmanage`, 새 건설 카드가 있음.
- 따라서 전달한 외부 URL은 최신 커밋을 제공하지 않았다. HTTP 200과 Git SHA 일치만 확인하고 **제공 중인 프로세스의 소스 정체를 확인하지 않은 검증 실패**다.

### 1.2 최신 코드 자체의 화면 상태

최신 소스를 393×852, DPR3, 실제 모바일 조건으로 `5174`에서 다시 캡처했다.

- 최신 홈: `/tmp/ppaji-latest-home.png`
- 최신 메뉴: `/tmp/ppaji-latest-menu.png`
- 최신 건설: `/tmp/ppaji-latest-build.png`
- 최신 코스: `/tmp/ppaji-latest-course.png`
- 최신 사건: `/tmp/ppaji-latest-card2.png`
- 변경 전 홈: `tmp-shots/ui-prod-home.png`

판정:

1. **홈은 행동 내용만 바뀌고 시각적 셸은 거의 같다.**
   - 같은 상단 크림 HUD
   - 같은 왼쪽 3장 카드 기둥
   - 같은 하단 메뉴/건설 버튼
   - 같은 뉴스 띠
   - A 목표 라벨은 `물려받은 코스 시…`로 잘린다.
2. **최신 메뉴 IA는 실제로 구현돼 있다.** 5174에서는 한 번 탭으로 Today → 경고 → 운영/성장/기록이 보인다. 다만 외부 URL은 구 5173을 제공해서 사용자가 볼 수 없었다.
3. **건설 카드 개편은 실제로 구현돼 있다.** 화살표 0개, 카드 3장, 실제 썸네일·가격·역할·정원·잠금 이유가 보인다.
4. **코스 진입은 구현됐지만 핵심 조작 화면의 마감이 부족하다.**
   - 목표 3장이 편집 중에도 남아 물을 가린다.
   - `Settings`가 영문으로 남았다 (`src/ui/kairo-course.ts:317`).
   - 하단 지표가 `스릴 18 · 안전 100 · 실제 0…`로 잘리고 현재→예상 변화가 첫 화면에서 읽히지 않는다.
   - 핵심 화면보다 홈 HUD가 시각적으로 더 강하다.
5. **사건 카드의 가로 선택은 구현됐지만 ‘그림’은 미완료다.** 현재 `event/<theme>`는 실제 사건 장면이 아니라 숫자/기호가 있는 CSS 색면이다 (`src/ui/kairo-card.ts:17-32`).
6. **결산 재구성은 실제로 구현돼 있다.** 3 KPI → 처방 → 히트맵 → 요일/구성 → 장부 순서가 캡처에서 확인된다.

---

## 2. 기존 Phase 0~7 완료 주장 재감사

| Phase | 이전 완료 주장 | 실제 판정 | 복구 필요 |
|---|---|---|---|
| 0 UI 계약 | 393×852, 44px, 표면 계약 | **부분 완료**. 정적/좌표 검사는 있으나 외부 첫 프레임과 변경 전 A/B 판정이 없고 잘못된 포트도 통과함 | 외부 소스 정체·첫 프레임 A/B·새 루트 가시성 게이트 추가 |
| 1 홈 목표 | A/B/C, A 직접 코스 진입, 빈 티커 금지 | **동작 완료 / 시각 부분**. A는 1탭 진입하고 티커 힌트도 뜨지만 홈 셸은 동일, A 제목 잘림, 편집 중 목표 자동 접힘 미작동 | 홈 셸 v2, 텍스트 무잘림, 편집/시트 중 목표 숨김 |
| 2 코스 | 기존 코스 편집, 보트 2종, 4초 시험, 반응, 적용 | **시뮬·상태 완료 / UX 부분**. `Settings`, 지표 잘림, 목표가 코스를 가림. “설명 없이 30초 완료” 사람 검증은 수행되지 않음 | 코스 액션 독, 한글화, 지도 가림 제거, 실제 30초 사용성 게이트 |
| 3 단골·메뉴 | 8×8, 두 단골 3단, 실제 구매 | **코어 완료 / 첫 플레이 연결 부분**. 음식 시설 건설에서 온보딩이 끝나며 메뉴 장착·단골 소비·첫 보상까지 안내하지 않음 | 온보딩을 메뉴 장착→단골 소비까지 연장 |
| 4 건설 | 3장 카드, 화살표 제거, 비용·역할·잠금 | **완료**. 최신 5174 화면에서 확인 | 홈 목표 가림만 공통 셸 작업에서 수정 |
| 5 결산 | 3 KPI·처방·132px 히트맵·장부 | **완료**. 최신 검증 캡처에서 확인 | 첫 결산을 온보딩 종점으로 연결 |
| 6 사건 | 2~4주 cadence, 삽화 포함 가로 선택 | **cadence/가로 선택 완료, 삽화 미완료**. CSS 숫자·기호 슬롯은 의미 있는 사건 그림이 아님 | 기존 게임 스프라이트를 조합한 테마별 실제 미니 장면 8종 |
| 7A 메뉴 IA | Today·경고·운영/성장/기록 | **최신 코드 완료 / 외부 제공 실패** | 외부 제공 게이트, 시각 위계 강화 |
| 7B 온보딩 | 소개·배치·코스·메뉴·단골·결산 | **축소 구현**. 실제는 `open-course→drag-route→test-run→apply-course→build-food→done` 5단계 (`src/sim/kairo/meta.ts:13-38`) | 메뉴 장착·단골 구매·첫 결산 확인 단계 추가. 화장실을 코스보다 앞세우는 과거 안은 복구하지 않음 |
| 7C 엔딩 | 계속 운영/새 지역/감상, 별도 경력 | **완료** | 실제 장기 플레이 도달성은 별도 플레이테스트 |
| 7D 주변 | 주택·편의점·주차 차량·가로등·안내판·화단·수풀 등 12개 이내 | **축소 구현**. 실제는 banner/planter/sculpture 3종×2개뿐 (`src/render/kairo/surround.ts:1-21`) | 렌더 전용 주변 생활 장식 확장 |
| 외부 공개 | 최신 커밋을 외부 URL에서 실행 | **실패**. 5174 대신 구 5173을 터널링 | strict port와 build identity를 갖춘 단일 공유 명령 |

### 의도적으로 복구하지 않을 과거 항목

과거 Phase 7 온보딩에는 화장실을 코스보다 먼저 두는 안이 있었지만, 같은 계획의 제품 결정은 “첫 10초·첫 행동은 물려받은 코스”라고 정했다. 두 계약은 충돌한다. 이번 정본은 **코스 먼저**를 유지하고, 위생은 첫 결산 처방/중기 목표로 가르친다.

---

## 3. 최종 UX 방향 — 첫 화면부터 달라야 한다

### 3.1 홈 셸 v2

현재 왼쪽 3장 목표 기둥을 폐기하고 다음처럼 재구성한다.

1. **상단 상태 밴드**
   - 헤더 0버튼, 2줄 지표라는 불변식은 유지한다.
   - 높이는 현재 78px 이내로 유지하되 날짜/날씨와 현금을 1행, 만족/방문/등급/위험을 2행에 둔다.
   - 캡슐 무더기가 아니라 현재처럼 한 패널 구조를 유지한다.
2. **주행동 A 카드** — ⚠ 2026-08-25 개정 (실측 후 주인님 결정)
   - 화면 하단 뉴스 띠 바로 위 **목표 밴드**(높이 64px) 안에 둔다. 밴드는 세로에서 전폭,
     가로에서 폰 한 칸 폭(377px)으로 캡한다.
   - A는 밴드의 **약 60%**를 차지하는 시각적 주역이다.
   - 배지 `지금 할 일`, 행동명, 한 줄 설명/진행, 목적지 아이콘을 모두 표시한다.
   - `물려받은 코스 시험 운행`이 줄임표 없이 보여야 한다.
   - 지도 위 핵심 대상을 가리키는 얇은 연결 표식/펄스는 렌더 FX 등록부를 사용한다.
3. **보조 목표 B/C** — ⚠ 2026-08-25 개정
   - **A와 같은 밴드 한 줄**에 각각 약 20% 폭으로 둔다 (아이콘 + 진행 축약).
   - 높이 64px이라 44px 터치 계약은 높이로 지켜진다. 글자는 감추고 전문은 `aria-label`에 남긴다.
   - B=단골/운영, C=등급/엔딩 색 역할을 분리한다.
   - 펼친 3장 기둥은 삭제한다. 상세는 탭했을 때 목적지 또는 메뉴에서 본다.
   - ⚠ **왜 별도 행이 아닌가:** A를 하단 전폭 카드, B/C를 상단 별도 행으로 두면 상자가 둘이라
     HUD 예산(세로 24% · 가로 36%)을 구조적으로 못 지킨다 — 실측 세로 28% · 가로 53%이고,
     B/C를 아무리 좁혀도 1%p도 안 내려간다 (전폭 A 카드 하나가 세로 7.2%p).
     한 밴드면 세로 24% · 가로 35%다. 예산 상수는 올리지 않는다.
4. **뉴스 띠와 하단 바**
   - 뉴스 26px, 하단 `메뉴/건설` 2개는 유지한다.
   - 주행동 A와 같은 문장을 뉴스에 중복하지 않는다. 뉴스가 없으면 다음 사건/운행 상태를 말한다.
5. **모드별 가시성**
   - 메뉴/건설/코스/결산/카드가 열리면 A/B/C는 모두 숨긴다.
   - 패널을 닫으면 복원한다.
   - 코스 편집 중에는 상단 상태 밴드만 남기고 지도 조작 영역을 확보한다.

**시각 합격 조건:** 변경 전과 새 홈을 라벨 없는 A/B로 나란히 보여도 즉시 구분돼야 한다. 텍스트만 바뀐 화면은 실패다.

### 3.2 메뉴 셸 v2

최신 `.kmanage`의 구조는 보존하되 ‘베이지 버튼 격자’ 인상을 줄인다.

- 메뉴는 한 번 탭으로 열리는 단일 시트이며 레거시 메뉴 래퍼를 두지 않는다.
- 열리는 순간 홈 목표는 숨긴다.
- `Today`는 아이콘·이유·행동 버튼이 있는 72~88px 영웅 카드.
- 경고는 Today를 밀어내는 큰 카드가 아니라 32~40px 요약 행.
- 운영/성장/기록은 아이콘+라벨+보조값이 있는 그룹 카드로 구분한다.
- 첫 폴드에 Today, 경고, 운영 전체, 성장 일부가 보여야 한다.
- `새 판`은 최하단 위험 영역, 배속은 소형 설정 행.

### 3.3 코스 핵심 화면 v2

- 홈 목표를 완전히 숨기고 코스와 핸들이 화면의 주인공이 된다.
- `Settings`를 `설정`으로 고친다.
- 정보 상태:
  - 코스명·장비·보트
  - 현재 스릴/안전/실제 탑승/주간 이익 4개
  - `루트 조정` 한 개의 명확한 주버튼
- 편집 상태 하단 독(최대 112px):
  - 1행: 스릴 `18→24`, 안전 `100→92`, 실제 `0→5`, 손익 `-0.3→+1.2만`
  - 2행: `설정 / 취소 / 시험 운행`
- 시험 운행:
  - 4초 동안 보트가 실제 경로를 이동
  - 대표 손님 3명의 말풍선이 서로 다른 시점에 표시
  - 진행바/남은 시간을 숫자로 강요하지 않음
- 리뷰 상태:
  - `다시 조정 / 적용`
  - 현재 대비 변화와 비용을 다시 표시
- 전역 메뉴/건설 버튼은 편집/시험 중 비활성 또는 숨김 처리하고, 닫기/취소 경로는 코스 독이 소유한다.

### 3.4 사건 카드의 실제 장면

새 그림 파일 8장을 무조건 추가하지 않는다. 기존 아틀라스/절차 스프라이트를 조합해 테마별 작은 장면을 만든다.

- crowd: 버스 + 손님 군집
- weather: 비 + 우산/실내 목적지
- safety: 안전요원 + 구명함
- publicity: 카메라 + 손님
- staff: 직원 2명 + 시설
- market: 매점 + 동전
- facility: 시설 실루엣 + 공구
- environment: 물가 + 수풀/화단

구성 규칙은 `event/<theme>` 데이터 ID가 선택하고 렌더 함수 하나가 그린다. CSS 숫자/기호만 있는 현재 슬롯은 폴백으로만 남긴다.

### 3.5 온보딩 완결

새 정본 순서:

1. 코스 열기
2. 핸들 이동
3. 시험 운행
4. 코스 적용
5. 먹거리 시설 건설
6. 기본 메뉴 확인/장착
7. 민지의 실제 방문·구매 관찰
8. 첫 결산 열기
9. 자유 운영 전환

- 자유 행동을 막지 않는다.
- 이미 충족된 생산 상태는 현재 단계 도달 시 안전하게 인식하되 중간 단계를 건너뛰지 않는다.
- v8 필드의 의미가 확장되므로 기존 v8 세이브의 `done`을 어떻게 다룰지 migration 정책이 필요하다.
  - 권장: `onboarding.version: 2`를 도입한다.
  - 기존 version 1 `done`은 그대로 완료로 보존한다.
  - version 1 미완료 단계는 대응되는 version 2 단계로 이동한다.

### 3.6 주변 생활감

시뮬레이션 격자와 시설 데이터에는 넣지 않는다. `bakeSurroundTexture()` 합성만 확장한다.

- render-only 종류: 작은 주택, 편의점 전면, 주차 차량, 가로등, 안내판, 화단, 수풀
- 최대 12개 인스턴스, 플레이 격자 밖, 결정론적 좌표
- 기존 지형 스케일과 아이소 투영 사용
- 원경 배경막 금지
- 런타임 Phaser 객체 0개, 부팅 시 캔버스 합성 1회

---

## 4. 구현 단계

### Task 0: 외부 제공을 먼저 바로잡고 검증 불변식으로 만든다

**Objective:** 잘못된 포트의 오래된 앱을 공유하는 재발을 구조적으로 막는다.

**Files:**
- Modify: `vite.config.ts`
- Create: `tools/share-kairo.ts`
- Modify: `package.json`
- Modify: `src/main.ts`
- Modify: `tools/verify-kairo.ts`
- Test: `tools/share-kairo.test.ts`

**Steps:**

1. RED: 포트가 점유된 상태에서 공유 서버가 다음 포트로 조용히 이동하면 실패하는 테스트를 작성한다.
2. `server.strictPort: true`를 설정한다.
3. `npm run share:kairo` 한 명령이 다음을 수행하게 한다.
   - 현재 worktree와 `git rev-parse HEAD` 기록
   - 지정한 포트의 기존 응답이 같은 build identity인지 확인
   - 다르면 중단하고 PID/포트를 출력
   - Vite를 명시 포트로 시작
   - health check 후 cloudflared를 정확한 포트에 연결
   - 외부 URL에서 build identity 재확인
4. `window.__kairo.build` 또는 읽기 전용 DOM 메타에 short SHA·branch·startedAt을 노출한다. 사용자 화면에서는 메뉴 하단 작은 버전 줄로만 보인다.
5. 외부 URL에서 SHA가 현재 HEAD와 다르면 성공으로 보고하지 않는다.
6. GREEN: 포트 충돌, 옛 서버, 잘못된 터널 대상 대조군을 모두 잡는다.

**Acceptance:** HTTP 200만으로 성공하지 않는다. 외부 URL의 build SHA, 최신 홈 DOM, 393×852 캡처가 모두 일치해야 한다.

### Task 1: 홈 셸 v2의 DOM 계약을 RED로 고정한다

**Objective:** 텍스트 변경이 아닌 실제 첫 화면 재설계를 테스트로 정의한다.

**Files:**
- Modify: `src/ui/kairo-ui-contract.test.ts`
- Modify: `src/ui/kairo-goals.test.ts`
- Modify: `tools/verify-kairo.ts`
- Create: `docs/ui-shell-v2.md`

**Steps:**

1. 기존 `.kchipcol` 3장 세로 기둥이 존재하면 실패한다.
2. `[data-goal-role="immediate"]`가 전폭 주행동 영역에 있고 B/C가 한 행에 있어야 한다.
3. A 제목 `물려받은 코스 시험 운행`의 `scrollWidth <= clientWidth`를 검사한다.
4. 외부 fresh context에서 첫 프레임과 메뉴 1탭 화면을 캡처한다.
5. 패널/코스 모드에서 목표 루트의 `visible=false`를 정체로 검사한다.
6. 변경 전 기준 이미지와 새 캡처를 무라벨 A/B 검수 대상으로 문서에 연결한다.

### Task 2: 홈 셸 v2를 구현한다

**Objective:** 첫 프레임의 구성·위계·주행동을 실제로 바꾼다.

**Files:**
- Modify: `src/ui/kairo-hud.ts`
- Modify: `src/ui/style.css`
- Modify: `src/main.ts`
- Modify: `src/render/kairo/fx.ts` if target pulse needs a registered FX
- Test: `src/ui/kairo-goals.test.ts`

**Steps:**

1. 목표 뷰 모델 A/B/C는 유지하고 렌더 루트를 primary + secondary row로 교체한다.
2. 패널/편집 상태를 받는 `setGoalSurface(mode)` 한 경계를 추가한다.
3. 홈·메뉴·건설·코스·모달의 전환마다 해당 경계를 사용한다. 호출부마다 CSS를 직접 만지지 않는다.
4. A/B/C action callback은 기존 production callback을 그대로 사용한다.
5. 393×852와 852×393에서 지도 가시 영역·44px·overflow를 검증한다.
6. 이전 화면과 나란히 캡처해 시각 검수한다.

### Task 3: 메뉴 셸 v2를 마감한다

**Objective:** 새 IA가 한눈에 읽히고 첫 폴드에서 우선순위가 드러나게 한다.

**Files:**
- Modify: `src/ui/kairo-management.ts`
- Modify: `src/ui/style.css`
- Modify: `src/main.ts`
- Test: `src/ui/kairo-management.test.ts`
- Browser: `tools/verify-kairo.ts`

**Steps:**

1. Today/경고/그룹의 semantic order 행동 테스트를 유지한다.
2. Today에 icon/reason/detail을 추가하되 새 시뮬 규칙은 만들지 않는다.
3. 그룹 항목에 현재 상태 보조값을 UI adapter에서 제공한다.
4. 첫 폴드에 Today+운영 전체가 들어오는지 393×852 rect로 검증한다.
5. 메뉴를 열었을 때 홈 목표가 숨고, 닫으면 복원되는 실제 터치 테스트를 추가한다.
6. 레거시 버튼 루트가 `.kmanage` 앞뒤에 남아 있지 않은지 검사한다.

### Task 4: 코스 편집 v2를 핵심 화면으로 만든다

**Objective:** 설명 없이도 30초 안에 코스를 조정·시험·적용할 수 있게 한다.

**Files:**
- Modify: `src/ui/kairo-course.ts`
- Modify: `src/ui/style.css`
- Modify: `src/main.ts`
- Modify: `src/render/scenes/KairoScene.ts` only for existing overlay/feedback presentation
- Test: `src/ui/kairo-course-phase2.test.ts`
- Test: `src/ui/kairo-course-phase2-surface.test.ts`
- Browser: `tools/verify-kairo.ts`

**Steps:**

1. RED: 코스 오픈 상태에서 홈 목표가 보이거나 `Settings`가 있거나 delta가 잘리면 실패한다.
2. info/edit/trial/review 상태별 한글 라벨과 버튼 정체를 고정한다.
3. `courseProjection()` 결과만 사용해 4개 delta를 렌더한다.
4. 실제 CDP touch로 핸들 이동→시험→리뷰→적용을 수행한다.
5. 시험 중 대표 반응 3개가 서로 다른 타이밍으로 화면에 나타나는지 확인한다.
6. 조작 지도 높이와 핸들 가시성, 하단 독 높이를 393×852에서 잰다.
7. 자동 검증 후 실제 사용자 3회 또는 주인님의 직접 플레이로 ‘30초 무설명’ 게이트를 수행한다. 이 사람 게이트 전에는 코스 UI 완료라고 쓰지 않는다.

### Task 5: 온보딩을 단골 소비와 첫 결산까지 완결한다

**Objective:** 시스템을 만들기만 하고 첫 플레이에서 연결하지 못한 부분을 복구한다.

**Files:**
- Modify: `src/sim/kairo/meta.ts`
- Modify: `src/save/kairo.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/kairo-hud.ts`
- Test: `src/sim/kairo/meta.test.ts`
- Test: `src/save/kairo-onboarding-v8.test.ts` or create v2-specific test
- Browser: `tools/verify-kairo.ts`

**Steps:**

1. RED: 음식 시설 건설 직후 `done`이 되는 현재 동작을 고정적으로 실패시킨다.
2. onboarding snapshot version 2와 migration을 작성한다.
3. `menu-equipped`, `regular-purchased`, `report-opened` production 사건을 추가한다.
4. 기본 메뉴가 이미 장착된 시설이면 ‘확인/장착’ 단계가 의미 없이 막히지 않도록 production 상태와 이벤트를 함께 본다.
5. 일반 손님 통계가 아니라 이름 있는 단골 구매 사건으로만 해당 단계를 완료한다.
6. 첫 결산 처방을 실제로 열어야 `done`이 된다.
7. 저장/재로드, 순서 밖 행동, 구 v8 done 보존을 검증한다.

### Task 6: 사건 테마를 실제 미니 장면으로 교체한다

**Objective:** CSS 숫자 표지를 의미 있는 게임 장면으로 바꾼다.

**Files:**
- Create: `src/ui/kairo-event-art.ts`
- Create: `src/ui/kairo-event-art.test.ts`
- Modify: `src/ui/kairo-card.ts`
- Modify: `src/ui/style.css`
- Modify: `src/assets/kairo-render-contract.json` only if new logical IDs are required
- Browser: `tools/verify-kairo.ts`

**Steps:**

1. 테마 8개가 서로 다른 composition plan을 내는 순수 함수를 RED로 작성한다.
2. 기존 atlas/procedural provider의 논리 ID만 사용해 canvas에 합성한다.
3. 아트 로드 실패 시 현재 CSS 테마를 폴백으로 남긴다.
4. 선택 2개와 3개 모두 한 행, 44px, 모달 380px 이내를 검증한다.
5. 실제 캡처에서 테마명을 가려도 crowd/weather/safety 중 세 장이 구분되는 사람 검수를 추가한다.

### Task 7: 주변 생활 장식을 원래 범위로 복구한다

**Objective:** 세 가지 표지 복제 수준을 넘어 지도 밖에 생활감을 준다.

**Files:**
- Modify: `src/render/kairo/surround.ts`
- Modify: `src/render/kairo/surround.test.ts`
- Modify: surround baking module that consumes `surroundDecorationPlan`
- Modify: procedural deco renderer/contract as required
- Browser: `tools/verify-kairo.ts`

**Steps:**

1. 7종 이하, 인스턴스 12개 이하, 전부 격자 밖인 계약을 작성한다.
2. 도로 옆에는 차량/가로등/편의점, 주거 가장자리에는 주택/수풀, 입구 주변에는 안내판/화단이 오도록 지형 문맥을 반영한다.
3. 좌표는 seed 또는 맵 크기에서 결정론적으로 파생한다.
4. 런타임 Phaser 객체 0, bake 1회, 메모리 증가를 측정한다.
5. 지도 네 귀퉁이/중앙에서 하늘 노출 0과 경계 이음새를 재검증한다.

### Task 8: 완료 주장과 문서를 정직하게 다시 쓴다

**Objective:** 동작·하위 UI·IA·시각 재설계를 혼용하지 않는다.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/design.md`
- Modify: `docs/kairo-phases.md`
- Modify: `docs/phase7-final-integration.md`
- Modify: `.hermes/plans/2026-08-25_141103-kairo-core-loop-ui-implementation.md`
- Create: `docs/ui-shell-v2-validation.md`

**Steps:**

1. 기존 계획의 Phase별 결과를 완료/부분/미구현으로 표기한다.
2. v2 홈 셸·메뉴·코스·온보딩·사건 아트·주변 계약을 문서화한다.
3. 구현하지 않은 사람 플레이테스트를 자동 테스트 통과와 섞지 않는다.
4. 외부 URL·커밋 SHA·첫 프레임 캡처·검증 일시를 기록한다.
5. “UI 전면 개편 완료”는 외부 첫 프레임 A/B와 주인님 확인 뒤에만 사용한다.

### Task 9: 최종 외부 소스 검증과 전달

**Objective:** 정확한 커밋의 정확한 화면을 외부에서 확인한다.

**Files:**
- Modify: `tools/verify-kairo.ts`
- Modify: `docs/ui-shell-v2-validation.md`

**Steps:**

1. 전체 검증을 실행한다.
2. `npm run share:kairo`로 strict port 서버와 tunnel을 시작한다.
3. 외부 URL에서 `window.__kairo.build.sha === git rev-parse HEAD`를 확인한다.
4. fresh browser context, 393×852 DPR3에서 다음을 캡처한다.
   - 무조작 홈
   - 메뉴 1탭
   - 건설
   - 코스 info/edit/trial/review
   - 결산
   - 사건 2선택/3선택
5. 변경 전 기준과 홈/메뉴를 나란히 비교한다.
6. 콘솔 오류 0, 외부 HTTP 200, source identity 일치, 터치 게이트 결과를 함께 보고한다.

---

## 5. 검증 명령

각 Task의 집중 테스트 뒤 최종적으로 실행한다.

```bash
npm run typecheck
npm run lint
npm run test
npm run gate
npm run build
npm run sim:kairo -- --determinism
npm run sim:kairo -- --seeds 12 --weeks 26
npm run sim:kairo -- --seeds 24 --weeks 52
PPAJI_URL=http://127.0.0.1:<STRICT_PORT> npm run verify:kairo
npm run seam -- --selftest
npm run verify:pwa
```

추가 필수 게이트:

- 외부 build SHA == 현재 HEAD
- 외부 first frame에 새 primary goal root 존재
- 외부 first menu에 `.kmanage`가 첫 폴드에서 보임
- 기존 `.kchipcol` 세로 3장 기둥 없음
- 홈/메뉴/건설/코스/카드의 393×852 실제 캡처
- 코스 실제 CDP touch 전체 흐름
- 메뉴/코스/건설 중 홈 목표 hidden
- 카드 테마 의미 구분
- 온보딩 저장/재로드와 단골 실제 구매
- 알려진 K37 2건은 별도 기존 결함으로 남기되 새 실패와 섞지 않음

---

## 6. 아키텍처 보호선

- `src/sim/**`은 렌더러/DOM을 import하지 않는다.
- UI는 `WeekReport`, `courseProjection`, `TodayRecommendation`, 메뉴/단골 production 사건을 표시할 뿐 규칙을 재계산하지 않는다.
- RNG 도메인 4분리를 유지한다.
- 시설·레시피·보트·카드 내용은 JSON 정본을 유지한다.
- 홈/메뉴 재배치는 저장 필드를 추가하지 않는다.
- 온보딩 확장만 명시적인 version 2 migration을 사용한다.
- 사건 미니 장면과 주변 장식은 렌더 전용이며 시뮬 상태·충돌·세이브에 들어가지 않는다.
- 색은 `style.css` 토큰이 소유하고 TS 하드코딩 색 0을 유지한다.
- 패널은 `PanelHost`, 코스 액션 독은 기존 예외 계약을 명시적으로 유지한다.
- 전환은 transform/opacity만 사용하고 reduced-motion을 지킨다.

---

## 7. 위험과 중단 조건

1. **시각 변경을 위해 상시 버튼을 늘리지 않는다.** 첫 프레임은 구성과 위계로 바꾼다.
2. **홈 목표를 줄였다고 다음 행동 정보까지 숨기지 않는다.** A는 언제나 한 번 탭 가능한 전폭 카드다.
3. **코스 독이 지도를 과도하게 덮으면 중단한다.** 조작 지도 높이 최소 620px 계약을 다시 잰다.
4. **사건 아트 때문에 새 대형 에셋 팩을 만들지 않는다.** 기존 스프라이트 조합으로 먼저 증명한다.
5. **온보딩 v1 완료 사용자를 강제로 되돌리지 않는다.** 기존 done은 done이다.
6. **외부 URL을 HTTP 200만 보고 전달하지 않는다.** build identity가 없으면 전달 금지다.
7. **사람 검수를 자동 검사로 위장하지 않는다.** 30초 코스 완료와 무라벨 시각 A/B는 별도 완료 조건이다.

---

## 8. 가장 비싼 선결정 세 가지

1. **홈 목표 표현:** 왼쪽 3장 기둥을 폐기하고 하단 주행동 A + 상단 보조 B/C로 옮긴다.
2. **코스 모드 우선권:** 편집 중 홈 목표와 전역 행동을 숨겨 코스를 화면의 주인공으로 만든다.
3. **외부 제공 정체:** strict port + build SHA 일치 없이는 공개 완료로 인정하지 않는다.

이 세 가지를 먼저 고정한 뒤 하위 화면 미감을 조정한다. 그렇지 않으면 다시 ‘기능은 바뀌었지만 첫 화면은 같은’ 결과가 나온다.

---

## 9. 계획 완료 기준

이 계획의 실행이 끝났다고 말할 수 있는 조건은 다음 모두다.

- 주인님이 외부 URL 첫 화면에서 이전 버전과 즉시 다르다고 확인한다.
- 홈 A 행동이 잘리지 않고 한 번 탭으로 코스를 연다.
- 메뉴 한 번 탭으로 Today/운영/성장/기록이 새 시각 위계로 보인다.
- 코스 조정→시험→반응→적용이 30초 안에 완료된다.
- 음식 시설→메뉴→단골 구매→첫 결산까지 온보딩이 이어진다.
- 사건 카드에 의미 있는 테마 미니 장면이 보인다.
- 주변 장식이 3종 표지 복제에서 생활 장면으로 확장된다.
- 외부 build SHA가 커밋 HEAD와 일치한다.
- 자동 게이트와 실제 터치 게이트가 통과한다.
- 구현·부분·미구현 상태가 문서와 실제 화면에서 일치한다.
