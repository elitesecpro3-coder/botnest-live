"""
BotNest OG Image Generator
1200x630 — optimized for Open Graph + Twitter Card sharing
Brand: dark navy bg, gold accent, premium SaaS aesthetic
"""

import os
import glob
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Brand tokens ──────────────────────────────────────────────────────────────
BG_COLOR        = (8, 14, 28)        # #080e1c — deep navy
PANEL_COLOR     = (14, 22, 42)       # #0e162a — card bg
PANEL_BORDER    = (30, 44, 80)       # #1e2c50 — card border
ACCENT          = (242, 191, 58)     # #f2bf3a — gold
ACCENT_GLOW     = (242, 191, 58, 28) # translucent for glows
TEXT_PRIMARY    = (240, 244, 255)    # #f0f4ff — near-white
TEXT_MUTED      = (130, 145, 175)    # #8291af — muted
BADGE_BG        = (242, 191, 58, 38) # gold badge fill
BADGE_BORDER    = (242, 191, 58, 100)

W, H = 1200, 630

# ── Font helpers ──────────────────────────────────────────────────────────────
FONT_DIR = r"C:\Windows\Fonts"

def find_font(*names):
    """Return first matching TTF/OTF from Windows Fonts."""
    for name in names:
        for ext in ("ttf", "otf"):
            path = os.path.join(FONT_DIR, f"{name}.{ext}")
            if os.path.exists(path):
                return path
    return None

def load(path, size):
    if path:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

# Prefer Manrope/Sora (brand fonts) → fall back to Segoe UI → Arial
segoe_bold  = find_font("segoeuib", "segoeuib", "ARIALBD", "arialbd")
segoe_reg   = find_font("segoeui",  "segoeui",  "ARIAL",   "arial")
segoe_semi  = find_font("segoeuisl","segoeuib", "ARIALBD", "arialbd")

f_badge    = load(segoe_bold, 22)
f_logo     = load(segoe_bold, 38)
f_headline = load(segoe_bold, 60)
f_tagline  = load(segoe_reg,  28)
f_sub      = load(segoe_reg,  23)
f_mbg      = load(segoe_bold, 26)

# ── Canvas ────────────────────────────────────────────────────────────────────
img  = Image.new("RGBA", (W, H), BG_COLOR + (255,))
draw = ImageDraw.Draw(img, "RGBA")

# ── Background gradient layers ────────────────────────────────────────────────
def radial_glow(canvas, cx, cy, radius, color_rgba, steps=60):
    """Paint a soft radial glow using concentric ellipses."""
    r, g, b, base_a = color_rgba
    for i in range(steps, 0, -1):
        frac = i / steps
        cr   = int(radius * frac)
        # Quadratic falloff
        alpha = int(base_a * (1 - frac) ** 2)
        if alpha < 1:
            continue
        bbox = [cx - cr, cy - cr, cx + cr, cy + cr]
        canvas.ellipse(bbox, fill=(r, g, b, alpha))

