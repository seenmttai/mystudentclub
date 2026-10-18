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
        "title": "01 classic",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/01-classic.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/01-classic.pdf"
      },
      {
        "title": "02 ledger layout",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/02-ledger-layout.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/02-ledger-layout.pdf"
      },
      {
        "title": "03 structured grid",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/03-structured-grid.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/03-structured-grid.pdf"
      },
      {
        "title": "04 pill corporate",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/04-pill-corporate.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/04-pill-corporate.pdf"
      },
      {
        "title": "05 hybrid grid",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/05-hybrid-grid.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/05-hybrid-grid.pdf"
      },
      {
        "title": "06 corporate box",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/06-corporate-box.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/06-corporate-box.pdf"
      },
      {
        "title": "07 bordered grid",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/07-bordered-grid.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/07-bordered-grid.pdf"
      },
      {
        "title": "08 split ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/08-split-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/08-split-ledger.pdf"
      },
      {
        "title": "09 academic ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/09-academic-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/09-academic-ledger.pdf"
      },
      {
        "title": "10 firm info",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/10-firm-info.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/10-firm-info.pdf"
      },
      {
        "title": "11 grid layout",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/11-grid-layout.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/11-grid-layout.pdf"
      },
      {
        "title": "12 professional",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/12-professional.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/12-professional.pdf"
      },
      {
        "title": "13 corporate",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/13-corporate.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/13-corporate.pdf"
      },
      {
        "title": "14 minimalist",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/14-minimalist.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/14-minimalist.pdf"
      },
      {
        "title": "15 bold modern",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/15-bold-modern.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/15-bold-modern.pdf"
      },
      {
        "title": "16 refined classic",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/16-refined-classic.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/16-refined-classic.pdf"
      },
      {
        "title": "17 modern bold",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/17-modern-bold.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/17-modern-bold.pdf"
      },
      {
        "title": "18 executive",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/18-executive.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/18-executive.pdf"
      },
      {
        "title": "19 merit layout",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/19-merit-layout.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/19-merit-layout.pdf"
      },
      {
        "title": "20 clean ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/20-clean-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/20-clean-ledger.pdf"
      },
      {
        "title": "21 modern split",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/21-modern-split.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/21-modern-split.pdf"
      },
      {
        "title": "22 horizon split",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/22-horizon-split.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/22-horizon-split.pdf"
      },
      {
        "title": "23 professional banner",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/23-professional-banner.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/23-professional-banner.pdf"
      },
      {
        "title": "24 executive professional",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/24-executive-professional.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/24-executive-professional.pdf"
      },
      {
        "title": "25 corporate grid",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/25-corporate-grid.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/25-corporate-grid.pdf"
      },
      {
        "title": "26 banner resume",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/26-banner-resume.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/26-banner-resume.pdf"
      },
      {
        "title": "27 elegant grid",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/27-elegant-grid.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/27-elegant-grid.pdf"
      },
      {
        "title": "28 structured ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/28-structured-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/28-structured-ledger.pdf"
      },
      {
        "title": "29 classic ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/29-classic-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/29-classic-ledger.pdf"
      },
      {
        "title": "30 formal ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/30-formal-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/30-formal-ledger.pdf"
      },
      {
        "title": "31 smart ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/31-smart-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/31-smart-ledger.pdf"
      },
      {
        "title": "32 modern ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/32-modern-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/32-modern-ledger.pdf"
      },
      {
        "title": "33 standard ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/33-standard-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/33-standard-ledger.pdf"
      },
      {
        "title": "34 classic grid",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/34-classic-grid.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/34-classic-grid.pdf"
      },
      {
        "title": "35 profile sidebar",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/35-profile-sidebar.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/35-profile-sidebar.pdf"
      },
      {
        "title": "36 compact banner",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/36-compact-banner.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/36-compact-banner.pdf"
      },
      {
        "title": "37 dual columns",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/37-dual-columns.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/37-dual-columns.pdf"
      },
      {
        "title": "38 inset frame",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/38-inset-frame.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/38-inset-frame.pdf"
      },
      {
        "title": "39 clean rule",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/39-clean-rule.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/39-clean-rule.pdf"
      },
      {
        "title": "40 continuous outline",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/40-continuous-outline.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/40-continuous-outline.pdf"
      },
      {
        "title": "41 formal docket",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/41-formal-docket.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/41-formal-docket.pdf"
      },
      {
        "title": "42 open panel",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/42-open-panel.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/42-open-panel.pdf"
      },
      {
        "title": "43 executive docket",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/43-executive-docket.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/43-executive-docket.pdf"
      },
      {
        "title": "44 tabular ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/44-tabular-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/44-tabular-ledger.pdf"
      },
      {
        "title": "45 grid docket",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/45-grid-docket.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/45-grid-docket.pdf"
      },
      {
        "title": "46 split banner",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/46-split-banner.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/46-split-banner.pdf"
      },
      {
        "title": "47 wave grid",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/47-wave-grid.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/47-wave-grid.pdf"
      },
      {
        "title": "48 side panel",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/48-side-panel.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/48-side-panel.pdf"
      },
      {
        "title": "49 classic docket",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/49-classic-docket.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/49-classic-docket.pdf"
      },
      {
        "title": "50 composite ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/50-composite-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/50-composite-ledger.pdf"
      },
      {
        "title": "51 dotted split",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/51-dotted-split.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/51-dotted-split.pdf"
      },
      {
        "title": "52 pill header split",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/52-pill-header-split.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/52-pill-header-split.pdf"
      },
      {
        "title": "53 banner executive split",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/53-banner-executive-split.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/53-banner-executive-split.pdf"
      },
      {
        "title": "54 sidebar panel split",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/54-sidebar-panel-split.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/54-sidebar-panel-split.pdf"
      },
      {
        "title": "55 timeline flow split",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/55-timeline-flow-split.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/55-timeline-flow-split.pdf"
      },
      {
        "title": "56 executive header split",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/56-executive-header-split.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/56-executive-header-split.pdf"
      },
      {
        "title": "57 bordered box ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/57-bordered-box-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/57-bordered-box-ledger.pdf"
      },
      {
        "title": "58 matrix grid ledger",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/58-matrix-grid-ledger.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/58-matrix-grid-ledger.pdf"
      },
      {
        "title": "59 clean line executive",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/59-clean-line-executive.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/59-clean-line-executive.pdf"
      },
      {
        "title": "60 minimalist executive",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/60-minimalist-executive.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/60-minimalist-executive.pdf"
      },
      {
        "title": "61 accent split summary",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/61-accent-split-summary.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/61-accent-split-summary.pdf"
      },
      {
        "title": "62 plain ats",
        "type": "docx",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/cv-gallery/62-plain-ats.docx",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/62-plain-ats.pdf"
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
        "title": "62-CV gallery",
        "type": "zip",
        "group": "Templates",
        "download_storage_path": "articleship-program-v2/day-1/CV gallery.zip",
        "view_storage_path": "articleship-program-v2/day-1/cv-gallery/Choose your layout.pdf"
      },
      {
        "title": "Selected cvs anonymised",
        "type": "pdf",
        "group": "Examples",
        "view_storage_path": "articleship-program-v2/day-1/selected-cvs-anonymised.pdf"
      },
      {
        "title": "Day 0 and Day 1 kit",
        "type": "zip",
        "group": "Checklists",
        "download_storage_path": "articleship-program-v2/day-1/MSC Articleship Day 0 and Day 1.zip"
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
        "url": "https://www.mystudentclub.com/cv-reviewer/#uploadSection"
      },
      {
        "title": "Personal CV review",
        "type": "external_link",
        "group": "Tools",
        "url": "https://wa.me/917228881182?text=Hello%20Sir%2C%20please%20review%20my%20articleship%20CV."
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
      },
      {
        "title": "Experience explorer (download and open)",
        "type": "html",
        "group": "Tools",
        "download_storage_path": "articleship-program-v2/day-5/Experience explorer.html"
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
