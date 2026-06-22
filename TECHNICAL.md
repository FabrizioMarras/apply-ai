# ApplyAI — Technical Documentation

> Last updated: June 2026 | Version: 0.1.0

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Project structure](#2-project-structure)
3. [Database schema](#3-database-schema)
4. [API routes](#4-api-routes)
5. [AI pipeline in detail](#5-ai-pipeline-in-detail)
6. [Authentication & security](#6-authentication--security)
7. [File storage](#7-file-storage)
8. [Frontend components](#8-frontend-components)
9. [Environment variables](#9-environment-variables)
10. [Local development](#10-local-development)
11. [Deployment](#11-deployment)
12. [Cost model](#12-cost-model)
13. [Roadmap](#13-roadmap)
14. [Known limitations](#14-known-limitations)

---

## 1. Architecture overview

ApplyAI is a **Next.js 14 App Router** application. All AI calls and data operations run server-side (API routes), so no API keys are ever exposed to the browser.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (React)                      │
│   Login → Setup → Dashboard → Apply panel               │
└───────────────────────┬─────────────────────────────────┘
                        │  HTTP (fetch)
┌───────────────────────▼─────────────────────────────────┐
│              Next.js API Routes (Server)                 │
│                                                          │
│  POST /api/upload-cv      ← PDF parsing (pdf-parse)      │
│  POST /api/process-job    ← Full AI pipeline             │
│  PATCH /api/update-status ← Status + notes               │
└──────────┬───────────────────────┬──────────────────────┘
           │                       │
┌──────────▼──────────┐  ┌────────▼────────────────────── ┐
│   Anthropic API      │  │         Supabase               │
│   claude-sonnet-4-6  │  │                                │
│                      │  │  Auth   (email/password)       │
│  · Extract job info  │  │  DB     (job_applications,     │
│  · Score CV fit      │  │          user_profiles)        │
│  · Tailor full CV    │  │  Storage (cv-uploads,          │
│  · Write cover letter│  │           job-documents)       │
└──────────────────────┘  └────────────────────────────────┘
```

### Key design decisions

- **No Python backend** — everything runs in Next.js API routes (Node.js). Simpler to deploy, one codebase.
- **Server-side AI calls** — `ANTHROPIC_API_KEY` never leaves the server. API routes validate Supabase auth before calling Claude.
- **PDF parsed server-side** — `pdf-parse` runs in the API route, not the browser. Handles text-based PDFs up to 10MB.
- **Supabase RLS as the security boundary** — even if someone calls the API directly, they can only read/write their own rows. Defence in depth.
- **CV stored as text, documents as files** — the raw CV text lives in `user_profiles.cv_raw_text` for fast AI access. The generated `.docx` files live in Supabase Storage and are linked by URL.

---

## 2. Project structure

```
apply-ai/
│
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── upload-cv/
│   │   │   └── route.ts          # CV upload: receives PDF, parses text, upserts user_profiles
│   │   ├── process-job/
│   │   │   └── route.ts          # Full AI pipeline (see §5)
│   │   └── update-status/
│   │       └── route.ts          # PATCH: update status or notes on a job_application
│   │
│   ├── login/
│   │   └── page.tsx              # Email/password auth (client component)
│   ├── setup/
│   │   └── page.tsx              # CV upload onboarding (client component)
│   ├── apply/
│   │   └── [id]/
│   │       └── page.tsx          # Apply page: server component, passes job to ApplyClient
│   ├── page.tsx                  # Dashboard: server component, fetches jobs + stats
│   ├── layout.tsx                # Root layout with Inter font
│   └── globals.css               # Tailwind base + scrollbar styles
│
├── components/
│   ├── DashboardClient.tsx       # Main interactive UI: stats, job processor, table, panel
│   ├── ApplyClient.tsx           # Apply mode: download CV, copy cover letter, mark applied
│   └── Navbar.tsx                # Top nav with sign out + CV upload prompt
│
├── lib/
│   ├── types.ts                  # All shared TypeScript types + STATUS_META constant
│   ├── supabase-server.ts        # createClient() for Server Components + API routes
│   └── supabase-client.ts        # createClient() for Client Components (browser)
│
├── supabase/
│   └── schema.sql                # Full DB schema: tables, RLS, indexes, stats view
│
├── middleware.ts                 # Auth guard: redirects unauthenticated users to /login
├── next.config.js                # serverComponentsExternalPackages for pdf-parse, docx
├── tailwind.config.js            # Custom colors: ink, mist, slate, brand, emerge, warn, danger
├── tsconfig.json
├── package.json
├── .env.local.example
├── README.md
└── TECHNICAL.md                  # This file
```

---

## 3. Database schema

Two main tables, both protected by Row Level Security.

### `user_profiles`

Stores each user's extracted CV text and preferences. One row per user, keyed to `auth.users.id`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | References `auth.users(id)` |
| `cv_raw_text` | text | Full text extracted from uploaded PDF |
| `cv_file_url` | text | Public URL of original PDF in `cv-uploads` bucket |
| `full_name` | text | Optional display name |
| `location` | text | e.g. "Amsterdam, NL" |
| `target_roles` | text | e.g. "Product Manager, Product Lead" |
| `preferences` | jsonb | Salary range, work type preferences, deal-breakers |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Auto-updated by trigger |

### `job_applications`

One row per processed job URL per user.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `user_id` | uuid | FK → `auth.users(id)` |
| `job_url` | text | Original URL submitted |
| `company` | text | Extracted by Claude |
| `role` | text | Extracted by Claude |
| `location` | text | Extracted by Claude |
| `work_type` | text | `remote\|hybrid\|onsite\|unknown` |
| `salary` | text | Extracted if present, else null |
| `seniority` | text | `junior\|mid\|senior\|lead\|unknown` |
| `job_description` | text | Cleaned job description (max ~1200 words) |
| `fit_score` | integer | 0–100, scored by Claude |
| `fit_reason` | text | 2–3 sentence explanation from Claude |
| `strengths` | jsonb | Array of candidate strengths for this role |
| `gaps` | jsonb | Array of skill gaps identified |
| `recommendation` | text | `apply\|skip\|stretch` |
| `cv_file_url` | text | Supabase Storage URL → tailored `.docx` CV |
| `cover_letter_url` | text | Supabase Storage URL → cover letter `.txt` |
| `cover_letter_text` | text | Full cover letter text (for in-app copy) |
| `tailored_summary` | text | 3–4 sentence tailored professional summary |
| `tailored_bullets` | jsonb | Full experience array with rewritten bullets |
| `tailored_skills` | jsonb | Ordered skills list for this role |
| `status` | text | `new\|applied\|interviewing\|offer\|rejected\|skipped` |
| `notes` | text | User's free-text notes |
| `created_at` | timestamptz | |
| `applied_at` | timestamptz | Set when status changes to `applied` |
| `updated_at` | timestamptz | Auto-updated by trigger |

### `my_job_stats` (view)

A per-user stats view used by the dashboard header cards. Returns counts by status, average fit score, and interview rate — automatically filtered to `auth.uid()`.

### RLS policies

```sql
-- user_profiles: each user sees and edits only their own row
CREATE POLICY "users: own row only" ON user_profiles
  FOR ALL USING (auth.uid() = id);

-- job_applications: each user sees and edits only their own rows
CREATE POLICY "jobs: own rows only" ON job_applications
  FOR ALL USING (auth.uid() = user_id);
```

---

## 4. API routes

### `POST /api/upload-cv`

**Purpose:** Receive a PDF, extract text server-side, save to Supabase.

**Auth:** Requires valid Supabase session cookie.

**Request:** `multipart/form-data` with field `cv` (PDF file, max 10MB).

**Flow:**
1. Validate session → get `user.id`
2. Parse PDF with `pdf-parse` → extract raw text
3. Validate text length ≥ 100 chars (rejects scanned image PDFs)
4. Upload original PDF to `cv-uploads/{user_id}/cv-{timestamp}.pdf`
5. Upsert `user_profiles` with `cv_raw_text` and `cv_file_url`

**Response:**
```json
{ "success": true, "charCount": 3842, "preview": "John Smith\nAmsterdam…" }
```

**Errors:**
- `400` — no file, wrong type, too large, or unreadable text
- `401` — unauthenticated
- `500` — Supabase or parsing error

---

### `POST /api/process-job`

**Purpose:** Full AI pipeline — fetch job, score fit, tailor CV, build `.docx`, write cover letter, save everything.

**Auth:** Requires valid Supabase session cookie.

**Request body:**
```json
{ "jobUrl": "https://linkedin.com/jobs/view/12345" }
```

**Flow:** See [§5 AI pipeline](#5-ai-pipeline-in-detail) for full detail.

**Response (success, score ≥ threshold):**
```json
{
  "id": "uuid",
  "skipped": false,
  "score": 84,
  "company": "Mollie",
  "role": "Senior Product Manager",
  "recommendation": "apply"
}
```

**Response (skipped, score < threshold):**
```json
{
  "id": "uuid",
  "skipped": true,
  "score": 52,
  "reason": "Creative domain too far from candidate background."
}
```

**Errors:**
- `400` — missing `jobUrl`, no CV uploaded yet
- `401` — unauthenticated
- `409` — duplicate URL (already processed)
- `500` — fetch failed, Claude error, Supabase error

---

### `PATCH /api/update-status`

**Purpose:** Update job status and/or notes.

**Auth:** Requires valid Supabase session cookie.

**Request body:**
```json
{ "id": "uuid", "status": "applied", "notes": "Recruiter called." }
```

Both `status` and `notes` are optional — send either or both. When `status` is `applied`, `applied_at` is also set automatically.

**Response:** `{ "success": true }`

---

## 5. AI pipeline in detail

All Claude calls use `claude-sonnet-4-6` with structured JSON output. The pipeline runs sequentially in a single API route execution.

### Step 1 — Fetch job page

```
fetch(jobUrl) → strip HTML tags + scripts → plain text → truncate to 8000 chars
```

Works on LinkedIn, Indeed, Greenhouse, Lever, Ashby, Workday, and most company careers pages. Some sites return minimal content when fetched without a browser session (LinkedIn in particular) — this is a known limitation (see §14).

### Step 2 — Extract job details

Claude reads the raw text and returns structured JSON:

```typescript
{
  company, role, location, work_type, salary, seniority,
  description,        // cleaned, max ~1200 words
  required_skills,    // string[]
  nice_to_have,       // string[]
}
```

### Step 3 — Score fit

Claude reads the candidate's `cv_raw_text` (first 3000 chars) and the job description, returns:

```typescript
{
  score,           // 0–100
  reason,          // 2–3 sentence explanation
  strengths,       // string[] — candidate's relevant strengths
  gaps,            // string[] — skills/experience gaps
  recommendation,  // "apply" | "skip" | "stretch"
}
```

If `score < FIT_SCORE_THRESHOLD` (default 60), the job is saved as `skipped` and the pipeline stops here — no documents generated, no further Claude calls.

### Step 4 — Tailor full CV

Claude reads the full CV text (first 4000 chars) and produces a complete restructured CV:

```typescript
{
  full_name, email, phone, location, linkedin,
  professional_summary,   // 3–4 sentences tailored to this role
  skills_to_highlight,    // string[6] — ordered by relevance
  experience: [{
    company, role, dates,
    bullets: string[],    // rewritten bullets emphasising relevant experience
  }],
  education: [{ institution, degree, dates }],
  languages: string[],
}
```

The instruction to Claude explicitly says: *only highlight real experience, naturally reframed. Do not invent anything.* This keeps the output honest.

### Step 5 — Build `.docx` file

The `docx` Node.js library assembles a formatted Word document from the tailored CV JSON:

- **Name** in large bold type
- Contact line (email · phone · location · LinkedIn)
- "Applying for: [role] at [company]" in brand colour italic
- **Professional Summary** section
- **Key Skills** — 2-column grid with skill chips
- **Experience** — each role with dates and bullet points
- **Education**
- **Languages**

The file is uploaded to `job-documents/{user_id}/{timestamp}-cv.docx` in Supabase Storage.

### Step 6 — Write cover letter

Claude writes a 3-paragraph cover letter (max 320 words):

1. Specific hook about the company or role
2. Evidence of fit + specific value the candidate brings
3. Confident close with call to action

Saved as plain text to `job-documents/{user_id}/{timestamp}-cover.txt` and also stored in `cover_letter_text` for in-app copy-paste.

### Step 7 — Save to Supabase

One `INSERT` into `job_applications` with all extracted data, scores, file URLs, and tailored content.

### Claude call summary

| Step | Model | Max tokens | Approx cost |
|------|-------|-----------|-------------|
| Extract job | claude-sonnet-4-6 | 1200 | ~$0.003 |
| Score fit | claude-sonnet-4-6 | 600 | ~$0.002 |
| Tailor CV | claude-sonnet-4-6 | 2500 | ~$0.010 |
| Cover letter | claude-sonnet-4-6 | 800 | ~$0.004 |
| **Total per job** | | | **~$0.019–0.030** |

---

## 6. Authentication & security

Authentication is handled entirely by **Supabase Auth** (email + password). Session cookies are managed by `@supabase/ssr`.

### Middleware (`middleware.ts`)

Runs on every non-static, non-API request. Refreshes the session token and redirects unauthenticated users to `/login`. Authenticated users hitting `/login` are redirected to `/`.

```typescript
// Protected: all routes except /login
// Public: /login, /_next/*, /api/*
```

Note: API routes do their own auth check (`supabase.auth.getUser()`) independently of middleware — API routes are excluded from middleware to avoid double-handling.

### API route auth pattern

Every API route:
```typescript
const { data: { user }, error } = await supabase.auth.getUser()
if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### RLS as the security boundary

Even if API auth is bypassed, Supabase RLS ensures users can only read/write their own data. All queries run with the user's JWT (via the anon key + cookie session), not a service key, so RLS applies to every DB operation.

---

## 7. File storage

Two private Supabase Storage buckets:

| Bucket | Contents | Path pattern |
|--------|----------|-------------|
| `cv-uploads` | Original uploaded PDFs | `{user_id}/cv-{timestamp}.pdf` |
| `job-documents` | Generated .docx CVs + cover letters | `{user_id}/{timestamp}-cv.docx` / `-cover.txt` |

Files are namespaced by `user_id` as the first path segment, which the storage policies use to enforce ownership:

```sql
(auth.uid()::text = (storage.foldername(name))[1])
```

Public URLs are generated via `supabase.storage.from(bucket).getPublicUrl(path)` and stored in the database for direct access from the dashboard.

---

## 8. Frontend components

### `app/page.tsx` (Server Component)

Fetches session, user profile, all job applications, and computes stats server-side. Passes data as props to `DashboardClient`. No client-side data fetching on initial load — instant render.

### `DashboardClient.tsx` (Client Component)

The main interactive UI. Manages:
- Local job list state (updated optimistically after pipeline runs)
- Filter (by status), search (company/role/location), sort (date/score/company)
- `ProcessJobBar` — URL input, pipeline trigger, step-by-step progress display
- `DetailPanel` — slide-in panel with fit score, strengths/gaps, CV download button, full CV preview (expandable), cover letter (copyable), notes
- `StatusPill` — dropdown to change job status, calls `/api/update-status`

After `processJob()` resolves, calls `router.refresh()` to re-fetch server data while also updating local state immediately for instant feedback.

### `ApplyClient.tsx` (Client Component)

Dedicated apply page for a single job. Shows:
- Job header with fit score and status
- **Download Tailored CV (.docx)** — primary action
- Open job posting button
- Full cover letter with copy button
- "Mark as applied" button

### `Navbar.tsx` (Client Component)

Sticky top nav. Shows a warning badge if the user hasn't uploaded a CV yet (links to `/setup`).

---

## 9. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (server-side only) |
| `NEXT_PUBLIC_APP_URL` | Yes | App base URL (e.g. `https://apply-ai.vercel.app`) |
| `FIT_SCORE_THRESHOLD` | No | Minimum score to generate documents (default: `60`) |

`ANTHROPIC_API_KEY` is server-only (no `NEXT_PUBLIC_` prefix) and never sent to the browser.

---

## 10. Local development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your keys

# Run Supabase schema
# → paste supabase/schema.sql into Supabase SQL Editor

# Start dev server
npm run dev
# http://localhost:3000
```

### Useful dev tips

**Adjusting the fit threshold:** Set `FIT_SCORE_THRESHOLD=0` in `.env.local` during development to process every job regardless of score.

**Watching Claude responses:** Add `console.log(raw)` before `parseJson()` calls in `process-job/route.ts` to inspect raw Claude output.

**Testing the pipeline without a real URL:** You can temporarily replace the `fetchJobText()` call with a hardcoded string to test the AI steps without needing a live job page.

**Supabase local dev:** You can run Supabase locally with `npx supabase start` if you have Docker. Update `NEXT_PUBLIC_SUPABASE_URL` to `http://localhost:54321`.

---

## 11. Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel         # follow prompts, auto-detects Next.js
```

In Vercel dashboard → Settings → Environment Variables, add all four variables. Set `NEXT_PUBLIC_APP_URL` to your Vercel deployment URL.

Vercel's default function timeout is 10 seconds on the free plan — the pipeline may exceed this for slow job pages. **Upgrade to Vercel Pro** (or set `maxDuration` in route config) if you hit timeouts.

To increase timeout on free plan, add to your API route:

```typescript
export const maxDuration = 30 // seconds — requires Vercel Pro for > 10s
```

### Alternative: Railway / Render

Both support Next.js with longer timeouts on free tiers. Set environment variables in their dashboard and deploy via GitHub integration.

---

## 12. Cost model

### Supabase (free tier)
- 500MB database
- 1GB file storage
- 50,000 monthly active users
- More than sufficient for personal use and small teams

### Anthropic API
- ~$0.02–0.03 per job processed (4 Claude calls)
- ~$2–3 per 100 applications
- Skipped jobs (below threshold) cost ~$0.005 (only 2 calls: extract + score)

### Vercel (free tier)
- 100GB bandwidth/month
- 100 serverless function invocations/day limit on Hobby plan
- For heavier use: Vercel Pro at $20/month

---

## 13. Roadmap

### Phase 2 — Job Discovery (next sprint)

Instead of manually pasting URLs, the app polls job boards on a schedule and feeds matching listings into the pipeline automatically.

**Adzuna API** (free tier, covers NL/EU well):
```
GET https://api.adzuna.com/v1/api/jobs/nl/search/1
  ?app_id=YOUR_ID&app_key=YOUR_KEY
  &what=product+manager
  &where=amsterdam
  &distance=20
  &results_per_page=20
```

**Implementation plan:**
- Add `adzuna_app_id` + `adzuna_app_key` to user preferences
- New API route: `POST /api/discover-jobs` — fetches listings, deduplicates against existing `job_url` records, feeds new ones into the pipeline
- Cron job (Vercel Cron or Supabase Edge Functions) runs daily
- Dashboard shows "Discovered today: 8 new jobs" banner

**LinkedIn scraping note:** LinkedIn actively blocks non-browser fetches. Options:
- Use [ProxyCurl API](https://nubela.co/proxycurl) (~$0.01/request) for LinkedIn job data
- Use [Apify LinkedIn Jobs Scraper](https://apify.com/curious_coder/linkedin-jobs-scraper) (pay per run)
- Unofficial: `linkedin-jobs-api` npm package (grey area, use at own risk)

### Phase 3 — Interview prep

When a job moves to `interviewing` status:
- Claude generates a 1-page brief: likely questions, company culture notes, talking points connecting your background to their needs
- Saved to a new `interview_briefs` table
- Accessible from the apply panel

### Phase 4 — Profile preferences UI

Currently `user_profiles.preferences` is a jsonb field set manually. Build a settings page:
- Target salary range (min/max)
- Preferred work type (remote/hybrid/onsite)
- Target locations
- Deal-breakers (e.g. no relocation, no startups)
- Minimum company size

These preferences get injected into scoring and tailoring prompts for more accurate results.

### Phase 5 — Weekly digest email

- Supabase Edge Function runs every Monday
- Summarises the week: jobs processed, avg score, status updates
- Sends via [Resend](https://resend.com) (free tier: 3,000 emails/month)
- Includes a "top 3 jobs to apply to this week" recommendation

### Phase 6 — CV template upload

Currently the `.docx` output is generated from scratch by the `docx` library using a fixed structure. Allow users to upload their own `.docx` template:
- Parse the template structure
- Inject tailored content into the right sections
- Preserve their personal formatting, fonts, and layout

### Phase 7 — Multi-CV support

Some users have different CV variants (e.g. one for product roles, one for consulting). Allow:
- Uploading multiple named CV profiles
- Selecting which CV to use when processing a job
- Automatic selection based on role type

---

## 14. Known limitations

### Job page fetching

| Site | Status | Notes |
|------|--------|-------|
| Indeed | ✅ Works | Good text extraction |
| LinkedIn | ⚠️ Partial | Returns limited content without login session. Use the full job description URL (`/jobs/view/123456`), not the search results page |
| Greenhouse | ✅ Works | Clean HTML |
| Lever | ✅ Works | Clean HTML |
| Ashby | ✅ Works | Clean HTML |
| Workday | ⚠️ Partial | Heavy JS rendering — text extraction may be incomplete |
| Company career pages | ✅ Usually works | Varies by site |

**Workaround for difficult sites:** Copy-paste the job description text into a notes field and process from there (Phase 4 feature).

### PDF parsing

- `pdf-parse` works on text-based PDFs only
- Scanned image PDFs (photographed CVs) return empty text and are rejected with a clear error message
- Solution: export your CV from Word/Google Docs as PDF — these are always text-based

### Claude output reliability

Claude is prompted to return strict JSON. Occasionally (~1–2% of calls) it may return malformed JSON or include unexpected content. The `parseJson()` helper strips markdown fences. If parsing fails, the API route returns a 500 error — simply retry the URL.

### Vercel free tier timeout

The pipeline runs 4 sequential Claude API calls, each taking 3–8 seconds. Total pipeline time: ~20–35 seconds. Vercel Hobby plan has a **10-second function timeout** — this will cause failures. Options:
- Upgrade to Vercel Pro ($20/month) for 60-second timeout
- Deploy to Railway or Render (longer timeouts on free tiers)
- Split the pipeline into a queue (Supabase Edge Functions + pg_cron) — Phase 2 architecture

### Rate limits

Anthropic API: 50 requests/minute on Tier 1. At 4 calls per job, you can process ~12 jobs/minute before hitting rate limits. Unlikely to be an issue for personal use.
