-- Follow-up to public-resource-catalog: match the LMS treatment of missing path sentinels.
-- Replaces only the names-only function; does not change resource or enrollment rows.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_resource_catalog(p_program text DEFAULT NULL)
RETURNS TABLE(resource_key text, program_type text, title text, category text, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH entries AS (
    SELECT
      CASE
        WHEN lower(v.course::text) ~ '(industrial|mscit)' THEN 'industrial-training'
        WHEN lower(v.course::text) ~ 'articleship' THEN 'articleship'
        WHEN lower(v.course::text) ~ 'fresh' THEN 'ca-fresher'
        WHEN lower(v.course::text) ~ 'semi.?qualified' THEN 'semi-qualified'
        ELSE NULL
      END AS program,
      r.item
    FROM public.videos AS v
    CROSS JOIN LATERAL jsonb_array_elements(public.msc_resource_array(to_jsonb(v.resources))) AS r(item)
  ), named AS (
    SELECT program, item, btrim(item->>'title') AS name
    FROM entries
    WHERE program IS NOT NULL AND jsonb_typeof(item) = 'object'
      AND btrim(coalesce(item->>'title', '')) <> ''
      -- A draft placeholder with no usable material should not become a sales promise.
      AND EXISTS (
        SELECT 1
        FROM (VALUES (item->>'url'), (item->>'view_storage_path'), (item->>'download_storage_path')) AS paths(value)
        WHERE lower(btrim(coalesce(value, ''))) NOT IN ('', 'none', 'null', 'undefined')
      )
      AND coalesce(item->>'catalog_hidden', 'false') <> 'true'
  ), classified AS (
    SELECT program, name,
      CASE
        WHEN item->>'catalog_category' IN ('cv-prep', 'interview-guidance', 'application-tricks')
          THEN item->>'catalog_category'
        WHEN lower(name) ~ '(cv|resume|résumé|cover.?letter)' THEN 'cv-prep'
        WHEN lower(name) ~ '(interview|syllabus|question|technical|finance|accounting|audit|tax|ind as|case.?study)'
          THEN 'interview-guidance'
        ELSE 'application-tricks'
      END AS group_name,
      CASE
        WHEN item->>'catalog_priority' ~ '^[0-9]{1,4}$' THEN (item->>'catalog_priority')::integer
        WHEN lower(name) ~ '(template|complete|master|guidebook|handbook)' THEN 10
        WHEN lower(name) ~ '(question|booklet|syllabus|hiring|compan|application)' THEN 20
        ELSE 50
      END AS priority
    FROM named
  )
  SELECT md5(program || ':' || lower(name)), program, name, group_name, min(priority)::integer
  FROM classified
  WHERE p_program IS NULL OR program = p_program
  GROUP BY program, name, group_name
  ORDER BY min(priority), lower(name);
$$;

REVOKE ALL ON FUNCTION public.get_public_resource_catalog(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_resource_catalog(text) TO anon, authenticated;
COMMENT ON FUNCTION public.get_public_resource_catalog(text) IS
  'Names-only public catalogue generated from LMS resources; never exposes resource URLs, storage paths, descriptions, video IDs or video content.';

COMMIT;
