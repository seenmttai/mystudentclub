-- ==============================================================================
-- My Student Club - Hirer Access Control & Row-Level Security (RLS) Policies
-- ==============================================================================
-- Run this in your Supabase SQL Editor.
-- Step 1 adds the required columns (`posted_by`, `hirer_email`, `status`, `notes`)
-- Step 2 enables Row Level Security
-- Step 3 creates the helper security function
-- Step 4 creates the RLS policies for `profiles` and `job_applications`
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Add `posted_by` & `hirer_email` columns to all 4 job tables (if not already present)
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public."Industrial Training Job Portal"
ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS hirer_email text;

ALTER TABLE IF EXISTS public."Fresher Jobs"
ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS hirer_email text;

ALTER TABLE IF EXISTS public."Semi Qualified Jobs"
ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS hirer_email text;

ALTER TABLE IF EXISTS public."Articleship Jobs"
ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS hirer_email text;

-- Add `status` and `notes` to job_applications
ALTER TABLE IF EXISTS public.job_applications
ADD COLUMN IF NOT EXISTS status text DEFAULT 'new',
ADD COLUMN IF NOT EXISTS notes text;

-- ------------------------------------------------------------------------------
-- 2. Enable RLS on core tables
-- ------------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Industrial Training Job Portal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Fresher Jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Semi Qualified Jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."Articleship Jobs" ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. Helper Security Function: Check if candidate applied to any job posted by Hirer
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_hirer_for_applicant(hirer_uid uuid, applicant_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if there is any application from this applicant for a job posted by this hirer
    -- across all 4 job tables
    RETURN EXISTS (
        SELECT 1 FROM public.job_applications ja
        WHERE ja.user_id = applicant_uid
        AND (
            -- Check Industrial Training
            (ja.job_table = 'Industrial Training Job Portal' AND EXISTS (
                SELECT 1 FROM public."Industrial Training Job Portal" j
                WHERE (j.id::text = ja.job_id::text OR j.id::text = split_part(ja.job_id::text, '|', 2))
                AND j.posted_by = hirer_uid
            ))
            OR
            -- Check Fresher Jobs
            (ja.job_table = 'Fresher Jobs' AND EXISTS (
                SELECT 1 FROM public."Fresher Jobs" j
                WHERE (j.id::text = ja.job_id::text OR j.id::text = split_part(ja.job_id::text, '|', 2))
                AND j.posted_by = hirer_uid
            ))
            OR
            -- Check Semi Qualified Jobs
            (ja.job_table = 'Semi Qualified Jobs' AND EXISTS (
                SELECT 1 FROM public."Semi Qualified Jobs" j
                WHERE (j.id::text = ja.job_id::text OR j.id::text = split_part(ja.job_id::text, '|', 2))
                AND j.posted_by = hirer_uid
            ))
            OR
            -- Check Articleship Jobs
            (ja.job_table = 'Articleship Jobs' AND EXISTS (
                SELECT 1 FROM public."Articleship Jobs" j
                WHERE (j.id::text = ja.job_id::text OR j.id::text = split_part(ja.job_id::text, '|', 2))
                AND j.posted_by = hirer_uid
            ))
        )
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. RLS Policies on `profiles`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile or hirer can view applicant profile" ON public.profiles;

CREATE POLICY "Users can view own profile or hirer can view applicant profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    -- 1. Users can always read their own profile
    auth.uid() = uuid
    OR
    -- 2. Hirers can ONLY read profiles of candidates who applied to their jobs
    public.is_hirer_for_applicant(auth.uid(), profiles.uuid)
);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = uuid);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = uuid)
WITH CHECK (auth.uid() = uuid);

-- ------------------------------------------------------------------------------
-- 5. RLS Policies on `job_applications`
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Applicants can view own applications or hirers can view applications to their jobs" ON public.job_applications;

CREATE POLICY "Applicants can view own applications or hirers can view applications to their jobs"
ON public.job_applications
FOR SELECT
TO authenticated
USING (
    -- 1. Applicant can view their own application history
    auth.uid() = user_id
    OR
    -- 2. Hirer can view applications for jobs they posted
    (
        (job_table = 'Industrial Training Job Portal' AND EXISTS (
            SELECT 1 FROM public."Industrial Training Job Portal" j
            WHERE (j.id::text = job_applications.job_id::text OR j.id::text = split_part(job_applications.job_id::text, '|', 2))
            AND j.posted_by = auth.uid()
        ))
        OR
        (job_table = 'Fresher Jobs' AND EXISTS (
            SELECT 1 FROM public."Fresher Jobs" j
            WHERE (j.id::text = job_applications.job_id::text OR j.id::text = split_part(job_applications.job_id::text, '|', 2))
            AND j.posted_by = auth.uid()
        ))
        OR
        (job_table = 'Semi Qualified Jobs' AND EXISTS (
            SELECT 1 FROM public."Semi Qualified Jobs" j
            WHERE (j.id::text = job_applications.job_id::text OR j.id::text = split_part(job_applications.job_id::text, '|', 2))
            AND j.posted_by = auth.uid()
        ))
        OR
        (job_table = 'Articleship Jobs' AND EXISTS (
            SELECT 1 FROM public."Articleship Jobs" j
            WHERE (j.id::text = job_applications.job_id::text OR j.id::text = split_part(job_applications.job_id::text, '|', 2))
            AND j.posted_by = auth.uid()
        ))
    )
);

DROP POLICY IF EXISTS "Applicants can insert own applications" ON public.job_applications;
CREATE POLICY "Applicants can insert own applications"
ON public.job_applications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Hirers can update status of applications for their jobs" ON public.job_applications;
CREATE POLICY "Hirers can update status of applications for their jobs"
ON public.job_applications
FOR UPDATE
TO authenticated
USING (
    (job_table = 'Industrial Training Job Portal' AND EXISTS (
        SELECT 1 FROM public."Industrial Training Job Portal" j
        WHERE (j.id::text = job_applications.job_id::text OR j.id::text = split_part(job_applications.job_id::text, '|', 2))
        AND j.posted_by = auth.uid()
    ))
    OR
    (job_table = 'Fresher Jobs' AND EXISTS (
        SELECT 1 FROM public."Fresher Jobs" j
        WHERE (j.id::text = job_applications.job_id::text OR j.id::text = split_part(job_applications.job_id::text, '|', 2))
        AND j.posted_by = auth.uid()
    ))
    OR
    (job_table = 'Semi Qualified Jobs' AND EXISTS (
        SELECT 1 FROM public."Semi Qualified Jobs" j
        WHERE (j.id::text = job_applications.job_id::text OR j.id::text = split_part(job_applications.job_id::text, '|', 2))
        AND j.posted_by = auth.uid()
    ))
    OR
    (job_table = 'Articleship Jobs' AND EXISTS (
        SELECT 1 FROM public."Articleship Jobs" j
        WHERE (j.id::text = job_applications.job_id::text OR j.id::text = split_part(job_applications.job_id::text, '|', 2))
        AND j.posted_by = auth.uid()
    ))
);
