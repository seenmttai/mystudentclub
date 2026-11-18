-- MSC Articleship Program v3: account sync for the programme's web tools.
-- What it does: creates public.articleship_tool_progress, one row per (student, tool) holding that tool's saved
-- progress as JSON (CV checklist ticks, LinkedIn checklist ticks, interview tracker status, Work Simulation levels,
-- written-test scores, and the shared "my domain" + CV pick under tool = 'settings').
-- Who reads/writes it: only the signed-in student, only their own rows (RLS). anon has no access at all.
-- Client: scripts/articleship-progress.js. Without this table the tools keep progress in the browser only, so this
-- file can run before or after the code is merged.
-- Safe to run twice (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
-- Reversible: DROP TABLE public.articleship_tool_progress; DROP FUNCTION public.articleship_tool_progress_touch();
--             (students then keep their progress in the browser only; nothing else depends on the table).
BEGIN;

CREATE TABLE IF NOT EXISTS public.articleship_tool_progress (
    user_id    uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    tool       text        NOT NULL,
    data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT articleship_tool_progress_pkey PRIMARY KEY (user_id, tool),
    CONSTRAINT articleship_tool_progress_tool_check CHECK (tool ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
    CONSTRAINT articleship_tool_progress_data_check CHECK (
        jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 262144
    )
);

COMMENT ON TABLE public.articleship_tool_progress IS
    'MSC Articleship Program tool progress, one row per student and tool; written by scripts/articleship-progress.js.';

-- The server clock decides updated_at, so two devices compare against one time line.
CREATE OR REPLACE FUNCTION public.articleship_tool_progress_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    IF TG_OP = 'UPDATE' THEN
        NEW.created_at := OLD.created_at;
        NEW.user_id := OLD.user_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS articleship_tool_progress_touch ON public.articleship_tool_progress;
CREATE TRIGGER articleship_tool_progress_touch
    BEFORE INSERT OR UPDATE ON public.articleship_tool_progress
    FOR EACH ROW EXECUTE FUNCTION public.articleship_tool_progress_touch();

ALTER TABLE public.articleship_tool_progress ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.articleship_tool_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.articleship_tool_progress FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.articleship_tool_progress TO authenticated;

DROP POLICY IF EXISTS "articleship_tool_progress_select_own" ON public.articleship_tool_progress;
CREATE POLICY "articleship_tool_progress_select_own" ON public.articleship_tool_progress
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "articleship_tool_progress_insert_own" ON public.articleship_tool_progress;
CREATE POLICY "articleship_tool_progress_insert_own" ON public.articleship_tool_progress
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "articleship_tool_progress_update_own" ON public.articleship_tool_progress;
CREATE POLICY "articleship_tool_progress_update_own" ON public.articleship_tool_progress
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "articleship_tool_progress_delete_own" ON public.articleship_tool_progress;
CREATE POLICY "articleship_tool_progress_delete_own" ON public.articleship_tool_progress
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

COMMIT;
