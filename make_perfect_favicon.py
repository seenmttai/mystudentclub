import glob
import os
from PIL import Image

# Open the exact reference image assets/icon-70x70.png which contains the perfect slate grey hexagon, side figures, and blue person
ref_img = Image.open('assets/icon-70x70.png').convert('RGBA')

# Update assets/icon-70x70.png to be 192x192 sharp PNG
icon_70 = ref_img.resize((192, 192), Image.Resampling.LANCZOS)
icon_70.save('assets/icon-70x70.png', format='PNG')
print("Updated assets/icon-70x70.png")

# Update favicon.png
icon_70.save('favicon.png', format='PNG')
print("Updated favicon.png")

# Save favicon.ico preserving transparency across standard sizes
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128)]
ref_img.save('favicon.ico', format='ICO', sizes=ico_sizes)
print("Updated favicon.ico")
