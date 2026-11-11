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
    "description": "Join the channel today and save the three links in the preface. Then open Day 1.",
    "day_number": 0,
    "resources": [
      {
        "title": "MSC Articleship Guidebook",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-0/guidebook/MSC Articleship Guidebook.docx",
        "view_storage_path": "articleship-program-v2/day-0/guidebook/MSC Articleship Guidebook.pdf",
        "group": "Guidebook"
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
    "description": "Finish your one-page CV PDF today, then send it to me for a review.",
    "day_number": 1,
    "resources": [
      {
        "title": "Day 1 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-1/slides/Day 1 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "Choose your CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/Choose your CV.docx",
        "view_storage_path": "articleship-program-v2/day-1/Choose your CV.pdf",
        "group": "Templates"
      },
      {
        "title": "Classic Academic CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Classic Academic.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Classic Academic.pdf",
        "group": "Templates"
      },
      {
        "title": "Separate Group Results CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Separate Group Results.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Separate Group Results.pdf",
        "group": "Templates"
      },
      {
        "title": "Academic Highlights CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Academic Highlights.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Academic Highlights.pdf",
        "group": "Templates"
      },
      {
        "title": "College Projects CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/College Projects.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/College Projects.pdf",
        "group": "Templates"
      },
      {
        "title": "Excel First CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Excel First.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Excel First.pdf",
        "group": "Templates"
      },
      {
        "title": "Statutory Audit Foundations CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Statutory Audit Foundations.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Statutory Audit Foundations.pdf",
        "group": "Templates"
      },
      {
        "title": "Direct Tax Practice CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Tax Practice.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Tax Practice.pdf",
        "group": "Templates"
      },
      {
        "title": "GST Reconciliation CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/GST Reconciliation.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/GST Reconciliation.pdf",
        "group": "Templates"
      },
      {
        "title": "Accounting Practice CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Accounting Practice.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Accounting Practice.pdf",
        "group": "Templates"
      },
      {
        "title": "Audit & Tax CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Audit & Tax.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Audit & Tax.pdf",
        "group": "Templates"
      },
      {
        "title": "Campus Leadership CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Campus Leadership.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Campus Leadership.pdf",
        "group": "Templates"
      },
      {
        "title": "Community Contribution CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Community Contribution.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Community Contribution.pdf",
        "group": "Templates"
      },
      {
        "title": "Direct Entry Graduate CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Entry Graduate.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Entry Graduate.pdf",
        "group": "Templates"
      },
      {
        "title": "Financial Analysis CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Financial Analysis.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Financial Analysis.pdf",
        "group": "Templates"
      },
      {
        "title": "IFC Controls CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/IFC Controls.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/IFC Controls.pdf",
        "group": "Templates"
      },
      {
        "title": "Internal Audit Process CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Internal Audit Process.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Internal Audit Process.pdf",
        "group": "Templates"
      },
      {
        "title": "Sport & Responsibility CV",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Sport & Responsibility.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Sport & Responsibility.pdf",
        "group": "Templates"
      },
      {
        "title": "Writing & Communication CV",
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
        "title": "Classic Academic, filled in",
        "type": "pdf",
        "download_storage_path": "articleship-program-v2/day-1/Classic Academic, filled in.pdf",
        "view_storage_path": "articleship-program-v2/day-1/Classic Academic, filled in.pdf",
        "group": "Examples"
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
        "download_storage_path": "articleship-program-v2/day-1/CV checklist.docx",
        "view_storage_path": "articleship-program-v2/day-1/CV checklist.pdf",
        "group": "Checklists"
      },
      {
        "title": "Keywords by domain",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-1/Keywords by domain.xlsx",
        "view_storage_path": "articleship-program-v2/day-1/Keywords by domain.pdf",
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
    "description": "Pick one project or activity and finish a first output in two focused sessions.",
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
        "download_storage_path": "articleship-program-v2/day-1/Strengthen your CV.docx",
        "view_storage_path": "articleship-program-v2/day-1/Strengthen your CV.pdf",
        "group": "Checklists"
      },
      {
        "title": "CV ahead",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-1/CV ahead.docx",
        "view_storage_path": "articleship-program-v2/day-1/CV ahead.pdf",
        "group": "Checklists"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 3,
    "title": "Applying the right way",
    "description": "Send five relevant applications today, with a follow-up date for each.",
    "day_number": 2,
    "resources": [
      {
        "title": "Day 2 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-2/slides/Day 2 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "Articleship mail templates",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.docx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.pdf",
        "group": "Templates"
      },
      {
        "title": "Articleship vacancy alerts",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Vacancy Alerts.docx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Vacancy Alerts.pdf",
        "group": "Checklists"
      },
      {
        "title": "Big 10 articleship routes",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-2/Big 10 Articleship Routes.xlsx",
        "view_storage_path": "articleship-program-v2/day-2/Big 10 Articleship Routes.pdf",
        "group": "Tools"
      },
      {
        "title": "Articleship cold mailing list",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Cold Mailing List.xlsx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Cold Mailing List.pdf",
        "group": "Tools"
      },
      {
        "title": "Get your Automail sheet",
        "type": "external_link",
        "url": "https://wa.me/917228881182?text=Hello%20Sir%2C%20please%20share%20my%20Articleship%20Automail%20sheet.",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 9,
    "title": "Follow-ups, offers and your weekly routine",
    "description": "Block 9:00 to 9:45 am for applications every weekday, and WhatsApp me your counts every Saturday.",
    "day_number": 2,
    "resources": [
      {
        "title": "Follow-up, thank-you and back-out mails",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.docx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.pdf",
        "page": 3,
        "group": "Templates"
      },
      {
        "title": "Send your Saturday counts",
        "type": "external_link",
        "url": "https://wa.me/917228881182?text=Hello%20Sir%2C%20my%20Saturday%20counts%3A%20applications%20%5B%20%5D%2C%20cold%20mails%20%5B%20%5D%2C%20follow-ups%20%5B%20%5D%2C%20calls%20%5B%20%5D%2C%20interviews%20%5B%20%5D.%20Stuck%20at%3A%20%5B%20%5D",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 4,
    "title": "Using LinkedIn",
    "description": "Spend 30 minutes on your headline, About and one project, then run four searches.",
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
        "title": "LinkedIn profile checklist",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-3/LinkedIn Profile Checklist.docx",
        "view_storage_path": "articleship-program-v2/day-3/LinkedIn Profile Checklist.pdf",
        "group": "Checklists"
      },
      {
        "title": "LinkedIn search links",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-3/LinkedIn Search Links.xlsx",
        "view_storage_path": "articleship-program-v2/day-3/LinkedIn Search Links.pdf",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 10,
    "title": "Connections and referrals",
    "description": "Send three connection requests today, two of them with a note.",
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
    "description": "Practise your introduction and one technical answer aloud, then record one and listen back.",
    "day_number": 4,
    "resources": [
      {
        "title": "Day 4 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-4/slides/Day 4 slides.pdf",
        "group": "Slides"
      },
      {
        "title": "Articleship interviews by firm",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-4/Articleship-Interviews-by-Firm.docx",
        "view_storage_path": "articleship-program-v2/day-4/Articleship-Interviews-by-Firm.pdf",
        "group": "Examples"
      },
      {
        "title": "Interview preparation syllabus",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-4/Interview-Preparation-Syllabus.docx",
        "view_storage_path": "articleship-program-v2/day-4/Interview-Preparation-Syllabus.pdf",
        "group": "Checklists"
      },
      {
        "title": "Interview syllabus tracker",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-4/Interview-Syllabus-Tracker.xlsx",
        "view_storage_path": "articleship-program-v2/day-4/Interview-Syllabus-Tracker.pdf",
        "group": "Checklists"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 11,
    "title": "Practising audit, tax and Excel",
    "description": "Take the Articleship Excel test with a timer, then rehearse three audit answers aloud.",
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
        "title": "Articleship Excel solution",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-4/articleship-excel-solution.xlsx",
        "view_storage_path": "articleship-program-v2/day-4/articleship-excel-solution.pdf",
        "group": "Tools"
      },
      {
        "title": "Practise your interview",
        "type": "external_link",
        "url": "https://www.mystudentclub.com/ai-interview.html?mode=articleship",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 6,
    "title": "Choosing your domain",
    "description": "Choose your first domain and one backup after reading five experience cards for each.",
    "day_number": 5,
    "resources": [
      {
        "title": "Day 5 slides",
        "type": "pdf",
        "view_storage_path": "articleship-program-v2/day-5/slides/Day 5 slides.pdf",
        "group": "Slides"
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
    "video_number": 12,
    "title": "Finding firms in your domain",
    "description": "Make 10 of this Saturday''s 25 new firms come from the domain firm shortlist.",
    "day_number": 5,
    "resources": [
      {
        "title": "Firm notes",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-5/domain-firms/Firm notes.docx",
        "view_storage_path": "articleship-program-v2/day-5/domain-firms/Firm notes.pdf",
        "group": "Examples"
      },
      {
        "title": "MSC domain roadmaps",
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
        "title": "Domain firm shortlist",
        "type": "xlsx",
        "download_storage_path": "articleship-program-v2/day-5/domain-firms/Domain firm shortlist.xlsx",
        "view_storage_path": "articleship-program-v2/day-5/domain-firms/Domain firm shortlist.pdf",
        "group": "Tools"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 7,
    "title": "Registering your articleship",
    "description": "Finish the deed and Form 103 in your first week, and start the E-Diary on day one.",
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
        "download_storage_path": "articleship-program-v2/day-6/Articleship Registration Process.docx",
        "view_storage_path": "articleship-program-v2/day-6/Articleship Registration Process.pdf",
        "group": "Checklists"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 13,
    "title": "Transfer, industrial training and CA Final",
    "description": "Ask about transfer and industrial training before you join, and fix a daily Final study slot.",
    "day_number": 6,
    "resources": [
      {
        "title": "Form 109 letter templates",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/Form 109 Letter Templates.docx",
        "view_storage_path": "articleship-program-v2/day-6/Form 109 Letter Templates.pdf",
        "group": "Templates"
      },
      {
        "title": "Articleship transfer guidelines",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/Articleship Transfer Guidelines.docx",
        "view_storage_path": "articleship-program-v2/day-6/Articleship Transfer Guidelines.pdf",
        "group": "Checklists"
      },
      {
        "title": "Industrial training guide",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/Industrial Training Guide.docx",
        "view_storage_path": "articleship-program-v2/day-6/Industrial Training Guide.pdf",
        "group": "Checklists"
      },
      {
        "title": "CA Final study guidelines",
        "type": "docx",
        "download_storage_path": "articleship-program-v2/day-6/CA Final Study Guidelines.docx",
        "view_storage_path": "articleship-program-v2/day-6/CA Final Study Guidelines.pdf",
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
