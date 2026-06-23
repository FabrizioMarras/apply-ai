# ApplyAI — Technical Documentation

> Last updated: June 2026 | Version: 0.2.0

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

ApplyAI is a **Next.js App Router** application. All AI calls and data operations run server-side (API routes), so no API keys are ever exposed to the browser.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser (React)                      │
│   Login → Dashboard (CV upload + job processor + table) │
└───────────────────────┬─────────────────────────────────┘
                        │  HTTP (fetch)
┌───────────────────────▼─────────────────────────────────┐
│              Next.js API Routes (Server)                 │
│                                                          │
│  POST   /api/upload-cv      ← PDF parsing (pdf-parse)   │
│  POST   /api/process-job    ← Full AI pipeline           │
│  PATCH  /api/update-status  ← Status + notes             │
│  DELETE /api/delete-job     ← Remove application         │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼────────────────────── ┐
│   Jina AI Reader     │  │         Supabase               │
│   r.jina.ai          │  │                                │
│   (free, no key)     │  │  Auth   (email/password)       │
└──────────┬───────────┘  │  DB     (job_applications,     │
           │               │          user_profiles)        │
┌──────────▼──────────┐   │  Storage (cv-uploads,          │
│   Anthropic API      │  │           job-documents)       │
│   claude-sonnet-4-6  │  └────────────────────────────────┘
│                      │
│  · Extract job info  │
│  · Score CV fit      │
│  · Tailor full CV    │
│  · Write cover letter│
└──────────────────────┘
```

### Key design decisions

- **No Python backend** — everything runs in Next.js API routes (Node.js). Simpler to deploy, one codebase.
- **Jina AI Reader for job fetching** — `https://r.jina.ai/{url}` renders JavaScript-heavy pages (LinkedIn, Greenhouse, Lever, Workday) server-side and returns clean text. Free, no API key required.
- **Server-side AI calls** — `ANTHROPIC_API_KEY` never leaves the server. API routes validate Supabase auth before calling Claude.
- **PDF parsed server-side** — `pdf-parse` runs in the API route, not the browser. Handles text-based PDFs up to 10MB.
- **Supabase RLS as the security boundary** — even if API auth is bypassed, users can only read/write their own rows. Defence in depth.
- **CV stored as text, documents as files** — the raw CV text lives in `user_profiles.cv_raw_text` for fast AI access. Generated `.docx` files live in Supabase Storage and are linked by URL.
- **Stats computed client-side** — dashboard stats are derived from the in-memory job list, keeping the UI reactive without extra DB queries.
- **Rate limiting via DB count** — each user is limited to `DAILY_JOB_LIMIT` job analyses per day (default: 10), enforced by counting today's rows before running the pipeline.

---

## 2. Project structure

```
apply-ai/
│
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── upload-cv/
│   │   │   └── route.ts          # CV upload: PDF → text → upserts user_profiles
│   │   ├── process-job/
│   │   │   └── route.ts          # Full AI pipeline (see §5)
│   │   ├── update-status/
│   │   │   └── route.ts          # PATCH: update status or notes
│   │   └── delete-job/
│   │       └── route.ts          # DELETE: remove a job application
│   │
│   ├── login/
│   │   └── page.tsx              # Email/password auth (client component)
│   ├── page.tsx                  # Dashboard: server component, fetches jobs
│   ├── layout.tsx                # Root layout: Inter font, ToastProvider, ErrorBoundary
│   ├── icon.svg                  # Favicon (brand colour + "A")
│   ├── not-found.tsx             # Custom 404 page
│   └── globals.css               # Tailwind base + scrollbar styles
│
├── components/
│   ├── DashboardClient.tsx       # Main interactive UI (see §8)
│   ├── Navbar.tsx                # Sticky top nav with sign out
│   ├── Toast.tsx                 # ToastProvider + useToast() hook
│   └── ErrorBoundary.tsx         # React error boundary with recovery UI
│
├── lib/
│   ├── types.ts                  # All shared TypeScript types + STATUS_META + scoreColor
│   ├── supabase-server.ts        # createClient() for Server Components + API routes
│   └── supabase-client.ts        # createClient() for Client Components (browser)
│
├── supabase/
│   └── schema.sql                # Full DB schema: tables, RLS, indexes, stats view (deprecated)
│
├── proxy.ts                      # Auth session helper (Supabase SSR pattern)
├── next.config.js                # External packages config + security headers
├── tailwind.config.js            # Custom colors: ink, mist, slate, brand, emerge, warn, danger
├── tsconfig.json
├── package.json
├── .env.example                  # Environment variable template
├── README.md
└── TECHNICAL.md                  # This file
```

