# 구명조끼 대여소·드라이룸 메인 적용 — 2026-09-20

사용자 시연 승인 후 `ppaji/` 메인(5189)의 건설 카드·배치 미리보기·기존/신규 시설 외형에 적용했다.

- rental_tube: 구명조끼 대여소, 기존2×1 유지. 조끼3개·대여 카운터·반납함.
- dry_room: 드라이룸, 기존2×1 유지. 거울2개·드라이기2개.
- 시설 정의/ID/해금/비용/정원/기존 저장은 변경하지 않음. 잠긴 드라이룸도 목록에 표시하되 기존 해금 조건 유지.
- `approved-facilities/manifest.json`에서 renderOnly=true. 승인된 native-d0..3 이미지8개 원본 픽셀 그대로, 앵커(96,107.75755076535926), 방향별 footprint/pivot 반영.
- 원본: 에셋만들기_v3/assets/generated/kairo-v4-simple-pilot/indoor-service-v1. 프레임 SHA 및 소스 QA는 public/assets/approved-facilities/indoor-service-provenance.json.
- 재반입: `python3 tools/assets/adopt-indoor-service.py /absolute/path/to/에셋만들기_v3`, 이후 ppaji에서 npm run build.

## 다른 시스템 세션에서 연결할 내용

각 ID 폴더의 interaction.json, depth/support-dN.bin, depth-metadata.json은 비활성 인계 자료다. 메인에서는 아직 신규 상호작용에 사용하지 않는다.

rental_tube에는 손님1명 시연 자리와 별도 staffAnchors.attendant 1자리가 있다. 직원은 (-.57,.22,0), heading=-π/2의 고정 idle. 손님 이용 정원을 직원이 차지하지 않게 한다. PNG에 직원은 포함되어 있지 않으며 **메인 직원 표시는 아직 미연결**이다. 기존 게임 capacity2는 그대로이고, 시연 손님 슬롯1개와의 대기/예약 연결은 시스템 작업이다.

dry_room은 서 있는 손님 자리2개. 실제 드라이기를 쥐거나 팔을 드는 전용 모션은 없고 idle로 이용 모습을 검토했다.

좌표는 중앙 원점 Blender XY 타일 단위; Game I=X,J=-Y. R(I,J)=(J,-I)로 회전 후 방향별 pivot을 더한다. NPC heading과 기물의 깊이 가림도 같은 회전을 따라야 한다. 메인 건설은 여전히 facing0/1 시스템이며 준비된4방향 이미지가 회전 시스템 변경을 뜻하지 않는다.

사무실·기념품과 앞서 제외한 시설은 계속 건설 목록에서 제외되어 있다. 기존 배치/정의는 보존한다.

검증: approved-facilities/build 관련10검사 및 production build(typecheck 포함) 통과. 실제 main5189 카드2종, d0..d3 로드, 현재지원2방향 placed/ghost 텍스처·좌표·앵커 일치, scale1 확인. 삭제 요청5종 건설목록 미노출 확인. browser-qa.json 및 main-catalog.png 참조.
