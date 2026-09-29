import subprocess
import os
import base64
from PIL import Image

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")

# Read logo and encode as base64
logo_path = os.path.join(ASSETS_DIR, "logo.png")
logo_b64 = ""
if os.path.exists(logo_path):
    with open(logo_path, "rb") as f:
        logo_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode("utf-8")

BANNERS = [
    {
        "id": "og-image",
        "pill": "INDIA'S #1 CA JOB PORTAL",
        "pill_color": "#1d4ed8",
        "pill_bg": "#eff6ff",
        "pill_border": "#bfdbfe",
        "headline": "Your Path to a<br><span style='color: #1d4ed8;'>Top CA Career</span>",
        "subheadline": "CA Industrial Training, Big 4 Articleships, Semi Qualified, Fresher & Experienced CA Jobs at Top Companies",
        "bottom_bg": "linear-gradient(90deg, #1d4ed8, #2563eb)",
        "bottom_left": "Industrial Training • Articleships • Fresher Jobs",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(37, 99, 235, 0.08) 0%, transparent 60%)"
    },
    {
        "id": "og-industrial",
        "pill": "CA INDUSTRIAL TRAINING PORTAL",
        "pill_color": "#0284c7",
        "pill_bg": "#f0f9ff",
        "pill_border": "#bae6fd",
        "headline": "Fast-Track Your<br><span style='color: #0284c7;'>Corporate Career</span>",
        "subheadline": "Exclusive Industrial Training Roles at Top MNCs, Investment Banks & FMCG Giants.",
        "bottom_bg": "linear-gradient(90deg, #0284c7, #0369a1)",
        "bottom_left": "Top MNCs • Investment Banking • Management Consulting",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(2, 132, 199, 0.08) 0%, transparent 60%)"
    },
    {
        "id": "og-articleship",
        "pill": "CA ARTICLESHIP OPPORTUNITIES",
        "pill_color": "#2563eb",
        "pill_bg": "#eff6ff",
        "pill_border": "#bfdbfe",
        "headline": "Land Your Dream<br><span style='color: #2563eb;'>CA Articleship</span>",
        "subheadline": "Openings across Big 4, Top 20 Accounting Firms & Boutique Practices pan-India.",
        "bottom_bg": "linear-gradient(90deg, #2563eb, #1d4ed8)",
        "bottom_left": "Big 4 • Statutory Audit • Tax Advisory • M&A",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(37, 99, 235, 0.08) 0%, transparent 60%)"
    },
    {
        "id": "og-fresher",
        "pill": "CA FRESHER & SEMI-QUALIFIED JOBS",
        "pill_color": "#4338ca",
        "pill_bg": "#eef2ff",
        "pill_border": "#c7d2fe",
        "headline": "High-Growth Finance &<br><span style='color: #4338ca;'>CA Fresher Roles</span>",
        "subheadline": "Direct recruiter applications for Auditing, FP&A, Taxation & Corporate Advisory.",
        "bottom_bg": "linear-gradient(90deg, #4338ca, #3730a3)",
        "bottom_left": "Audit • Taxation • FP&A • Corporate Advisory",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(67, 56, 202, 0.08) 0%, transparent 60%)"
    },
    {
        "id": "og-reviews",
        "pill": "CA FIRM REVIEWS & STIPENDS",
        "pill_color": "#1e40af",
        "pill_bg": "#eff6ff",
        "pill_border": "#bfdbfe",
        "headline": "Honest Reviews.<br><span style='color: #1e40af;'>Transparent Stipends.</span>",
        "subheadline": "Real insider reviews covering work culture, working hours, exam leaves & stipends.",
        "bottom_bg": "linear-gradient(90deg, #1e40af, #1e3a8a)",
        "bottom_left": "Culture • Working Hours • Exam Leaves • Learning Exposure",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(30, 64, 175, 0.08) 0%, transparent 60%)"
    },
    {
        "id": "og-cv-suite",
        "pill": "AI CA CV BUILDER & REVIEWER",
        "pill_color": "#0284c7",
        "pill_bg": "#f0f9ff",
        "pill_border": "#bae6fd",
        "headline": "ATS-Optimized<br><span style='color: #0284c7;'>CA Resumes & Reviews</span>",
        "subheadline": "Build and get instant AI scoring on executive CA resumes tailored for Big 4 & MNCs.",
        "bottom_bg": "linear-gradient(90deg, #0284c7, #0369a1)",
        "bottom_left": "Executive ATS Templates • Instant AI Scoring",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(2, 132, 199, 0.08) 0%, transparent 60%)"
    },
    {
        "id": "og-ai-interview",
        "pill": "AI VIDEO MOCK INTERVIEW",
        "pill_color": "#6366f1",
        "pill_bg": "#eef2ff",
        "pill_border": "#c7d2fe",
        "headline": "Master Your CA<br><span style='color: #6366f1;'>Technical & HR Interviews</span>",
        "subheadline": "Simulate real interview rounds with instant AI voice feedback on finance & audit questions.",
        "bottom_bg": "linear-gradient(90deg, #6366f1, #4f46e5)",
        "bottom_left": "Real-Time Voice AI • Big 4 Technical Questions",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 60%)"
    },
    {
        "id": "og-lms",
        "pill": "MY STUDENT CLUB ACADEMY",
        "pill_color": "#1d4ed8",
        "pill_bg": "#eff6ff",
        "pill_border": "#bfdbfe",
        "headline": "Master High-Growth<br><span style='color: #1d4ed8;'>Finance & CA Skills</span>",
        "subheadline": "Practical masterclasses in Financial Modeling, Valuation, PowerBI & Taxation.",
        "bottom_bg": "linear-gradient(90deg, #1d4ed8, #1e40af)",
        "bottom_left": "Financial Modeling • PowerBI • Practical Masterclasses",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(29, 78, 216, 0.08) 0%, transparent 60%)"
    },
    {
        "id": "og-tools",
        "pill": "AI CA CAREER TOOLS",
        "pill_color": "#0369a1",
        "pill_bg": "#f0f9ff",
        "pill_border": "#bae6fd",
        "headline": "Supercharge Your<br><span style='color: #0369a1;'>CA Preparation</span>",
        "subheadline": "ATS CV Maker, AI Video Mock Interviews & ICAI Campus Shortlist Predictor.",
        "bottom_bg": "linear-gradient(90deg, #0369a1, #075985)",
        "bottom_left": "ATS CVs • AI Video Interviews • Campus Predictor",
        "bottom_right": "mystudentclub.com • free",
        "ambient": "radial-gradient(circle at 85% 20%, rgba(3, 105, 161, 0.08) 0%, transparent 60%)"
    }
]

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&display=swap');

  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }}
  body {{
    width: 1200px;
    height: 630px;
    margin: 0;
    padding: 0;
    background: #ffffff;
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #0f172a;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }}

  /* Ambient light */
  .ambient {{
    position: absolute;
    inset: 0;
    background: {ambient};
    pointer-events: none;
    z-index: 1;
  }}

  .content {{
    position: relative;
    z-index: 2;
    padding: 60px 88px 0 88px;
    display: flex;
    flex-direction: column;
  }}

  .header {{
    display: flex;
    align-items: center;
    gap: 20px;
  }}

  .logo-img {{
    height: 52px;
    width: auto;
    object-fit: contain;
  }}

  .pill {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 36px;
    padding: 7px 18px;
    border-radius: 9999px;
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: 0.8px;
    color: {pill_color};
    background: {pill_bg};
    border: 1.5px solid {pill_border};
    align-self: flex-start;
  }}

  .headline {{
    font-size: 64px;
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: -2px;
    color: #0f172a;
    margin-top: 16px;
    max-width: 1020px;
  }}

  .subheadline {{
    font-size: 24px;
    line-height: 1.45;
    font-weight: 500;
    color: #475569;
    max-width: 1020px;
    margin-top: 18px;
  }}

  /* Bottom Solid Stripe - Exact Humsafar style */
  .bottom-bar {{
    position: relative;
    z-index: 2;
    height: 90px;
    padding: 0 88px;
    background: {bottom_bg};
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #ffffff;
  }}

  .bottom-left {{
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.2px;
  }}

  .bottom-right {{
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.2px;
    opacity: 0.95;
  }}
</style>
</head>
<body>
  <div class="ambient"></div>

  <div class="content">
    <div class="header">
      <img src="{logo_b64}" alt="My Student Club" class="logo-img" />
    </div>

    <div class="pill">
      {pill}
    </div>

    <h1 class="headline">{headline}</h1>
    <p class="subheadline">{subheadline}</p>
  </div>

  <div class="bottom-bar">
    <div class="bottom-left">{bottom_left}</div>
    <div class="bottom-right">{bottom_right}</div>
  </div>
</body>
</html>
"""

def generate():
    temp_html = os.path.join(BASE_DIR, "temp_banner.html")
    
    for item in BANNERS:
        rendered_html = HTML_TEMPLATE.format(
            logo_b64=logo_b64,
            pill=item["pill"],
            pill_color=item["pill_color"],
            pill_bg=item["pill_bg"],
            pill_border=item["pill_border"],
            headline=item["headline"],
            subheadline=item["subheadline"],
            bottom_bg=item["bottom_bg"],
            bottom_left=item["bottom_left"],
            bottom_right=item["bottom_right"],
            ambient=item["ambient"]
        )

        with open(temp_html, "w", encoding="utf-8") as f:
            f.write(rendered_html)

        out_png = os.path.join(ASSETS_DIR, f"{item['id']}.png")
        out_jpg = os.path.join(ASSETS_DIR, f"{item['id']}.jpg")

        cmd = [
            CHROME_PATH,
            "--headless=new",
            "--disable-gpu",
            "--window-size=1200,630",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            f"--screenshot={out_png}",
            f"file:///{temp_html}"
        ]

        print(f"Generating {item['id']}...")
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"Error generating {item['id']}: {res.stderr}")
            continue

        # Convert to lightweight PNG (under 150KB) and ultra-light JPG (under 100KB)
        try:
            with Image.open(out_png) as im:
                im_rgb = im.convert("RGB")
                # Save optimized JPG
                im_rgb.save(out_jpg, "JPEG", quality=90, optimize=True)
                
                # Quantize PNG to 128 colors for crystal clarity + tiny file size (<140KB)
                im_q = im_rgb.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
                im_q.save(out_png, "PNG", optimize=True)

            print(f"  Saved {item['id']}.png ({os.path.getsize(out_png):,} bytes) and {item['id']}.jpg ({os.path.getsize(out_jpg):,} bytes)")
        except Exception as e:
            print(f"  Optimization warning: {e}")

    if os.path.exists(temp_html):
        os.remove(temp_html)
    print("All banners regenerated with Humsafar layout & lightweight size!")

if __name__ == "__main__":
    generate()
