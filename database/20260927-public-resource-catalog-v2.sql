-- Add source-based day/group ordering without exposing premium file access.
-- Requires 20260927-public-resource-catalog.sql for msc_resource_array(jsonb).
-- v1 remains unchanged so cached clients continue to work.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_resource_catalog_v2(p_program text DEFAULT NULL)
RETURNS TABLE(
  resource_key text,
  program_type text,
  title text,
  category text,
  sort_order integer,
  day_number integer,
  group_name text,
  session_order integer,
  group_order integer,
  resource_order integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH source_sessions AS (
    SELECT v.id, v.course, v.day_number, v.video_number, v.resources,
      CASE
        WHEN lower(v.course::text) ~ '(industrial|mscit)' THEN 'industrial-training'
        WHEN lower(v.course::text) ~ 'articleship' THEN 'articleship'
        WHEN lower(v.course::text) ~ 'fresh' THEN 'ca-fresher'
        WHEN lower(v.course::text) ~ 'semi.?qualified' THEN 'semi-qualified'
        ELSE NULL
      END AS program
    FROM public.videos AS v
  ), sessions AS (
    SELECT program, day_number, resources,
      -- Raw session/video identifiers are never part of the public projection.
      row_number() OVER (
        PARTITION BY program, day_number
        ORDER BY video_number ASC NULLS LAST, course, id
      )::integer AS session_position
    FROM source_sessions
    WHERE program IS NOT NULL AND (p_program IS NULL OR program = p_program)
  ), expanded AS (
    SELECT s.program, s.day_number, s.session_position, r.item,
      r.ordinality::integer AS source_position
    FROM sessions AS s
    CROSS JOIN LATERAL jsonb_array_elements(
      public.msc_resource_array(to_jsonb(s.resources))
    ) WITH ORDINALITY AS r(item, ordinality)
  ), named AS (
    SELECT program, day_number, session_position, source_position, item,
      btrim(item->>'title') AS name,
      coalesce(nullif(btrim(CASE
        WHEN jsonb_typeof(item->'group') = 'string' THEN item->>'group'
        ELSE NULL
      END), ''), 'General Resources') AS source_group
    FROM expanded
    WHERE jsonb_typeof(item) = 'object'
      -- Do not stringify nested objects into public titles or group labels.
      AND jsonb_typeof(item->'title') = 'string'
      AND btrim(item->>'title') <> ''
      AND lower(btrim(coalesce(item->>'catalog_hidden', 'false'))) <> 'true'
      AND EXISTS (
        SELECT 1
        FROM (VALUES (item->>'url'), (item->>'view_storage_path'), (item->>'download_storage_path')) AS paths(value)
        WHERE lower(btrim(coalesce(value, ''))) NOT IN ('', 'none', 'null', 'undefined')
      )
  ), classified AS (
    SELECT program, day_number, session_position, source_position, name,
      source_group, lower(source_group) AS group_key,
      CASE
        WHEN item->>'catalog_category' IN ('cv-prep', 'interview-guidance', 'application-tricks')
          THEN item->>'catalog_category'
        WHEN lower(name) ~ '(cv|resume|résumé|cover.?letter)' THEN 'cv-prep'
        WHEN lower(name) ~ '(interview|syllabus|question|technical|finance|accounting|audit|tax|ind as|case.?study)'
          THEN 'interview-guidance'
        ELSE 'application-tricks'
      END AS resource_category,
      CASE
        WHEN item->>'catalog_priority' ~ '^[0-9]{1,4}$' THEN (item->>'catalog_priority')::integer
        WHEN lower(name) ~ '(template|complete|master|guidebook|handbook)' THEN 10
        WHEN lower(name) ~ '(question|booklet|syllabus|hiring|compan|application)' THEN 20
        ELSE 50
      END AS priority
    FROM named
  ), deduplicated AS (
    -- Keep the first source placement within a day/group, but retain the same
    -- named resource when the curriculum places it on a different day/group.
    SELECT DISTINCT ON (program, day_number, group_key, lower(name)) *
    FROM classified
    ORDER BY program, day_number, group_key, lower(name), session_position, source_position
  ), first_groups AS (
    SELECT DISTINCT ON (program, day_number, group_key)
      program, day_number, group_key, source_group, session_position, source_position
    FROM deduplicated
    ORDER BY program, day_number, group_key, session_position, source_position
  ), ordered_groups AS (
    SELECT program, day_number, group_key, source_group,
      row_number() OVER (
        PARTITION BY program, day_number
        ORDER BY session_position, source_position, group_key
      )::integer AS group_position
    FROM first_groups
  ), ordered_resources AS (
    SELECT d.program, d.day_number, d.name, d.resource_category, d.priority,
      g.source_group, d.group_key, d.session_position, g.group_position,
      row_number() OVER (
        PARTITION BY d.program, d.day_number, d.group_key
        ORDER BY d.session_position, d.source_position, lower(d.name)
      )::integer AS resource_position
    FROM deduplicated AS d
    JOIN ordered_groups AS g ON g.program = d.program
      AND g.day_number IS NOT DISTINCT FROM d.day_number
      AND g.group_key = d.group_key
  )
  SELECT
    md5(jsonb_build_array(program, day_number, group_key, lower(name))::text),
    program, name, resource_category, priority, day_number,
    source_group, session_position, group_position, resource_position
  FROM ordered_resources
  ORDER BY program, day_number ASC NULLS LAST, group_position, resource_position;
$$;

REVOKE ALL ON FUNCTION public.get_public_resource_catalog_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_resource_catalog_v2(text) TO anon, authenticated;
COMMENT ON FUNCTION public.get_public_resource_catalog_v2(text) IS
  'Public resource names with actual curriculum days, resource group labels and normalized ordering only. Excludes URLs, storage paths, video identifiers, lesson text and resource content. Does not alter v1 or source data.';

COMMIT;
