#!/usr/bin/env python3
"""Compose actual-map HD pilot screenshots into review boards."""

from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "artifacts/hd-pixel-mode-pilot-v1/runtime-map"
OUT = SRC / "review"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size, index=7 if bold else 2)
            except (OSError, IndexError):
                try:
                    return ImageFont.truetype(str(path), size=size)
                except OSError:
                    pass
    return ImageFont.load_default()


def comparison_board() -> Path:
    panels = [
        ("A", "기본 D=1 · 현재 배치", "1× 백버퍼 · 아이스크림 1×2 · 카페 2×3", "a-actual-map-s2.png"),
        ("B", "HD D=2 · 현재 배치", "2× 백버퍼 · 화면 크기는 A와 동일", "b-actual-map-s2.png"),
        ("C", "HD D=2 · 승인 배치", "2× 백버퍼 · 아이스크림 1×1 · 카페 2×2", "c-actual-map-s2.png"),
    ]
    crop = (400, 250, 1840, 1160)
    panel_w = crop[2] - crop[0]
    panel_h = crop[3] - crop[1]
    gap = 24
    header = 154
    footer = 82
    board = Image.new("RGB", (panel_w * 3 + gap * 4, header + panel_h + footer), "#151a1f")
    draw = ImageDraw.Draw(board)
    title_font = font(52, True)
    body_font = font(34, True)
    note_font = font(25)
    colors = ["#9aa4ae", "#53a7ff", "#ffb84d"]

    draw.text((gap, 18), "실제 맵 A/B/C — S=2 동일 카메라 비교", fill="white", font=title_font)
    draw.text(
        (gap, 84),
        "기본 경로는 유지하고, URL 검토 모드만 바꿔 같은 위치에 시설을 배치했습니다.",
        fill="#c9d0d8",
        font=note_font,
    )

    for index, (letter, label, note, filename) in enumerate(panels):
        x = gap + index * (panel_w + gap)
        image = Image.open(SRC / filename).convert("RGB").crop(crop)
        board.paste(image, (x, header))
        draw.rectangle((x, header, x + panel_w - 1, header + panel_h - 1), outline=colors[index], width=6)
        badge = (x + 18, header + 18, x + 86, header + 86)
        draw.rounded_rectangle(badge, radius=14, fill=colors[index])
        draw.text((x + 36, header + 20), letter, fill="#10151a", font=body_font)
        draw.text((x + 104, header + 22), label, fill="white", stroke_width=2, stroke_fill="#20252a", font=body_font)
        draw.text((x + 12, header + panel_h + 20), note, fill="#e5e9ee", font=note_font)

    path = OUT / "actual-map-abc-s2-comparison.png"
    board.save(path)
    return path


def direction_board() -> Path:
    source = Image.open(SRC / "c-approved-four-directions-actual-map-s2.png").convert("RGB")
    header = 154
    board = Image.new("RGB", (source.width, source.height + header), "#151a1f")
    board.paste(source, (0, header))
    draw = ImageDraw.Draw(board)
    draw.text((28, 18), "승인 배치 C — 실제 맵 4방향", fill="white", font=font(52, True))
    draw.text(
        (28, 86),
        "위 대각선: 아이스크림 d0 → d1 → d2 → d3   ·   아래 대각선: 카페 d0 → d1 → d2 → d3",
        fill="#d8dee5",
        font=font(28),
    )
    path = OUT / "actual-map-approved-four-directions-s2.png"
    board.save(path)
    return path


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    outputs = [comparison_board(), direction_board()]
    print("\n".join(str(path) for path in outputs))


if __name__ == "__main__":
    main()
