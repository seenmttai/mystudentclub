-- MSC Articleship Program v2: Day 0–6 sessions and completed resource files.
-- Reversible: restore a preflight export of this course's rows; for a new course,
-- remove only the eight (course, day_number, video_number) tuples in the handover.
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
    "description": "Read the guidebook and join the group.",
    "day_number": 0,
    "resources": [
      {
        "title": "MSC Articleship Guidebook",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-0/guidebook/MSC Articleship Guidebook.docx",
        "view_storage_path": "articleship-program-v2/day-0/guidebook/MSC Articleship Guidebook.pdf"
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
        "title": "Broad Exposure Cover Letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Broad Exposure Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Broad Exposure Cover Letter.pdf"
      },
      {
        "title": "Choose your cover letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Choose your cover letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Choose your cover letter.pdf"
      },
      {
        "title": "Direct Tax Cover Letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Direct Tax Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Direct Tax Cover Letter.pdf"
      },
      {
        "title": "GST Cover Letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/GST Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/GST Cover Letter.pdf"
      },
      {
        "title": "Internal Audit and IFC Cover Letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Internal Audit and IFC Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Internal Audit and IFC Cover Letter.pdf"
      },
      {
        "title": "Referral Cover Letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Referral Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Referral Cover Letter.pdf"
      },
      {
        "title": "Statutory Audit Cover Letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Statutory Audit Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Statutory Audit Cover Letter.pdf"
      },
      {
        "title": "Strong Academics Cover Letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Strong Academics Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Strong Academics Cover Letter.pdf"
      },
      {
        "title": "Valuation and FDD Cover Letter",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cover-letters/Valuation and FDD Cover Letter.docx",
        "view_storage_path": "articleship-program-v2/day-1/cover-letters/Valuation and FDD Cover Letter.pdf"
      },
      {
        "title": "Academic Highlights",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Academic Highlights.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Academic Highlights.pdf"
      },
      {
        "title": "Accounting Practice",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Accounting Practice.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Accounting Practice.pdf"
      },
      {
        "title": "Audit & Tax",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Audit & Tax.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Audit & Tax.pdf"
      },
      {
        "title": "Campus Leadership",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Campus Leadership.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Campus Leadership.pdf"
      },
      {
        "title": "Classic Academic",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Classic Academic.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Classic Academic.pdf"
      },
      {
        "title": "College Projects",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/College Projects.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/College Projects.pdf"
      },
      {
        "title": "Community Contribution",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Community Contribution.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Community Contribution.pdf"
      },
      {
        "title": "Direct Entry Graduate",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Entry Graduate.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Entry Graduate.pdf"
      },
      {
        "title": "Direct Tax Practice",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Tax Practice.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Direct Tax Practice.pdf"
      },
      {
        "title": "Excel First",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Excel First.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Excel First.pdf"
      },
      {
        "title": "Financial Analysis",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Financial Analysis.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Financial Analysis.pdf"
      },
      {
        "title": "GST Reconciliation",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/GST Reconciliation.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/GST Reconciliation.pdf"
      },
      {
        "title": "IFC Controls",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/IFC Controls.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/IFC Controls.pdf"
      },
      {
        "title": "Internal Audit Process",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Internal Audit Process.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Internal Audit Process.pdf"
      },
      {
        "title": "Separate Group Results",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Separate Group Results.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Separate Group Results.pdf"
      },
      {
        "title": "Sport & Responsibility",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Sport & Responsibility.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Sport & Responsibility.pdf"
      },
      {
        "title": "Statutory Audit Foundations",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Statutory Audit Foundations.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Statutory Audit Foundations.pdf"
      },
      {
        "title": "Writing & Communication",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-templates/Writing & Communication.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-templates/Writing & Communication.pdf"
      },
      {
        "title": "Selected cvs anonymised",
        "type": "pdf",
        "group": "Examples",
        "view_storage_path": "articleship-program-v2/day-1/selected-cvs-anonymised.pdf"
      },
      {
        "title": "CV checklist",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-1/cv-checklist.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-checklist.pdf"
      },
      {
        "title": "Keywords by domain",
        "type": "xlsx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-1/keywords-by-domain.xlsx",
        "view_storage_path": "articleship-program-v2/day-1/keywords-by-domain.pdf"
      },
      {
        "title": "MSC CV Builder",
        "type": "external_link",
        "group": "Tools",
        "url": "https://www.mystudentclub.com/cv-builder/?stage=articleship"
      },
      {
        "title": "MSC CV Reviewer",
        "type": "external_link",
        "group": "Tools",
        "url": "https://www.mystudentclub.com/cv-reviewer/"
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
        "title": "Selected industrial training cvs",
        "type": "pdf",
        "group": "Examples",
        "view_storage_path": "articleship-program-v2/day-1/selected-industrial-training-cvs.pdf"
      },
      {
        "title": "CV ahead",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-1/cv-ahead.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-ahead.pdf"
      },
      {
        "title": "Strengthen your CV",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-1/strengthen-your-cv.docx",
        "view_storage_path": "articleship-program-v2/day-1/strengthen-your-cv.pdf"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 3,
    "title": "Apply to your chosen firms",
    "description": "Prepare your mail and find openings.",
    "day_number": 2,
    "resources": [
      {
        "title": "Articleship Mail Templates",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.docx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Mail Templates.pdf"
      },
      {
        "title": "Articleship Cold Mailing List",
        "type": "xlsx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Cold Mailing List.xlsx"
      },
      {
        "title": "Articleship Vacancy Alerts",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-2/Articleship Vacancy Alerts.docx",
        "view_storage_path": "articleship-program-v2/day-2/Articleship Vacancy Alerts.pdf"
      },
      {
        "title": "Big 10 Articleship Routes",
        "type": "xlsx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-2/Big 10 Articleship Routes.xlsx"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 4,
    "title": "Find and connect with the right people",
    "description": "Find people at your target firms and prepare your message.",
    "day_number": 3,
    "resources": [
      {
        "title": "LinkedIn connection and follow up messages",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-3/linkedin-connection-and-follow-up-messages.docx",
        "view_storage_path": "articleship-program-v2/day-3/linkedin-connection-and-follow-up-messages.pdf"
      },
      {
        "title": "LinkedIn profile checklist",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-3/linkedin-profile-checklist.docx",
        "view_storage_path": "articleship-program-v2/day-3/linkedin-profile-checklist.pdf"
      },
      {
        "title": "LinkedIn search guide",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-3/linkedin-search-guide.docx",
        "view_storage_path": "articleship-program-v2/day-3/linkedin-search-guide.pdf"
      },
      {
        "title": "LinkedIn search links",
        "type": "xlsx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-3/linkedin-search-links.xlsx"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 5,
    "title": "Prepare for your interview",
    "description": "Revise your domain and practise the Excel test.",
    "day_number": 4,
    "resources": [
      {
        "title": "Articleship excel test",
        "type": "xlsx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-4/articleship-excel-test.xlsx"
      },
      {
        "title": "Articleship excel solution",
        "type": "xlsx",
        "group": "Examples",
        "download_storage_path": "articleship-program-v2/day-4/articleship-excel-solution.xlsx"
      },
      {
        "title": "Articleship Interviews by Firm",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-4/Articleship-Interviews-by-Firm.docx",
        "view_storage_path": "articleship-program-v2/day-4/Articleship-Interviews-by-Firm.pdf"
      },
      {
        "title": "Interview Preparation Syllabus",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-4/Interview-Preparation-Syllabus.docx",
        "view_storage_path": "articleship-program-v2/day-4/Interview-Preparation-Syllabus.pdf"
      },
      {
        "title": "Interview Syllabus Tracker",
        "type": "xlsx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-4/Interview-Syllabus-Tracker.xlsx"
      },
      {
        "title": "Direct tax interview booklet",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-4/direct-tax-interview-booklet.docx",
        "view_storage_path": "articleship-program-v2/day-4/direct-tax-interview-booklet.pdf"
      },
      {
        "title": "Indirect tax interview booklet",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-4/indirect-tax-interview-booklet.docx",
        "view_storage_path": "articleship-program-v2/day-4/indirect-tax-interview-booklet.pdf"
      },
      {
        "title": "Internal audit interview booklet",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-4/internal-audit-interview-booklet.docx",
        "view_storage_path": "articleship-program-v2/day-4/internal-audit-interview-booklet.pdf"
      },
      {
        "title": "Statutory audit interview booklet",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-4/statutory-audit-interview-booklet.docx",
        "view_storage_path": "articleship-program-v2/day-4/statutory-audit-interview-booklet.pdf"
      },
      {
        "title": "Practise your interview",
        "type": "external_link",
        "group": "Tools",
        "url": "https://www.mystudentclub.com/ai-interview.html?mode=articleship"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 6,
    "title": "Choose your domain",
    "description": "Compare firms and plan the skills you want to build.",
    "day_number": 5,
    "resources": [
      {
        "title": "Domain firm shortlist",
        "type": "xlsx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-5/domain-firms/Domain firm shortlist.xlsx"
      },
      {
        "title": "Domain certifications",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-5/domain-roadmaps/Domain certifications.docx",
        "view_storage_path": "articleship-program-v2/day-5/domain-roadmaps/Domain certifications.pdf"
      },
      {
        "title": "MSC Domain Roadmaps",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-5/domain-roadmaps/MSC-Domain-Roadmaps.docx",
        "view_storage_path": "articleship-program-v2/day-5/domain-roadmaps/MSC-Domain-Roadmaps.pdf"
      }
    ],
    "industrial_training_path": null
  },
  {
    "course": "msc-articleship-program",
    "video_number": 7,
    "title": "Register your articleship",
    "description": "Complete your registration and plan your studies.",
    "day_number": 6,
    "resources": [
      {
        "title": "Articleship registration process",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-6/articleship-registration-process.docx",
        "view_storage_path": "articleship-program-v2/day-6/articleship-registration-process.pdf"
      },
      {
        "title": "Articleship transfer guidelines",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-6/articleship-transfer-guidelines.docx",
        "view_storage_path": "articleship-program-v2/day-6/articleship-transfer-guidelines.pdf"
      },
      {
        "title": "Ca final study guidelines",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-6/ca-final-study-guidelines.docx",
        "view_storage_path": "articleship-program-v2/day-6/ca-final-study-guidelines.pdf"
      },
      {
        "title": "Industrial training policy",
        "type": "docx",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-6/industrial-training-policy.docx",
        "view_storage_path": "articleship-program-v2/day-6/industrial-training-policy.pdf"
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
