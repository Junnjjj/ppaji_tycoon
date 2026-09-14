# 에셋 작업 브랜치의 로컬 자료 복구

시설 스킬 최적화·독립 시험 기록은 main의 6e62295에 반영됐다. `.agents/skills/ppaji-kairo-assets/`가 저장소에서 관리하는 실행 스킬이다. 이 반영은 main에 이미 채택된 시설/게임 상태를 과거 검토 맵으로 되돌리는 작업이 아니다.

검증 완료: 32,246파일, 원본 약7.88GB / 압축 약7.02GB. 압축 내 파일과 원본 SHA256 대조 통과.

Git에 포함되지 않은 생성 Blender/PNG, 전체 실험 자료, 미커밋 코드의 보존 위치:

`/Users/jangjunpyo/asset-worktree-backups/ppaji-assets-20260912-100929`

- `workspace.tar.gz`: 작업 파일 스냅샷. 생성 에셋/실험 결과와 미추적 파일 포함. `.git`, node_modules, dist, .vite, __pycache__는 제외.
- `files.json` 및 `verification.json`: 파일별 SHA256과 압축 내용/원본 비교 결과. verified=true를 확인한다.
- `branch.bundle`: 원래 작업 브랜치의 main 미포함 커밋. 최신 main 이력을 가진 저장소에서 원래 HEAD를 복구할 수 있다.
- `staged.patch`, `unstaged.patch`, `status.txt`, `head.txt`, `git-index`: 작업 당시 Git 변경 상태. 미커밋 자료는 main에 자동 채택하지 않았다.

복구할 때는 별도 빈 폴더에 압축을 풀고 필요한 모델/이미지/도구를 골라 사용한다. 전체 스냅샷이나 패치를 최신 main 위에 그대로 덮어쓰면 후속 게임 변경이 되돌아갈 수 있다. 전체 미완료 작업 재개는 head.txt의 커밋을 기준으로 별도 브랜치에서 복원한다. 의존성은 프로젝트 lockfile로 다시 설치한다.

이 백업은 같은 Mac의 로컬 파일이다. GitHub에서 clone만 한 다른 기기에는 생성 에셋이 없으므로 별도 전송이 필요하다. 문서 속 과거 worktree 절대경로는 출처 기록이며 복원 위치에 맞춰 바꿔 사용한다. 기존 Tailscale 비교 URL은 원래 워크트리의 서버에 의존하므로 정리 후에는 복원 경로에서 다시 제공해야 한다.
