# 빠지 타이쿤 게임 시스템 대규모 업데이트 구현 계획 v2

> **2026-08-25 재검증:** 공식 Pool Slide Story 설명, 저장소의 PSS 갭 분석, 현재 메뉴·코스 구현을 다시 대조했다. 큰 방향은 유지하지만, **견인 코스 재조정을 제1 핵심 장난감으로 승격**하고, 전 손님 취향 시뮬보다 **이름 있는 단골 NPC의 요청·친밀도·보상 사슬**을 우선하며, 카드 빈도를 줄인 자리에 **비차단 소보상과 3단 목표**를 넣도록 수정한다.

> **For Hermes:** 구현 시 이 계획을 작업 묶음별로 실행하되, 각 묶음마다 설계 계약 → 단위 RED/GREEN → 브라우저 실제 터치 → 헤드리스 밸런싱 순서로 검증한다. 사용자가 요청하기 전에는 커밋하지 않는다.

**Goal:** 카이로소프트식 `발견 → 시설 성장 → 개별 손님 반응 → 다음 발견` 루프와 RCT식 `코스 조정 → 스릴·안전·처리량 변화 → 운영 결과` 루프를 결합해, 이미 많은 시스템을 “계속 손대고 싶은 놀이”로 재조립한다.

**Architecture:** 기존의 데이터 중심 sim 구조와 6개 동사를 유지한다. **플레이 핵심은 `견인 코스 조정 → 시험 운행 → 손님 반응 → 재조정`**이고, 카이로식 장기 엔진은 `단골 요청 → 재료·메뉴 발견 → 시설 성장 → 새 요청`이다. 음식 조합은 시설 개선과 가격 결정 안에, 보트·코스 조정은 기존 코스 동사 안에 넣으며 새 관리 화폐·재고·물류는 만들지 않는다. 결산·사건·온보딩·엔딩은 이 두 핵심 루프를 설명하고 보상하는 지원층으로 둔다.

**Tech Stack:** TypeScript 5.9, Phaser 3.90, DOM/CSS UI, Vitest, Playwright/Chrome 기반 `verify:kairo`, 데이터 JSON, 결정론적 seed RNG, localStorage save v7 호환.

---

## 0. 이번 업데이트의 핵심 판단

### 0.1 시스템을 더 늘리는 업데이트가 아니다

현재 데이터는 시설 75종, 장비 19종, 코스 프리셋 6종, 콤보 73종, 카드 27종, 의뢰 16종, 인증 12종이다. 부족한 것은 항목 수가 아니라 다음 반복이다.

1. 지도를 보며 문제나 욕구를 발견한다.
2. 메뉴·코스·시설을 직접 조절한다.
3. 손님 개체와 지도 위 연출이 즉시 반응한다.
4. 결산이 전주 대비 결과와 원인을 짧게 설명한다.
5. 번 돈으로 다음 조합·보트·시설 외형을 연다.

새 기능은 반드시 이 다섯 단계 중 하나를 강화해야 한다. 그렇지 않은 기능은 이번 범위에서 제외한다.

### 0.2 기존 6개 동사를 유지한다

| 새 요구 | 기존 동사 안의 위치 | 새 독립 동사 여부 |
|---|---|---|
| 음식·음료 조합 | `값을 매긴다` + 시설 개선 | 추가하지 않음 |
| 메뉴 슬롯 증가 | 시설 개선 | 추가하지 않음 |
| 보트 교체 | `코스를 그린다` | 추가하지 않음 |
| 코스 재편집 | `코스를 그린다` | 추가하지 않음 |
| 버스·지역 이벤트 | 의뢰·사건 | 추가하지 않음 |
| 온보딩 대화 | 기존 행동을 안내 | 추가하지 않음 |
| 엔딩·새 지역 | 메타 진행 | 플레이 중 동사 아님 |

재고관리, 식자재 발주, 유통기한, 대출, 직원 스킬트리, 연료 재고는 넣지 않는다.

### 0.3 제품 우선순위와 구현 순서

**제품의 중심 순서:**

1. **핵심 장난감 — 견인 코스:** 루트 핸들·타는 장비·보트를 바꾸고 즉시 시험 운행한다.
2. **카이로 성장 엔진 — 단골·메뉴:** 이름 있는 NPC의 요청을 메뉴 조합과 시설 성장으로 해결한다.
3. **지원층 — 결산·사건·목표:** 결과를 읽히게 하고 다음 행동을 한 개씩 제안한다.
4. **완주층 — 온보딩·엔딩·새 지역:** 두 핵심 루프를 배우고 다시 시작할 이유를 만든다.

**실제 구현 critical path:**

1. **G0 — 설계 계약과 기준선**
2. **G1 일부 — 결산 첫 화면과 카드 중단 빈도만 먼저 정리**
3. **G3 — 견인 코스 재편집 + 시험 운행 + 보트 2종 수직 슬라이스**
4. **G2 — 단골 NPC + 매점·카페 메뉴 수직 슬라이스**
5. **G1 나머지 — 3단 목표와 비차단 소보상 배선**
6. **G4 — 온보딩 대화와 실행 흐름**
7. **G5 — 엔딩·계속하기·새 지역 메타**
8. **G6 — 건설 UI 재설계 + 풍부한 주변 지도**
9. **G7 — 전체 확장·밸런싱·모바일 QA**

G2와 G3은 각각 작은 수직 슬라이스를 먼저 만든다. **G3가 먼저다.** 이 게임을 다른 카이로 게임과 구분하는 고유 장난감이 견인 코스이기 때문이다.

### 0.4 재검증한 카이로소프트 성공 공식

Pool Slide Story의 공식 설명은 `시설 확장 → 방문객 의견·제안 → 음식·음료·풀 구성으로 만족 → 재료 수집·조리·메뉴 구성 → 5성 성장`을 한 사슬로 제시한다. 여기서 가져와야 하는 것은 음식 자체가 아니라 다음 여섯 규칙이다.

1. **항상 보이는 짧은 목표:** 1~2분 안에 끝낼 행동 하나.
2. **중간 사슬:** 5~10분짜리 단골 요청·메뉴 발견·코스 기록 목표 하나.
3. **긴 진행률:** 등급·인증·엔딩 진행률 하나.
4. **거의 모든 행동의 작은 피드백:** 돈 숫자, 손님 말풍선, 발견 도장, 게이지 상승. 강제 모달은 드물다.
5. **이름 있는 손님의 반복 방문:** 요구를 충족하면 친밀도·새 재료·새 시설이 열린다.
6. **같은 시설을 다시 만지는 성장:** 메뉴 슬롯, 외형, 코스 기록처럼 이미 지은 것을 되돌아보게 한다.

따라서 카드 모달을 줄이는 것만으로는 부족하다. 줄어든 중단 자리를 **목표 칩·지도 위 반응·발견 연출**로 채워야 한다. 조용해졌지만 할 일이 없는 게임은 실패다.

### 0.5 빠지 타이쿤의 30초 핵심 루프

> 코스를 탭한다 → 핸들 또는 보트를 하나 바꾼다 → 예상 스릴·안전 delta를 본다 → 3~5초 시험 운행을 본다 → 손님 반응과 새 기록을 받는다 → 돈을 모아 다음 장비·메뉴·시설 성장으로 간다.

메뉴 루프는 이 핵심의 병렬 성장축이지 주인공을 대체하지 않는다. 첫 15분, 대표 스크린샷, 온보딩 모두 코스를 먼저 보여준다.

