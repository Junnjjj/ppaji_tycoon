# 에셋 산출물 색인 (2026-08-17 컴팩 시점)

`assets/generated/sprites/` 런 폴더 **105개**.

## ⚠ 폐기 예정 — yaw20 규격

카이로 전환(yaw45/elev30)으로 규격이 바뀌어 다시 뽑아야 한다. 11개:

`y20-cafe`, `y20-changing`, `y20-gate`, `y20-pool`, `y20-restroom`, `y20-shade`, `y20-shop`, `y20-shower`, `y20-slide`, `y20-tent`, `y20-trampoline`

## 살아남는 것

- `art-reference/guides/diamond-*.png` — 바닥 다이아몬드 가이드. **생성기가 yaw 로 매개화됨** (`tools/make-diamond-guide.py`)
- `tools/quantize-fixed-palette.py` — 39색 hue-버킷 양자화 (v4)
- `tools/make-backdrop-map.py` — 배경 맵 타입별 굽기
- `prototype-3d/tools/skillcheck.mjs` — 정합성 9종 (폭 검사 포함)
- `assets/generated/yaw20-spec.json` — 규격 데이터 (숫자만 갈아끼우면 재사용)

## 이전 세대 (스타일 참고용으로 보존)

- **건물 18종 f0/f1** 36개
- **수상 기구** 10개
- **데크·소품** 17개
- **코스 장비 정박** 19개
