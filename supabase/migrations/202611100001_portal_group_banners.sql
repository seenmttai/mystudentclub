-- WhatsApp group banners for the Industrial Training, Semi Qualified and CA Fresher job portals (Padam, 10 Nov 2026).
-- Each opens the matching tab of /links (WhatsApp channel / group / community). Safe to run twice.
-- The images ship with the code (assets/banners/*-group-2026-11.webp), so merge the PR before running this.
--
-- Reverse SQL:
--   delete from public."Banners" where "Image" in (
--     'https://www.mystudentclub.com/assets/banners/industrial-group-2026-11.webp',
--     'https://www.mystudentclub.com/assets/banners/semi-qualified-group-2026-11.webp',
--     'https://www.mystudentclub.com/assets/banners/ca-fresher-group-2026-11.webp');

insert into public."Banners" ("Image", "Hyperlink", "Type", visible_to_unenrolled, web_only)
select v.image, v.link, v.type, null, false
from (values
  (1, 'https://www.mystudentclub.com/assets/banners/industrial-group-2026-11.webp', '/links/?tab=industrial', 'Industrial'),
  (2, 'https://www.mystudentclub.com/assets/banners/semi-qualified-group-2026-11.webp', '/links/?tab=semi', 'Semi-Qualified'),
  (3, 'https://www.mystudentclub.com/assets/banners/ca-fresher-group-2026-11.webp', '/links/?tab=fresher', 'Freshers')
) as v(ord, image, link, type)
where not exists (
  select 1 from public."Banners" b where b."Image" = v.image and b."Type" = v.type
)
order by v.ord;
