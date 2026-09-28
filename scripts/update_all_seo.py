import os
import re
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGE_METADATA = {
    # Core portals
    "index.html": {
        "title": "My Student Club - CA Industrial Training, Articleship & Fresher Jobs",
        "description": "Find the best CA industrial training, articleship, and CA fresher jobs at My Student Club. Apply directly to verified opportunities at top MNCs, Big 4, and leading firms.",
        "image": "og-image.png",
        "url": "https://www.mystudentclub.com/"
    },
    "ca-articleship-opportunities.html": {
        "title": "CA Articleship Opportunities | Big 4 & Top CA Firms - My Student Club",
        "description": "Explore verified CA articleship vacancies across Big 4, Top 20, and boutique CA firms across India. View firm reviews, stipends, and apply directly.",
        "image": "og-articleship.png",
        "url": "https://www.mystudentclub.com/ca-articleship-opportunities"
    },
    "articleship.html": {
        "title": "CA Articleship Opportunities | Big 4 & Top CA Firms - My Student Club",
        "description": "Explore verified CA articleship vacancies across Big 4, Top 20, and boutique CA firms across India. View firm reviews, stipends, and apply directly.",
        "image": "og-articleship.png",
        "url": "https://www.mystudentclub.com/articleship.html"
    },
    "ca-fresher-jobs.html": {
        "title": "CA Fresher Jobs | High-Growth Corporate Roles - My Student Club",
        "description": "Apply for newly qualified Chartered Accountant jobs in Auditing, FP&A, Direct/Indirect Tax, M&A, and Financial Reporting with verified recruiters.",
        "image": "og-fresher.png",
        "url": "https://www.mystudentclub.com/ca-fresher-jobs"
    },
    "fresher.html": {
        "title": "CA Fresher Jobs | High-Growth Corporate Roles - My Student Club",
        "description": "Apply for newly qualified Chartered Accountant jobs in Auditing, FP&A, Direct/Indirect Tax, M&A, and Financial Reporting with verified recruiters.",
        "image": "og-fresher.png",
        "url": "https://www.mystudentclub.com/fresher.html"
    },
    "semi-qualified-ca-jobs.html": {
        "title": "Semi-Qualified CA Jobs | Audit, Tax & Accounting Openings - My Student Club",
        "description": "Discover verified job opportunities for Semi-Qualified CAs, CA Inter, and CA Finalists across top accounting firms and corporates in India.",
        "image": "og-fresher.png",
        "url": "https://www.mystudentclub.com/semi-qualified-ca-jobs"
    },
    "semi-qualified.html": {
        "title": "Semi-Qualified CA Jobs | Audit, Tax & Accounting Openings - My Student Club",
        "description": "Discover verified job opportunities for Semi-Qualified CAs, CA Inter, and CA Finalists across top accounting firms and corporates in India.",
        "image": "og-fresher.png",
        "url": "https://www.mystudentclub.com/semi-qualified.html"
    },
    "experienced-ca-jobs.html": {
        "title": "Experienced CA Jobs | Managerial & Leadership Roles - My Student Club",
        "description": "Career-defining opportunities for experienced Chartered Accountants in finance leadership, taxation advisory, risk, and corporate finance.",
        "image": "og-fresher.png",
        "url": "https://www.mystudentclub.com/experienced-ca-jobs.html"
    },
    "experienced-ca.html": {
        "title": "Experienced CA Jobs | Managerial & Leadership Roles - My Student Club",
        "description": "Career-defining opportunities for experienced Chartered Accountants in finance leadership, taxation advisory, risk, and corporate finance.",
        "image": "og-fresher.png",
        "url": "https://www.mystudentclub.com/experienced-ca.html"
    },
    "articleship-firm-reviews.html": {
        "title": "CA Articleship Firm Reviews & Stipend Database - My Student Club",
        "description": "Read transparent, anonymous reviews from CA students covering work culture, working hours, exam leaves, and actual stipends across 100+ firms.",
        "image": "og-reviews.png",
        "url": "https://www.mystudentclub.com/articleship-firm-reviews.html"
    },
    "reviews.html": {
        "title": "CA Articleship Firm Reviews & Stipend Database - My Student Club",
        "description": "Read transparent, anonymous reviews from CA students covering work culture, working hours, exam leaves, and actual stipends across 100+ firms.",
        "image": "og-reviews.png",
        "url": "https://www.mystudentclub.com/reviews.html"
    },
    "articleship-firm-review.html": {
        "title": "CA Firm Reviews | Insider Articleship Insights - My Student Club",
        "description": "Detailed insights into articleship firm experience, learning exposure, client audits, and stipends shared by real students.",
        "image": "og-reviews.png",
        "url": "https://www.mystudentclub.com/articleship-firm-review.html"
    },
    "ca-industrial-training-resources.html": {
        "title": "CA Industrial Training Resources & Interview Guides - My Student Club",
        "description": "Free preparation materials, CV blueprints, and interview question booklets for CA Industrial Training at top investment banks and MNCs.",
        "image": "og-industrial.png",
        "url": "https://www.mystudentclub.com/ca-industrial-training-resources.html"
    },
    "ca-fresher-training-resources.html": {
        "title": "CA Fresher Career Resources & Interview Guides - My Student Club",
        "description": "Comprehensive technical interview guides and preparation dossiers for CA fresher placements across audit, tax, and finance.",
        "image": "og-fresher.png",
        "url": "https://www.mystudentclub.com/ca-fresher-training-resources.html"
    },

    # CV Builder Suite
    "cv-builder/index.html": {
        "title": "AI CA CV Builder | ATS-Optimized Resume Creator - My Student Club",
        "description": "Build high-scoring ATS resumes designed specifically for Chartered Accountants, industrial trainees, and articles. Choose from executive templates.",
        "image": "og-cv-suite.png",
        "url": "https://www.mystudentclub.com/cv-builder/"
    },
    "cv-maker.html": {
        "title": "AI CA CV Maker | Professional ATS Resume Builder - My Student Club",
        "description": "Build high-scoring ATS resumes designed specifically for Chartered Accountants, industrial trainees, and articles. Free instant export.",
        "image": "og-cv-suite.png",
        "url": "https://www.mystudentclub.com/cv-maker.html"
    },
    "cv-builder2.html": {
        "title": "CA CV Builder Suite | Professional Finance Resumes - My Student Club",
        "description": "Choose from executive CA CV templates curated for Big 4, investment banking, and corporate finance roles.",
        "image": "og-cv-suite.png",
        "url": "https://www.mystudentclub.com/cv-builder2.html"
    },
    "cv-checklist.html": {
        "title": "The Chartered Accountant's CV Blueprint & Checklist - My Student Club",
        "description": "A comprehensive checklist and formatting blueprint for crafting high-impact CA articleship and fresher resumes.",
        "image": "og-cv-suite.png",
        "url": "https://www.mystudentclub.com/cv-checklist.html"
    },
    "cv_templates5.html": {
        "title": "Chartered Accountant Resume Templates - My Student Club",
        "description": "Modern, ATS-friendly CV templates formatted specifically for CA freshers, industrial trainees, and experienced professionals.",
        "image": "og-cv-suite.png",
        "url": "https://www.mystudentclub.com/cv_templates5.html"
    },

    # CV Reviewer
    "cv-reviewer/index.html": {
        "title": "AI CA CV Reviewer | Instant ATS Resume Scoring - My Student Club",
        "description": "Upload your resume for real-time AI feedback on ATS compatibility, finance action verbs, bullet impact, and Big 4 shortlisting criteria.",
        "image": "og-cv-suite.png",
        "url": "https://www.mystudentclub.com/cv-reviewer/"
    },

    # AI Mock Interview
    "ai-interview.html": {
        "title": "AI CA Mock Video Interview Practice - My Student Club",
        "description": "Simulate realistic technical and HR interviews with real-time AI feedback on finance, accounting, audit, and tax questions.",
        "image": "og-ai-interview.png",
        "url": "https://www.mystudentclub.com/ai-interview.html"
    },
    "ai-interview2.html": {
        "title": "AI Video Mock Interview Practice | CA Aspirants - My Student Club",
        "description": "Real-time AI voice and video mock interviews with instant speech evaluation and technical role assessments.",
        "image": "og-ai-interview.png",
        "url": "https://www.mystudentclub.com/ai-interview2.html"
    },
    "ai-interview3.html": {
        "title": "AI CA Technical Interview Practice - My Student Club",
        "description": "Practice role-specific interview questions for investment banking, FP&A, statutory audit, and taxation with AI scoring.",
        "image": "og-ai-interview.png",
        "url": "https://www.mystudentclub.com/ai-interview3.html"
    },
    "ai-interview4.html": {
        "title": "AI CA Video Interview Simulator - My Student Club",
        "description": "Complete mock video interview simulator with comprehensive scorecard, strengths, and areas for improvement.",
        "image": "og-ai-interview.png",
        "url": "https://www.mystudentclub.com/ai-interview4.html"
    },
    "interview-predictor.html": {
        "title": "CA Interview Question Predictor & Company Dossier - My Student Club",
        "description": "Predict role-specific and company-specific interview questions for CA Industrial Training and Fresher hiring drives.",
        "image": "og-ai-interview.png",
        "url": "https://www.mystudentclub.com/interview-predictor.html"
    },

    # Learning Management System (LMS)
    "learning-management-system/index.html": {
        "title": "Learning Management System | My Student Club Academy",
        "description": "Access your enrolled CA masterclasses, practical finance modeling courses, and study materials on My Student Club LMS.",
        "image": "og-lms.png",
        "url": "https://www.mystudentclub.com/learning-management-system/"
    },
    "learning-management-system/course.html": {
        "title": "Course Curriculum & Modules | My Student Club LMS",
        "description": "Structured modules, real-world case studies, and Excel financial models taught by leading Chartered Accountants.",
        "image": "og-lms.png",
        "url": "https://www.mystudentclub.com/learning-management-system/course.html"
    },
    "learning-management-system/lms-resources.html": {
        "title": "LMS Resources & Learning Materials - My Student Club",
        "description": "Download lecture notes, templates, sample financial models, and interview preparation guides on My Student Club LMS.",
        "image": "og-lms.png",
        "url": "https://www.mystudentclub.com/learning-management-system/lms-resources.html"
    },
    "learning-management-system/video.html": {
        "title": "Course Video Player | My Student Club LMS",
        "description": "Stream high-definition lecture modules and walkthrough sessions on My Student Club LMS.",
        "image": "og-lms.png",
        "url": "https://www.mystudentclub.com/learning-management-system/video.html"
    },

    # Payment Success Page (Privacy Protected: does not reveal sensitive purchase/customer details outside the link)
    "payment-success.html": {
        "title": "Registration Confirmation | My Student Club",
        "description": "Thank you for registering with My Student Club. Log in to your candidate dashboard to access your tools and opportunities.",
        "image": "og-image.png",
        "url": "https://www.mystudentclub.com/payment-success.html",
        "robots": "noindex, nofollow"
    },

    # Mentorship & Additional Services
    "mentor.html": {
        "title": "Find a CA Mentor | 1-on-1 Guidance - My Student Club",
        "description": "Connect 1-on-1 with experienced Chartered Accountants from Big 4 and top investment banks for personalized career mentorship.",
        "image": "og-image.png",
        "url": "https://www.mystudentclub.com/mentor.html"
    },
    "mentor-profile.html": {
        "title": "CA Mentor Profile | My Student Club Mentorship",
        "description": "Book a 1-on-1 mentorship session with industry-tested Chartered Accountants to accelerate your career.",
        "image": "og-image.png",
        "url": "https://www.mystudentclub.com/mentor-profile.html"
    },
    "career_navigator.html": {
        "title": "Professional Finance Career Navigator - My Student Club",
        "description": "Explore career paths in Investment Banking, FP&A, Audit, Tax, and Management Consulting for Chartered Accountants.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/career_navigator.html"
    },
    "ICAI-Campus-Shortlisting-Predictor/index.html": {
        "title": "ICAI Campus Shortlisting Predictor - My Student Club",
        "description": "Predict your ICAI Campus Placement shortlisting chances across top companies based on your attempts, marks, and profile.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/ICAI-Campus-Shortlisting-Predictor/"
    },
    "direct-tax-interview-booklet/index.html": {
        "title": "Direct Tax Interview Booklet | CA Preparation - My Student Club",
        "description": "Master corporate tax, transfer pricing, and TDS technical interview questions with our comprehensive guide.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/direct-tax-interview-booklet/"
    },
    "indirect-tax-interview-booklet/index.html": {
        "title": "Indirect Tax (GST) Interview Booklet - My Student Club",
        "description": "Essential GST concepts, input tax credit rules, and audit interview questions for CA freshers and industrial trainees.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/indirect-tax-interview-booklet/"
    },
    "fpa-interview-booklet/index.html": {
        "title": "FP&A Interview Booklet | Financial Planning & Analysis - My Student Club",
        "description": "Ace corporate FP&A interviews with variance analysis, budgeting, and KPI questions asked by top recruiters.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/fpa-interview-booklet/"
    },
    "internal-audit-interview-booklet/index.html": {
        "title": "Internal Audit & Risk Interview Booklet - My Student Club",
        "description": "Internal audit methodology, IFC testing, and risk control matrices preparation booklet for Chartered Accountants.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/internal-audit-interview-booklet/"
    },
    "investment-banking-interview-booklet/index.html": {
        "title": "Investment Banking Interview Booklet - My Student Club",
        "description": "Valuation, DCF modeling, M&A accounting, and pitch-book concepts for CA aspirants entering investment banking.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/investment-banking-interview-booklet/"
    },
    "finance-interview-booklet/index.html": {
        "title": "Corporate Finance Interview Booklet - My Student Club",
        "description": "Core corporate finance, treasury, working capital, and capital budgeting interview questions for CA candidates.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/finance-interview-booklet/"
    },
    "skill-check/index.html": {
        "title": "CA Skill Check Assessment - My Student Club",
        "description": "Benchmark your financial knowledge, auditing acumen, and taxation expertise with our CA Skill Check assessment.",
        "image": "og-tools.png",
        "url": "https://www.mystudentclub.com/skill-check/"
    },
    "contact.html": {
        "title": "Contact Us | My Student Club",
        "description": "Reach out to My Student Club for recruiter inquiries, career counseling, support, or partnership opportunities.",
        "image": "og-image.png",
        "url": "https://www.mystudentclub.com/contact.html"
    },
    "forum.html": {
        "title": "CA Discussion Forum & Community - My Student Club",
        "description": "Ask questions, discuss articleship experiences, share interview questions, and connect with CA peers across India.",
        "image": "og-image.png",
        "url": "https://www.mystudentclub.com/forum.html"
    },
    "links/index.html": {
        "title": "Connect with My Student Club | Official Links & Communities",
        "description": "Join 50,000+ CA students on WhatsApp, Telegram, YouTube, and LinkedIn for verified jobs, articleships, and resources.",
        "image": "og-image.png",
        "url": "https://www.mystudentclub.com/links/"
    }
}