---

## 1. 현재 구현에서 확인한 출발점

### 1.1 주간 선택 카드

- `src/sim/kairo/cards.ts:110-116`은 여름에 **매주 1~2장**, 다른 계절에 0~1장을 뽑는다.
- `src/sim/kairo/cards.ts:263-291`은 한 주에 여러 장을 반환할 수 있다.
- `src/ui/kairo-card.ts:110-142`는 텍스트 중심 전면 모달과 세로 56px 선택지 목록이다.
- `src/main.ts:2023-2041`에서 결산 후 다음 주가 시작되기 전에 카드 선택을 강제한다.
- 사고 대응처럼 실제 사건이 호출하는 카드는 별도 trigger 경로가 이미 있다.

즉 “매주 너무 자주 뜬다”는 느낌이 아니라 실제 규칙이다. G1에서 루프 지탱 장치를 없애는 대신 **상시 강제 선택 → 드문 운영 사건**으로 역할을 바꾼다.

### 1.2 음식 메뉴

- `src/data/kairo-facilities.json`에는 메뉴 시설 11종과 표시용 메뉴 38개가 있다.
- `src/sim/kairo/placement.ts:189`의 `menu`는 현재 표시 데이터다.
- `src/ui/kairo-facility.ts:591-602`는 판매 품목 이름과 가격을 읽기만 한다.
- 메뉴 선택, 레시피 발견, 메뉴 슬롯, 손님 취향 매칭은 아직 없다.
- 시설은 이미 1~5단계 개선과 3단계 특화 분기를 갖는다.

따라서 새 음식 이름을 대량 추가하기보다, 이미 있는 38개 메뉴를 **실제 선택·발견·수입·만족 시스템으로 배선**하는 것이 우선이다.

### 1.3 코스와 장비

- `src/sim/kairo/course.ts:27-58`에 프리셋과 장비의 속도가 있고, 장비는 `tow | power`로 구분된다.
- `src/sim/kairo/course.ts:576-629`가 코스 곡률·속도·차량 수로 스릴, 안전, 처리량, 매출을 계산한다.
- `src/ui/kairo-course.ts:197-204`에서 핸들을 드래그하면 지표가 실시간으로 변한다.
- `src/ui/kairo-course.ts:275-283` 주석대로 **기존 코스 편집은 없다**. 새 코스 생성과 철거만 된다.
- `src/sim/kairo/course.ts:675-699`의 코스 매출은 공원 방문객 수와 무관한 잠재 처리량으로 계산된다.

코스 수학은 이미 살아 있다. 부족한 층은 **기존 코스로 돌아와 조정하는 UI**, 견인장비와 별개인 **견인 보트 선택**, 그리고 실제 손님 수에 묶인 **수요 상한**이다.

### 1.4 결과 보고서

- `src/ui/kairo-report.ts:382-404`는 입장·매출·입장료·유지비·손익을 한 표에 섞어 보여준다.
- `WeekReport`에는 이미 `admission`, `sales`, `courseRevenue`, `upkeep`, `wages`, `profit`이 있다.
- `WeekSummary`는 방문객·돌려보냄·손익·만족 네 값만 저장한다.
- `src/main.ts:1363-1376`처럼 전체 보고서는 현재 세션에만 있고 요약만 저장한다.
- 전주 대비 증감과 비용/수익의 시각적 구획이 없다.

새 장부를 복제할 필요 없이 기존 정본 필드를 재구성하면 G1의 1차 개선이 가능하다.

### 1.5 온보딩과 엔딩

- `src/sim/kairo/startkit.ts`와 `onboarding.test.ts`는 시작 배치와 첫 주 밸런스를 검증하지만, 플레이어에게 말하고 행동을 유도하는 안내 상태는 없다.
- `src/sim/kairo/scenario.ts:96-116`에는 `playing | won | lost` 판정이 있다.
- 기본 `inherited` 시나리오는 `goal.kind === 'none'`이라 영원히 `playing`이다.
- `src/ui/kairo-newgame.ts`는 새 판을 열 수 있지만 현재 등급으로 시나리오 잠금을 풀며, 새 판을 시작하면 런 세이브가 지워진다.
- 클리어 기록을 런 밖에 보관하는 커리어 메타 저장소는 없다.

엔딩 판정의 일부는 이미 있고, 빠진 것은 **한 번만 열리는 엔딩 흐름**, **계속 운영**, **런 삭제와 별개인 클리어 기록**이다.

### 1.6 건설 UI와 지도 장식

- `src/ui/kairo-hud.ts:555-621`에 시설·건물·바닥·코스 탭, 시설 유형 칩, 가로 카드 캐러셀이 이미 있다.
- 따라서 “건설 UI 변경”은 기능 부재가 아니라 카드 밀도·정보 우선순위·선택 흐름의 재설계다.
- `kairo-ground.json`에는 도로·보도·가로수가 있지만 도시 띠의 종류가 적다.
- 플레이어 시설과 충돌하지 않는 주변 주택·상점·주차·화단 클러스터 계층은 별도로 없다.

G6은 코드부터 바꾸지 않고 393×852 실측 목업 3안을 먼저 비교한다.

---

## 2. G0 — 설계 계약과 기준선

### Task G0-1: 새 정본 스펙 작성

**Objective:** 기존 v4 문서와 현재 구현이 충돌하지 않도록 이번 업데이트의 새 정본을 만든다.

**Files:**
- Create: `docs/superpowers/specs/2026-08-25-game-system-overhaul-design.md`
- Modify after approval: `docs/design.md`
- Do not modify yet: `CLAUDE.md` — 구현 완료 사실만 나중에 기록한다.

**필수 결정:**

- 사건 카드의 빈도와 최초 등장 주차
- 메뉴 슬롯 증가 규칙
- 메뉴 조합 비용과 실패 처리
- 손님 취향 태그 수
- 견인 보트 모델 수와 역할
- 코스 실제 탑승객의 수요 상한
- 기본 시나리오 엔딩 조건
- 새 지역에서 유지되는 메타 진행

**Acceptance:** 코드에 임시 숫자를 넣기 전에 위 값이 스펙의 “초기 가설값”으로 명시되고, 밸런싱 후 바꿀 수 있는 값과 아키텍처 불변식이 구분된다.

### Task G0-2: 기준선 저장

**Objective:** 업데이트 전후의 플레이·경제 차이를 같은 seed로 비교할 수 있게 한다.

**Read/Run:**

```bash
npm run verify
npm run sim:kairo -- --seeds 12 --weeks 26
npm run sim:kairo -- --seeds 24 --weeks 52
npm run sim:kairo -- --seeds 12 --weeks 80
```

**Record:**

- 26·52·80주 현금 분위수
- 등급·퇴장 만족도·입장객·만석·파산
- 수입 구성: 입장료 / 별도구매 / 코스
- 4주 단위 건설비 0원 비율
- 20주 동안 강제 카드 모달 수
- 메뉴 시설 이용 횟수
- 코스 수와 코스 수입 비중

**Acceptance:** 이후 G2·G3 경제 변경은 반드시 이 기준선과 동일 seed A/B로 비교한다.

---

## 3. G1 — 읽히는 결산과 드문 운영 사건

### Task G1-1: `WeekSummary`를 전주 비교용으로 확장

**Objective:** 새로고침 뒤에도 다음 결산에서 전주 대비를 보여준다.

