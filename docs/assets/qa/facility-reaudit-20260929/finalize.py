from pathlib import Path
import json,html
b=Path(__file__).resolve().parent;a=json.loads((b/'results.json').read_text());old=json.load(open(b.parent/'facility-corrections-20260927/work-items.json'))['items'];prior={x['id']:x.get('unresolvedDirections',[]) for x in old}
notes={
'rental_tube':'D1 옷걸이/본체의 세로 범위가 원본보다 약20% 작다. D0 폭도 약11% 작다. 방향별 비율 검토 필요.',
'authored_bbq_zone':'D1/D3 테이블·벤치 조합의 가로 범위가 약13%/22% 작다. D3 긴 상판과 벤치 비율이 줄어 보인다.',
'sikhye':'D2 용기 높이와 전체 세로 범위가 원본보다 약13% 작다. 트레이 위치 수정과 별개인 치수 검토 항목.',
'dry_room':'D1 가로 범위 약11% 증가. 기존 registration 조정과 실제 거울/카운터 간격을 구별해야 하므로 확정 오류 아님.',
'stage_river_lv3':'D1 가로 범위 약12.5% 축소. 지붕·무대·관객석의 상대 배치 및 기존 각도 문제 함께 검토.',
'playground':'D1 가로 범위 약11% 축소. 활주면 길이/상부 난간 관계 검토.',
'bungee_jump':'D2 가로 범위 약16% 축소. 타워와 별도 착지 블록을 분리 측정해야 하므로 전체 폭을 타워 폭으로 단정하지 않음.',
'ppaji_slide':'FAIL_USER_VISUAL_REJECTION. 고해상도 물리 렌더 대비 D0 폭 -23.1%, D2 폭 -8.1%, D3 높이 -5.7%. D1 외곽 근접만으로 내부 구조/접점 PASS 불가. 기존 fit 공식으로 D0 폭비0.7682 재현.',
'rig_blob':'D2/D3 상부 타워/난간의 높이 범위 축소. 타워와 튜브를 각각 대조해야 함.',
'rig_jump_tower':'D0 포함 네 방향의 상부 높이가 원본보다 낮음. 계단·난간 수/높이와 바닥 두께를 분리 검토.',
'diving':'D1 데크 포함 가로 범위 약11% 축소. 난간/계단과 바닥 접점 검토.',
'module_rig_seesaw':'D0/D1 가로 범위 약11% 축소. D1–D3 기존 방향 잔여 문제도 유지. 패드는 원본3개가 기준.',
'module_rig_mini_slide':'D1 폭 약11% 축소, D3 높이 약10% 축소. 계단/후면 연결과 기존 D3 잔여 문제 유지.',
'module_rig_slidedock':'D0/D1/D3 폭 약11%/14%/10% 축소. 기존 fit 공식에서 동일 축소 재현. 슬롯/진입 데크와 활주면 연결 위치 재검토 필요.',
'module_rig_led_buoy':'네 방향 데크 폭 약14–16% 축소. 기존 생성본 fit 과정에서도 축소 재현. 원본 대비 반복 타일 간격/접속 폭 문제.',
'module_rig_sunbed':'D1 외곽 높이 약13% 증가. 기존 방향 교정으로 바뀐 등받이/발판 실루엣을 분리해야 하며 자동 불합격으로 단정하지 않음.',
'watchtower':'전체 높이 약8–11% 감소. 기존 사다리/구명환 방향 교정과 별개로 상부 난간·기둥 비율 검토.',
'env_car':'D0/D3가 원본 후면 형태를 재현하지 못하는 기존 미해결 유지. 크기 범위가 비슷해도 의미상 방향 불일치가 남는 사례.'}
for r in a['rows']:
 r['visualComparisonReviewed']=True;r['evidenceBoard']=f"board-{(r['auditNo']-1)//4+1:02}.jpg";r['priorUnresolvedDirections']=prior.get(r['id'],[])
 r['reviewNote']=notes.get(r['id'],'네 방향 비교판 확인. 수치 범위 내라는 이유로 부품·각도·접점 통과를 선언하지 않음. 기존 잔여 문제는 별도 유지.')
 if r['id'].startswith(('env_wood_fence','env_stone_wall','env_hedge','env_water_rail')):r['reviewNote']='새 기둥 두께·벽 마감·식재/기단 디자인 때문에 레거시 외곽과 차이가 크다. 이 수치를 그대로 축소 오류로 판정하지 않음. 이웃 조각의 실제 연결점 검증은 별도로 필요.'
 if r['id'] in ['env_village_house','env_village_shop','env_pension','env_small_hotel','env_convenience_store','env_maintenance_shed']:r['reviewNote']='후면 창문 등 기존 승인 디자인 변경이 존재하므로 원본과 부품 차이 자체를 새 오류로 세지 않음. 기존 미해결 국소 각도는 유지.'
