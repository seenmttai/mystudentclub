-- Articleship portal content: 3 banners and 7 exclusive Big firm articleship vacancies.
-- Needs 202611090002 first (Banners.web_only, "Articleship Jobs".is_exclusive).
-- Safe to run twice: each insert skips rows that already exist.
--
-- Reverse SQL (run in one transaction):
--   delete from public."Banners" where "Image" like 'https://www.mystudentclub.com/assets/banners/%-2026-11.webp';
--   delete from public."Articleship Jobs" where is_exclusive and hirer_email = 'recruit@mystudentclub.com'
--     and "Created_At" >= '2026-11-09' and "Company" in
--     ('PwC','Deloitte','KPMG','EY','BDO India','Grant Thornton Bharat','RSM India');

-- 1. Banners. Type matches the portal: 'Articleship' or 'Industrial'. visible_to_unenrolled null = everyone.
--    The Articleship Program banner is web_only: paid programs are kept out of the phone apps.
insert into public."Banners" ("Image", "Hyperlink", "Type", visible_to_unenrolled, web_only)
select v.image, v.link, v.type, null, v.web_only
from (values
  (1, 'https://www.mystudentclub.com/assets/banners/articleship-program-2026-11.webp',
   'https://www.mystudentclub.com/articleship-program/', 'Articleship', true),
  (2, 'https://www.mystudentclub.com/assets/banners/articleship-vacancies-group-2026-11.webp',
   '/links/?tab=articleship', 'Articleship', false),
  (3, 'https://www.mystudentclub.com/assets/banners/firm-review-2026-11.webp',
   '/submit-review.html', 'Articleship', false),
  (4, 'https://www.mystudentclub.com/assets/banners/firm-review-2026-11.webp',
   '/submit-review.html', 'Industrial', false)
) as v(ord, image, link, type, web_only)
where not exists (
  select 1 from public."Banners" b where b."Image" = v.image and b."Type" = v.type
)
order by v.ord;  -- ids follow this order, and the carousel shows banners in id order

-- 2. Exclusive articleship vacancies: Easy Apply (applications land in job_applications and on the
--    hire.mystudentclub.com dashboard of recruit@mystudentclub.com), free to apply, pinned on top of the
--    Articleship portal for 15 days. Stipends: MSC's own firm reviews (Jul-Sep 2026) checked against
--    Glassdoor and firm posts; see the PR for sources.
--    posted_by stays null so no "your job is posted" mail is queued to MSC's own inbox.
insert into public."Articleship Jobs" (
  "Company", "Job_Title", "Location", "Category", "Primary Domain", "Firm Type", "Exposure Tags",
  "Salary", "Stipend Range", "Description", "Application ID", hirer_email, owner_id, is_exclusive,
  "Employment_Type", "Created_At", "Posted_Date"
)
select v.company, 'Article Assistant · Audit, Tax & Advisory', v.cities, 'Statutory Audit', 'Statutory Audit',
       v.firm_type, v.domains, v.salary, v.stipend_range,
       '**MSC Exclusive · Articleship at ' || v.company || '**' || E'\n\n'
       || 'Apply once on MSC with Easy Apply. Applications go to the MSC team, who get back to shortlisted students with the next steps.' || E'\n\n'
       || '**Domains:** ' || array_to_string(v.domains, ' · ') || E'\n'
       || '**Cities:** ' || replace(v.cities, ', ', ' · ') || E'\n'
       || '**Stipend:** ' || v.stipend_text || E'\n'
       || '**Articleship firm (ICAI):** ' || v.icai_firms || E'\n'
       || '**Who can apply:** CA Intermediate, both groups cleared, with ICITSS (IT and OC) done.' || E'\n\n'
       || '**Before you apply:** complete your MSC profile and upload your CV. Your profile and CV go with the application.',
       'recruit@mystudentclub.com', 'recruit@mystudentclub.com',
       (select u.id from auth.users u where u.email = 'recruit@mystudentclub.com' limit 1),
       true, 'Articleship', now() - (v.ord || ' seconds')::interval, now()