**Files:**
- Modify: `src/sim/kairo/week.ts`
- Modify: `src/save/kairo.ts`
- Test: `src/save/kairo.test.ts`
- Test: `src/ui/kairo-report.test.ts`

**Proposed optional shape:**

```ts
export interface WeekSummary {
  visitors: number;
  turnedAway: number;
  profit: number;
  exitSatisfaction: number;
  revenue?: number;
  admission?: number;
  sales?: number;
  courseRevenue?: number;
  upkeep?: number;
  wages?: number;
}
```

필드는 optional로 추가해 세이브 v7을 유지한다. 전체 히트맵과 재생 프레임은 계속 저장하지 않는다.

**TDD:**

1. 새 필드가 있는 요약이 save round-trip을 통과하는 실패 테스트를 작성한다.
2. 이전 v7 fixture에서 새 필드가 없어도 복원되는 테스트를 유지한다.
3. 현재 보고서와 이전 요약의 delta 함수 테스트를 작성한다.
4. 최소 구현 후 관련 테스트를 통과시킨다.

### Task G1-2: 결산의 정보 순서를 재구성

**Objective:** 5초 안에 “손님이 늘었나, 돈을 벌었나, 왜 그런가”를 읽게 한다.

**Files:**
- Modify: `src/ui/kairo-report.ts`
- Modify: `src/style.css`
- Modify: `src/main.ts:1758-1830`
- Test: `src/ui/kairo-report.test.ts`
- Browser: `tools/verify-kairo.ts`

**추천 화면 순서:**

1. 상단 KPI 3칸
   - 방문객 `이번 주 N명` + `전주 대비 ±N / ±%`
   - 영업 손익 `+/-₩N` + 전주 대비
   - 퇴장 만족도 `N` + 전주 대비
2. **수익** 묶음
   - 입장료
   - 음식·대여 등 별도 구매
   - 견인 코스
   - 합계
3. **비용** 묶음
   - 시설·코스 유지비
   - 인건비
   - 합계
4. 굵은 **영업 손익**
5. 요일별 수요·입장 막대
6. 혼잡 히트맵
7. 손님 구성
8. 콤보와 병목 처방

**중요 표기:** `영업 손익` 아래에 “건설·개선·메뉴 개발비 제외”를 명시한다. 건설비를 운영비와 섞어 손익을 거짓말하지 않는다. 현금흐름 장부는 별도 후속으로 두고 이번 1차에서는 기존 정본 숫자를 정확히 재구성한다.

**Mobile budget:** 393×852에서 KPI와 수익/비용/손익이 첫 화면에 들어와야 한다. 전체 결산은 스크롤 가능하지만 핵심 숫자를 보기 위해 첫 스크롤을 요구하지 않는다.

### Task G1-3: 일상 카드 빈도를 낮추는 결정론적 스케줄 도입

**Objective:** 매주 1~2개 강제 선택을 없애되, 사건 시스템 자체는 유지한다.

**Files:**
- Modify: `src/sim/kairo/cards.ts`
- Modify: `src/data/kairo-cards.json`
- Modify: `src/main.ts:1988-2041`
- Test: `src/sim/kairo/cards.test.ts`
- Test: `src/sim/kairo/golden.test.ts`
- Test: `src/sim/kairo/accident.test.ts`

**Initial cadence, provisional:**

- 여름 일상 운영 사건: 2~3주 간격, 한 번에 최대 1장
- 봄·가을·겨울: 3~4주 간격, 한 번에 최대 1장
- 첫 일상 사건: 3주차 이후
- 사고·심사·해금·발견 등 trigger 사건: 즉시, 위 간격과 무관
- 같은 카드 재등장: 현재 seen-pool 소진 규칙 유지
- 온보딩 진행 중: 일상 사건 억제, trigger 사건만 허용

`CardSnapshot`에는 `nextRoutineWeek?`를 optional로 추가한다. 카드 RNG는 기존 독립 스트림을 유지한다.

**Acceptance:**

- 20주 여름에서 일상 카드가 7~10회가 아니라 대략 6~9회 이하로 제한된다. 정확 범위는 스펙 승인 후 고정한다.
- 어떤 주에도 일상 카드가 2장 연속으로 쌓이지 않는다.
- 사고 대응은 지연되지 않는다.
- 동일 seed는 동일 등장 주와 카드를 낸다.

### Task G1-4: 이미지가 있는 1행 선택 카드 UI

**Objective:** 사건을 텍스트 벽이 아니라 한 장면과 한 줄 선택으로 읽게 한다.

**Files:**
- Modify: `src/ui/kairo-card.ts`
- Modify: `src/style.css`
- Modify: `src/main.ts:1290`
- Modify: `src/assets/manifest.json`
- Add event art through the existing asset pipeline only after concept approval.
- Browser test: `tools/verify-kairo.ts`

**Data contract:**

```ts
export interface CardDef {
  // existing fields...
  art: string; // logical asset id
  category: 'local' | 'weather' | 'media' | 'safety' | 'delivery' | 'transport' | 'staff';
}
```

27장 전용 그림을 만들지 않는다. **7~8개 사건 테마 그림을 여러 카드가 공유**한다. 데이터의 `art`가 같은 ID를 가리킨다.

**Layout contract:**

- 상단: 80~96px 사건 그림 + 제목 + 2줄 설명
- 하단: 2~3개 선택지를 동일 폭 **한 행**으로 배치
- 각 선택지는 최소 높이 56px, 라벨과 비용/효과 요약 2줄 이내
- 세 선택지의 폭이 393px safe width 안에서 각각 최소 100px 이상
- 선택 세부 설명이 너무 길면 데이터 검증 실패; UI 스크롤로 숨기지 않는다.

**Asset gate:** 먼저 2개 사건 테마만 실제 크기로 만들어 카드 화면을 검증한 후 7~8개로 확장한다.

### Task G1-5: 카이로식 3단 목표와 소보상 cadence

**Objective:** 카드 모달을 줄여도 플레이어가 다음 행동을 잃지 않게 한다.

**Files:**
- Modify: `src/ui/kairo-hud.ts`
- Modify: `src/main.ts`
- Reuse: existing quests, wishes, exam, certs, combo discovery, ticker and FX registry
- Test: goal selection unit test
- Browser: `tools/verify-kairo.ts`

**Three fixed slots:**

1. **지금 할 일 A (1~2분):** 길 한 칸, 메뉴 장착, 코스 핸들 조정, 병목 시설 하나처럼 단일 행동
2. **단골·운영 목표 B (5~10분):** 이름 있는 NPC 요청, 메뉴 발견, 코스 기록, 의뢰
3. **성장 목표 C:** 다음 등급·인증·엔딩의 진행률

새 목표 시스템을 하나 더 만들지 않는다. 기존 의뢰·소원·심사·인증에서 시간축에 맞는 항목을 골라 세 슬롯에 배치한다.

**Feedback budget:**

- 비차단 소보상: 평균 1~2분에 하나까지 허용 — 지도 숫자, 말풍선, 토스트, 게이지
- 큰 축하 모달: 평균 5~10분보다 자주 나오지 않음
- 강제 선택 사건: G1-3의 2~4주 간격
- 한 사건을 토스트·티커·모달에 중복 노출하지 않는 기존 채널 계약 유지

---

## 4. G2 — 음식·음료 조합과 시설 성장

### 4.1 설계 계약

