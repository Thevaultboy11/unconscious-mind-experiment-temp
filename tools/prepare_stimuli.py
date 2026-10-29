"""
Builds the light-weight stimulus files the experiment actually loads.

  images/   -> the original full-size photos you downloaded (untouched)
  stimuli/  -> what the app uses (made by this script)

The original photos are 10-200 megapixels. Decoding those would make the
browser miss screen refreshes, so every prime is cut to a 512x512 square,
every choice picture to 640x640, and the masks are made from the photos.

Run (only needed if you change the photos):   python3 tools/prepare_stimuli.py
Needs: pip install pillow numpy
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "images")
OUT = os.path.join(ROOT, "stimuli")
PRIME_SIZE = 512
CHOICE_SIZE = 640
N_MASKS = 24
TILE = 32

# Photos left out of the prime sets (see README for why)
EXCLUDE = {
    "beach": {"20.jpg"},     # watermelon: identical to choice option 3a
    "football": {"12.jpg"},  # watermelon: a beach item in the football folder
}

# Where to centre the square crop (0-1, x then y). 0.5,0.5 = middle.
FOCUS = {
    ("choices", "4a.jpg"): (0.5, 0.35),
    ("choices", "6b.jpg"): (0.5, 0.4),
    ("choices", "9b.jpg"): (0.5, 0.65),
    ("choices", "5b.jpg"): (0.6, 0.5),
    ("football", "13.jpg"): (0.5, 0.6),
    ("football", "15.jpg"): (0.5, 0.25),
    ("football", "3.jpg"): (0.5, 0.6),
}

random.seed(42)
np.random.seed(42)


def load(path):
    im = Image.open(path)
    im.draft("RGB", (2000, 2000))  # fast JPEG downscale while decoding
    return ImageOps.exif_transpose(im).convert("RGB")


def square(im, size, focus=(0.5, 0.5)):
    w, h = im.size
    s = min(w, h)
    cx, cy = focus[0] * w, focus[1] * h
    left = int(min(max(cx - s / 2, 0), w - s))
    top = int(min(max(cy - s / 2, 0), h - s))
    return im.crop((left, top, left + s, top + s)).resize((size, size), Image.LANCZOS)


def num_key(name):
    digits = "".join(c for c in name if c.isdigit())
    return (int(digits or 0), name)


# ---------- generated patterns (5 per set) ----------
def solid(rgb):
    return Image.new("RGB", (PRIME_SIZE, PRIME_SIZE), rgb)


def sine_waves():
    im = Image.new("RGB", (PRIME_SIZE, PRIME_SIZE), (226, 242, 250))
    d = ImageDraw.Draw(im)
    for k, y0 in enumerate(range(40, PRIME_SIZE, 64)):
        pts = [(x, y0 + 18 * math.sin(2 * math.pi * x / 128 + k)) for x in range(0, PRIME_SIZE + 1, 4)]
        d.line(pts, fill=(40, 120, 190), width=10)
    return im


def sand_grain():
    base = np.array([222, 196, 150], dtype=np.float32)
    noise = np.random.normal(0, 28, (PRIME_SIZE, PRIME_SIZE, 1)).astype(np.float32)
    arr = np.clip(base + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr).filter(ImageFilter.GaussianBlur(0.6))


def warm_gradient():
    t = np.linspace(0, 1, PRIME_SIZE)[:, None, None]
    top = np.array([255, 214, 90])
    bottom = np.array([255, 120, 40])
    arr = (top * (1 - t) + bottom * t) * np.ones((1, PRIME_SIZE, 1))
    return Image.fromarray(arr.astype(np.uint8))


def hexagons():
    im = Image.new("RGB", (PRIME_SIZE, PRIME_SIZE), (245, 245, 245))
    d = ImageDraw.Draw(im)
    r = 46
    w, h = math.sqrt(3) * r, 1.5 * r
    row = 0
    y = -r
    while y < PRIME_SIZE + r:
        x = -w + (w / 2 if row % 2 else 0)
        col = 0
        while x < PRIME_SIZE + w:
            pts = [(x + r * math.cos(math.radians(60 * i + 30)), y + r * math.sin(math.radians(60 * i + 30))) for i in range(6)]
            black = (row % 2 == 0 and col % 3 == 0) or (row % 2 == 1 and col % 3 == 2)
            d.polygon(pts, fill=(20, 20, 20) if black else (245, 245, 245), outline=(60, 60, 60))
            x += w
            col += 1
        y += h
        row += 1
    return im


def chalk_lines():
    im = Image.new("RGB", (PRIME_SIZE, PRIME_SIZE), (58, 140, 62))
    d = ImageDraw.Draw(im)
    d.line([(PRIME_SIZE // 2, 0), (PRIME_SIZE // 2, PRIME_SIZE)], fill=(240, 240, 240), width=10)
    d.ellipse([96, 96, PRIME_SIZE - 96, PRIME_SIZE - 96], outline=(240, 240, 240), width=10)
    d.ellipse([PRIME_SIZE // 2 - 10, PRIME_SIZE // 2 - 10, PRIME_SIZE // 2 + 10, PRIME_SIZE // 2 + 10], fill=(240, 240, 240))
    return im


def net_grid():
    im = Image.new("RGB", (PRIME_SIZE, PRIME_SIZE), (40, 44, 52))
    d = ImageDraw.Draw(im)
    for k in range(-PRIME_SIZE, 2 * PRIME_SIZE, 48):
        d.line([(k, 0), (k + PRIME_SIZE, PRIME_SIZE)], fill=(235, 235, 235), width=5)
        d.line([(k, PRIME_SIZE), (k + PRIME_SIZE, 0)], fill=(235, 235, 235), width=5)
    return im


def mow_stripes():
    im = Image.new("RGB", (PRIME_SIZE, PRIME_SIZE))
    d = ImageDraw.Draw(im)
    for i, x in enumerate(range(0, PRIME_SIZE, 64)):
        d.rectangle([x, 0, x + 64, PRIME_SIZE], fill=(70, 160, 70) if i % 2 else (52, 128, 54))
    return im


PATTERNS = {
    "beach": [solid((245, 197, 24)), solid((95, 180, 232)), sine_waves(), sand_grain(), warm_gradient()],
    "football": [solid((58, 143, 58)), hexagons(), chalk_lines(), net_grid(), mow_stripes()],
}


def main():
    all_prime_photos = []
    manifest = {}
    for cat in ("beach", "football"):
        os.makedirs(os.path.join(OUT, cat), exist_ok=True)
        names = sorted((n for n in os.listdir(os.path.join(SRC, cat)) if n.lower().endswith(".jpg")), key=num_key)
        kept = []
        for n in names:
            if n in EXCLUDE[cat]:
                continue
            im = square(load(os.path.join(SRC, cat, n)), PRIME_SIZE, FOCUS.get((cat, n), (0.5, 0.5)))
            im.save(os.path.join(OUT, cat, n), quality=85)
            all_prime_photos.append(im)
            kept.append(n)
        for i, p in enumerate(PATTERNS[cat], 1):
            p.save(os.path.join(OUT, cat, f"p{i}.png"))
            kept.append(f"p{i}.png")
        manifest[cat] = kept

    os.makedirs(os.path.join(OUT, "choices"), exist_ok=True)
    for n in sorted(os.listdir(os.path.join(SRC, "choices")), key=num_key):
        if n.lower().endswith(".jpg"):
            im = square(load(os.path.join(SRC, "choices", n)), CHOICE_SIZE, FOCUS.get(("choices", n), (0.5, 0.5)))
            im.save(os.path.join(OUT, "choices", n), quality=85)

    # Masks: mosaics of random 32px tiles cut from BOTH prime sets, so every
    # group (beach, football, no-prime) sees exactly the same masks.
    os.makedirs(os.path.join(OUT, "masks"), exist_ok=True)
    arrays = [np.array(im) for im in all_prime_photos]
    g = PRIME_SIZE // TILE
    for m in range(1, N_MASKS + 1):
        canvas = np.zeros((PRIME_SIZE, PRIME_SIZE, 3), dtype=np.uint8)
        for ty in range(g):
            for tx in range(g):
                src = random.choice(arrays)
                sy, sx = random.randrange(g) * TILE, random.randrange(g) * TILE
                tile = src[sy:sy + TILE, sx:sx + TILE]
                tile = np.rot90(tile, random.randrange(4))
                canvas[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE] = tile
        Image.fromarray(canvas).save(os.path.join(OUT, "masks", f"m{m}.jpg"), quality=85)

    for cat, files in manifest.items():
        print(cat, len(files), files)
    print("masks", N_MASKS)


if __name__ == "__main__":
    main()