from (values
  (1, 'PwC', 'Big 4',
   'Mumbai, Gurugram, Bengaluru, Kolkata, Chennai, Hyderabad, Pune, Ahmedabad',
   array['Statutory Audit','Indirect Tax (GST)','Transfer Pricing','International Taxation','M&A Tax','Risk Advisory'],
   15000, '₹15,000 – ₹20,000/month',
   '₹15,000 – ₹20,000 a month, from what PwC articles report. It varies by city, team and year.',
   'Price Waterhouse & Co Chartered Accountants LLP, Price Waterhouse Chartered Accountants LLP'),
  (2, 'Deloitte', 'Big 4',
   'Mumbai, Gurugram, Bengaluru, Hyderabad, Chennai, Pune, Ahmedabad, Kolkata',
   array['Statutory Audit','Direct Tax','M&A Tax','Transfer Pricing','International Taxation','Internal Audit'],
   12000, '₹12,000 – ₹20,000/month',
   '₹12,000 – ₹20,000 a month, from what Deloitte articles report (most say ₹15,000). It varies by city, team and year.',
   'Deloitte Haskins & Sells LLP'),
  (3, 'KPMG', 'Big 4',
   'Mumbai, Gurugram, Bengaluru, Chennai, Hyderabad, Kolkata, Pune, Ahmedabad',
   array['Statutory Audit','Concurrent Audit','Valuation'],
   15000, '₹15,000 – ₹20,000/month',
   '₹15,000 – ₹20,000 a month, from what KPMG articles report (most say ₹15,000). It varies by city and year.',
   'B S R & Co. LLP'),
  (4, 'EY', 'Big 4',
   'Mumbai, Gurugram, Noida, Bengaluru, Chennai, Hyderabad, Kolkata, Pune, Ahmedabad',
   array['Statutory Audit','Internal Audit','SOX / IFC Controls','Direct Tax','Indirect Tax (GST)','M&A Tax','Valuation'],
   15000, '₹15,000/month (metros)',
   'About ₹15,000 a month in the metros, from what EY articles report. It varies by city and team.',
   'S.R. Batliboi & Co. LLP, S R B C & Co LLP, S.R. Batliboi & Associates LLP'),
  (5, 'BDO India', 'Big 6',
   'Mumbai, Pune, Bengaluru, Hyderabad, Gurugram, Kolkata, Chennai, Ahmedabad',
   array['Statutory Audit','Internal Audit','Risk Advisory','Direct Tax','Indirect Tax (GST)','Transfer Pricing','Forensics','Due Diligence'],
   13500, '₹13,500 – ₹15,000/month',
   '₹13,500 – ₹15,000 a month, from what BDO articles report (most say ₹13,500 in every city).',
   'M S K A & Associates'),
  (6, 'Grant Thornton Bharat', 'Big 6',
   'Mumbai, Gurugram, Noida, Bengaluru, Chennai, Hyderabad, Kolkata, Pune, Ahmedabad',
   array['Statutory Audit','Internal Audit','Risk Advisory','Direct Tax','Indirect Tax (GST)','Transfer Pricing','M&A Tax','International Taxation','Valuation','Forensics'],
   16000, '₹16,000 – ₹20,000/month',
   'About ₹16,000 a month (some teams ₹20,000), from what Grant Thornton articles report. It varies by city and team.',
   'Walker Chandiok & Co LLP'),
  (7, 'RSM India', 'Big 10',
   'Mumbai, Noida, Gurugram, Chennai, Bengaluru, Hyderabad, Ahmedabad',
   array['Statutory Audit','Direct Tax','Indirect Tax (GST)','Internal Audit','Risk Advisory','Transfer Pricing'],
   12000, 'Around ₹12,000/month',
   'About ₹12,000 a month plus conveyance in a recent Chennai post. It varies by city; ask at the interview.',
   'Suresh Surana & Associates LLP')
) as v(ord, company, firm_type, cities, domains, salary, stipend_range, stipend_text, icai_firms)
where not exists (
  select 1 from public."Articleship Jobs" j
  where j.is_exclusive and j."Company" = v.company and j."Created_At" >= now() - interval '15 days'
);
