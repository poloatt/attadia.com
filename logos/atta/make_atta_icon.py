"""Generate ATTA app icon: black glyph + black ring on transparent background.

The ring is vector in the SVG. The PNG is supersampled with an antialiased
ring so it stays smooth when scaled up.
"""

from __future__ import annotations

import base64
import io
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
WHITE_SVG = HERE / "atta-icon.svg"
GLYPH_SRC = Path(
    r"C:\Users\polo\.cursor\projects\c-Users-polo-projects-attadia-com\assets"
    r"\c__Users_polo_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images"
    r"_ATTA_logo2-3770573e-6d23-4413-9ecd-74ae65c44a72.png"
)

SIZE = 512
# Render PNG at higher res then downscale — keeps the ring smooth when zoomed
PNG_SCALE = 3
SIDE_TRIM = 0.04

OUT_SVG = HERE / "atta-icon-black.svg"
OUT_PNG = HERE / "atta-icon-black.png"
OUT_GLYPH = HERE / "atta-glyph-black.png"


def load_white_glyph_from_svg() -> Image.Image:
    text = WHITE_SVG.read_text(encoding="utf-8")
    m = re.search(r"data:image/png;base64,([A-Za-z0-9+/=]+)", text)
    if not m:
        raise SystemExit(f"No embedded PNG in {WHITE_SVG}")
    return Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert("RGBA")


def load_source() -> Image.Image:
    if WHITE_SVG.exists():
        print("source: embedded glyph in", WHITE_SVG.name)
        return load_white_glyph_from_svg()
    if GLYPH_SRC.exists():
        print("source:", GLYPH_SRC)
        return Image.open(GLYPH_SRC).convert("RGBA")
    raise SystemExit("No glyph source found")


def to_black_cropped(im: Image.Image) -> Image.Image:
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 10:
                px[x, y] = (0, 0, 0, a)
                found = True
                minx = min(minx, x)
                miny = min(miny, y)
                maxx = max(maxx, x)
                maxy = max(maxy, y)
            else:
                px[x, y] = (0, 0, 0, 0)
    if not found:
        raise SystemExit("Glyph has no opaque pixels")
    pad = 2
    return im.crop(
        (
            max(0, minx - pad),
            max(0, miny - pad),
            min(w, maxx + 1 + pad),
            min(h, maxy + 1 + pad),
        )
    )


def trim_sides(im: Image.Image, fraction: float) -> Image.Image:
    w, h = im.size
    cut = int(round(w * fraction))
    if cut * 2 >= w - 8:
        return im
    return im.crop((cut, 0, w - cut, h))


def tip_points(im: Image.Image) -> tuple[tuple[float, float], tuple[float, float]]:
    px = im.load()
    w, h = im.size
    left = (w, 0.0)
    right = (-1.0, 0.0)
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 80:
                if x < left[0]:
                    left = (x, y)
                if x > right[0]:
                    right = (x, y)
    if right[0] < 0:
        raise SystemExit("No tip pixels found")
    return (left[0] + 0.5, left[1] + 0.5), (right[0] + 0.5, right[1] + 0.5)


def measure_stroke(im: Image.Image) -> float:
    """Median opaque run length across horizontal samples (glyph stroke width)."""
    px = im.load()
    w, h = im.size
    runs: list[int] = []
    for y in range(h // 5, (4 * h) // 5, max(1, h // 40)):
        x = 0
        while x < w:
            if px[x, y][3] > 80:
                j = x
                while j < w and px[j, y][3] > 80:
                    j += 1
                length = j - x
                # Ignore huge filled spans; keep stroke-like runs
                if 2 <= length <= max(8, w // 8):
                    runs.append(length)
                x = j
            else:
                x += 1
    if not runs:
        return 12.0
    runs.sort()
    return float(runs[len(runs) // 2])


def fit_params(
    glyph: Image.Image, ring_r: float, ring_stroke: float, size: int
) -> tuple[float, float, float, float, float]:
    """Return scale, x, y, nw, nh so tips land on inner ring edge."""
    gw, gh = glyph.size
    (lx, ly), (rx, ry) = tip_points(glyph)
    inner_r = ring_r - ring_stroke / 2

    def radial_unit(x: float, y: float) -> float:
        dx = x - gw / 2
        dy = y - gh / 2
        return math.hypot(dx, dy)

    unit = max(radial_unit(lx, ly), radial_unit(rx, ry))
    scale = inner_r / unit
    nw = max(1, int(round(gw * scale)))
    nh = max(1, int(round(gh * scale)))
    scale = min(nw / gw, nh / gh)
    nw = max(1, int(round(gw * scale)))
    nh = max(1, int(round(gh * scale)))
    x = (size - nw) / 2
    y = (size - nh) / 2
    return scale, x, y, float(nw), float(nh)


def draw_ring_aa(canvas: Image.Image, cx: float, cy: float, ring_r: float, stroke: float) -> None:
    """Antialiased ring via mask + supersampled ellipse (smooth when scaled)."""
    w, h = canvas.size
    r_out = ring_r + stroke / 2
    r_in = ring_r - stroke / 2
    # Draw at 2x within this canvas's coordinate space for extra AA, then paste
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        [cx - r_out, cy - r_out, cx + r_out, cy + r_out],
        fill=255,
    )
    draw.ellipse(
        [cx - r_in, cy - r_in, cx + r_in, cy + r_in],
        fill=0,
    )
    # Soften hard ellipse edges slightly
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.6))
    ring = Image.new("RGBA", (w, h), (0, 0, 0, 255))
    ring.putalpha(mask)
    canvas.alpha_composite(ring)


def circular_clip(canvas: Image.Image, cx: float, cy: float, radius: float) -> None:
    w, h = canvas.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(radius=0.4))
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(canvas, (0, 0), mask)
    canvas.paste(out)


