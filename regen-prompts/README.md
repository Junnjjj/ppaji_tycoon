# 넘길 것 — A군 8종 (접지 + 광원 둘 다)

`npx tsx tools/regen-facility.ts --id <id> --dry-run --print` 로 뽑았다 (2026-08-23).
**한 파일 = 한 시설.** 3번째 줄이 **첨부할 이미지(순서대로)**, `────` 사이가
**붙여넣을 프롬프트**다.

지시서 정본은 `docs/assets/maintenance/legacy-v2-regeneration.md`, 넘길 한 장은 **`_CODEX.md`** 다.

## 저장소에 접근되는 세션이면 — 한 줄

```bash
npx tsx tools/regen-facility.ts --severe --tries 3   # 심각 2종 먼저
npx tsx tools/regen-facility.ts --both --tries 3     # A군 8종 전부
```

조립·첨부·생성·후처리·**게이트 4·5 판정**·리롤이 전부 자동이다. 실패하면 게이트 실측을
다음 프롬프트에 넣어 다시 돌린다. 이 폴더는 그게 안 될 때만 쓴다.

## 손으로 할 때

1. `<id>.txt` 를 연다 (심각 2종부터: `airbounce` `jump_cushion`)
2. 3번째 줄의 이미지 **3~4장을 그 순서대로** 첨부 — **첫 장이 발자국 가이드**여야 한다
   (프롬프트가 `1. THE FOOTPRINT GUIDE` 로 번호를 가리킨다)
3. `────` 사이를 복사해 붙인다
4. 결과를 `assets/generated/kairo-regen/<id>.png` 로 저장

## ⚠ 이 파일들은 스냅샷이다

수치(꼭짓점 이탈·IoU·광원 점수)가 **뜬 시점의 것**이라, 한 장이라도 채택하면 거짓이 된다.
다시 뜨는 법:

```bash
rm -f regen-prompts/*.txt
for id in $(npx tsx tools/regen-facility.ts --both --dry-run | sed -n 's/^\[[0-9]*\/[0-9]*\] \([a-z_]*\) .*/\1/p'); do
  npx tsx tools/regen-facility.ts --id "$id" --dry-run --print > "regen-prompts/$id.txt"
done
```

`--both` 를 `--light-only`(C군) · `--geom-only`(B군) · `--all`(26종) 로 바꾸면 그 무리가 나온다.

## 돌려주면 이쪽에서

```bash
npx tsx tools/kairo-gate.ts --geom      # 접지
npx tsx tools/kairo-gate.ts --light     # 광원
npm run bake:atlas && npm run verify:kairo
```
