# 에셋 제작 자료 복구와 새 작업 시작

2026-10-23 보관본을 기준으로 한다. 새 세션은 이 문서 → 복구한 `skills/ppaji-assets/SKILL.md` → 해당 종류의 참조 문서 순서로 읽는다. 기존 워크트리 이름이나 대화 기록이 없어도 자료를 찾아 재개하기 위한 안내다.

## 보관 위치와 완료 여부

Finder의 **iCloud Drive → Ppaji-Asset-Recovery → 2026-10-23** 폴더 전체가 한 보관 단위다. Mac 로컬 경로는 아래와 같다.

```text
~/Library/Mobile Documents/com~apple~CloudDocs/Ppaji-Asset-Recovery/2026-10-23
```

압축 데이터 52개는 총 16,288,365,106바이트(약16.29GB)다. 최신 게임·작업 자료·스킬과 과거 백업을 함께 보관한다. Git clone만으로 이 모든 생성 원본이 내려오지는 않는다.

**문서가 있다는 사실은 업로드 완료를 뜻하지 않는다.** 작성 시점에는 일부 파일에 iCloud 오류4355가 남아 있다. 해당 Mac에서 `python3 check-cloud.py`를 실행하고 `CLOUD-STATUS.json`의 시각·파일별 상태·`all_uploaded`를 확인한다. 업로드되지 않은 파일의 원본은 삭제하지 않는다. 정리 결과는 `LOCAL-CLEANUP.json`에 별도로 기록한다.

## 다른 폴더 또는 다른 Mac에서 복구

필요 도구는 Python3.11 이상, zstd, Node.js/npm이다. 렌더링에는 `requirements-render.txt`의 Pillow/NumPy가 필요하다. 실행 파일·node_modules·가상환경은 보관하지 않으며 설치에는 인터넷이 필요할 수 있다. 실행 전 패키지를 다운로드할 디스크 공간과 복구할 공간을 확보한다. 전체 과거 백업을 한꺼번에 풀 필요는 없다.

```sh
# 이 셸 변수는 보관 폴더만 가리킨다.
ASSET_ARCHIVE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Ppaji-Asset-Recovery/2026-10-23"
cd "$ASSET_ARCHIVE"

# 모든 보관 압축 파일의 크기/SHA256 확인: 원격 파일은 다운로드될 수 있다.
python3 restore.py --verify

# 매번 새 빈 폴더를 지정한다. 기존 게임 위에 덮어쓰지 않는다.
python3 restore.py --destination "$HOME/Projects/ppaji-asset-restore-20261023"
```

일반 복구는 main/workspace/skills 세 압축본만 사용하고 파일별 SHA를 확인한다. 견인기구 과거 복원 작업까지 필요하면 처음 복구할 때 `--include-tow`를 추가한다. `RESTORE-RECEIPT.json`에서 검증한 파일과 설치하지 않은 외부 링크를 확인한다. 이 복구본은 파일 스냅샷이며 `.git` 이력은 포함하지 않는다. 새 브랜치에서 작업하려면 별도로 최신 저장소를 clone하고 필요한 후보만 검토 후 옮긴다.

| 복구 폴더 안 경로 | 용도 |
| --- | --- |
| `main/ppaji/` | 최종 채택 게임 코드·에셋·manifest·테스트 |
| `main/docs/assets/` | 메인에 남긴 제작/채택/검증 문서 |
| `workspace/assets/generated/` | 편집 가능한 레시피·원본·실험·과거 검수 자료 |
| `skills/ppaji-assets/` | 시설·NPC·지형·이동기구의 통합 제작 진입점 |
| `skills/ppaji-assets/assets/facility-seed/` | 외부 텍스처 없이 재생성 가능한 드라이룸 기준 레시피 |
| 패키지의 `history/sep12`, `history/sep30` | 더 오래된 고유 자료와 당시 변경 상태 |
| 패키지의 `verification/` | 실제 복구·독립 제작 시험·해시 검증 근거 |

보관한 게임의 기준 커밋은 `29de23ab8ed01ad7e0d82e6cb8178cc7be5b7ac7`이다. 이후 최신 메인과 다를 수 있으므로 새 게임에 적용할 때는 현재 provider/manifest를 다시 확인한다.

## 게임과 기준 에셋 재생성

복구 폴더에서 다음 명령을 실행한다. `runs/dry-room-replay`는 새 경로여야 한다.

```sh
cd main/ppaji
npm ci
npm run build
npm test -- src/assets/npc-source.test.ts src/render/npc-density.test.ts src/render/npc-motion.test.ts src/assets/watercraft.test.ts src/render/terrain-layers.test.ts
cd ../..

python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-render.txt
mkdir -p runs/dry-room-replay
cp -R skills/ppaji-assets/assets/facility-seed runs/dry-room-replay/recipe
.venv/bin/python runs/dry-room-replay/recipe/render.py runs/dry-room-replay/recipe/surface-spec.json --out runs/dry-room-replay/candidate
```

원본을 재생성한 경우 `provenance.json`의 디코딩 RGBA 해시와 d0–d3를 비교한다. 새 후보는 기준 레시피를 복사해서 수정하고 원본 해시·실패 근거를 보존한다. 렌더 성공과 미술적 승인, 실게임 적용은 각각 확인한다.

