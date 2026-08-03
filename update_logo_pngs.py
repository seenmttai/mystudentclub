import fitz
import glob
import os
from PIL import Image

svg_content = '''<svg xmlns="http://www.w3.org/2000/svg" width="207" height="223" fill="none" viewBox="0 0 207 223">
  <path d="m188.4 49.73-72.25-41.61c-9.06-5.29-18.21-4.74-26.19 0l-70.9 40.81c-7.32 4.03-10.97 11.88-10.97 19.86v14.89c2.12-1.59 4.37-1.94 6.61-1.87 2.38 0.08 4.05 0.7 5.79 1.95v-14.58c0-4.34 1.26-6.8 5.52-9.26l71.93-41.41c4.95-2.85 9.07-1.13 12.08 0.83l70.98 40.74c3.8 2.14 5.39 4.6 5.39 9.1v14.58c2.12-1.33 3.53-1.95 5.99-1.95 2.78-0.07 5.03 0.55 7.35 2.14v-15.16c0-7.78-4.5-15.18-11.33-19.06z" fill="url(#paint0_linear_1_103)"/>
  <path d="m199.7 128.3-2.24 3.32c-6.68 8.36-7.65 15.35-5.97 24.32 1.1 5.85 1.72 10.43-0.31 15.01 5.85-4.19 8.52-11.51 8.52-16.78v-25.87z" fill="url(#paint1_linear_1_103)"/>
  <path d="m8.12 127.8v26.34c0 6.72 2.93 13.52 8.79 17.94-1.95-4.73-1.49-9.15-0.23-16.09 1.59-9.05-1.04-17.8-6.52-24.4l-2.04-2.77v-1.02z" fill="url(#paint2_linear_1_103)"/>
  <path d="m199.4 90.46c-1.59-4.03-2.84-5.99-6.18-5.99-4.8 0-7.34 4.5-5.83 8.99 2.17 6.23 2.47 8.69 1.94 14.2-1.47 8.82-6.66 18.11-17.62 21.91-2.58 0.94-3.04 3.16-2.35 5.84l5.33 25.6c0.38 1.63-2.02 5.66-3.13 6.4-1.59 0-4.85-4.5-4.85-4.5v-24.19c0-3.7-1.05-6.46-4.31-6.84-6.61-0.74-15.44-1.91-20.77-0.5-2.46 0.65-2.92 9.09-2.15 15.69 1.18 7.02 4.44 20.34 3.74 29.02-0.85 9.05-4.51 14.56-10.36 17.88l-20.69 12.44c-5.56 3.32-12.96 2.93-18.29 0l-20.14-11.65c-6.68-3.32-9.14-8.44-9.14-19.69 0-8.06 3.11-18.67 3.49-24.9 0.94-11.41-2.56-18.45-5.82-18.83-5.41-0.66-10.36 0.27-17.26 0.42-3.5 0.08-4.94 2.12-4.94 6.61v24.19c0 1.17-3.66 5.51-4.6 5.36-1.59-0.31-3.76-4.42-3.69-5.08l5.93-25.53c0.77-2.84-0.08-5.43-3.01-6.25-10.49-3.24-17.17-13.07-17.24-23.4-0.08-5.51 1.65-9.75 2.7-13.85 1.18-4.49-2.4-9.07-6.44-9.07-3.81 0-5.42 1.69-7.01 6.27-5.11 12.13-3.45 26.9 3.71 37.71 7.26 9.37 8.85 15.9 7.11 27.52-1.82 9.13-1.36 15.78 5.9 19.81l67.46 38.73c7.82 4.03 16.03 3.29 23.51-0.59l69.51-38.41c6.34-3.33 6.15-11.62 4.35-19.54-2.24-10.41 0.31-18.26 6.99-27.09 7.48-10.1 8.73-24.38 4.15-38.69z" fill="url(#paint3_linear_1_103)"/>
  <path d="m43.26 104.1c-6.92 0-10.8 5.82-10.8 10.74 0 6.78 5.26 10.98 10.8 10.98 6.49 0 10.83-5.59 10.83-10.98 0-5.97-4.88-10.74-10.83-10.74z" fill="url(#paint4_linear_1_103)"/>
  <path d="m163.5 104.1c-7.4 0-11.05 6.23-11.05 10.74 0 6.39 5.25 10.98 10.66 10.98 6.99 0 11.33-5.59 11.33-10.98 0-5.97-5.07-10.74-10.94-10.74z" fill="url(#paint5_linear_1_103)"/>
  <path d="m103.4 76.34c-9.14-0.31-14.92 7.54-14.92 14.67 0 8.52 7.26 14.75 14.61 14.75 9.14 0 15-7.85 15-14.75 0-7.85-6.68-14.67-14.69-14.67z" fill="#0077BF"/>
  <path d="m150.7 59.61c-2.11-4.19-4.78-4.85-8.04-4.85-6.6 0-9.54 6.25-7.8 11.37 2.86 6.56 3.55 11.05 3.09 18.06-1.39 13.72-12.85 26.7-28.26 29.94-2.46 0.31-3.4 1.94-4.66 4.25-0.54 0.94-0.31 0.71-0.38 1.88 1.41 14 6.49 46.02 7.1 52.58 0.15 1.02-6.68 9.23-6.68 9.23-1.59 1.31-3.08 0.47-4.11-1.06-1.87-2.15-6.01-6.64-6.24-7.58l6.92-52.52c-0.31-2.05-3.65-6.16-5.24-6.47-14.28-2.13-26.41-15.22-27.46-30.25-0.45-6.23 1.05-11.15 3.51-17.04 2.17-5.87-1.71-12.1-8.61-12.1-4.58 0-6.83 2.13-8.42 5.76-7.73 15.45-6.79 34.9 4.52 49.92 8.78 10.81 12.51 21.96 11.97 35.68-0.45 9.6-4.44 18.8-3.12 30.66 0.94 6.55 3.12 10.51 8.37 12.89l18.54 10.81c5.41 2.93 11.53 2.19 16.5-1.13l18.46-10.49c6.68-3.32 8.27-12.08 7.02-20.84-1.49-9.6-3.23-16.6-2.85-24.38 0.61-10.81 4.56-21.62 13.11-33.27 10.48-15.03 10.03-31.6 2.76-51.05z" fill="#0077BF"/>
  <defs>
    <linearGradient id="paint0_linear_1_103" x1="18.89" x2="184.3" y1="17.93" y2="75.88" gradientUnits="userSpaceOnUse">
      <stop stop-color="#94ADB9" offset="0"/>
      <stop stop-color="#889CA7" offset="1"/>
    </linearGradient>
    <linearGradient id="paint1_linear_1_103" x1="193.3" x2="199.8" y1="133.1" y2="166.8" gradientUnits="userSpaceOnUse">
      <stop stop-color="#889CA7" offset="0"/>
      <stop stop-color="#A4B5BE" offset="1"/>
    </linearGradient>
    <linearGradient id="paint2_linear_1_103" x1="8.119" x2="16.14" y1="132.7" y2="169.1" gradientUnits="userSpaceOnUse">
      <stop stop-color="#738A98" offset="0"/>
      <stop stop-color="#A4B5BE" offset="1"/>
    </linearGradient>
    <linearGradient id="paint3_linear_1_103" x1="8.087" x2="199.9" y1="101.3" y2="170.5" gradientUnits="userSpaceOnUse">
      <stop stop-color="#557484" offset="0"/>
      <stop stop-color="#6E8793" offset="1"/>
    </linearGradient>
    <linearGradient id="paint4_linear_1_103" x1="32.46" x2="53.29" y1="104.1" y2="125.2" gradientUnits="userSpaceOnUse">
      <stop stop-color="#557484" offset="0"/>
      <stop stop-color="#627D8B" offset="1"/>
    </linearGradient>
    <linearGradient id="paint5_linear_1_103" x1="152.4" x2="173.8" y1="104.1" y2="125.7" gradientUnits="userSpaceOnUse">
      <stop stop-color="#557484" offset="0"/>
      <stop stop-color="#627D8B" offset="1"/>
    </linearGradient>
  </defs>
</svg>'''

doc = fitz.open(stream=svg_content.encode('utf-8'), filetype='svg')
page = doc[0]
zoom = 512.0 / max(page.rect.width, page.rect.height)
mat = fitz.Matrix(zoom, zoom)
pix = page.get_pixmap(matrix=mat, alpha=True)
img = Image.frombytes('RGBA', [pix.width, pix.height], pix.samples)

# Update assets/logo.png and assets/logo_favicon_android.png
img.save('assets/logo.png', format='PNG')
img.save('assets/logo_favicon_android.png', format='PNG')
print("Updated assets/logo.png and assets/logo_favicon_android.png")

# Find and replace all logo png files
other_logos = glob.glob('**/logo.png', recursive=True) + glob.glob('**/logo*.png', recursive=True)
for logo_path in set(other_logos):
    img.save(logo_path, format='PNG')
    print(f"Updated {logo_path}")

# Update favicon assets
img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save('favicon.png', format='PNG')
img.save('favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128)])
print("Updated favicon.png and favicon.ico")
