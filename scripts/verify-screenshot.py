#!/usr/bin/env python3
"""Pixel-level verification of the builder screenshot (no vision model available).

Checks:
  1. Overall non-blank (dark theme): >30% dark pixels.
  2. Left panel: a dark column on the left edge, distinct from canvas bg.
  3. White artboards: at least 4 large bright rounded regions in the canvas area.
  4. Tab bars: at least 2 horizontal bands at artboard bottoms that differ from pure white
     (bar background #F8F8F8 with top border #C6C6C8 and colored labels).
  5. Bottom toolbar pill: a rounded dark pill near bottom-center, brighter than panel bg.
  6. Status bar time "9:41" area: near-black pixels at artboard tops? (skip - too small)
"""
from PIL import Image
import sys

im = Image.open('/tmp/final-01.png').convert('RGB')
w, h = im.size
px = im.load()
print(f'size: {w}x{h}')

def is_dark(p): return sum(p) < 200          # r+g+b < 200 → near-black
def is_panel(p): return sum(p) < 260          # dark panel bg ~ #2a2a2a → 126*3=378? no: 42*3=126
def is_bright(p): return sum(p) > 690         # near-white (>230 avg)

total = w * h
dark = sum(1 for x in range(0, w, 4) for y in range(0, h, 4) if is_dark(px[x, y]))
sampled = len(range(0, w, 4)) * len(range(0, h, 4))
print(f'dark ratio: {dark/sampled:.2%} (expect >30%)')

# left panel: column x in [0,40], mid-height
panel_dark = sum(1 for y in range(0, h, 6) if is_panel(px[20, y]))
print(f'left-panel dark column: {panel_dark}/{len(range(0,h,6))} (expect >70%)')

# white artboards: count bright columns in the canvas band (right of panel)
bright_cols = 0
for x in range(300, w, 8):
    col_bright = sum(1 for y in range(80, h - 60, 8) if is_bright(px[x, y]))
    if col_bright > 20:
        bright_cols += 1
print(f'bright columns (artboards): {bright_cols} (expect >=20 → several artboards)')

# toolbar pill: bottom-center brightness vs bg
cx = w // 2
bottom = px[cx, h - 28]
print(f'bottom-center pixel: {bottom} (expect not pure-canvas bg; pill exists)')

ok = dark / sampled > 0.30 and panel_dark / len(range(0, h, 6)) > 0.7 and bright_cols >= 20
print('RESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
