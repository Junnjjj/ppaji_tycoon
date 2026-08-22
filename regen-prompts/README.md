# 붙여넣을 프롬프트 56장

`npx tsx tools/regen-facility.ts --all --dry-run --print` 로 뽑은 것이다.
**한 파일 = 한 시설.** 각 파일의 3번째 줄이 **첨부할 이미지 목록(순서대로)** 이고,
`────` 사이가 **그대로 복사해 붙일 프롬프트**다.

## 쓰는 법 (이미지 생성이 되는 세션에서)

1. `<id>.txt` 를 연다
2. 3번째 줄의 이미지 3장을 **그 순서대로** 첨부한다 — **첫 장이 발자국 가이드**여야 한다
   (프롬프트 본문이 "Reference images, in the order attached: 1. THE FOOTPRINT GUIDE" 로
   번호를 가리킨다)
3. `────` 사이를 복사해 붙인다
4. 나온 그림을 `assets/generated/kairo-regen/<id>.png` 로 저장한다

## 그다음 (이 저장소에서)

```bash
npx tsx tools/kairo-gate.ts --geom | grep <id>     # 통과했나
```
통과했으면 `assets/generated/kairo/facility__<id>.png` 로 옮기고 `npm run bake:atlas`.

⚠ **통과 못 했으면 그 파일을 다시 뽑아라** — 게이트가 낸 실측(꼭짓점 몇 텍셀·IoU 얼마)을
프롬프트의 `WHAT WENT WRONG LAST TIME` 절에 넣으면 같은 실수를 덜 반복한다.
`tools/regen-facility.ts` 가 자동으로 그렇게 한다 (`image_gen` 권한이 있는 환경이면
`npx tsx tools/regen-facility.ts --all --tries 3` 한 줄로 전부 자동이다).

## 우선순위

`docs/asset-regen-order.md` 를 보라 — 심각 17종이 먼저고, 그중 **축뒤집힘 11종**은
발자국 두 축이 바뀐 그림이다 (프롬프트가 이미 그것을 지목한다).
⚠ **가이드를 뒤집지 마라** — 가이드는 엔진 정본에서 파생돼 옳다.
