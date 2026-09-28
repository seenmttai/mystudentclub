import subprocess
import os
import base64
import time

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")

# Read logo and encode as base64
logo_path = os.path.join(ASSETS_DIR, "logo.png")
logo_b64 = ""
if os.path.exists(logo_path):
    with open(logo_path, "rb") as f:
        logo_b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode("utf-8")

SVGS = {
    "money": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>""",
    "building": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>""",
    "bolt": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>""",
    "star": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>""",
    "check": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>""",
    "chart": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>""",
    "briefcase": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>""",
    "shield": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>""",
    "file": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>""",
    "video": """<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>"""
}

BANNERS = [
    {
        "id": "og-image",
        "pill": "INDIA'S #1 CA JOB PORTAL",
        "pill_color": "#2563eb",
        "pill_bg": "#eff6ff",
        "pill_border": "#bfdbfe",
        "headline": "Your Path to a<br><span style='color: #2563eb;'>Top CA Career</span>",
        "subheadline": "Explore Top CA Industrial Training, Big 4 Articleships & High-Growth CA Fresher Jobs at Fortune 500 Companies.",
        "badges": [
            ("money", "#16a34a", "#f0fdf4", "Verified Stipends & CTC"),
            ("building", "#2563eb", "#eff6ff", "Big 4 & Fortune 500 Hirers"),
            ("bolt", "#d97706", "#fffbeb", "Direct Recruiter Apply")
        ],
        "footer_left": "Industrial Training • Articleship • Fresher Opportunities",
        "footer_accent": "linear-gradient(90deg, #2563eb, #3b82f6)",
        "ambient_1": "radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 90% 10%, rgba(99, 102, 241, 0.12) 0%, transparent 60%)",
        "ambient_3": "radial-gradient(circle at 80% 90%, rgba(14, 165, 233, 0.1) 0%, transparent 50%)"
    },
    {
        "id": "og-industrial",
        "pill": "CA INDUSTRIAL TRAINING PORTAL",
        "pill_color": "#0284c7",
        "pill_bg": "#f0f9ff",
        "pill_border": "#bae6fd",
        "headline": "Fast-Track Your<br><span style='color: #0284c7;'>Corporate Career</span>",
        "subheadline": "Exclusive CA Industrial Training openings at Top Investment Banks, FMCG Leaders & Global Consulting Firms.",
        "badges": [
            ("money", "#0284c7", "#f0f9ff", "Up to ₹1,00,000/mo Stipend"),
            ("briefcase", "#2563eb", "#eff6ff", "Investment Banking & FP&A"),
            ("check", "#16a34a", "#f0fdf4", "100% Verified Hirers")
        ],
        "footer_left": "Top MNCs • Investment Banking • Management Consulting",
        "footer_accent": "linear-gradient(90deg, #0284c7, #2563eb)",
        "ambient_1": "radial-gradient(circle at 15% 15%, rgba(2, 132, 199, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 90% 20%, rgba(56, 189, 248, 0.12) 0%, transparent 50%)",
        "ambient_3": "radial-gradient(circle at 75% 85%, rgba(14, 165, 233, 0.1) 0%, transparent 60%)"
    },
    {
        "id": "og-articleship",
        "pill": "CA ARTICLESHIP OPPORTUNITIES",
        "pill_color": "#059669",
        "pill_bg": "#ecfdf5",
        "pill_border": "#a7f3d0",
        "headline": "Land Your Dream<br><span style='color: #059669;'>CA Articleship</span>",
        "subheadline": "Verified openings across Big 4, Top 20 Accounting Firms, and Premier Boutique Practices pan-India.",
        "badges": [
            ("star", "#d97706", "#fffbeb", "Big 4 & Top 20 Openings"),
            ("shield", "#059669", "#ecfdf5", "Firm Reviews & Stipend Data"),
            ("building", "#2563eb", "#eff6ff", "Mumbai, Delhi, Bangalore & Pan-India")
        ],
        "footer_left": "Big 4 • Statutory Audit • Tax Advisory • M&A",
        "footer_accent": "linear-gradient(90deg, #059669, #10b981)",
        "ambient_1": "radial-gradient(circle at 10% 20%, rgba(5, 150, 105, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 85% 15%, rgba(16, 185, 129, 0.12) 0%, transparent 50%)",
        "ambient_3": "radial-gradient(circle at 80% 85%, rgba(6, 182, 212, 0.08) 0%, transparent 50%)"
    },
    {
        "id": "og-fresher",
        "pill": "CA FRESHER & SEMI-QUALIFIED JOBS",
        "pill_color": "#7c3aed",
        "pill_bg": "#f5f3ff",
        "pill_border": "#ddd6fe",
        "headline": "High-Growth Finance &<br><span style='color: #7c3aed;'>CA Fresher Roles</span>",
        "subheadline": "Direct recruiter connections for Statutory Audit, Corporate FP&A, Direct/Indirect Tax & Financial Reporting.",
        "badges": [
            ("chart", "#7c3aed", "#f5f3ff", "Best-in-Class CTC Packages"),
            ("check", "#2563eb", "#eff6ff", "Direct Recruiter Inboxes"),
            ("briefcase", "#059669", "#ecfdf5", "Freshers & Semi-Qualified")
        ],
        "footer_left": "Audit • Direct & Indirect Tax • FP&A • Corporate Advisory",
        "footer_accent": "linear-gradient(90deg, #7c3aed, #9333ea)",
        "ambient_1": "radial-gradient(circle at 15% 20%, rgba(124, 58, 237, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 85% 15%, rgba(168, 85, 247, 0.12) 0%, transparent 50%)",
        "ambient_3": "radial-gradient(circle at 80% 80%, rgba(99, 102, 241, 0.1) 0%, transparent 50%)"
    },
    {
        "id": "og-reviews",
        "pill": "CA FIRM REVIEWS & STIPENDS",
        "pill_color": "#ea580c",
        "pill_bg": "#fff7ed",
        "pill_border": "#ffedd5",
        "headline": "Honest Reviews.<br><span style='color: #ea580c;'>Transparent Stipends.</span>",
        "subheadline": "Real insider reviews from articles and assistants covering work culture, working hours, exam leaves & stipends.",
        "badges": [
            ("star", "#ea580c", "#fff7ed", "100+ CA Firms Rated"),
            ("money", "#16a34a", "#f0fdf4", "Accurate Stipend Insights"),
            ("shield", "#475569", "#f8fafc", "100% Anonymous Submissions")
        ],
        "footer_left": "Culture • Work-Life Balance • Exam Leaves • Learning Exposure",
        "footer_accent": "linear-gradient(90deg, #ea580c, #f97316)",
        "ambient_1": "radial-gradient(circle at 10% 20%, rgba(234, 88, 12, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 90% 15%, rgba(249, 115, 22, 0.12) 0%, transparent 50%)",
        "ambient_3": "radial-gradient(circle at 85% 85%, rgba(245, 158, 11, 0.08) 0%, transparent 50%)"
    },
    {
        "id": "og-tools",
        "pill": "AI CA CAREER TOOLS",
        "pill_color": "#0d9488",
        "pill_bg": "#f0fdfa",
        "pill_border": "#ccfbf1",
        "headline": "Supercharge Your<br><span style='color: #0d9488;'>CA Preparation</span>",
        "subheadline": "ATS-ready CA CV Maker, AI Video Mock Interviews & ICAI Campus Shortlist Predictor built for finance aspirants.",
        "badges": [
            ("file", "#0d9488", "#f0fdfa", "CA-Specific ATS CV Templates"),
            ("video", "#2563eb", "#eff6ff", "AI Video Mock Interview Practice"),
            ("chart", "#7c3aed", "#f5f3ff", "ICAI Campus Shortlist Predictor")
        ],
        "footer_left": "Free Career Tools Designed Exclusively for Chartered Accountants",
        "footer_accent": "linear-gradient(90deg, #0d9488, #14b8a6)",
        "ambient_1": "radial-gradient(circle at 10% 20%, rgba(13, 148, 136, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 85% 15%, rgba(20, 184, 166, 0.12) 0%, transparent 50%)",
        "ambient_3": "radial-gradient(circle at 80% 85%, rgba(6, 182, 212, 0.08) 0%, transparent 50%)"
    },
    {
        "id": "og-cv-suite",
        "pill": "AI CA CV BUILDER & REVIEWER",
        "pill_color": "#0284c7",
        "pill_bg": "#f0f9ff",
        "pill_border": "#bae6fd",
        "headline": "ATS-Optimized<br><span style='color: #0284c7;'>CA Resumes & Reviews</span>",
        "subheadline": "Build and get instant AI scoring on executive CA resumes tailored for Big 4, Investment Banking & Corporate Finance.",
        "badges": [
            ("file", "#0284c7", "#f0f9ff", "Executive ATS Templates"),
            ("check", "#16a34a", "#f0fdf4", "AI Bullet Point Enhancer"),
            ("chart", "#7c3aed", "#f5f3ff", "Instant ATS Resume Score")
        ],
        "footer_left": "Big 4 • Investment Banking • Management Consulting Templates",
        "footer_accent": "linear-gradient(90deg, #0284c7, #38bdf8)",
        "ambient_1": "radial-gradient(circle at 15% 15%, rgba(2, 132, 199, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 90% 20%, rgba(56, 189, 248, 0.12) 0%, transparent 50%)",
        "ambient_3": "radial-gradient(circle at 75% 85%, rgba(14, 165, 233, 0.1) 0%, transparent 60%)"
    },
    {
        "id": "og-ai-interview",
        "pill": "AI VIDEO MOCK INTERVIEW",
        "pill_color": "#6366f1",
        "pill_bg": "#eef2ff",
        "pill_border": "#c7d2fe",
        "headline": "Master Your CA<br><span style='color: #6366f1;'>Technical & HR Interviews</span>",
        "subheadline": "Simulate real interview rounds with instant AI evaluation on finance, statutory audit, taxation and behavioral questions.",
        "badges": [
            ("video", "#6366f1", "#eef2ff", "AI Video & Voice Practice"),
            ("building", "#2563eb", "#eff6ff", "Big 4 & MNC Question Bank"),
            ("star", "#d97706", "#fffbeb", "Detailed Performance Analysis")
        ],
        "footer_left": "Real-Time AI Voice Feedback • Role-Specific Technical Questions",
        "footer_accent": "linear-gradient(90deg, #6366f1, #818cf8)",
        "ambient_1": "radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 85% 15%, rgba(129, 140, 248, 0.12) 0%, transparent 50%)",
        "ambient_3": "radial-gradient(circle at 80% 85%, rgba(168, 85, 247, 0.08) 0%, transparent 50%)"
    },
    {
        "id": "og-lms",
        "pill": "MY STUDENT CLUB ACADEMY",
        "pill_color": "#059669",
        "pill_bg": "#ecfdf5",
        "pill_border": "#a7f3d0",
        "headline": "Master High-Growth<br><span style='color: #059669;'>Finance & CA Skills</span>",
        "subheadline": "Practical masterclasses in Financial Modeling, FP&A, Valuation, PowerBI, and Taxation taught by industry leaders.",
        "badges": [
            ("briefcase", "#059669", "#ecfdf5", "Hands-on Practical Models"),
            ("star", "#d97706", "#fffbeb", "Taught by Top Finance Leaders"),
            ("shield", "#2563eb", "#eff6ff", "Verified Course Certificates")
        ],
        "footer_left": "Financial Modeling • PowerBI • FP&A • Direct/Indirect Tax",
        "footer_accent": "linear-gradient(90deg, #059669, #34d399)",
        "ambient_1": "radial-gradient(circle at 10% 20%, rgba(5, 150, 105, 0.09) 0%, transparent 50%)",
        "ambient_2": "radial-gradient(circle at 90% 15%, rgba(16, 185, 129, 0.12) 0%, transparent 50%)",
        "ambient_3": "radial-gradient(circle at 85% 85%, rgba(6, 182, 212, 0.08) 0%, transparent 50%)"
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
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }}

  /* Ambient light glows */
  .ambient-1 {{
    position: absolute;
    inset: 0;
    background: {ambient_1};
    pointer-events: none;
    z-index: 1;
  }}
  .ambient-2 {{
    position: absolute;
    inset: 0;
    background: {ambient_2};
    pointer-events: none;
    z-index: 1;
  }}
  .ambient-3 {{
    position: absolute;
    inset: 0;
    background: {ambient_3};
    pointer-events: none;
    z-index: 1;
  }}
  .mesh-grid {{
    position: absolute;
    inset: 0;
    background-image: 
      radial-gradient(rgba(148, 163, 184, 0.22) 1.5px, transparent 1.5px);
    background-size: 32px 32px;
    opacity: 0.6;
    pointer-events: none;
    z-index: 1;
  }}

  .content {{
    position: relative;
    z-index: 2;
    padding: 56px 68px 0 68px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }}

  .header {{
    display: flex;
    align-items: center;
    gap: 22px;
  }}

  .logo-img {{
    height: 48px;
    width: auto;
    object-fit: contain;
  }}

  .pill {{
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 20px;
    border-radius: 9999px;
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: 0.8px;
    color: {pill_color};
    background: {pill_bg};
    border: 1.5px solid {pill_border};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }}

  .pill-dot {{
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: {pill_color};
    box-shadow: 0 0 10px {pill_color};
  }}

  .main-section {{
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-top: 4px;
    gap: 40px;
  }}

  .left-col {{
    flex: 1;
    max-width: 660px;
  }}

  .headline {{
    font-size: 58px;
    line-height: 1.1;
    font-weight: 900;
    letter-spacing: -1.8px;
    color: #0f172a;
    margin-bottom: 20px;
  }}

  .subheadline {{
    font-size: 21.5px;
    line-height: 1.48;
    font-weight: 500;
    color: #475569;
    max-width: 620px;
  }}

  .right-col {{
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 6px;
    min-width: 360px;
  }}

  .card-badge {{
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1.5px solid rgba(226, 232, 240, 0.95);
    border-radius: 20px;
    padding: 16px 22px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 12px 28px -6px rgba(15, 23, 42, 0.06), 0 6px 12px -4px rgba(15, 23, 42, 0.04);
  }}

  .badge-icon-box {{
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }}

  .badge-text {{
    font-size: 17.5px;
    font-weight: 700;
    color: #1e293b;
    letter-spacing: -0.2px;
  }}

  /* Footer bar */
  .footer {{
    position: relative;
    z-index: 2;
    padding: 20px 68px 24px 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(248, 250, 252, 0.98);
    border-top: 1.5px solid #e2e8f0;
  }}

  .footer-left {{
    font-size: 15.5px;
    font-weight: 600;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 10px;
  }}

  .footer-right {{
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 16.5px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.2px;
  }}

  .url-highlight {{
    color: #2563eb;
    font-weight: 800;
  }}

  .free-tag {{
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    background: #dcfce7;
    color: #15803d;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }}

  .top-accent-line {{
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    background: {footer_accent};
    z-index: 10;
  }}
</style>
</head>
<body>
  <div class="top-accent-line"></div>
  <div class="mesh-grid"></div>
  <div class="ambient-1"></div>
  <div class="ambient-2"></div>
  <div class="ambient-3"></div>

  <div class="content">
    <div class="header">
      <img src="{logo_b64}" alt="My Student Club" class="logo-img" />
      <div class="pill">
        <span class="pill-dot"></span>
        {pill}
      </div>
    </div>

    <div class="main-section">
      <div class="left-col">
        <h1 class="headline">{headline}</h1>
        <p class="subheadline">{subheadline}</p>
      </div>

      <div class="right-col">
        {badges_html}
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-left">
      {footer_left}
    </div>
    <div class="footer-right">
      <span class="url-highlight">www.mystudentclub.com</span>
      <span style="color: #cbd5e1;">•</span>
      <span class="free-tag">100% FREE</span>
    </div>
  </div>
</body>
</html>
"""

def generate():
    temp_html = os.path.join(BASE_DIR, "temp_banner.html")
    
    for item in BANNERS:
        badges_html_parts = []
        for svg_key, color, bg, text in item["badges"]:
            svg_icon = SVGS.get(svg_key, "")
            b_html = f'''<div class="card-badge">
  <div class="badge-icon-box" style="background: {bg}; color: {color};">
    {svg_icon}
  </div>
  <div class="badge-text">{text}</div>
</div>'''
            badges_html_parts.append(b_html)
        badges_html = "\n".join(badges_html_parts)

        rendered_html = HTML_TEMPLATE.format(
            logo_b64=logo_b64,
            pill=item["pill"],
            pill_color=item["pill_color"],
            pill_bg=item["pill_bg"],
            pill_border=item["pill_border"],
            headline=item["headline"],
            subheadline=item["subheadline"],
            badges_html=badges_html,
            footer_left=item["footer_left"],
            footer_accent=item["footer_accent"],
            ambient_1=item["ambient_1"],
            ambient_2=item["ambient_2"],
            ambient_3=item["ambient_3"]
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

        try:
            from PIL import Image
            with Image.open(out_png) as im:
                im_rgb = im.convert("RGB")
                im_rgb.save(out_jpg, "JPEG", quality=92, optimize=True)
            print(f"  Saved {item['id']}.png ({os.path.getsize(out_png):,} bytes) and {item['id']}.jpg ({os.path.getsize(out_jpg):,} bytes)")
        except Exception as e:
            print(f"  JPG conversion warning: {e}")

    if os.path.exists(temp_html):
        os.remove(temp_html)
    print("All banners generated successfully!")

if __name__ == "__main__":
    generate()
