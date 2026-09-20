# 안전 망루 승인 에셋 메인 적용 — 2026-09-20

사용자 승인 후 watchtower-v1의 네 native PNG를 메인 ppaji/에 적용.
- watchtower 1×1, 저장·정원·비용·guardRadius·안전도 로직 유지.
- 건설 카드/ghost/설치 외형은 approved provider 사용. renderOnly=true.
- source facility.blend SHA 및 독립 재열기 QA와4프레임 hash 검증 후 복사.
- 11개 관련 검사 및 TypeScript/Vite 빌드 통과. 5189 실제 로딩4프레임192×192, 건설카드 표시, 지원 방향0/1ghost scale1 확인.
- 4방향 이미지가 있어도 현행 게임의 정사각형 회전 제한은 그대로.
- 고정 안전요원 앵커/가림 데이터는 이 디렉터리에 인계만 함. production 직원 스프라이트와 사다리 모션은 미연결. 후보 시연62124에서는 고정 직원이 보임.
- 재적용: python3 tools/assets/adopt-watchtower.py /path/to/asset-worktree
- 원본 QA 선분 투영 d2 FAIL/d3 WARN 이력은 provenance에 보존. 전체 자동 시각 검증 통과로 보지 않음.
