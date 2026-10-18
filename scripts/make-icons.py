#!/usr/bin/env python3
"""Draws the app's neon radar artwork and writes every icon and splash file.

Run it from anywhere after changing the design:

    python3 scripts/make-icons.py

It needs Python 3 and Pillow (pip install Pillow). It overwrites:

    assets/images/icon.png                     1024x1024, opaque (iOS fallback, Android legacy)
    assets/images/android-icon-foreground.png  512x512, radar inside the adaptive-icon safe zone
    assets/images/android-icon-background.png  512x512, solid #05070D
    assets/images/android-icon-monochrome.png  432x432, white on transparent (themed icons)
    assets/images/splash-icon.png              512x512, transparent (splash background is #05070D)
    assets/images/favicon.png                  48x48 (web)
    assets/expo.icon/Assets/radar.png          1024x1024 layers for the iOS liquid glass icon
    assets/expo.icon/Assets/blips.png
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / 'assets' / 'images'
ICON_ASSETS = ROOT / 'assets' / 'expo.icon' / 'Assets'

# Colours from src/constants/theme.ts (Neon palette).
BACKGROUND = (5, 7, 13)  # #05070D
CENTER_GLOW = (12, 24, 44)
CYAN = (0, 229, 255)  # #00E5FF
GREEN = (57, 255, 136)  # #39FF88
MAGENTA = (255, 61, 214)  # #FF3DD6
RED = (255, 77, 109)  # #FF4D6D, the "possible tracker" blip
WHITE = (255, 255, 255)

# Drawing happens at this multiple of the final size, then gets scaled down for smooth edges.
SUPERSAMPLE = 4

# Angles are in degrees, 0 = 3 o'clock, growing clockwise (Pillow's convention).
SWEEP_LEAD = -50  # leading edge of the sweep, about half past one
SWEEP_SPAN = 75  # how far the fading tail reaches behind it

# (angle, distance from centre as a fraction of the outer ring, dot radius as a fraction, colour, halo)
BLIPS = [
    (-62, 0.58, 0.085, GREEN, False),
    (150, 0.33, 0.065, GREEN, False),
    (112, 0.84, 0.07, MAGENTA, False),
    (205, 0.74, 0.06, MAGENTA, False),
    (28, 0.60, 0.095, RED, True),
]

# The favicon is tiny, so it gets fewer, bigger blips.
FAVICON_BLIPS = [
    (-62, 0.55, 0.15, GREEN, False),
    (140, 0.62, 0.13, MAGENTA, False),
    (30, 0.62, 0.17, RED, False),
]


def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def circle_box(cx, cy, r):
    return (cx - r, cy - r, cx + r, cy + r)


def new_layer(size):
    return Image.new('RGBA', (size, size), (0, 0, 0, 0))


def shrink(img, size):
    """Scales a supersampled layer down with premultiplied alpha, so edges keep their colour."""
    return img.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')


def add_glow(layer, radius, strength=1.0):
    """Puts a soft blurred copy of the layer underneath it."""
    blur = layer.convert('RGBa').filter(ImageFilter.GaussianBlur(radius)).convert('RGBA')
    if strength != 1.0:
        blur.putalpha(blur.getchannel('A').point(lambda v: min(255, round(v * strength))))
    out = new_layer(layer.size[0])
    out.alpha_composite(blur)
    out.alpha_composite(layer)
    return out


def tint(color, mono):
    return WHITE if mono else color


def draw_scope(size, radius, *, rings=(1.0, 0.68, 0.36), stroke=0.035, crosshair=True,
               disk=True, sweep_alpha=0.6, mono=False):
    """Rings, crosshair and sweep wedge, centred, on a transparent square of `size` pixels."""
    s = size * SUPERSAMPLE
    c = s / 2
    r = radius * SUPERSAMPLE
    width = max(1, round(stroke * r))
    cyan = tint(CYAN, mono)
    layer = new_layer(s)
    draw = ImageDraw.Draw(layer)

    if disk:
        # A faint screen behind the rings.
        draw.ellipse(circle_box(c, c, r), fill=cyan + (18,))

    if crosshair:
        line = max(1, round(width * 0.4))
        draw.line([(c - r, c), (c + r, c)], fill=cyan + (70,), width=line)
        draw.line([(c, c - r), (c, c + r)], fill=cyan + (70,), width=line)

    # Sweep wedge: thin pie slices that get brighter towards the leading edge.
    wedge = Image.new('L', (s, s), 0)
    wedge_draw = ImageDraw.Draw(wedge)
    steps = 90
    start = SWEEP_LEAD - SWEEP_SPAN
    for i in range(steps):
        a0 = start + SWEEP_SPAN * i / steps
        a1 = start + SWEEP_SPAN * (i + 1) / steps + 0.4  # small overlap hides seams
        t = (i + 1) / steps
        wedge_draw.pieslice(circle_box(c, c, r), a0, a1, fill=round(255 * sweep_alpha * t ** 1.6))
    sweep = Image.new('RGBA', (s, s), cyan + (0,))
    sweep.putalpha(wedge)
    layer.alpha_composite(sweep)

    # Bright leading edge of the sweep.
    draw = ImageDraw.Draw(layer)
    draw.line([(c, c), polar(c, c, r, SWEEP_LEAD)], fill=cyan + (255,), width=width)

    for ring in rings:
        rr = r * ring
        alpha = 255 if ring == rings[0] else 200
        draw.ellipse(circle_box(c, c, rr), outline=cyan + (alpha,), width=width)

    return shrink(layer, size)


def draw_blips(size, radius, blips=BLIPS, *, center=0.05, mono=False):
    """Signal dots (and the centre dot) on a transparent square of `size` pixels."""
    s = size * SUPERSAMPLE
    c = s / 2
    r = radius * SUPERSAMPLE
    layer = new_layer(s)
    draw = ImageDraw.Draw(layer)

    if center:
        draw.ellipse(circle_box(c, c, r * center), fill=tint(CYAN, mono) + (255,))

    for angle, dist, dot, color, halo in blips:
        x, y = polar(c, c, r * dist, angle)
        color = tint(color, mono)
        if halo:
            # A warning ring around the tracker blip.
            draw.ellipse(circle_box(x, y, r * dot * 1.9), outline=color + (170,),
                         width=max(1, round(r * 0.022)))
        draw.ellipse(circle_box(x, y, r * dot), fill=color + (255,))
        # A light core makes each blip read as glowing.
        if not mono:
            core = tuple(round(v + (255 - v) * 0.55) for v in color)
            draw.ellipse(circle_box(x, y, r * dot * 0.45), fill=core + (255,))

    return shrink(layer, size)


def background(size):
    """#05070D with a slightly lighter navy centre."""
    mask = Image.radial_gradient('L').resize((size, size), Image.BICUBIC)
    return Image.composite(Image.new('RGB', (size, size), BACKGROUND),
                           Image.new('RGB', (size, size), CENTER_GLOW), mask)


