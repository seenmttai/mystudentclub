-- Restore the portal-specific WhatsApp groups that were overwritten by the
-- links-directory seed/update. This intentionally does not touch Industrial
-- Training or any other link.

BEGIN;

-- Preview the exact rows that this repair is expected to change.
SELECT
  id,
  category,
  title,
  url AS current_url,
  CASE category
    WHEN 'ca' THEN 'https://chat.whatsapp.com/DsFD7rCA7Wn6s7kyemDCr2?mode=gi_t'
    WHEN 'articleship' THEN 'https://chat.whatsapp.com/FMQvEUsMZw2EN2t2h2LnRZ?mode=gi_t'
    WHEN 'semi-qualified' THEN 'https://chat.whatsapp.com/FQSSe5uCeIlITf5brb2J6M?mode=gi_t'
  END AS restored_url
FROM public.links
WHERE category IN ('ca', 'articleship', 'semi-qualified')
  AND card_type = 'whatsapp'
  AND lower(trim(title)) = 'whatsapp community';

-- Only replace the duplicated channel URL created by the bad overwrite.
-- The URL guard prevents this repair from clobbering a later manual change.
UPDATE public.links
SET url = CASE category
    WHEN 'ca' THEN 'https://chat.whatsapp.com/DsFD7rCA7Wn6s7kyemDCr2?mode=gi_t'
    WHEN 'articleship' THEN 'https://chat.whatsapp.com/FMQvEUsMZw2EN2t2h2LnRZ?mode=gi_t'
    WHEN 'semi-qualified' THEN 'https://chat.whatsapp.com/FQSSe5uCeIlITf5brb2J6M?mode=gi_t'
  END,
  updated_at = now()
WHERE category IN ('ca', 'articleship', 'semi-qualified')
  AND card_type = 'whatsapp'
  AND lower(trim(title)) = 'whatsapp community'
  AND url = 'https://whatsapp.com/channel/0029Vb8XM5GDzgT6YyWk4x0F';

-- Verify the repaired values before committing.
SELECT category, title, url
FROM public.links
WHERE category IN ('ca', 'articleship', 'semi-qualified')
  AND card_type = 'whatsapp'
  AND lower(trim(title)) = 'whatsapp community'
ORDER BY CASE category
  WHEN 'ca' THEN 1
  WHEN 'articleship' THEN 2
  WHEN 'semi-qualified' THEN 3
END;

COMMIT;