메뉴 시스템은 재고 게임이 아니다.

- 식재료 수량 없음
- 발주·유통기한 없음
- 새 화폐 없음
- 해금한 재료는 영구 사용 가능
- 조합 시 기존 현금을 “메뉴 개발비”로 사용
- 발견한 메뉴를 시설 슬롯에 장착
- 개별 손님은 자기 취향에 맞는 메뉴를 선택
- 결과가 그 손님의 지출·만족·말풍선에 반영

현재 11개 메뉴 시설, 38개 메뉴를 먼저 활용한다. 자판기 2종은 `fixed`로 두고 조합 대상에서 제외한다. 나머지는 데이터에서 `craft` 여부를 명시한다.

### Task G2-1: 메뉴·재료 데이터 정본 분리

**Objective:** 표시용 문자열을 실제 게임 데이터로 승격한다.

**Files:**
- Create: `src/data/kairo-menu.json`
- Create: `src/sim/kairo/menu.ts`
- Modify: `src/sim/kairo/placement.ts`
- Modify: `src/data/kairo-facilities.json`
- Test: `src/sim/kairo/menu.test.ts`
- Test: `src/sim/kairo/data.test.ts` or existing data validation suite

**Proposed data:**

```ts
export type TasteTag = 'cool' | 'warm' | 'sweet' | 'savory' | 'hearty' | 'light';

export interface IngredientDef {
  id: string;
  name: string;
  art: string;
  unlock: { kind: 'grade' | 'event' | 'wish'; id?: string; grade?: number };
}

export interface MenuDef {
  id: string;
  name: string;
  facilityIds: string[];
  ingredients: [string, string];
  tags: TasteTag[];
  price: number;
  satisfaction: number;
  developmentCost: number;
  art: string;
}
```

시설 정의에는 다음만 남긴다.

```ts
menuMode?: 'craft' | 'fixed';
startingMenu?: string[];
```

기존 `menu` 38개와 새 메뉴 ID의 1:1 매핑 검사를 둔다. 이름이 조용히 사라지거나 중복되지 않아야 한다.

### Task G2-2: 발견 상태와 시설별 메뉴 슬롯 저장

**Objective:** 발견과 장착을 서로 다른 상태로 저장한다.

**Files:**
- Create: `src/sim/kairo/menu-store.ts`
- Modify: `src/sim/kairo/placement.ts`
- Modify: `src/save/kairo.ts`
- Test: `src/sim/kairo/menu-store.test.ts`
- Test: `src/save/kairo.test.ts`

**State contract:**

```ts
export interface MenuSnapshot {
  discovered: string[];
  ingredients: string[];
}

export interface PlacedFacility {
  // existing fields...
  menuIds?: string[];
}
```

**Slot rule, provisional:**

- 시설 1~2단계: 1칸
- 시설 3~4단계: 2칸
- 시설 5단계: 3칸
- `fixed` 자판기는 데이터 고정 슬롯만 사용
- 낮은 단계로 내려가는 기능은 없으므로 슬롯 축소 문제는 발생하지 않는다.

`menuIds`와 `MenuSnapshot`은 optional로 저장해 v7 호환을 우선한다. 데이터에서 제거된 메뉴 ID는 로드시 버리고 시작 메뉴로 보정한다.

### Task G2-3: 조합 수직 슬라이스 — 매점과 카페

**Objective:** 전체 38개를 배선하기 전에 두 시설로 핵심 재미를 검증한다.

**Files:**
- Create: `src/ui/kairo-menu-lab.ts`
- Modify: `src/ui/kairo-facility.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Test: `src/ui/kairo-menu-lab.test.ts`
- Browser: `tools/verify-kairo.ts`

**Input flow:**

1. 시설 정보에서 `메뉴 개발`을 누른다.
2. 해금된 재료 A와 B를 한 번씩 고른다.
3. 결과 미리보기는 이름을 숨기되 실루엣과 예상 태그를 보여준다.
4. `개발 ₩N`을 눌러 발견한다.
5. 이미 발견한 조합이면 비용을 받지 않고 기존 메뉴를 연다.
6. 맞지 않는 조합도 **빈 실패가 아니다.** 20% 연구비로 후보 하나를 지우거나 재료 힌트 하나를 공개해 다음 시도가 반드시 가까워진다.
7. 발견 메뉴를 빈 슬롯에 바로 장착할 수 있다.

**Vertical slice content:** 매점 4개 + 카페 4개, 재료 6~8개. 이 단계에서는 신규 메뉴 이름을 추가하지 않는다.

**Acceptance:**

- 후반 현금이 메뉴 개발비로 실제 감소한다.
- 한 시설에 장착한 메뉴가 다른 인스턴스에 자동 복제되지 않는다.
- 동일 재료 조합은 순서와 무관하게 동일 결과다.
- 새로고침 후 발견·장착 상태가 유지된다.
- 393×852에서 재료 선택→개발→장착이 스크롤 없이 가능하다.

### Task G2-4: 이름 있는 단골 NPC와 실제 소비 연결

**Objective:** 전 손님에게 보이지 않는 취향 변수를 늘리기보다, 기존 인물·소원 시스템을 재사용해 카이로식 “저 사람을 만족시켰다”를 만든다.

**Files:**
- Modify: `src/sim/kairo/guests.ts`
- Modify: `src/sim/kairo/groups.ts`
- Modify: `src/sim/kairo/wishes.ts`
- Modify: `src/sim/kairo/week.ts`
- Modify: `src/render/kairo/guest-layer.ts` or the current guest rendering consumer found during implementation
- Test: `src/sim/kairo/menu-guests.test.ts`
- Test: `src/sim/kairo/week-identity.test.ts`

**Rule:**

- 현재 존재하는 이름 있는 인물 8명을 **반복 방문 단골**로 사용한다. 새 인물 시스템을 만들지 않는다.
- 각 단골은 선호 태그, 피하는 태그, 3단계 요청 사슬, 친밀도 보상을 데이터로 갖는다.
- 단골이 실제 agent로 방문한 주에는 머리 위 작은 표식과 요청 메뉴 반응이 보인다.
- 요청 메뉴를 장착한 시설을 실제로 이용하면 친밀도 상승, 새 재료·레시피·장식 중 하나가 열린다.
- 일반 손님 1,200명은 기존 그룹 선호를 사용한다. 메뉴 선택은 가격·대기·그룹 태그로 계산하되, 개인별 영구 취향·친밀도를 저장하지 않는다.
- 메뉴가 비었으면 음식 시설을 이용한 척하지 않는다.

**결정론:** 단골 방문 주와 일반 손님 메뉴 선택은 기존 독립 RNG stream을 사용한다. 단골 친밀도는 기존 wish snapshot과 함께 저장한다.

**Report additions:** 인기 메뉴 상위 3개, 이번 주 방문한 단골과 만족 여부, 일반 손님의 미충족 메뉴 태그 1개를 결산의 별도구매 세부에 넣는다.

### Task G2-5: 11개 시설로 확장

**Objective:** 수직 슬라이스 검증 뒤 기존 38개 메뉴 전체를 배선한다.

**Files:**
- Modify: `src/data/kairo-menu.json`
- Modify: `src/data/kairo-facilities.json`
- Modify: `src/data/kairo-unlocks.json` or event/wish data only where ingredients need an arrival source
- Test: `src/sim/kairo/menu.test.ts`
- Headless: `tools/kairo-sim.ts`

**Content partition:**

- `craft`: 식혜·계란, 매점, 분식, 치킨, 아이스크림, 카페, BBQ, 화로대, 붕어빵
- `fixed`: 실내·야외 자판기

각 시설은 시작 메뉴 1개를 갖는다. 추가 메뉴는 등급만 올려 자동으로 열리지 않고, 재료 도착·발견을 거쳐야 한다.

### Task G2-6: 시설 외형 성장 — 4종만 먼저

**Objective:** 메뉴와 시설 단계가 지도에서 눈에 보이게 자란다.

**Files:**
- Modify: `src/assets/manifest.json`
- Modify: `src/data/kairo-render-contract.json`
- Modify: current Kairo facility texture selection module discovered during implementation
- Asset production: existing Kairo asset pipeline and gates
- Browser: `tools/verify-kairo.ts`
- Asset: `npm run gate`

**Scope cap:**

- 1차 완전 외형 업그레이드: 매점, 분식, 카페, BBQ존 4종
- 단계 묶음: 1~2단계 / 3~4단계 / 5단계의 3단 외형
- 추가 canonical 그림: 시설당 2장, 총 8장 이내. 방향 runtime 확장은 manifest 정본으로 계산한다.
- 나머지 메뉴 시설은 공통 간판·차양·진열 오버레이로 성장 표시. 전체 11종을 처음부터 3장씩 다시 그리지 않는다.

**Gate:** 같은 크기 무라벨 A/B에서 3단계와 5단계가 즉시 구분돼야 한다. 작은 배지나 몇 픽셀 덧칠만으로 “외형 업그레이드”를 통과시키지 않는다.

---

## 5. G3 — 코스 재편집과 견인 보트

### 5.1 선행 수정: 코스 매출을 실제 수요에 묶는다

현재 `CourseStore.weekly()`는 잠재 처리량 × 요금으로 매출을 만든다. 보트를 추가해 속도를 올리기 전에 이 구조를 고치지 않으면 코스가 공원 방문객과 무관한 돈 복사기가 된다.

### Task G3-1: 잠재 처리량과 실제 탑승객 분리

**Objective:** 코스 성능은 손님을 처리하는 능력이고, 실제 매출은 실제 방문 수요 안에서만 발생하게 한다.

**Files:**
- Modify: `src/sim/kairo/course.ts`
- Modify: `src/sim/kairo/week.ts`
- Modify: `src/main.ts`
- Modify: `tools/kairo-sim.ts`
- Test: `src/sim/kairo/course.test.ts`
- Test: `src/sim/kairo/week.test.ts`
- Test: `src/sim/kairo/golden.test.ts`

**Contract:**

```ts
interface CourseCapacitySummary {
  capacity: number;   // 잠재 주간 처리량
  upkeep: number;
  weightedThrill: number;
}