def build_og_tags(title, description, image_filename, canonical_url, robots=None):
    img_url = f"https://www.mystudentclub.com/assets/{image_filename}"
    robots_tag = f'  <meta name="robots" content="{robots}">\n' if robots else ''
    return f"""{robots_tag}  <!-- Open Graph / WhatsApp / Facebook / LinkedIn -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="{canonical_url}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:image" content="{img_url}">
  <meta property="og:image:secure_url" content="{img_url}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{title}">
  <meta property="og:site_name" content="My Student Club">

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">
  <meta name="twitter:image" content="{img_url}">"""

def update_core_pages():
    print("Updating all site pages...")
    for rel_path, meta in PAGE_METADATA.items():
        file_path = os.path.join(BASE_DIR, rel_path)
        if not os.path.exists(file_path):
            print(f"Skipping {rel_path} (not found)")
            continue
        
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        # Update title if needed
        content = re.sub(r'<title>.*?</title>', f'<title>{meta["title"]}</title>', content, count=1, flags=re.IGNORECASE)
        # Update description if needed
        if '<meta name="description"' in content.lower():
            content = re.sub(r'<meta\s+name=["\']description["\']\s+content=["\'].*?["\']\s*/?>', f'<meta name="description" content="{meta["description"]}">', content, count=1, flags=re.IGNORECASE)
        else:
            # Insert description tag after title
            content = re.sub(r'(<title>.*?</title>)', r'\1\n  <meta name="description" content="' + meta["description"] + '">', content, count=1, flags=re.IGNORECASE)

        # Remove any existing og or twitter tags to avoid duplication
        content = re.sub(r'\s*<!--\s*(?:Open Graph|Twitter).*?-->', '', content, flags=re.IGNORECASE)
        content = re.sub(r'\s*<meta\s+property=["\']og:[^>]+>', '', content, flags=re.IGNORECASE)
        content = re.sub(r'\s*<meta\s+name=["\']twitter:[^>]+>', '', content, flags=re.IGNORECASE)
        if meta.get("robots"):
            content = re.sub(r'\s*<meta\s+name=["\']robots["\'][^>]*>', '', content, flags=re.IGNORECASE)

        # Build clean tags block
        og_block = build_og_tags(meta["title"], meta["description"], meta["image"], meta["url"], meta.get("robots"))
        
        # Inject right after description or robots or title
        if '<meta name="description"' in content:
            content = re.sub(r'(<meta\s+name=["\']description["\'][^>]*>)', r'\1\n' + og_block, content, count=1, flags=re.IGNORECASE)
        elif '<meta name="robots"' in content:
            content = re.sub(r'(<meta\s+name=["\']robots["\'][^>]*>)', r'\1\n' + og_block, content, count=1, flags=re.IGNORECASE)
        elif '</title>' in content:
            content = re.sub(r'(</title>)', r'\1\n' + og_block, content, count=1, flags=re.IGNORECASE)
        elif '</head>' in content:
            content = content.replace('</head>', og_block + '\n</head>', 1)
        else:
            print(f"Warning: could not inject into {rel_path}")
            continue

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Updated {rel_path} with {meta['image']}")

if __name__ == "__main__":
    update_core_pages()