---

## 3. Database schema

Two main tables, both protected by Row Level Security.

### `user_profiles`

One row per user, keyed to `auth.users.id`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | References `auth.users(id)` |
| `cv_raw_text` | text | Full text extracted from uploaded PDF |
| `cv_file_url` | text | Signed URL (1-year expiry) to original PDF in private `cv-uploads` bucket |
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
| `cv_file_url` | text | Public Supabase Storage URL → tailored `.docx` CV |
| `cover_letter_url` | text | Public Supabase Storage URL → cover letter `.docx` |
| `cover_letter_text` | text | Plain cover letter text (for in-app copy-paste) |
| `tailored_summary` | text | 3–4 sentence tailored professional summary |
| `tailored_bullets` | jsonb | Full experience array: `[{ company, role, dates, bullets[] }]` |
| `tailored_skills` | jsonb | Ordered skills list for this role |
| `status` | text | `new\|applied\|interviewing\|offer\|rejected\|skipped` |
| `notes` | text | User's free-text notes |
| `created_at` | timestamptz | |
| `applied_at` | timestamptz | Set when status changes to `applied` |
| `updated_at` | timestamptz | Auto-updated by trigger |

### `my_job_stats` (view — deprecated)

This view was used by earlier versions of the dashboard. Stats are now computed client-side from the job list for real-time reactivity. The view is harmless but can be removed:

```sql
DROP VIEW IF EXISTS my_job_stats;
```

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
4. Upload PDF to private `cv-uploads/{user_id}/cv-{timestamp}.pdf`
5. Generate 1-year signed URL for the uploaded file
6. Upsert `user_profiles` with `cv_raw_text` and signed `cv_file_url`

**Response:**
```json
{ "success": true, "charCount": 3842, "preview": "John Smith\nAmsterdam…" }
```

**Errors:** `400` (no file / wrong type / too large / unreadable), `401` (unauthenticated), `500` (storage or DB error)

---

### `POST /api/process-job`

**Purpose:** Full AI pipeline — fetch job, validate, score, tailor CV, build `.docx` files, save everything.

**Auth:** Requires valid Supabase session cookie.

**Request body:**
```json
{ "jobUrl": "https://example.com/jobs/product-manager" }
```

**Guards (in order):**
1. Rate limit — rejects if user has already processed `DAILY_JOB_LIMIT` jobs today (HTTP 429)
2. CV check — rejects if no CV uploaded yet (HTTP 400)
3. URL validation — rejects non-http/https URLs (HTTP 400)
4. Duplicate check — rejects if this URL was already processed (HTTP 409)
5. Content validation — rejects if Jina returns < 200 chars (likely login wall or empty page)
6. Extraction validation — rejects if Claude can't find a role, company, or skills (likely not a job posting)