def png_b64(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def write_svg(
    glyph: Image.Image,
    x: float,
    y: float,
    w: float,
    h: float,
    ring_r: float,
    ring_stroke: float,
    inner_r: float,
) -> None:
    # Embed a higher-res glyph so the logo also scales cleaner in SVG
    hi = glyph.resize((glyph.size[0] * 2, glyph.size[1] * 2), Image.Resampling.LANCZOS)
    b64 = png_b64(hi)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">
  <defs>
    <clipPath id="inside-ring">
      <circle cx="256" cy="256" r="{inner_r}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#inside-ring)">
    <image href="data:image/png;base64,{b64}" x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" />
  </g>
  <circle cx="256" cy="256" r="{ring_r}" fill="none" stroke="#000000" stroke-width="{ring_stroke}" stroke-linecap="round"/>
</svg>
"""
    OUT_SVG.write_text(svg, encoding="utf-8")


def render_png(
    glyph: Image.Image,
    x: float,
    y: float,
    nw: float,
    nh: float,
    ring_r: float,
    ring_stroke: float,
    inner_r: float,
) -> Image.Image:
    """Supersample canvas so the ring stays crisp when the PNG is enlarged."""
    s = PNG_SCALE
    big = SIZE * s
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))

    placed = glyph.resize((int(round(nw * s)), int(round(nh * s))), Image.Resampling.LANCZOS)
    canvas.alpha_composite(placed, (int(round(x * s)), int(round(y * s))))

    cx = cy = big / 2
    circular_clip(canvas, cx, cy, inner_r * s)
    draw_ring_aa(canvas, cx, cy, ring_r * s, ring_stroke * s)
    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    raw = load_source()
    glyph = to_black_cropped(raw)
    glyph = trim_sides(glyph, SIDE_TRIM)
    glyph = to_black_cropped(glyph)

    # Provisional fit with stroke 16 to measure placed stroke, then match ring
    _, _, _, nw0, nh0 = fit_params(glyph, ring_r=148, ring_stroke=16, size=SIZE)
    probe = glyph.resize((int(nw0), int(nh0)), Image.Resampling.LANCZOS)
    stroke = measure_stroke(probe)
    ring_stroke = max(8, int(round(stroke)))
    ring_r = 148.0
    inner_r = ring_r - ring_stroke / 2

    # Optional: if glyph is clearly thinner than a clean ring, thicken slightly
    if stroke < ring_stroke - 1:
        mask = glyph.split()[-1]
        thick = mask.filter(ImageFilter.MaxFilter(3))
        out = Image.new("RGBA", glyph.size, (0, 0, 0, 0))
        out.putalpha(thick)
        # force RGB black under alpha
        px = out.load()
        for y in range(out.size[1]):
            for x in range(out.size[0]):
                a = px[x, y][3]
                px[x, y] = (0, 0, 0, a)
        glyph = to_black_cropped(out)
        probe = glyph.resize((int(nw0), int(nh0)), Image.Resampling.LANCZOS)
        stroke = measure_stroke(probe)
        ring_stroke = max(8, int(round(stroke)))
        inner_r = ring_r - ring_stroke / 2

    glyph.save(OUT_GLYPH, format="PNG", optimize=True)

    _, x, y, nw, nh = fit_params(glyph, ring_r, ring_stroke, SIZE)
    placed = glyph.resize((int(nw), int(nh)), Image.Resampling.LANCZOS)

    write_svg(placed, x, y, nw, nh, ring_r, ring_stroke, inner_r)
    png = render_png(glyph, x, y, nw, nh, ring_r, ring_stroke, inner_r)
    png.save(OUT_PNG, format="PNG", optimize=True)

    print(f"glyph stroke ~{stroke:.1f}px -> ring stroke {ring_stroke}")
    print(f"glyph {glyph.size} -> placed {int(nw)}x{int(nh)} at ({x:.1f},{y:.1f})")
    print(f"png supersample {PNG_SCALE}x with AA ring")
    print("wrote:", OUT_SVG)
    print("wrote:", OUT_PNG)
    print("wrote:", OUT_GLYPH)


if __name__ == "__main__":
    main()