a['summary']={'facilities':100,'frames':400,'visualBoardsReviewed':25,'metricFlagFacilities':72,'metricFlagFrames':175,'metricFlagMeaning':'screening only, NOT 175 confirmed defects','priorityReviewFacilities':len(notes),'fullPhysicalCertification':False,'liveAssetsChanged':False};(b/'results.json').write_text(json.dumps(a,ensure_ascii=False,indent=2))
text='''# 전체 시설 재검수 — 2026-09-29

100종 × D0–D3 = 400프레임을 현재 MAIN 파일에서 읽어 기준 원본과 대조했다. 25개 비교판의 전체 네 방향을 육안으로 재확인했다. 이전의 “모두 조사했다”는 설명은 모든 시설이 물리적으로 맞는다는 의미가 아니었으며, 외곽 크기와 원본 부품 대응을 충분히 검증하지 못했다.

## 결과 범위

- 400프레임 모두 같은 논리 캔버스/투명 여백으로 정렬. 독립 bbox 맞춤이나 가로·세로 늘리기를 하지 않았다.
- 폭/높이 5% 초과 차이 또는 중심/하단 2 논리px 초과 차이: **72종175방향의 추가 검토 신호**. 확정 오류175개라는 뜻이 아니다. 192px 등 저해상도 원본의 외곽 양자화, 기존 승인 디자인 차이도 포함한다.
- 100종 모두 네 방향 비교판 확인. 수치가 범위 안인 나머지28종도 물리/부품/접점 PASS로 세지 않았다.
- 접점은 현재 그림의 하단/중심과 배치 metadata 기준으로 검사했다. 발·기둥·활주면별 실제 NPC 접촉 및 전체 타일 연결 시험까지 완료한 것은 아니다.
- 메인 파일은 변경하지 않았다. 이번 작업은 재검수이며 기존 시도 한도를 넘긴 추가 생성도 하지 않았다.

## 141 원인 확인

고해상도 물리 가이드와 비교: D0 폭540/702px, D1 폭429/430px·높이504/507px, D2 폭646/703px, D3 높이346/367px. D1 외곽 근접은 내부 구조 검증 통과가 아니다.

기존 `style-imagegen-redo/art.mjs`의 fit은 생성 그림을 원본 외곽 안에 `min(원본폭/생성폭, 원본높이/생성높이)`로 균일 축소하고 하단·가로중앙을 맞춘다. 생성 그림의 종횡비가 다르면 한 축만 맞고 다른 축은 작아진다. 원본 시트를 계산한 결과 D0 폭비0.7682, D2 폭비0.9180, D3 높이비0.9455로 현재 현상이 재현된다. **렌더러가 비균일하게 찌그러뜨렸다는 뜻은 아니다. 생성 단계의 형태 차이를 fit 검사가 거르지 못한 것이다.** 164/169도 같은 경로에서 축소 재현. `packing-diagnostic.json` 참조.

## 우선 재검수 목록

'''
for r in a['rows']:
 if r['id'] in notes:text+=f"- **{r['reviewNo']} {r['name']}** — {notes[r['id']]}\n"
text+='''
## 오탐을 구별한 항목

129–140 연결 울타리·돌담·생울타리는 새 단면/기단/기둥 디자인이 외곽 비율을 바꾼다. 단순히 원본 bbox와 다르다고 전부 오류로 세지 않았다. 조경 건물의 후면 창문도 기존 승인된 디자인 차이와 구분했다. 다만 연결점의 정확한 일치까지 검증 완료한 것은 아니다.

재생성 전에 한 물리 모델의 네 방향과 타일/연결 기준을 고정해야 한다. 그림을 가로로 늘리거나 바닥점을 옮겨 외곽만 맞추는 방식은 내부 부품 이동을 해결하지 못한다.

전체 상세: results.json. 비교판: board-01.jpg ~ board-25.jpg (위=기준 원본, 아래=현재 MAIN, 각 열 D0–D3). 밝은 바탕 위 같은 스케일과 같은 crop으로 대조.
''';(b/'README.md').write_text(text)
h='<!doctype html><meta charset="utf-8"><title>시설 전체 재검수</title><style>body{font:16px system-ui;background:#edf1ed;margin:30px}img{width:100%;max-width:1280px}article{margin:30px 0}p{max-width:1000px;line-height:1.7}</style><h1>시설100종 · 네 방향 재검수</h1><p>위: 기준 원본 / 아래: 현재 메인. 크기 차이는 검토 신호이며 자동 오류 판정이 아닙니다. 141번은 19번 비교판에 있습니다.</p><p><a href="README.md">상세 판정</a> · <a href="results.json">400프레임 기록</a></p>'
for n in range(1,26):h+=f'<article id="b{n}"><h2>비교판 {n}</h2><img loading="lazy" src="board-{n:02}.jpg"></article>'
(b/'index.html').write_text(h)
v=b.parent/'facility-corrections-20260927/visual-review.json';j=json.loads(v.read_text());j['latestUserReinspection']={'date':'2026-09-29','status':'FAIL_USER_VISUAL_REJECTION','namedExample':'141 ppaji_slide','scope':'100 facilities re-screened; historical applied counts are not current geometry approval','report':'../facility-reaudit-20260929/README.md'};v.write_text(json.dumps(j,ensure_ascii=False,indent=2))
print(a['summary'])
