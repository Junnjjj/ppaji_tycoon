/// <reference types="vite/client" />

/*
 * Vite 가 주입하는 `import.meta.env` 타입.
 *
 * 서비스 워커를 **배포 빌드에서만** 등록하려면 `import.meta.env.PROD` 가 필요한데,
 * tsconfig 의 `types` 에 vite/client 가 없어 타입이 안 잡혔다. 이 파일 하나로 해결한다
 * (의존성을 늘리지 않는다 — vite 는 이미 있다).
 */
