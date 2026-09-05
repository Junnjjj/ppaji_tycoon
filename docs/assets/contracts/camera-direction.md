# 빠지 타이쿤 에셋 카메라·방향 계약

최종 갱신 2026-08-26. 시설, 고정 수상기구, 이동형 수상기구가 게임 격자와 같은 방향을
말하기 위한 수치 정본이다.

코드 정본:

- 투영·Blender 카메라: `src/assets/kairo-render-contract.json`의 `projection`
- 화면 변환: `src/render/kairo/iso.ts`
- 물리 d0–d3 격자 회전: `src/kairo-facing.ts`
- 시설 슬롯·입출구 적용: `src/sim/kairo/placement.ts`
- 절차형 검증 스프라이트 적용: `src/assets/kairo-procedural.ts`
- Blender 독립 검산: `tools/verify-kairo-blender-camera.py`

## 게임 카메라

| 값 | 계약 |
|---|---:|
| 투영 | orthographic |
| 게임 지면 yaw | 45° — 카메라는 `+I/+J` 근측 코너에 있다 |
| optical-axis pitch | 수평선에서 아래로 30° |
| roll | 0° |
| 카메라 줌 | 1.0 |
| 타일 | 32×16 texels |
| `+I` 한 칸 | screen `(+16,+8)` |
| `+J` 한 칸 | screen `(−16,+8)` |
| 바닥선 | `±atan(0.5) = ±26.565051°` |
| 수직선 | 90° |

`pitch down 30°`와 Blender Euler X `60°`는 모순이 아니다. 전자는 광축이 수평선 아래로
향하는 각도이고, 후자는 기본 카메라가 local `−Z`를 바라보는 Blender의 객체 회전 표현이다.

## Blender 좌표와 카메라

게임 격자를 Blender 오른손 좌표계에 다음처럼 놓는다.

```text
game +I      = Blender +X
game +J      = Blender -Y
game height  = Blender +Z
```

`J=−Y`를 빼면 좌우나 회전 부호 중 하나가 반드시 뒤집힌다. `I=X, J=Y`로 놓고 카메라
45°/30°만 맞추는 방식은 게임의 두 화면 스텝을 동시에 재현할 수 없다.

타깃을 원점, 거리를 `R`이라고 할 때:

```text
camera location = target + R × ( 0.612372435696, -0.612372435696, 0.5 )
camera forward  =              (-0.612372435696,  0.612372435696,-0.5 )
camera right    =              ( 0.707106781187,  0.707106781187, 0   )
camera up       =              (-0.353553390593,  0.353553390593, 0.866025403784)
```

Blender 카메라 객체의 고정 회전:

```text
rotation_mode       XYZ
rotation_euler_deg  (60, 0, 45)
quaternion_wxyz     (0.800103145191, 0.461939766256,
                     0.191341716183, 0.331413574036)
```

카메라·타깃·roll·조명은 d0–d3에서 움직이지 않는다. 방향은 완전한 에셋 루트만 돌린다.

## 월드 단위와 캔버스

한 타일 변을 `22.627417 = 32/√2` Blender units로 모델링한다. 수직 논리 1texel은
`1.1547005 = 1/cos(30°)` Blender units로 모델링하면 화면에서 정확히 1texel 높이가 된다.

현재 시설 캔버스는 전부 가로형 또는 정사각형이다. pixel aspect 1:1에서 Blender
`camera.data.ortho_scale`을 출력 캔버스 폭 texels와 같게 두면 한 월드 단위가 한 화면
texel로 투영되고 타일 스텝이 정확히 정수로 떨어진다. 개별 방향에 맞춘 crop/fit/scale은
금지하며, 네 방향은 하나의 union canvas와 bottom-center 접점을 공유한다.

## 물리 d0–d3

canonical 랜드마크는 local `+J` 쪽에 있다고 정의한다. Blender 루트 pitch와 roll은 항상
0°이고 yaw만 바뀐다.

| 방향 | 게임 facing | root Euler XYZ | 로컬 타일 `(di,dj)` | `+J` 랜드마크 화면 | 일반 시설 앞 두 면 |
|---|---:|---|---|---|---|
| d0 | 0 | `(0,0,0)` | `(di,dj)` | 좌하 | `+I,+J` |
| d1 | 1 | `(0,0,90)` | `(dj,w−1−di)` | 우하 | `+I,−J` |
| d2 | 2 | `(0,0,180)` | `(w−1−di,d−1−dj)` | 우상 | `−I,−J` |
| d3 | 3 | `(0,0,270)` | `(d−1−dj,di)` | 좌상 | `−I,+J` |

`(dj,di)`는 determinant가 −1인 반사다. 발자국의 가로·세로 크기만 바꾸지만 같은 물체의
90° 회전은 아니다. 따라서 production d1로 사용할 수 없다.

## 2방향 레거시와 4방향 생산 경로

현재 라이브 시설은 모두 `facings` 미지정, 즉 2방향이다. 이미 저장된 `facing:1`은
`(dj,di)` 전치와 가로 거울을 뜻하므로 세이브 호환을 위해 유지한다.

새 시설이 사용자 승인된 d0–d3와 함께 `facings:4`를 선언할 때만 위 물리 quarter-turn
산수를 사용한다. 이 분리 덕분에 기존 세이브와 현재 단방향 팩은 바뀌지 않으면서, 새
4방향 에셋의 그림·발자국·슬롯 facing·ride 입출구가 한 루트 회전과 일치한다.

## 검증

```bash
blender --background --factory-startup \
  --python tools/verify-kairo-blender-camera.py

npx vitest run \
  src/assets/kairo-contract.test.ts \
  src/sim/kairo/facings.test.ts \
  src/sim/kairo/slots.test.ts \
  src/sim/kairo/ride.test.ts \
  src/sim/kairo/entry.test.ts
```

Blender 검사는 Euler/quaternion/basis, `+I/+J` 화면 스텝, 수직 1texel, d0–d3 랜드마크
사분면을 독립적으로 재계산한다. TypeScript 검사는 같은 수치가 게임 코드와 일치하는지,
물리 quarter-turn이 모든 슬롯·입출구에서 발자국을 벗어나지 않는지 확인한다.