def radar(size, radius, *, glow=True, blips=BLIPS, scope=None, blip_glow=1.6, center=0.05, mono=False):
    """Full radar artwork (scope + blips) on transparent, optionally with neon glow."""
    scope_layer = draw_scope(size, radius, mono=mono, **(scope or {}))
    blip_layer = draw_blips(size, radius, blips, center=center, mono=mono)
    if glow:
        scope_layer = add_glow(scope_layer, radius * 0.035, 1.3)
        blip_layer = add_glow(blip_layer, radius * 0.06, blip_glow)
    out = new_layer(size)
    out.alpha_composite(scope_layer)
    out.alpha_composite(blip_layer)
    return out


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f'wrote {path.relative_to(ROOT)} {img.size[0]}x{img.size[1]} {img.mode}')


def main():
    # Main icon: opaque, because iOS rejects icons with transparency.
    icon = background(1024).convert('RGBA')
    icon.alpha_composite(radar(1024, 1024 * 0.39))
    save(icon.convert('RGB'), IMAGES / 'icon.png')

    # Android adaptive icon. The launcher crops the 108dp canvas to a shape, and only the
    # middle 66dp circle is always visible, so the radar stays inside radius 0.30 of the width.
    save(radar(512, 512 * 0.27), IMAGES / 'android-icon-foreground.png')
    save(Image.new('RGB', (512, 512), BACKGROUND), IMAGES / 'android-icon-background.png')

    # Themed (monochrome) icon: Android only uses the alpha, so it is flat white.
    mono = radar(432, 432 * 0.27, glow=False, mono=True, scope={'disk': False, 'sweep_alpha': 0.55})
    save(mono, IMAGES / 'android-icon-monochrome.png')

    # Splash: transparent, drawn on the #05070D splash background set in app.json.
    save(radar(512, 512 * 0.42), IMAGES / 'splash-icon.png')

    # Favicon: a dark rounded tile with a simplified radar, so it reads at 48px.
    fav_size = 48
    tile = new_layer(fav_size * SUPERSAMPLE)
    ImageDraw.Draw(tile).rounded_rectangle(
        (0, 0, tile.size[0] - 1, tile.size[1] - 1), radius=11 * SUPERSAMPLE, fill=BACKGROUND + (255,))
    favicon = shrink(tile, fav_size)
    favicon.alpha_composite(radar(
        fav_size, fav_size * 0.4, blips=FAVICON_BLIPS, blip_glow=1.2, center=0.1,
        scope={'rings': (1.0, 0.5), 'stroke': 0.09, 'crosshair': False, 'sweep_alpha': 0.7}))
    save(favicon, IMAGES / 'favicon.png')

    # iOS liquid glass icon (assets/expo.icon): two layers over the dark fill in icon.json.
    save(add_glow(draw_scope(1024, 1024 * 0.39), 1024 * 0.39 * 0.035, 1.3), ICON_ASSETS / 'radar.png')
    save(add_glow(draw_blips(1024, 1024 * 0.39), 1024 * 0.39 * 0.06, 1.6), ICON_ASSETS / 'blips.png')


if __name__ == '__main__':
    main()
