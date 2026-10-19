-- MSC Articleship Program v2: Day 0–6 sessions and completed resource files.
-- Reversible: restore a preflight export of this course's rows; for a new course,
-- remove only the 13 (course, day_number, video_number) tuples in the handover.
-- Does not change enrollment, schema, storage, or existing video recording paths.
-- Column contract: learning-management-system/course-script.js loadCourseVideos().
-- json_populate_recordset uses the live videos column types (including resources).
-- Take a course-row backup and test on a database snapshot before the maintainer runs this.
BEGIN;

WITH incoming AS (
    SELECT * FROM json_populate_recordset(NULL::public.videos, '[
  {
    "course": "msc-articleship-program",
    "video_number": 1,
    "title": "The MSC Articleship Guidebook",
    "description": "Read the guidebook and join the MSC WhatsApp channel.",
    "day_number": 0,
    "resources": [
      {
        "title": "MSC Articleship Guidebook",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-0/guidebook/MSC Articleship Guidebook.docx",
        "view_storage_path": "articleship-program-v2/day-0/guidebook/MSC Articleship Guidebook.pdf",
        "group": "Slides"
      },
      {
        "title": "Day 0 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-0/slides/Day 0 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "Free live session slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-0/slides/Free live session.pdf",
        "group": "Slides"
      },
      {
        "title": "MSC WhatsApp channel",
        "type": "external_link",
        "url": "https://whatsapp.com/channel/0029Vb8XM5GDzgT6YyWk4x0F",
        "group": "Tools"
      },
      {
        "title": "WhatsApp Padam",
        "type": "external_link",
        "url": "https://wa.me/917228881182",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 2,
    "title": "Your articleship CV",
    "description": "Prepare your CV and cover letter.",
    "day_number": 1,
    "resources": [
      {
        "title": "Day 1 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-1/slides/Day 1 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "Classic Academic",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Classic Academic.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Classic Academic.pdf",
        "group": "Templates"
      },
      {
        "title": "Academic Highlights",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Academic Highlights.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Academic Highlights.pdf",
        "group": "Templates"
      },
      {
        "title": "Accounting Practice",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Accounting Practice.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Accounting Practice.pdf",
        "group": "Templates"
      },
      {
        "title": "Audit & Tax",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Audit & Tax.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Audit & Tax.pdf",
        "group": "Templates"
      },
      {
        "title": "Campus Leadership",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Campus Leadership.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Campus Leadership.pdf",
        "group": "Templates"
      },
      {
        "title": "College Projects",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/College Projects.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/College Projects.pdf",
        "group": "Templates"
      },
      {
        "title": "Community Contribution",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Community Contribution.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Community Contribution.pdf",
        "group": "Templates"
      },
      {
        "title": "Direct Entry Graduate",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Entry Graduate.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Entry Graduate.pdf",
        "group": "Templates"
      },
      {
        "title": "Direct Tax Practice",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Tax Practice.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Tax Practice.pdf",
        "group": "Templates"
      },
      {
        "title": "Excel First",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Excel First.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Excel First.pdf",
        "group": "Templates"
      },
      {
        "title": "Financial Analysis",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Financial Analysis.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Financial Analysis.pdf",
        "group": "Templates"
      },
      {
        "title": "GST Reconciliation",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/GST Reconciliation.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/GST Reconciliation.pdf",
        "group": "Templates"
      },
      {
        "title": "IFC Controls",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/IFC Controls.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/IFC Controls.pdf",
        "group": "Templates"
      },
      {
        "title": "Internal Audit Process",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Internal Audit Process.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Internal Audit Process.pdf",
        "group": "Templates"
      },
      {
        "title": "Separate Group Results",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Separate Group Results.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Separate Group Results.pdf",
        "group": "Templates"
      },
      {
        "title": "Sport & Responsibility",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Sport & Responsibility.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Sport & Responsibility.pdf",
        "group": "Templates"
      },
      {
        "title": "Statutory Audit Foundations",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Statutory Audit Foundations.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Statutory Audit Foundations.pdf",
        "group": "Templates"
      },
      {
        "title": "Writing & Communication",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Writing & Communication.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Writing & Communication.pdf",
        "group": "Templates"
      },
      {
        "title": "CV gallery",
        "type": "zip",
        "download_storage_path": "articleship-program-v2/day-1/CV gallery.zip",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/Choose your layout.pdf",
        "group": "Templates"
      },
      {
        "title": "Choose your cover letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Choose your cover letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Choose your cover letter.pdf",
        "group": "Templates"
      },
      {
        "title": "Statutory Audit Cover Letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Statutory Audit Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Statutory Audit Cover Letter.pdf",
        "group": "Templates"
      },
      {
        "title": "Broad Exposure Cover Letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Broad Exposure Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Broad Exposure Cover Letter.pdf",
        "group": "Templates"
      },
      {
        "title": "Direct Tax Cover Letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Direct Tax Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Direct Tax Cover Letter.pdf",
        "group": "Templates"
      },
      {
        "title": "GST Cover Letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/GST Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/GST Cover Letter.pdf",
        "group": "Templates"
      },
      {
        "title": "Internal Audit and IFC Cover Letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Internal Audit and IFC Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Internal Audit and IFC Cover Letter.pdf",
        "group": "Templates"
      },
      {
        "title": "Referral Cover Letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Referral Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Referral Cover Letter.pdf",
        "group": "Templates"
      },
      {
        "title": "Strong Academics Cover Letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Strong Academics Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Strong Academics Cover Letter.pdf",
        "group": "Templates"
      },
      {
        "title": "Valuation and FDD Cover Letter",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Valuation and FDD Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Valuation and FDD Cover Letter.pdf",
        "group": "Templates"
      },
      {
        "title": "Big 4 and other firms’ CVs",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-1/selected-cvs-anonymised.pdf",
        "group": "Examples"
      },
      {
        "title": "CV checklist",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-checklist.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-checklist.pdf",
        "group": "Checklists"
      },
      {
        "title": "Keywords by domain",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-1/keywords-by-domain.xlsx",
        "view_storage_path": "articleship-program-v2/day-1/keywords-by-domain.pdf",
        "group": "Checklists"
      },
      {
        "title": "CV Builder",
        "type": "external_link",
        "url": "https://www.mystudentclub.com/cv-builder/?stage=articleship",
        "group": "Tools"
      },
      {
        "title": "CV Reviewer",
        "type": "external_link",
        "url": "https://www.mystudentclub.com/cv-reviewer/#uploadSection",
        "group": "Tools"
      },
      {
        "title": "Personal CV review",
        "type": "external_link",
        "url": "https://wa.me/917228881182?text=Hello%20Sir%2C%20please%20review%20my%20articleship%20CV.",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 8,
    "title": "Building your profile fast",
    "description": "Choose a project, build your skills and plan your CV ahead.",
    "day_number": 1,
    "resources": [
      {
        "title": "Industrial Training students’ CVs",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-1/selected-industrial-training-cvs.pdf",
        "group": "Examples"
      },
      {
        "title": "Strengthen your CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/strengthen-your-cv.docx",
        "view_storage_path": "articleship-program-v2/day-1/strengthen-your-cv.pdf",
        "group": "Checklists"
      },
      {
        "title": "CV ahead",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-ahead.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-ahead.pdf",
        "group": "Checklists"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 3,
    "title": "Applying the right way",
    "description": "Send your applications through the right routes.",
    "day_number": 2,
    "resources": [
      {
        "title": "Day 2 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-2/slides/Day 2 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "Articleship Mail Templates",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.docx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.pdf",
        "group": "Templates"
      },
      {
        "title": "Big 10 Articleship Routes",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-2/Big 10 Articleship Routes.xlsx",
        "view_storage_path": "articleship-program-v2/day-2/Big 10 Articleship Routes.pdf",
        "group": "Checklists"
      },
      {
        "title": "Articleship Cold Mailing List",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Cold Mailing List.xlsx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Cold Mailing List.pdf",
        "group": "Checklists"
      },
      {
        "title": "Articleship Vacancy Alerts",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Vacancy Alerts.docx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Vacancy Alerts.pdf",
        "group": "Checklists"
      },
      {
        "title": "Articleship Automail",
        "type": "external_link",
        "url": "https://wa.me/917228881182?text=Hello%20Sir%2C%20please%20share%20my%20Articleship%20Automail%20sheet.",
        "group": "Tools"
      },
      {
        "title": "MSC WhatsApp channel",
        "type": "external_link",
        "url": "https://whatsapp.com/channel/0029Vb8XM5GDzgT6YyWk4x0F",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 9,
    "title": "Follow-ups, offers and your weekly routine",
    "description": "Follow up, handle offers and keep your weekly routine.",
    "day_number": 2,
    "resources": [
      {
        "title": "Articleship Mail Templates",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.docx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.pdf",
        "group": "Templates"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 4,
    "title": "Using LinkedIn",
    "description": "Fix your profile and find the right posts and people.",
    "day_number": 3,
    "resources": [
      {
        "title": "Day 3 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-3/slides/Day 3 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "LinkedIn search guide",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-3/LinkedIn Search Guide.docx",
        "view_storage_path": "articleship-program-v2/day-3/LinkedIn Search Guide.pdf",
        "group": "Checklists"
      },
      {
        "title": "LinkedIn search links",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-3/LinkedIn Search Links.xlsx",
        "view_storage_path": "articleship-program-v2/day-3/LinkedIn Search Links.pdf",
        "group": "Checklists"
      },
      {
        "title": "LinkedIn profile checklist",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-3/LinkedIn Profile Checklist.docx",
        "view_storage_path": "articleship-program-v2/day-3/LinkedIn Profile Checklist.pdf",
        "group": "Checklists"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 10,
    "title": "Connections and referrals",
    "description": "Reach the right people and ask for a referral.",
    "day_number": 3,
    "resources": [
      {
        "title": "LinkedIn connection and follow-up messages",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-3/LinkedIn Connection and Follow-up Messages.docx",
        "view_storage_path": "articleship-program-v2/day-3/LinkedIn Connection and Follow-up Messages.pdf",
        "group": "Templates"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 5,
    "title": "Cracking interviews",
    "description": "Prepare your introduction and the answers your CV will get.",
    "day_number": 4,
    "resources": [
      {
        "title": "Day 4 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-4/slides/Day 4 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "Interview Preparation Syllabus",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-4/Interview-Preparation-Syllabus.docx",
        "view_storage_path": "articleship-program-v2/day-4/Interview-Preparation-Syllabus.pdf",
        "group": "Checklists"
      },
      {
        "title": "Interview Syllabus Tracker",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-4/Interview-Syllabus-Tracker.xlsx",
        "view_storage_path": "articleship-program-v2/day-4/Interview-Syllabus-Tracker.pdf",
        "group": "Checklists"
      },
      {
        "title": "Articleship Interviews by Firm",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-4/Articleship-Interviews-by-Firm.docx",
        "view_storage_path": "articleship-program-v2/day-4/Articleship-Interviews-by-Firm.pdf",
        "group": "Checklists"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 11,
    "title": "Practising audit, tax and Excel",
    "description": "Revise your domain and practise the Excel test.",
    "day_number": 4,
    "resources": [
      {
        "title": "Statutory audit interview booklet",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-4/statutory-audit-interview-booklet.docx",
        "view_storage_path": "articleship-program-v2/day-4/statutory-audit-interview-booklet.pdf",
        "group": "Checklists"
      },
      {
        "title": "Internal audit interview booklet",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-4/internal-audit-interview-booklet.docx",
        "view_storage_path": "articleship-program-v2/day-4/internal-audit-interview-booklet.pdf",
        "group": "Checklists"
      },
      {
        "title": "Direct tax interview booklet",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-4/direct-tax-interview-booklet.docx",
        "view_storage_path": "articleship-program-v2/day-4/direct-tax-interview-booklet.pdf",
        "group": "Checklists"
      },
      {
        "title": "Indirect tax interview booklet",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-4/indirect-tax-interview-booklet.docx",
        "view_storage_path": "articleship-program-v2/day-4/indirect-tax-interview-booklet.pdf",
        "group": "Checklists"
      },
      {
        "title": "Articleship Excel test",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-4/articleship-excel-test.xlsx",
        "view_storage_path": "articleship-program-v2/day-4/articleship-excel-test.pdf",
        "group": "Tools"
      },
      {
        "title": "Practise your interview",
        "type": "external_link",
        "url": "https://www.mystudentclub.com/ai-interview.html?mode=articleship",
        "group": "Tools"
      },
      {
        "title": "Articleship Excel solution",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-4/articleship-excel-solution.xlsx",
        "view_storage_path": "articleship-program-v2/day-4/articleship-excel-solution.pdf",
        "group": "Examples"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 6,
    "title": "Choosing your domain",
    "description": "Choose your first domain and one backup.",
    "day_number": 5,
    "resources": [
      {
        "title": "Day 5 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-5/slides/Day 5 slides.pdf",
        "group": "Slides"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 12,
    "title": "Finding firms in your domain",
    "description": "Shortlist firms in your domain and learn before you apply.",
    "day_number": 5,
    "resources": [
      {
        "title": "Domain firm shortlist",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-5/domain-firms/Domain firm shortlist.xlsx",
        "view_storage_path": "articleship-program-v2/day-5/domain-firms/Domain firm shortlist.pdf",
        "group": "Checklists"
      },
      {
        "title": "MSC Domain Roadmaps",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-5/domain-roadmaps/MSC Domain Roadmaps.docx",
        "view_storage_path": "articleship-program-v2/day-5/domain-roadmaps/MSC Domain Roadmaps.pdf",
        "group": "Checklists"
      },
      {
        "title": "Domain certifications",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-5/domain-roadmaps/Domain certifications.docx",
        "view_storage_path": "articleship-program-v2/day-5/domain-roadmaps/Domain certifications.pdf",
        "group": "Checklists"
      },
      {
        "title": "Firm notes",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-5/domain-firms/Firm notes.docx",
        "view_storage_path": "articleship-program-v2/day-5/domain-firms/Firm notes.pdf",
        "group": "Examples"
      },
      {
        "title": "Experience Explorer",
        "type": "external_link",
        "url": "https://www.mystudentclub.com/articleship-program/experience-explorer/",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 7,
    "title": "Registering your articleship",
    "description": "Plan your joining date and complete your registration.",
    "day_number": 6,
    "resources": [
      {
        "title": "Day 6 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-6/slides/Day 6 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "Articleship registration process",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/articleship-registration-process.docx",
        "view_storage_path": "articleship-program-v2/day-6/articleship-registration-process.pdf",
        "group": "Checklists"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 13,
    "title": "Transfer, industrial training and CA Final",
    "description": "Plan transfer, industrial training and your CA Final studies.",
    "day_number": 6,
    "resources": [
      {
        "title": "Form 109 Letter Templates",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/Form 109 Letter Templates.docx",
        "view_storage_path": "articleship-program-v2/day-6/Form 109 Letter Templates.pdf",
        "group": "Templates"
      },
      {
        "title": "Articleship transfer guidelines",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/articleship-transfer-guidelines.docx",
        "view_storage_path": "articleship-program-v2/day-6/articleship-transfer-guidelines.pdf",
        "group": "Checklists"
      },
      {
        "title": "Industrial training policy",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/industrial-training-policy.docx",
        "view_storage_path": "articleship-program-v2/day-6/industrial-training-policy.pdf",
        "group": "Checklists"
      },
      {
        "title": "CA Final study guidelines",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/ca-final-study-guidelines.docx",
        "view_storage_path": "articleship-program-v2/day-6/ca-final-study-guidelines.pdf",
        "group": "Checklists"
      }
    ],
    "industrial_training_path": null
  }
]'::json)
), updated AS (
    UPDATE public.videos AS existing
    SET title = incoming.title,
        description = incoming.description,
        resources = incoming.resources
    FROM incoming
    WHERE existing.course = incoming.course
      AND existing.day_number = incoming.day_number
      AND existing.video_number = incoming.video_number
    RETURNING existing.video_number
)
INSERT INTO public.videos
    (course, video_number, title, description, day_number, resources, industrial_training_path)
SELECT course, video_number, title, description, day_number, resources, industrial_training_path
FROM incoming
WHERE NOT EXISTS (
    SELECT 1 FROM public.videos AS existing
    WHERE existing.course = incoming.course
      AND existing.day_number = incoming.day_number
      AND existing.video_number = incoming.video_number
);

COMMIT;