## 종류별 제작 참고

아래 경로는 복구한 `skills/ppaji-assets/` 기준이다.

| 작업 | 먼저 읽기 | 유지할 계약 |
| --- | --- | --- |
| 건물·매점·의자·고정 시설 | `references/facilities.md` | 공통 조립 구조 전체를 d0–d3로 회전. 캔버스·풋프린트·앵커·density4 유지. 방향별 밀기·휘기 금지 |
| 보트·견인기구 | `references/watercraft.md` | h00–h15, 22.5도 간격. 좌석·깊이·수면 기준을 함께 회전. 보이는 WebP와 native PNG/depth 등록을 함께 확인 |
| NPC 성별·옷·머리·포즈 | `references/npc.md` | 원래 2D 파츠와 보호 픽셀, 정확한 팔레트 조합. 기존64px 파츠→160물리px/density4→40논리px 계약 확인 |
| 땅·줄눈·재질 경계·물 | `references/terrain.md` | 월드 격자 정합, 재질+틴트 경계, 해안 모서리, 데크 중복 숨김·복귀, 실제 물 애니메이션 |
| 실제 적용 위치 찾기 | `references/project.md` | 최신 게임 provider/manifest를 우선 확인 |
| 검수·게임 채택·독립 시험 | `references/review.md` | 원본/후보/격자/실게임을 같은 스케일로 연속 비교. 미측정은 통과로 세지 않음 |

시설의 색감·질감·아기자기한 비율과 둥근 명암은 승인 레시피를 따른다. 전체 RGB를 축소 후 확대해서 도트화하지 않고 선과 외곽 커버리지의 격자만 관리한다. 붕어빵 d1 원본 유지와 기존 코인라커·탈의실 승인본 예외를 보존한다. 이동기구16방향과 NPC4방향은 서로 다른 계약이다.

과거 시설군은 `workspace/assets/generated/kairo-v4-simple-pilot/`의 `dry-rental-line-20261002`, `indoor-shop-line-20261003`, `cafe-shop-batch-20261003`, `water-curves-batch-20261003`, `water-playground-batch-20261003` 등을 찾는다. 옛 `build.py`에는 절대 경로·다른 실험 의존·검토 상태 초기화가 있으므로 새 작업 폴더에 복사하고 입출력을 검토한 후 실행한다. 모든 구형 스크립트가 수정 없이 실행된다는 보장은 아니다.

## 새 세션에 전달할 요청 예시

> 이 문서와 복구된 skills/ppaji-assets/SKILL.md를 읽고 에셋 제작을 재개해줘. 복구 영수증과 현재 게임 provider부터 확인해줘. [대상 ID]의 승인 원본과 가장 가까운 레시피를 찾아 새 runs 폴더에서 수정하고, 색·질감·비율을 유지해줘. 시설은 d0–d3, 이동기구는16방향과 좌석/depth, NPC는 필요한 포즈와 옷 조합을 검증해줘. 원본→후보→격자→실제 맵을 연속 보고서로 보여주고, 검증 범위·미측정·적용 여부를 구분해줘. 이번 요청의 게임 적용 범위는 [후보 시험만 / 검수 후 메인 적용]이야.

## 실제로 확인한 범위

2026-10-23에 새 경로로 일반 파일19,336개를 복구·해시 검증했고 링크4,998개를 분류했다. 게임 빌드와 관련 테스트18개가 통과했다. 독립 작업자는 복구 자료만으로 드라이룸4방향을 재생성해 RGBA 해시4/4 일치와 작은 명암 후보를 확인했다. 손상 압축·누락 방향·비평면 형상·변조 텍스처 거부도 확인했다. 스킬 압축본은 iCloud 다운로드 제거 후 다시 받아 SHA를 확인했다.

이는 임의의 새 형상을 자동 복원하거나 모든 기구×NPC 접점을 인증한 결과가 아니다. 이번 독립 시험의 직선 정량 검사는 미측정이다. 상세 근거는 패키지의 `RESTORE-TEST.md`와 `verification/independent-blackbox/HANDOFF.md`에 있다.

## Mac에서 공간만 비우기

1. 패키지 전체의 업로드 완료와 최신 원본 포함 여부를 확인한다.
2. 캐시·빌드 출력은 실행 중인 검토 서버의 의존 여부를 확인하고 정리한다.
3. 원본 백업과 패키지의 파일별 SHA가 일치하고 누락이 없을 때 중복 백업을 정리한다.
4. 워크트리 제거는 Orca에서 해당 워크트리와 서버를 확인한 뒤 수행한다. 메인 저장소의 `.git`을 함께 지우지 않는다.
5. iCloud 폴더는 **삭제하지 않고 ‘다운로드 제거’**로 로컬 사본만 비운다. 패키지 자체를 휴지통으로 보내면 보관 목적을 달성할 수 없다.

예전 Tailscale `100.x` URL은 당시 서버 주소다. 복구 후 서버를 새로 열어야 하며 옛 주소가 계속 작동한다고 가정하지 않는다. 이 Mac의 Desktop 경로는 iCloud 동기화 과정에서 이동했으므로 하드코딩된 옛 절대 경로보다 실제 복구 경로를 사용한다.
