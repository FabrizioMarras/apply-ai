-- ============================================================
-- ApplyAI — Supabase Schema
-- Paste into Supabase SQL Editor and run
-- ============================================================

-- 1. USER PROFILES
-- Stores each user's CV text and preferences
CREATE TABLE user_profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cv_raw_text   text,                    -- extracted text from uploaded PDF
  cv_file_url   text,                    -- link to original PDF in storage
  full_name     text,
  location      text,
  target_roles  text,                    -- e.g. "Product Manager, Product Lead"
  preferences   jsonb DEFAULT '{}',      -- salary range, work type, deal-breakers
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 2. JOB APPLICATIONS
CREATE TABLE job_applications (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job details (extracted from URL)
  job_url             text NOT NULL,
  company             text,
  role                text,
  location            text,
  work_type           text CHECK (work_type IN ('remote','hybrid','onsite','unknown')),
  salary              text,
  seniority           text CHECK (seniority IN ('junior','mid','senior','lead','unknown')),
  job_description     text,

  -- AI scoring
  fit_score           integer CHECK (fit_score BETWEEN 0 AND 100),
  fit_reason          text,
  strengths           jsonb DEFAULT '[]',
  gaps                jsonb DEFAULT '[]',
  recommendation      text CHECK (recommendation IN ('apply','skip','stretch')),

  -- Generated documents (stored in Supabase Storage)
  cv_file_url         text,    -- downloadable tailored .docx CV
  cover_letter_url    text,
  cover_letter_text   text,
  tailored_summary    text,
  tailored_bullets    jsonb DEFAULT '[]',   -- per-section rewritten bullets
  tailored_skills     jsonb DEFAULT '[]',   -- ordered skills list for this role
  tailored_contact    jsonb,               -- { full_name, email, phone, location, linkedin }
  tailored_education  jsonb DEFAULT '[]',  -- [{ institution, degree, dates }]
  tailored_languages  jsonb DEFAULT '[]',  -- string[]

  -- Tracking
  status              text DEFAULT 'new'
                      CHECK (status IN ('new','applied','interviewing','offer','rejected','skipped')),
  notes               text,

  created_at          timestamptz DEFAULT now(),
  applied_at          timestamptz,
  updated_at          timestamptz DEFAULT now()
);

-- 3. AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER job_applications_updated_at
  BEFORE UPDATE ON job_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. INDEXES
CREATE INDEX idx_job_user    ON job_applications (user_id);
CREATE INDEX idx_job_status  ON job_applications (status);
CREATE INDEX idx_job_score   ON job_applications (fit_score DESC);
CREATE INDEX idx_job_created ON job_applications (created_at DESC);

-- 5. ROW LEVEL SECURITY
ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users: own row only" ON user_profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "jobs: own rows only" ON job_applications
  FOR ALL USING (auth.uid() = user_id);

-- 6. STATS VIEW (per user)
-- NOTE: This view is no longer queried by the frontend — stats are now
-- computed client-side from the job_applications array for real-time
-- reactivity. Safe to drop with: DROP VIEW IF EXISTS my_job_stats;
CREATE VIEW my_job_stats AS
SELECT
  auth.uid()                                                        AS user_id,
  COUNT(*)                                                          AS total,
  COUNT(*) FILTER (WHERE status = 'applied')                        AS applied,
  COUNT(*) FILTER (WHERE status = 'interviewing')                   AS interviewing,
  COUNT(*) FILTER (WHERE status = 'offer')                          AS offers,
  COUNT(*) FILTER (WHERE status = 'rejected')                       AS rejected,
  COUNT(*) FILTER (WHERE status = 'skipped')                        AS skipped,
  ROUND(AVG(fit_score) FILTER (WHERE status != 'skipped'), 1)       AS avg_fit_score,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status IN ('interviewing','offer'))
    / NULLIF(COUNT(*) FILTER (WHERE status = 'applied'), 0), 1
  )                                                                 AS interview_rate_pct
FROM job_applications
WHERE user_id = auth.uid()
GROUP BY auth.uid();

-- 7. STORAGE BUCKETS
-- Run these in Supabase Dashboard → Storage → New Bucket:
--   Name: "cv-uploads"       → Public: OFF (private)
--   Name: "job-documents"    → Public: ON  (so generated files are downloadable)
-- Then add policies: authenticated users can read/write their own files
-- Storage → Policies → New policy for each bucket:
--   INSERT: (auth.uid()::text = (storage.foldername(name))[1])
--   SELECT: (auth.uid()::text = (storage.foldername(name))[1])
