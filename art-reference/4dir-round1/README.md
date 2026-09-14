# 4방향 1차 (2026-08-22) — **회전이 실측으로 확인된 3장만** 여기 있다

19종 × d1·d2·d3 을 목표로 118회 생성했고, 접지·광원·팔레트 게이트를 통과한 19장 중
**실제로 돌아 있는 것은 이 3장뿐**이었다. 진단은 `docs/assets/history/prompt-chain-4dir-retrospective.md` §0,
워커 원본 보고는 `docs/assets/history/4dir-round1-report.md`.

| 파일 | 기준 | 그대로 | 뒤집기 | 여유 |
|---|---|---|---|---|
| `facility__slide_large__d1.png` | d0 | 0.422 | 0.944 | **+0.522** |
| `facility__slide_small__d1.png` | d0 | 0.597 | 0.844 | **+0.247** |
| `facility__slide_tube__d3.png`  | d2 | 0.670 | 0.895 | **+0.225** |

재는 법:

```bash
npx tsx tools/rotation-check.ts --dir <이 폴더에 d0/d2 를 같이 둔 폴더>
```

⚠ **이 3장으로는 어느 시설도 네 장이 안 찬다.** `facings: 4` 는 네 장이 다 있을 때만
켠다 — 아니면 게이트 3(생성물 누락)이 **하드 실패**한다.

⚠ 나머지 원자료(후보 118장 · 시도별 실측 JSON · QA 시트 · `visual-rejected/` 5장)는
`assets/generated/kairo-4dir/` 에 있고 **그 경로는 gitignore 다** — 이 머신에만 있다.

⚠ 셋 다 **골조가 드러난 물체**다 (실루엣이 확실히 비대칭). 상자에 가까운 건물은 한 장도
안 돌았다 — 다음 판의 난이도는 시설 종류가 정한다.