**Flow:** See [§5 AI pipeline](#5-ai-pipeline-in-detail).

**Response (success, score ≥ threshold):**
```json
{
  "skipped": false,
  "score": 84,
  "company": "Mollie",
  "role": "Senior Product Manager",
  "recommendation": "apply",
  "job": { /* full job_applications row */ }
}
```

**Response (skipped, score < threshold):**
```json
{
  "skipped": true,
  "score": 52,
  "reason": "Creative domain too far from candidate background.",
  "job": { /* full job_applications row with status: skipped */ }
}
```

In both cases the full `job` object is returned so the dashboard can update immediately without a page reload.

**Errors:** `400` (missing URL / no CV), `401` (unauth), `409` (duplicate), `422` (not a job posting / login wall), `429` (daily limit), `500` (pipeline error)

---

### `PATCH /api/update-status`

**Purpose:** Update status and/or notes on a job application.

**Request body:**
```json
{ "id": "uuid", "status": "applied", "notes": "Recruiter called." }
```

`status` and `notes` are both optional — send either or both. When `status` is `"applied"`, `applied_at` is also set.

**Response:** `{ "success": true }`

---

### `DELETE /api/delete-job`

**Purpose:** Permanently remove a job application.

**Request body:** `{ "id": "uuid" }`

The route enforces `user_id` ownership — users can only delete their own records.

**Response:** `{ "success": true }`

---

## 5. AI pipeline in detail

All Claude calls use `claude-sonnet-4-6` with structured JSON output.

### Step 1 — Fetch job page (Jina AI Reader)

```
https://r.jina.ai/{jobUrl}
  → renders JavaScript, strips navigation/ads/boilerplate
  → returns clean markdown/plain text
  → truncated to 8000 chars
```

Jina AI Reader handles JavaScript-rendered pages that a plain `fetch()` can't read: LinkedIn job listings, Greenhouse, Lever, Workday, Ashby, and most modern career sites. It is free with no API key required.

**Error handling chain:**
| Condition | HTTP | Error message |
|-----------|------|---------------|
| Jina returns 4xx/5xx | 422 | "Could not fetch job page (403). Check the URL is publicly accessible." |
| Response < 200 chars | 422 | "Job page returned too little content. The URL may require a login…" |
| Claude finds no role/company/skills | 422 | "Could not extract job details from this URL. The page may require login, or it may not be a job posting." |

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

Claude reads the candidate's `cv_raw_text` (first 6000 chars) via a **cached content block** and the job description, returns:

```typescript
{
  score,           // 0–100
  reason,          // 2–3 sentence explanation
  strengths,       // string[] — candidate's relevant strengths
  gaps,            // string[] — skill or experience gaps
  recommendation,  // "apply" | "skip" | "stretch"
}
```

If `score < FIT_SCORE_THRESHOLD` (default 60), the job is saved as `skipped` and the pipeline stops. No further Claude calls, no documents generated.

### Step 4 — Tailor full CV

Claude reads the full CV via the **same cached content block** from Step 3 — this call gets a guaranteed prompt cache hit (the CV was written to cache seconds ago, well within the 5-minute TTL). Produces a complete restructured CV:

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

Instruction to Claude: *only highlight real experience, naturally reframed. Do not invent anything.*

### Prompt caching

Steps 3 and 4 both send the candidate's CV text as the first content block with `cache_control: { type: "ephemeral" }`. The block is **identical** in both calls — same CV slice (6000 chars), same format string.

When Step 3 (`scoreJob`) executes, Anthropic writes a cache entry for that block. When Step 4 (`tailorCV`) executes seconds later with the same block as prefix, it gets a **cache read hit** — approximately 10× cheaper than uncached input tokens.

| Scenario | Cache result |
|----------|-------------|
| `tailorCV` after `scoreJob` in the same pipeline | **Guaranteed hit** — within seconds |
| Second job by same user within 5 min | Hit on both Step 3 and Step 4 |
| Second job after 5 min have elapsed | Miss — new write, next call within 5 min hits |

The 6000-char slice (~1500 tokens) is safely above Anthropic's 1024-token minimum for a cache write. CVs shorter than ~4000 chars may not reach the minimum; the API gracefully falls back to uncached input with no error.

### Step 5 — Build CV `.docx` & write cover letter (parallel)

These two run concurrently with `Promise.all` to save 5–8 seconds:

**CV `.docx`** (built by the `docx` Node.js library):
- Name in large bold type
- Contact line (email · phone · location · LinkedIn)
- "Applying for: [role] at [company]" in brand colour italic
- Professional Summary section
- Key Skills — 2-column grid
- Experience — each role with dates and bullet points
- Education
- Languages

**Cover letter text** — Claude writes a 3-paragraph cover letter (max 320 words):
1. Specific hook about this company or role
2. Evidence of fit + specific value the candidate brings
3. Confident close with call to action

### Step 6 — Build cover letter `.docx`

The plain cover letter text is formatted into a Word document matching the CV's visual style:
- Candidate header (name, contact line)
- Divider
- Date + addressee block (Hiring Manager, company, location)
- Body paragraphs
- "Sincerely," closing with candidate name

Both the plain text (`cover_letter_text`) and the `.docx` URL (`cover_letter_url`) are stored — the text powers the in-app copy-paste feature; the file provides the downloadable Word document.

### Step 7 — Save to Supabase

Both `.docx` files are uploaded to the public `job-documents` bucket:
- `{user_id}/{timestamp}-cv.docx`
- `{user_id}/{timestamp}-cover.docx`

One `INSERT` into `job_applications` stores all extracted data, scores, tailored content, and file URLs.

### Claude call summary

| Step | Model | Max tokens | Caching | Approx cost |
|------|-------|-----------|---------|-------------|
| Extract job | claude-sonnet-4-6 | 1200 | — | ~$0.003 |
| Score fit | claude-sonnet-4-6 | 600 | Cache **write** (CV block) | ~$0.003 |
| Tailor CV | claude-sonnet-4-6 | 2500 | Cache **read** (CV block) | ~$0.005 |
| Cover letter | claude-sonnet-4-6 | 800 | — | ~$0.004 |
| **Total per job** | | | | **~$0.015–0.020** |

Skipped jobs only run extract + score: ~$0.006. The cache write on the score call costs 1.25× normal input for that block, but saves ~90% on the same block in the tailor call.

For back-to-back jobs by the same user within 5 minutes, Steps 3 and 4 both get cache **reads** (not writes), reducing total cost further to ~$0.012–0.016 per job.

---

## 6. Authentication & security

Authentication is handled entirely by **Supabase Auth** (email + password). Session cookies are managed by `@supabase/ssr`.

### Auth flow

- **Login / signup:** `app/login/page.tsx` — client component, calls Supabase Auth directly in the browser.
- **Protected pages:** `app/page.tsx` and any other server components call `supabase.auth.getUser()` and `redirect('/login')` if no session. This is the primary auth guard.
- **`proxy.ts`:** Contains a Supabase SSR session helper and route matcher. Handles session cookie refresh and auth redirects.

### API route auth pattern

Every API route independently validates the session:
```typescript
const { data: { user }, error } = await supabase.auth.getUser()
if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```

### RLS as the security boundary

All queries use the user's JWT (via the anon key + session cookie), not a service key, so RLS applies to every DB and Storage operation. Even a direct API call with a valid token can only access that user's own data.

### Security headers

Set globally via `next.config.js`:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `SAMEORIGIN` |
| `X-Content-Type-Options` | `nosniff` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

---

## 7. File storage

| Bucket | Visibility | Contents | Path pattern |
|--------|-----------|----------|-------------|
| `cv-uploads` | **Private** | Original uploaded PDFs | `{user_id}/cv-{timestamp}.pdf` |
| `job-documents` | **Public** | Generated .docx CV + cover letter | `{user_id}/{timestamp}-cv.docx` / `-cover.docx` |

**`cv-uploads` is private** — files are accessed via a 1-year signed URL generated at upload time and stored in `user_profiles.cv_file_url`. This URL is for reference only; the raw text in `cv_raw_text` is what the pipeline actually uses.

**`job-documents` is public** — generated files must be downloadable directly from the dashboard without additional auth. Files are namespaced by `user_id` as the first path segment, enforced by storage policies.

---

## 8. Frontend components

### `app/page.tsx` (Server Component)

Fetches the session, user profile, and all job applications in parallel. Passes `initialJobs` and `initialHasCv` to `DashboardClient`. Stats are not fetched from the DB — they are derived from the job list client-side.

### `DashboardClient.tsx` (Client Component)

The entire interactive UI. Key behaviours:

- **Live state** — jobs are added to the local array immediately after the pipeline returns (no page reload). The API returns the full job record on success so the row appears instantly.
- **Client-side stats** — `computeStats(jobs)` derives all dashboard header numbers from the in-memory job array, keeping them reactive to status changes and deletions.
- **CV section** — when no CV is uploaded, shows an inline upload form. When a CV is active, shows a compact "CV active · Replace" bar. No separate `/setup` route.
- **StatusPill** — dropdown with click-outside-to-close. Calls `/api/update-status` on change and updates local state immediately.
- **DetailPanel** — slide-in panel showing fit score, strengths/gaps, download buttons for CV + cover letter (.docx), copyable cover letter text, notes editor, and delete button.
- **Pagination** — 20 jobs per page, with Prev/Next controls. Page resets to 0 when filter, search, or sort changes.
- **Filter / search / sort** — filter by status pill; search by company, role, or location; sort by date / fit score / company name.

### `Navbar.tsx` (Client Component)

Sticky top nav. Shows the user's email and a sign-out button. CV upload status is handled by the dashboard, not the navbar.

### `Toast.tsx`

`ToastProvider` wraps the app root. `useToast()` returns a `toast(type, message)` function used by `DashboardClient` for success, error, and info messages. Toasts auto-dismiss after 4 seconds.

### `ErrorBoundary.tsx`

Class component wrapping the app root. Catches unexpected React render errors and shows a "Something went wrong / Try again" recovery UI instead of a blank screen.

---

## 9. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (server-side only, never sent to browser) |
| `FIT_SCORE_THRESHOLD` | No | Minimum fit score to generate documents (default: `60`) |
| `DAILY_JOB_LIMIT` | No | Max job analyses per user per day (default: `10`) |

---

## 10. Local development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your Supabase and Anthropic keys

# Run Supabase schema (one-time)
# → paste supabase/schema.sql into Supabase SQL Editor → Run

# Start dev server
npm run dev
# http://localhost:3000
```

### Useful dev tips

**Disable fit threshold during development:**
```env
FIT_SCORE_THRESHOLD=0
```
Every job will be processed regardless of score.

**Increase daily limit for testing:**
```env
DAILY_JOB_LIMIT=100
```

**Inspect raw Claude output:**
Add `console.log(raw)` before any `parseJson()` call in `process-job/route.ts` to see exactly what Claude returns.

**Test the pipeline without a real URL:**
Temporarily replace the `fetchJobText()` call with a hardcoded job description string to test AI steps without a live page fetch.

**Supabase local dev:**
Run `npx supabase start` (requires Docker) and update `NEXT_PUBLIC_SUPABASE_URL` to `http://localhost:54321`.

---

## 11. Deployment

### Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Add all environment variables in Vercel dashboard → Settings → Environment Variables.

**Timeout:** The pipeline runs ~20–35 seconds. Vercel Hobby has a 10-second limit — **Vercel Pro ($20/month)** raises this to 60 seconds. Alternatively, add this to the route:

```typescript
// app/api/process-job/route.ts
export const maxDuration = 60 // requires Vercel Pro
```

### Alternative: Railway / Render

Both support Next.js with longer timeouts on free tiers. Deploy via GitHub integration and set environment variables in their dashboards.

---

## 12. Cost model

### Supabase (free tier)
- 500MB database, 1GB file storage, 50k MAU
- Sufficient for personal use and small teams

### Anthropic API
- ~$0.02–0.03 per job fully processed (4 Claude calls)
- ~$0.005 per skipped job (2 calls: extract + score)
- ~$2–3 per 100 applications

### Jina AI Reader
- Free, no usage limits documented for moderate use
- No API key required

### Vercel
- Hobby: free, 10s function timeout (pipeline will hit this)
- Pro: $20/month, 60s timeout

---

## 13. Roadmap

### Phase 2 — Job Discovery

Instead of manually pasting URLs, the app polls job boards on a schedule and feeds matching listings into the pipeline automatically.

**Adzuna API** (free tier, covers NL/EU):
```
GET https://api.adzuna.com/v1/api/jobs/nl/search/1
  ?app_id=YOUR_ID&app_key=YOUR_KEY
  &what=product+manager&where=amsterdam
```

**Implementation plan:**
- Add Adzuna credentials to user preferences
- New route: `POST /api/discover-jobs` — fetches listings, deduplicates, feeds new ones into the pipeline
- Supabase Edge Function cron runs daily
- Dashboard banner: "8 new jobs discovered today"

### Phase 3 — Interview prep

When a job moves to `interviewing`:
- Claude generates a 1-page brief: likely questions, company culture notes, talking points connecting the candidate's background to their needs
- Stored in a new `interview_briefs` table, accessible from the detail panel

### Phase 4 — Profile preferences UI

Build a settings page for the `user_profiles.preferences` jsonb field:
- Target salary range
- Preferred work type (remote/hybrid/onsite)
- Target locations
- Deal-breakers (no relocation, no startups, etc.)
- Minimum company size

These preferences get injected into scoring and tailoring prompts for more accurate results.

### Phase 5 — Weekly digest email

- Supabase Edge Function runs every Monday
- Summarises the week: jobs processed, avg score, status updates, top 3 recommendations
- Sends via [Resend](https://resend.com) (free tier: 3,000 emails/month)

### Phase 6 — CV template upload

Allow users to upload their own `.docx` template. Parse the template structure, inject tailored content into the right sections, preserve personal formatting and layout.

### Phase 7 — Multi-CV support

Allow multiple named CV profiles (e.g. one for product roles, one for consulting). Select manually when processing a job, or auto-select based on role type.

---

## 14. Known limitations

### Job page fetching

| Site | Status | Notes |
|------|--------|-------|
| LinkedIn (public jobs) | ✅ Works | Jina renders the page correctly |
| LinkedIn (login-required) | ❌ Auth wall | Returns login page — caught with clear error |
| Indeed | ✅ Works | Clean extraction |
| Greenhouse | ✅ Works | Clean extraction |
| Lever | ✅ Works | Clean extraction |
| Ashby | ✅ Works | Clean extraction |
| Workday | ✅ Improved | Jina handles JS rendering |
| Company career pages | ✅ Usually works | Varies; SPAs are handled by Jina |
| Private ATS (SSO-gated) | ❌ Auth wall | No free solution; use a direct job URL instead |

### PDF parsing

- `pdf-parse` handles text-based PDFs only
- Scanned image PDFs (photographed CVs) return empty text and are rejected with a clear error
- Fix: export your CV from Word or Google Docs as PDF — always text-based

### Claude output reliability

Claude is prompted to return strict JSON. Occasionally (~1–2% of calls) it may return malformed JSON or include unexpected content. `parseJson()` strips markdown fences. If parsing fails, the route returns a 500 — retry the URL.

### Vercel free tier timeout

The pipeline runs 4 Claude calls (two in parallel after tailoring). Total time: ~20–35 seconds. Vercel Hobby times out at 10 seconds. Use Vercel Pro or deploy to Railway/Render.

### Rate limits

- App-level: `DAILY_JOB_LIMIT` (default 10) analyses per user per day
- Anthropic API: 50 requests/minute on Tier 1. At 4 calls per job, ~12 jobs/minute before hitting limits — unlikely for personal use