# Top-left teal/blue glow (cool anchor)
radial_glow(draw, -60, -40, 600, (40, 100, 220, 55))
# Top-right accent glow
radial_glow(draw, W + 80, -60, 550, (242, 191, 58, 35))
# Bottom-center subtle glow
radial_glow(draw, W // 2, H + 60, 480, (40, 80, 180, 28))

# ── Grid lines (subtle tech feel) ────────────────────────────────────────────
GRID_COLOR = (255, 255, 255, 6)
for x in range(0, W, 80):
    draw.line([(x, 0), (x, H)], fill=GRID_COLOR, width=1)
for y in range(0, H, 80):
    draw.line([(0, y), (W, y)], fill=GRID_COLOR, width=1)

# ── Decorative accent bar (left edge) ────────────────────────────────────────
draw.rectangle([0, 0, 4, H], fill=ACCENT + (255,))

# ── Logo area (top-left) ──────────────────────────────────────────────────────
LOGO_X, LOGO_Y = 64, 54
logo_size = 52

try:
    logo_src = Image.open(r"F:\BotNest\BotNestFrontEnd\BotNestWebsite\assets\logo-icon.png").convert("RGBA")
    logo_src = logo_src.resize((logo_size, logo_size), Image.LANCZOS)
    img.paste(logo_src, (LOGO_X, LOGO_Y), logo_src)
    text_x = LOGO_X + logo_size + 14
except Exception:
    text_x = LOGO_X

draw.text((text_x, LOGO_Y + 7), "BotNest", font=f_logo, fill=TEXT_PRIMARY)

# ── Money-Back Guarantee badge ────────────────────────────────────────────────
badge_text = "5-Day Money-Back Guarantee"
bbox_b     = draw.textbbox((0, 0), badge_text, font=f_badge)
bw         = bbox_b[2] - bbox_b[0]
bh         = bbox_b[3] - bbox_b[1]
pad_x, pad_y = 18, 9

# Position top-right
badge_r = W - 64
badge_t = 54
badge_l = badge_r - bw - pad_x * 2
badge_b = badge_t + bh + pad_y * 2

# Draw badge background with rounded feel (manual rounded rect via layers)
draw.rounded_rectangle([badge_l, badge_t, badge_r, badge_b],
                       radius=8, fill=BADGE_BG, outline=BADGE_BORDER)
draw.text((badge_l + pad_x, badge_t + pad_y - 1),
          badge_text, font=f_badge, fill=ACCENT)

# ── Headline ──────────────────────────────────────────────────────────────────
headline1 = "AI Chatbots That Convert"
headline2 = "Visitors Into Customers"

# Vertical centre: slightly above mid
h_y1 = 168
h_y2 = h_y1 + 76

draw.text((64, h_y1), headline1, font=f_headline, fill=TEXT_PRIMARY)
# Second line: accent highlight on "Customers"
plain_part = "Visitors Into "
accent_part = "Customers"

bbox_plain = draw.textbbox((0, 0), plain_part, font=f_headline)
plain_w    = bbox_plain[2] - bbox_plain[0]

draw.text((64, h_y2), plain_part,  font=f_headline, fill=TEXT_PRIMARY)
draw.text((64 + plain_w, h_y2), accent_part, font=f_headline, fill=ACCENT)

# ── Tagline ───────────────────────────────────────────────────────────────────
tagline = "Capture leads & book appointments automatically, 24/7."
draw.text((64, 360), tagline, font=f_tagline, fill=TEXT_MUTED)

# ── Pricing pills ─────────────────────────────────────────────────────────────
pills = [
    ("Starter — $149/mo", "US Market"),
    ("Pro — $299/mo",     "US Market"),
    ("VN Starter — $39/mo", "Vietnam"),
]

pill_x = 64
pill_y = 424
for label, sublabel in [("Starter  $149/mo", ""), ("Pro  $299/mo", ""), ("VN  $39/mo", "")]:
    bb   = draw.textbbox((0, 0), label, font=f_sub)
    pw   = bb[2] - bb[0] + 28
    ph   = 40
    draw.rounded_rectangle([pill_x, pill_y, pill_x + pw, pill_y + ph],
                           radius=6,
                           fill=(255, 255, 255, 10),
                           outline=(255, 255, 255, 22))
    draw.text((pill_x + 14, pill_y + 9), label, font=f_sub, fill=TEXT_PRIMARY)
    pill_x += pw + 14

# ── CTA strip (bottom) ────────────────────────────────────────────────────────
strip_y = 538
draw.rectangle([0, strip_y, W, H], fill=(ACCENT[0], ACCENT[1], ACCENT[2], 18))
draw.line([(0, strip_y), (W, strip_y)], fill=ACCENT + (60,), width=1)

cta_text   = "Cancel anytime  ·  No questions asked  ·  bot-nest.com"
bbox_cta   = draw.textbbox((0, 0), cta_text, font=f_sub)
cta_w      = bbox_cta[2] - bbox_cta[0]
cta_x      = (W - cta_w) // 2
cta_y      = strip_y + (H - strip_y - (bbox_cta[3] - bbox_cta[1])) // 2
draw.text((cta_x, cta_y), cta_text, font=f_sub, fill=ACCENT)

# ── Right-side decorative element (abstract glow orb) ────────────────────────
orb_cx, orb_cy = 1040, 310
for r in range(180, 0, -4):
    frac  = r / 180
    alpha = int(45 * (1 - frac) ** 1.6)
    if alpha < 1:
        continue
    draw.ellipse([orb_cx - r, orb_cy - r, orb_cx + r, orb_cy + r],
                 fill=(242, 191, 58, alpha))

# Accent ring
draw.ellipse([orb_cx - 120, orb_cy - 120, orb_cx + 120, orb_cy + 120],
             outline=(242, 191, 58, 70), width=2)
draw.ellipse([orb_cx - 160, orb_cy - 160, orb_cx + 160, orb_cy + 160],
             outline=(242, 191, 58, 30), width=1)

# ── Export ────────────────────────────────────────────────────────────────────
out_path = r"F:\BotNest\BotNestFrontEnd\BotNestWebsite\assets\og-image.png"

# Convert to RGB for PNG (no transparency needed for OG)
final = Image.new("RGB", (W, H), BG_COLOR)
final.paste(img, mask=img.split()[3])
final.save(out_path, "PNG", optimize=True, compress_level=8)

size_kb = os.path.getsize(out_path) // 1024
print(f"OG image saved: {out_path}")
print(f"Dimensions: {W}x{H}px")
print(f"File size: {size_kb}KB")
print("Done.")
