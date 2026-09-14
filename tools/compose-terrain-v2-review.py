#!/usr/bin/env python3
"""컨셉 시도와 같은 좌표의 실제 런타임을 한 장에 묶는다."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PILOT = ROOT / "artifacts/asset-concept-sheets/terrain-v2-pilot"
OUT = PILOT / "terrain-v2-concept-to-runtime-review.png"
DETAIL_OUT = PILOT / "terrain-v2-b-vs-runtime-detail.png"
CALIBRATION_OUT = PILOT / "terrain-v2-imagegen-calibration-review.png"
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
PANEL_W, PANEL_H = 920, 560
HEADER = 68


def panel(path: Path, title: str, subtitle: str) -> Image.Image:
    image = Image.open(path).convert("RGB")
    fitted = ImageOps.fit(image, (PANEL_W, PANEL_H), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    card = Image.new("RGB", (PANEL_W, PANEL_H + HEADER), "#17242B")
    card.paste(fitted, (0, HEADER))
    draw = ImageDraw.Draw(card)
    title_font = ImageFont.truetype(FONT, 26)
    sub_font = ImageFont.truetype(FONT, 17)
    draw.text((20, 9), title, font=title_font, fill="#FFFFFF")
    draw.text((20, 40), subtitle, font=sub_font, fill="#A9C2CA")
    return card


def main() -> None:
    cards = [
        panel(PILOT / "attempt-a-diagnostic.png", "A · ImageGen 진단 시트", "재료·물결·해안·높이 문법"),
        panel(PILOT / "attempt-b-map-target.png", "B · ImageGen 실제 맵 목표", "현재 시각 정본 · 직접 크롭 금지"),
        panel(PILOT / "runtime-map/c-baseline.png", "C · 기존 HD 런타임", "같은 좌표 · 기존 지면"),
        panel(PILOT / "runtime-map/c-terrain-v2.png", "D8 · terrain-v2 런타임 후보", "같은 좌표 · 64×32 · REVIEW ONLY"),
    ]
    gap = 24
    canvas = Image.new(
        "RGB",
        (PANEL_W * 2 + gap * 3, (PANEL_H + HEADER) * 2 + gap * 3),
        "#0D171C",
    )
    for index, card in enumerate(cards):
        x = gap + (index % 2) * (PANEL_W + gap)
        y = gap + (index // 2) * (PANEL_H + HEADER + gap)
        canvas.paste(card, (x, y))
    canvas.save(OUT, optimize=True)
    detail = Image.new("RGB", (PANEL_W * 2 + gap * 3, PANEL_H + HEADER + gap * 2), "#0D171C")
    for index, card in enumerate(
        [
            panel(PILOT / "attempt-b-map-target.png", "B · 목표", "시각 정본 · ImageGen concept only"),
            panel(PILOT / "runtime-map/c-terrain-v2.png", "D8 · 실제 런타임", "같은 32×16 논리 타일 · 높이 16 · density 2"),
        ]
    ):
        detail.paste(card, (gap + index * (PANEL_W + gap), gap))
    detail.save(DETAIL_OUT, optimize=True)

    calibration_cards = [
        panel(PILOT / "attempt-b-map-target.png", "B · 원래 목표", "ImageGen 시각 정본"),
        panel(
            PILOT / "imagegen-calibration/attempt-c-runtime-paintover.png",
            "C · ImageGen 제약 페인트오버",
            "색·재료·질감 밀도만 참고 · geometry authority 아님",
        ),
        panel(PILOT / "history/r4-d4/c-terrain-v2-d4.png", "D4 · 이전 런타임", "3변형 · 평평한 물/잔디"),
        panel(PILOT / "runtime-map/c-terrain-v2.png", "D8 · 최신 런타임", "6변형 · 굴곡 포말/넓은 물결 띠"),
    ]
    calibration = Image.new(
        "RGB",
        (PANEL_W * 2 + gap * 3, (PANEL_H + HEADER) * 2 + gap * 3),
        "#0D171C",
    )
    for index, card in enumerate(calibration_cards):
        x = gap + (index % 2) * (PANEL_W + gap)
        y = gap + (index // 2) * (PANEL_H + HEADER + gap)
        calibration.paste(card, (x, y))
    calibration.save(CALIBRATION_OUT, optimize=True)
    print(f"{OUT}\n{DETAIL_OUT}\n{CALIBRATION_OUT}")


if __name__ == "__main__":
    main()
