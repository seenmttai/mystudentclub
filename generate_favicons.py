"""Regenerate the site favicons from the My Student Club symbol (new logo, October 2026).

Writes favicon.png, favicon.ico and the 192px icons in assets/. It does not touch
favicon.svg, which is the hand-made version that switches colours in dark mode.
The master artwork lives in the MSC logo kit (svg/msc-symbol-colour.svg).
"""
import fitz
from PIL import Image, ImageDraw

SYMBOL_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750.00 886.43" width="188" height="222"><g transform="translate(0.00 0.00) scale(1.00000) translate(-255.00 -95.57)"><path fill="#0057FF" d="M255 982L255 392.57A95 95 0 0 1 413.57 321.97L733.99 610.48A8 8 0 0 1 733.99 622.37L648.74 699.13A28 28 0 0 1 611.26 699.13L453.06 556.68A24 24 0 0 0 413 574.52L413 830C413 890 312.06 963.46 255 982Z"/><path fill="#06152F" d="M1005 982L1005 392.57A95 95 0 0 0 846.43 321.97L648.56 500.14A8 8 0 0 0 648.56 512.03L747.19 600.84A8 8 0 0 0 757.9 600.84L806.94 556.68A24 24 0 0 1 847 574.52L847 830C847 890 947.94 963.46 1005 982Z"/><circle fill="#0057FF" cx="350.00" cy="185.57" r="90.0"/><circle fill="#06152F" cx="910.00" cy="185.57" r="90.0"/></g></svg>'''

def render_symbol(height):
    doc = fitz.open(stream=SYMBOL_SVG.encode("utf-8"), filetype="svg")
    page = doc[0]
    zoom = height / page.rect.height
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=True)
    return Image.frombytes("RGBA", [pix.width, pix.height], pix.samples)

def on_square(size, share, rounded=0.0):
    sym = render_symbol(1024)
    h = round(size * share); w = round(sym.width * h / sym.height)
    sym = sym.resize((w, h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if rounded:
        ImageDraw.Draw(canvas).rounded_rectangle([0, 0, size - 1, size - 1], round(size * rounded), fill="white")
    else:
        canvas.paste(Image.new("RGBA", (size, size), "white"))
    canvas.alpha_composite(sym, ((size - w) // 2, (size - h) // 2))
    return canvas

# 192px icons on white (browser tabs, Google results, Android, apple-touch-icon)
icon = on_square(192, 0.80).convert("RGB")
for path in ["favicon.png", "assets/icon-70x70.png", "assets/logo_favicon_android.png"]:
    icon.save(path, format="PNG")
    print("Saved", path)

# ICO: symbol on a white rounded square so it reads on light and dark tabs
sizes = [16, 32, 48, 64, 128]
frames = [on_square(s, 0.86, rounded=0.22) for s in sizes]
frames[-1].save("favicon.ico", format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
print("Saved favicon.ico")