interface CourseWeekResult {
  riders: number;     // 실제 방문객 수요로 제한
  revenue: number;
  upkeep: number;
}
```

- 실제 탑승객 ≤ 그 주 입장객 중 코스를 원하는 손님 수
- 실제 탑승객 ≤ 전체 코스 잠재 처리량
- 코스가 늘어도 방문객이 없으면 수입 0
- 계절·손님 그룹의 코스 선호는 기존 수요 구성에서 파생
- 같은 seed의 계산은 결정론적

`weekly()`가 무료로 매출을 만드는 현 구조를 유지한 채 보트 보너스를 얹는 것은 금지한다.

### Task G3-2: 견인 보트 데이터 추가

**Objective:** 코스 형태와 타는 장비 외에, 운영 장비인 보트를 별도 선택 축으로 만든다.

**Files:**
- Create: `src/data/kairo-boats.json`
- Modify: `src/sim/kairo/course.ts`
- Modify: `src/save/kairo.ts`
- Test: `src/sim/kairo/boats.test.ts`
- Test: `src/save/kairo.test.ts`

**Proposed shape:**

```ts
export interface BoatDef {
  id: string;
  name: string;
  sprite: string;
  unlockGrade: number;
  cost: number;
  upkeep: number;
  speedMult: number;
  handling: number;
  thrillDelta: number;
  satisfactionDelta: number;
  towKinds: string[];
}

export interface PlacedCourse {
  // existing fields...
  boatId?: string;
}
```

**선택 복잡도 상한:** 현재 조합은 프리셋 6 × 장비 19 = 114다. 보트 3종을 15개 tow 장비에 전부 곱하면 power 장비를 포함해 runtime 조합이 **294개**가 된다. 294칸의 수제 적합도 표를 만들지 않는다. 보트는 공통 profile multiplier로 계산하고, UI는 해금된 최대 3종만 보여주며 추천 1종을 기본 선택한다. 플레이어의 주된 창작 선택은 여전히 루트 핸들이다.

**초기 3모델, 모두 역할이 달라야 한다:**

1. 작업형: 저렴, 유지비 낮음, 조향·안전 우수, 최고 스릴 낮음
2. 스포츠형: 속도·스릴 우수, 급커브 안전에 민감, 유지비 중간
3. 프리미엄형: 만족·승차감 우수, 가격·유지비 높음, 순수 스릴 최고는 아님

`power` 장비는 자체 동력이라 보트가 없고, `tow` 장비만 보트를 요구한다. 기존 세이브의 `boatId`가 없으면 데이터의 기본 작업형으로 복원한다.

### Task G3-3: 코스 평가식에 보트 역할 배선

**Objective:** 보트 교체와 핸들 이동이 서로 다른 축으로 지표를 바꾸게 한다.

**Files:**
- Modify: `src/sim/kairo/course.ts:576-629`
- Test: `src/sim/kairo/boats.test.ts`

**Rules:**

- 속도: 장비 속도 × 보트 속도 배율
- 스릴: 프리셋 기본 + 곡률×유효속도 + 보트 스릴 델타
- 안전: 장비 안전곡률 + 보트 조향 − 급커브×유효속도 페널티
- 처리량: 유효속도와 승하차 시간, 운행 대수로 계산
- 만족: 장비×프리셋 적합도 + 보트 승차감
- 유지비: 장비 대수 유지비 + 보트 유지비

스포츠형이 모든 프리셋에서 상위호환이 되면 데이터 검증 실패로 본다. 최소 한 프리셋에서는 작업형 또는 프리미엄형이 더 높은 순만족/순이익을 내야 한다.

### Task G3-4: 기존 코스 편집 API

**Objective:** 지은 코스로 돌아와 루트·장비·보트를 바꿀 수 있게 한다.

**Files:**
- Modify: `src/sim/kairo/course.ts:632-716`
- Modify: `src/ui/kairo-course.ts`
- Test: `src/sim/kairo/course.test.ts`
- Test: `src/ui/kairo-course.test.ts`

**API contract:**

```ts
update(handle: number, next: Omit<PlacedCourse, 'handle'>): boolean
```

**Validation:**

- 편집 중인 코스는 `others()`에서 제외해 자기 자신과 겹침 판정을 하지 않는다.
- 저장 전에 기존 코스와 같은 `validateCourse`를 통과한다.
- 코스 핸들 이동 자체는 무료.
- 장비·보트 교체는 기존 장비의 50% 보상가를 적용한 차액을 결제한다.
- 반복 교체로 현금이 늘지 않는다는 테스트를 둔다.

### Task G3-5: 지도 선택 → 코스 관리 화면

**Objective:** 코스가 “한 번 만들고 잊는 것”이 아니라 반복 조정 대상이 되게 한다.

**Files:**
- Modify: `src/render/kairo/KairoScene.ts` or actual course hit-test owner
- Modify: `src/ui/kairo-course.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Browser: `tools/verify-kairo.ts`

