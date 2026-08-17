/**
 * 빌드 산출물 목록을 `dist/precache.json` 으로 뽑는다.
 *
 * ## 왜 필요한가 (실측)
 *
 * 서비스 워커의 `fetch` 핸들러로만 캐시하면 **첫 방문에는 아무것도 안 담긴다** — 그때는
 * 워커가 아직 페이지를 제어하지 않아서 요청이 워커를 안 거친다. 사용자가 한 번 보고
 * 닫았다가 오프라인으로 돌아오면 흰 화면이다 (검증에서 실제로 실패했다).
 *
 * 그래서 **설치 시점에 미리 담는다.** 파일 이름에 해시가 붙으므로 목록은 빌드가 끝난 뒤에야
 * 알 수 있다 — 그게 이 스크립트가 빌드 뒤에 붙는 이유다.
 */
import { readdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';

/** 오프라인 첫 화면에 필요 없는 것은 뺀다 — 캐시가 커지면 설치가 느려지고 실패도 늘어난다 */
const SKIP = [/\.map$/, /^selftest/, /precache\.json$/];

async function walk(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if ((await stat(full)).isDirectory()) out.push(...(await walk(full, rel)));
    else if (!SKIP.some((re) => re.test(rel))) out.push(`./${rel}`);
  }
  return out;
}

async function main(): Promise<void> {
  const files = (await walk(DIST)).sort();
  await writeFile(`${DIST}/precache.json`, JSON.stringify(files, null, 2));
  const big = files.filter((f) => /\.js$/.test(f)).length;
  console.log(`precache ${files.length}개 (js ${big}) → dist/precache.json`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