**Flow:**

1. 붓이 없을 때 지도에서 코스/선착장을 탭한다.
2. 시설 정보와 같은 관리 시트가 열린다.
3. 상단에 현재 스릴·안전·주간 실제 탑승·순이익을 표시한다.
4. `루트 편집`, `타는 장비`, `견인 보트`, `운행 대수` 네 축을 같은 화면에 둔다.
5. 루트 편집을 누르면 기존 핸들이 지도에 나타난다.
6. 핸들을 움직이는 동안 이전값→예상값 delta를 즉시 표시한다.
7. 취소는 원상복구, 확정은 차액 결제 후 저장한다.

**Acceptance:** 진짜 터치 드래그로 핸들을 옮기고 스릴/안전이 달라지며, 새로고침 뒤 수정 코스가 유지된다.

### Task G3-5B: 3~5초 시험 운행과 개인 최고 기록

**Objective:** RCT식 설계 결과를 다음 주 결산까지 기다리지 않고 즉시 체감하게 한다.

**Files:**
- Modify: `src/ui/kairo-course.ts`
- Modify: Kairo course/vehicle renderer
- Modify: existing playback/FX slot consumers
- Test: deterministic course test-run result
- Browser: `tools/verify-kairo.ts`

**Flow:**

1. 편집 확정 후 실제 보트·장비가 코스 한 바퀴를 3~5초 압축 운행한다.
2. 대표 손님 3~5명의 스릴/불안/만족 말풍선이 비차단으로 나온다.
3. `스릴 최고`, `안전 최고`, `처리량 최고`, `단골 ○○ 만족` 중 새 기록이면 작은 도장과 FX가 뜬다.
4. 큰 모달은 첫 기록·장비 해금 같은 큰 사건만 사용한다.
5. 시험 운행 결과는 실제 `evaluateCourse` 값을 읽고 별도 렌더용 가짜 공식을 만들지 않는다.

이 단계가 통과해야 “코스를 설계한다”가 핵심 놀이로 인정된다. 숫자 패널만 변하고 운행 장면이 같으면 실패다.

### Task G3-6: 코스 수직 슬라이스 아트

**Objective:** 보트 선택이 숫자만 아니라 운행 화면에서 보인다.

**Scope:** 작업형·스포츠형 보트 2종만 먼저. 기존 견인 장비와 결합해 실제 코스에서 움직이는 것을 검증한 뒤 프리미엄형을 추가한다.

**Gate:** 방향, 깊이, 물 접지, 손님 부착, 항적 FX를 기존 슬롯 계약으로 검증한다. 호출부에 직접 tween이나 별도 FX를 만들지 않는다.

---

## 6. G4 — 온보딩 대화와 실제 행동 유도

온보딩은 G2·G3 수직 슬라이스가 확정된 뒤 최종 작성한다. 아직 바뀔 UI를 먼저 설명하지 않는다.

### Task G4-1: 데이터 기반 가이드 상태

**Files:**
- Create: `src/data/kairo-guide.json`
- Create: `src/sim/kairo/guide.ts`
- Modify: `src/save/kairo.ts`
- Test: `src/sim/kairo/guide.test.ts`
- Test: `src/save/kairo.test.ts`

**State:**

```ts
export interface GuideSnapshot {
  step: string;
  completed: string[];
  dismissed: boolean;
}
```

가이드 완료 조건은 안정적인 집계만 쓴다. 임의 DOM id나 화면 좌표를 sim 조건으로 넣지 않는다.

### Task G4-2: 운영 매니저 대화 UI

**Files:**
- Create: `src/ui/kairo-guide.ts`
- Modify: `src/style.css`
- Modify: `src/main.ts`
- Modify: `src/assets/manifest.json`
- Browser: `tools/verify-kairo.ts`

**Surface rule:**

- 첫 인사와 시스템 전환 설명만 짧은 대화 오버레이
- 실행 단계에서는 오버레이를 닫고 목표 칩과 지도 강조로 전환
- 매 행동마다 팝업을 띄우지 않음
- 언제든 `건너뛰기`, 메뉴에서 `다시 보기`
- 초반 2주 동안 일상 운영 카드는 억제

기존 사건 채널 3분리와 충돌하지 않도록 온보딩은 새 게임 초기에만 존재하는 명시적 예외다.

### Task G4-3: 첫 10~15분 실행 흐름

**Recommended sequence:**

1. **물려받은 빠지 소개** — 입구·실내동·선착장을 카메라가 차례로 잡는다.
2. **첫 위생 시설 배치** — 매니저가 화장실을 추천하고 건설 시트를 직접 연다.
3. **물려받은 코스 조정** — 코스가 있는 맵은 핸들 하나를 움직이고 3~5초 시험 운행을 본다. 코스가 없는 맵은 선착장 목표로 대체한다.
4. **첫 판매 시설과 메뉴** — 매점 또는 카페를 짓고 기본 메뉴를 슬롯에 장착한다.
5. **단골 한 명 관찰** — 요청 말풍선, 메뉴 이용, 친밀도 상승과 실제 결제를 본다.
6. **첫 결산 읽기** — 방문객 delta, 수익/비용/손익을 각각 한 번 강조한다.
7. **자율 목표 전환** — 현재 병목 또는 메뉴 힌트를 목표 칩으로 넘기고 가이드 종료.

**Acceptance:** 자동 QA는 버튼 백도어가 아니라 실제 393×852 터치로 배치·메뉴 장착·코스 드래그·결산 닫기를 수행한다.

---

## 7. G5 — 엔딩, 계속 운영, 새 지역

### Task G5-1: 기본 시나리오 엔딩 조건 추가

**Objective:** `inherited`도 명확한 1차 완주점을 갖게 한다.

**Files:**
- Modify: `src/data/kairo-scenarios.json`
- Modify: `src/sim/kairo/scenario.ts`
- Test: `src/sim/kairo/scenario.test.ts`

**Provisional default ending:**

- 5등급 달성
- 사이드 인증 6개 이상
- 시나리오 실패 상태가 아님

정확한 6개 값은 24 seed 52주 도달 분포를 보고 조정한다. 단순 “N주 생존”만으로 엔딩을 주지 않는다.

### Task G5-2: 런 밖의 커리어 메타 저장소

**Objective:** 새 지역으로 가도 클리어 기록이 지워지지 않게 한다.

**Files:**
- Create: `src/save/kairo-career.ts`
- Create: `src/sim/kairo/career.ts`
- Modify: `src/ui/kairo-newgame.ts`
- Modify: `src/main.ts`
- Test: `src/save/kairo-career.test.ts`

**Separate key:** `ppaji.kairo.career.v1`

```ts
export interface CareerSnapshot {
  cleared: string[]; // mapId:scenarioId
  endingsSeen: string[];
  best: Record<string, { week: number; reputation: number; cash: number }>;
}
```

`clearKairoStorage()`는 런 세이브만 지우고 커리어 키는 지우지 않는다. 전체 초기화는 별도 명시적 버튼과 확인을 요구한다.

### Task G5-3: 엔딩 화면

**Files:**
- Create: `src/ui/kairo-ending.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Browser: `tools/verify-kairo.ts`

**Buttons:**

1. `계속 운영` — 현재 세이브 유지, 엔딩은 같은 런에서 다시 뜨지 않음
2. `새 지역으로` — 맵·시나리오 선택 화면, 커리어 메타 기반 잠금
3. `내 빠지 보기` — 기존 감상/공유 화면 연결

1차 버전에서는 현금·시설·레시피를 새 맵으로 그대로 옮기지 않는다. 새 맵 경제를 무너뜨리는 계승 시스템은 별도 설계 없이 넣지 않는다. 클리어 기록과 선택 가능한 맵/시나리오만 유지한다.

---

## 8. G6 — 건설 UI 재설계와 풍부한 지도

### Task G6-1: 건설 UI 목업 3안 비교

**Objective:** 코드 전에 393×852에서 선택 밀도와 지도 가림을 결정한다.

**Artifacts:**
- Create mockups under an approved design/output path; implementation 전 사용자가 같은 크기 A/B/C로 선택.

**Three variants:**

- A: 현재 캐러셀 개선 — 큰 그림 1행 + 고정 카테고리 칩 + 비용/설명 한 줄
- B: 2열 compact list — 탐색 빠름, 그림 작음
- C: 왼쪽 카테고리 + 선택 상세 + 하단 확정 — 정보 풍부, 탭 1회 증가

**Recommended starting point:** A. 카이로식 한 줄 카드 트레이를 유지하되 카드 폭과 비용·설치조건을 명확히 하고, 선택 후 즉시 조준 모드로 전환한다.

**Measurement:**

- 393×852 safe area
- 터치 타깃 ≥44px
- 시트 높이 ≤ 화면 36%
- 시설 75종에서 카테고리 전환과 5번째 항목 선택의 탭/스와이프 수
- 잠김 티저 2개가 실제 항목을 밀어내지 않는지
- 선택한 시설 이름·비용·설치 가능 여부가 동시에 보이는지

### Task G6-2: 선택 정보와 조준 진입 정리

**Files:**
- Modify after mockup approval: `src/ui/kairo-hud.ts`
- Modify: `src/style.css`
- Modify: `src/main.ts` only where selected-item state is needed
- Browser: `tools/verify-kairo.ts`

**Rules:**

- 메인 탭은 시설·건물·바닥·코스 4개 유지
- 시설 유형 칩은 한 행, 가로 스크롤
- 카드에는 그림·이름·비용·핵심 제약 1개만
- 상세 설명은 선택 후 정보 줄에서 한 번만 표시
- 설치 불가 이유는 시트에서 미리 표시
- 탭하면 기존 카이로식 조준 배치로 전환; 즉시 설치로 되돌리지 않음

### Task G6-3: 주변 장식 데이터와 계층

**Objective:** 시뮬 규칙을 늘리지 않고 도로·화단·집·지역 생활감을 만든다.

**Files:**
- Create: `src/data/kairo-decor.json`
- Create/Modify: current Kairo decor renderer, likely `src/render/kairo/decor.ts` or scene-owned equivalent after symbol trace
- Modify: `src/assets/manifest.json`
- Modify: `src/data/kairo-render-contract.json`
- Test: deterministic decor placement unit test
- Browser: `tools/verify-kairo.ts`

**Three layers:**

1. **기능 지형:** 현재 도로·보도·가로수, sim 정본 유지
2. **주변 장식:** 주택, 편의점, 주차 차량, 가로등, 안내판, 화단, 수풀 — 충돌 없는 render-only 배치
3. **플레이어 장식 시설:** 기존 화단·조경 시설 — 콤보·경관에 영향을 주므로 placement 소유 유지

주택을 시설 75종 목록에 넣거나 손님 길을 막게 하지 않는다. 주변 장식은 맵 seed에서 결정론적으로 생성하며 저장하지 않는다.

**Initial art cap:**

- 주택 3종
- 지역 상점 2종
- 주차 차량 2종
- 가로등·표지·화단·수풀 4종
- 총 canonical prop 12장 이내로 수직 슬라이스

같은 집을 격자 간격으로 반복하지 않고 3~6개 단위 클러스터와 빈 공간을 함께 둔다. 도시 띠와 지도 바깥에 우선 배치해 플레이 공간의 판독성을 해치지 않는다.

### Task G6-4: 지도 풍부함 성능·가림 게이트

**Acceptance:**

- 393×852 네 귀퉁이와 중앙에서 하늘 노출 0 규칙 유지
- 장식이 게이트·매표소·코스 핸들·배치 고스트를 가리지 않음
- 조준 중 xray 대상에 주변 장식을 포함할지 명시하고 테스트
- 화면 내 non-interactive prop 개수 hard cap 설정
- 1,200명 장면에서 FPS/메모리 회귀 없음
- 같은 map seed는 같은 장식 배치

---

## 9. G7 — 통합, 경제, QA

### Task G7-1: 전체 데이터 확장 전 수직 슬라이스 판정

다음 네 질문이 모두 `예`일 때만 메뉴 38개·보트 3종·장식 12종 전체로 확장한다.

1. 메뉴를 바꾼 손님이 지도에서 다른 반응을 보이는가?
2. 결산에서 어떤 메뉴가 돈과 만족을 만들었는지 읽히는가?
3. 같은 코스에서 핸들 또는 보트를 바꾸면 스릴·안전·실제 탑승·순이익 중 둘 이상이 달라지는가?
4. 플레이어가 10분 안에 그 행동을 한 번 반복하는가?

숫자만 변하고 지도 위 차이가 안 보이면 콘텐츠 확대를 중단하고 수직 슬라이스를 고친다.

### Task G7-2: 결정론·save 호환

**Tests:**

- 메뉴 발견/장착 round-trip
- 옛 v7 세이브는 기본 메뉴와 기본 보트로 복원
- 코스 편집 후 round-trip
- career meta는 런 삭제 후 유지
- card nextRoutineWeek round-trip
- 동일 seed: 카드 등장 주, 손님 취향 분포, 메뉴 선택, 코스 수요 결과 동일
- `npm run sim -- --determinism`

세이브 optional 필드로 뜻을 보존할 수 없을 때만 v8 마이그레이션을 승인한다. 단지 필드가 늘었다는 이유로 버전을 올리지 않는다.

### Task G7-3: 헤드리스 경제 A/B

**Commands:**

```bash
npm run sim:kairo -- --seeds 12 --weeks 26
npm run sim:kairo -- --seeds 24 --weeks 52
npm run sim:kairo -- --seeds 12 --weeks 80
```

**New summary rows:**

- 메뉴 개발비와 메뉴 매출
- 취향 일치율
- 메뉴 슬롯 평균 사용량
- 코스 잠재 처리량 vs 실제 탑승
- 보트별 채택률·순이익·사고 위험
- 일상 카드 등장 횟수
- 엔딩 도달 주 분포

**Guardrails:**

- 파산 0 유지
- 메뉴 R&D가 없는 대조군보다 후반 현금이 줄더라도 건설이 구조적으로 막히지 않음
- 코스 매출은 실제 입장객 0이면 0
- 어느 보트도 80% 이상 독점하지 않음
- 엔딩은 24 seed 중 극소수만 닿거나 전부 같은 주에 닿지 않음

### Task G7-4: 브라우저 실제 터치 QA

**Run:**

```bash
npm run dev
npm run verify:kairo
```

**New harness sections:**

- 카드 2·3선택지가 1행이고 모두 44px 이상
- 카드 그림이 실제 asset provider에서 로드됨
- 결산 첫 화면에 방문객 delta, 수익, 비용, 손익이 모두 보임
- 메뉴 재료 선택→개발→장착 진짜 터치
- 손님 메뉴 반응과 판매 수입 관찰
- 기존 코스 선택→핸들 진짜 드래그→지표 delta→확정
- 보트 교체 후 운행 sprite 변화
- 온보딩 건너뛰기와 다시 보기
- 엔딩 계속 운영 후 같은 엔딩 재등장 없음
- 새 지역 선택 후 career clear 유지
- 건설 시트 최악 밀도에서 카드 터치
- 주변 장식이 고스트/코스 핸들을 가리지 않음

백도어 API는 sim 판정에만 사용하고, 화면 동작은 CDP 실제 터치로 검증한다.

### Task G7-5: 전체 검증

```bash
npm run verify
npm run build
npm run gate
npm run seam
npm run verify:kairo
npm run verify:pwa
```

완료 보고에는 실제 실행 결과의 테스트 수, 브라우저 검사 수, 정적 게이트, 26·52·80주 핵심 변화만 기록한다. 성공했다고 추정하지 않는다.

---

## 10. 주요 파일 변경 예상표

| 축 | 주요 파일 |
|---|---|
| 카드 빈도 | `src/sim/kairo/cards.ts`, `src/data/kairo-cards.json`, `src/main.ts` |
| 카드 이미지 UI | `src/ui/kairo-card.ts`, `src/style.css`, `src/assets/manifest.json` |
| 결산 | `src/sim/kairo/week.ts`, `src/ui/kairo-report.ts`, `src/main.ts`, `src/save/kairo.ts` |
| 메뉴 | `src/data/kairo-menu.json`, `src/sim/kairo/menu.ts`, `src/sim/kairo/menu-store.ts`, `src/sim/kairo/placement.ts`, `src/sim/kairo/guests.ts` |
| 메뉴 UI | `src/ui/kairo-menu-lab.ts`, `src/ui/kairo-facility.ts`, `src/style.css` |
| 보트·코스 | `src/data/kairo-boats.json`, `src/sim/kairo/course.ts`, `src/ui/kairo-course.ts`, `src/sim/kairo/week.ts` |
| 온보딩 | `src/data/kairo-guide.json`, `src/sim/kairo/guide.ts`, `src/ui/kairo-guide.ts` |
| 엔딩 | `src/sim/kairo/scenario.ts`, `src/sim/kairo/career.ts`, `src/save/kairo-career.ts`, `src/ui/kairo-ending.ts`, `src/ui/kairo-newgame.ts` |
| 건설 UI | `src/ui/kairo-hud.ts`, `src/style.css` |
| 지도 장식 | `src/data/kairo-decor.json`, Kairo decor renderer, manifest/render contract |
| 조립 | `src/main.ts` |
| 헤드리스 | `tools/kairo-sim.ts` |
| 모바일 QA | `tools/verify-kairo.ts` |

---

## 11. 위험과 완화

### Risk 1: 음식 조합이 별도 미니게임으로 고립

**완화:** 메뉴 선택이 실제 `Guest` 소비, 수입 이벤트, 만족도, 말풍선, 결산 인기 메뉴까지 한 경로로 연결되기 전에는 콘텐츠를 확대하지 않는다.

### Risk 2: 후반 돈 소모를 위해 억지 비용을 키움

**완화:** 개발비는 현금 sink지만 발견·슬롯·손님 반응이라는 영구 가치가 있어야 한다. 비용만 올려 후반을 늦추지 않는다.

### Risk 3: 보트가 단순 상위 등급 장비가 됨

**완화:** 속도·조향·만족·유지비의 역할을 갈라 모든 코스에서 같은 보트가 우세하지 않도록 데이터 검증과 seed 채택률을 둔다.

### Risk 4: 코스 수익이 방문객과 무관한 기존 누수 확대

**완화:** G3-1 수요 상한을 보트보다 먼저 구현한다. 이 작업이 통과하지 않으면 보트 경제 효과를 배선하지 않는다.

### Risk 5: 온보딩 팝업이 새 카드 피로가 됨

**완화:** 설명 대화 뒤 실제 행동 중에는 목표 칩으로 축소하고, 일상 카드를 초반 억제한다.

### Risk 6: 외형 업그레이드가 에셋 폭발

**완화:** 4개 대표 시설 × 추가 2단계 = canonical 8장으로 제한해 먼저 판정한다. 나머지는 공통 오버레이 후 필요성이 입증된 시설만 추가한다.

### Risk 7: 지도 장식이 플레이 공간을 가림

**완화:** render-only 주변 장식은 도시 띠와 지도 밖 우선, hard cap과 고스트/핸들 가림 테스트를 둔다. 경관 시설과 배경 장식을 같은 시스템으로 합치지 않는다.

### Risk 8: 대규모 변경이 한 번에 합쳐져 원인 추적 불가

**완화:** G1, G2 slice, G3 slice 각각 독립 A/B와 브라우저 게이트를 통과한 뒤 다음 단계로 간다. 메뉴와 코스 경제를 동시에 조정하지 않는다.

---

## 12. 구현 전에 사용자와 최종 확정할 세 가지

1. **메뉴 조합의 감각:** 두 재료를 직접 실험하는 방식과, 후보 레시피를 보고 개발하는 방식 중 어느 정도의 불확실성을 원하는가. 본 계획 기본값은 “실루엣 힌트가 있는 2재료 조합”이다.
2. **보트의 역할:** 실제 한국 빠지에서 보이는 모터보트/제트스키 차이를 어느 정도 사실적으로 가져갈지. 본 계획은 조작이 쉬운 3역할 모델로 제한한다.
3. **기본 엔딩:** 5등급+인증 6개를 완주점으로 볼지, 특정 시즌/대회 같은 서사 사건을 추가할지. 구현은 데이터로 바꿀 수 있지만 엔딩 연출과 온보딩 문구는 이 결정에 의존한다.

이 세 가지 외의 구조는 현재 저장소와 사용자 요구로 충분히 정할 수 있다.

---

## 13. 첫 실행 묶음 추천

전체를 바로 시작하지 않고 다음 하나를 첫 마일스톤으로 권장한다.

### Milestone 1 — “한 코스를 다시 고치고 싶어지는가”

- 카드 빈도 축소와 결산 첫 화면 최소 정리
- 코스 수요 상한
- 기존 코스 편집
- 보트 2종
- 핸들 이동→3~5초 시험 운행→스릴·안전·실제 탑승 변화
- 393×852 진짜 드래그 검증

### Milestone 2 — “단골 때문에 한 매점을 다시 만지는가”

- 매점·카페 메뉴 8개
- 재료 조합·슬롯 1→2→3
- 이름 있는 단골 2명의 요청 사슬
- 실제 방문·말풍선·친밀도·재료 보상
- 결산 인기 메뉴와 단골 만족

### Milestone 3 — “다음 할 일이 계속 보이는가”

- 1~2분 / 5~10분 / 장기 진행의 3단 목표
- 이미지 사건 카드 2개 테마
- 전주 delta·수익/비용 구획 완성
- 비차단 발견·기록·친밀도 연출

이 세 마일스톤이 재미를 증명한 뒤 온보딩·엔딩·전체 에셋 확장으로 넘어간다.
