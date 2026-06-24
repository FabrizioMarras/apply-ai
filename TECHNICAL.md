# ApplyAI — Technical Documentation

> Last updated: June 2026 | Version: 0.4.0

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
│   SSE stream reader — shows live pipeline progress       │
└───────────────────────┬─────────────────────────────────┘
                        │  HTTP / SSE
┌───────────────────────▼─────────────────────────────────┐
│              Next.js API Routes (Server)                 │
│                                                          │
│  POST   /api/upload-cv      ← PDF parsing (pdf-parse)   │
│  POST   /api/process-job    ← Full AI pipeline (SSE)    │
│  PATCH  /api/update-status  ← Status + notes            │
│  DELETE /api/delete-job     ← Remove application        │
└──────────┬──────────────────────┬───────────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼───────────────────────┐
│  Job page fetching   │  │         Supabase               │
│                      │  │                                │
│  1. Direct fetch     │  │  Auth   (email/password)       │
│     → JSON-LD parse  │  │  DB     (job_applications,     │
│  2. HTML text strip  │  │          user_profiles)        │
│  3. Jina AI fallback │  │  Storage (cv-uploads,          │
└──────────┬───────────┘  │           job-documents)       │
           │               └────────────────────────────────┘
┌──────────▼──────────┐
│   Anthropic API      │
│   claude-sonnet-4-6  │
│                      │
│  · Extract job info  │
│  · Score CV fit      │
│  · Tailor full CV    │
│  · Write cover letter│
└──────────────────────┘
```

### Key design decisions

- **No Python backend** — everything runs in Next.js API routes (Node.js). Simpler to deploy, one codebase.
- **Three-tier job fetching** — Direct fetch with browser headers is tried first (free, no rate limits). JSON-LD structured data (`<script type="application/ld+json">`) is preferred when present — it's clean and structured, better than raw HTML. Plain HTML text extraction is the second attempt. Jina AI Reader is the last resort for JavaScript-rendered pages that return empty HTML.
- **Tracking param stripping** — URLs are normalised before fetching: known tracking parameters (`utm_*`, `eBP`, `trk`, `refId`, `trackingId`, `fbclid`, etc.) are removed. Job identity is always in the URL path on major boards, so stripping these doesn't change which page loads, and prevents sites from serving gated responses to tracked requests.
- **SSE streaming progress** — `/api/process-job` streams pipeline progress as Server-Sent Events (`text/event-stream`). The browser receives live step updates ("Fetching job page…", "Scoring your fit…", etc.) instead of waiting silently for 60 seconds. Early-exit responses (auth failure, rate limit, duplicate) are still plain JSON.
- **Server-side AI calls** — `ANTHROPIC_API_KEY` never leaves the server. API routes validate Supabase auth before calling Claude.
- **Prompt caching** — The candidate's CV text is sent as a cached content block (`cache_control: { type: "ephemeral" }`). The score step writes the cache; the tailor step, running seconds later with the identical block, gets a guaranteed cache read hit (~10× cheaper).
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
│   │   │   └── route.ts          # Full AI pipeline — SSE streaming (see §5)
│   │   ├── update-status/
│   │   │   └── route.ts          # PATCH: update status or notes
│   │   └── delete-job/
│   │       └── route.ts          # DELETE: remove a job application
│   │
│   ├── login/
│   │   └── page.tsx              # Email/password auth (client component)
│   ├── page.tsx                  # Dashboard: server component, fetches jobs
│   ├── layout.tsx                # Root layout: Inter font, anti-flicker theme script, ToastProvider, ErrorBoundary
│   ├── icon.svg                  # Favicon (brand colour + "A")
│   ├── not-found.tsx             # Custom 404 page
│   └── globals.css               # Tailwind base + dark scrollbar styles
│
├── components/
│   ├── DashboardClient.tsx       # Main interactive UI (see §8)
│   ├── Navbar.tsx                # Sticky top nav: logo, email, dark-mode toggle, sign out
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
├── tailwind.config.js            # Custom colors + darkMode: 'class'
├── tsconfig.json
├── package.json
├── .env.example                  # Environment variable template
├── README.md
├── SETUP.md                      # Plain-English setup guide for non-developers
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

**Response format — two modes:**

Pre-flight checks (auth, rate limit, CV presence, URL validity, duplicate) return **plain JSON** with the appropriate HTTP status. The client checks `Content-Type` to detect which mode it's in.

Once all checks pass, the pipeline begins and the response switches to **Server-Sent Events** (`Content-Type: text/event-stream`). Events are newline-delimited JSON prefixed with `data: `.

**SSE event types:**

| `type` | Payload | Meaning |
|--------|---------|---------|
| `progress` | `{ message: string }` | Step started — display to user |
| `result` | `{ score, company, role, recommendation, job }` | Pipeline complete, job saved |
| `skipped` | `{ score, reason, job }` | Score below threshold, saved as skipped |
| `error` | `{ message, status? }` | Pipeline error (extraction failure, API error, etc.) |

**Progress sequence (normal flow):**
```
Fetching job page…
Extracting job details…
Scoring your fit…
Tailoring your CV…
Writing cover letter…
Saving documents…
```

**Guards (in order):**
1. Auth check — HTTP 401 if no session
2. Rate limit — HTTP 429 if `DAILY_JOB_LIMIT` reached today
3. CV check — HTTP 400 if no CV uploaded
4. URL validation — HTTP 400 for non-http/https URLs
5. Duplicate check — HTTP 409 if URL already processed (returns full `job` object so dashboard can open it)
6. *(Pipeline starts, switches to SSE)*
7. Extraction validation — `error` SSE event (422) if role/company/skills not found
8. Score threshold — `skipped` SSE event if score < threshold

**Errors (JSON):** `400`, `401`, `409`, `429`
**Errors (SSE):** `error` event with `status: 422` or `status: 500`

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

### Step 1 — Fetch job page (three-tier strategy)

The pipeline tries three methods in order, stopping at the first that returns ≥ 300 characters of content:

**Tier 1 — Direct fetch with browser headers**

```
fetch(cleanJobUrl, { headers: { User-Agent: Chrome/124, Accept: text/html... } })
  → HTML response
  → Try JSON-LD extraction first (see below)
  → Fall back to HTML tag stripping
```

Before fetching, `cleanJobUrl()` strips known tracking-only query parameters (`utm_*`, `eBP`, `trk`, `refId`, `trackingId`, `alternateChannel`, `fbclid`, `gclid`, etc.). Job identity lives in the URL path on all major boards, so stripping these doesn't change the target page and prevents sites from serving gated or different responses to bot-detected tracking URLs.

**JSON-LD extraction** (attempted first within Tier 1):

Many job boards embed full job data as `<script type="application/ld+json">` with `@type: "JobPosting"` for SEO. This structured data is cleaner than scraped HTML. The extractor finds all JSON-LD blocks, parses each, and returns formatted plain text with title, company, location, employment type, and description (HTML tags stripped).

Sites known to include `JobPosting` JSON-LD: LinkedIn, Indeed, Greenhouse, Lever, Ashby, most company career pages.

**HTML text strip** (Tier 1 fallback):

If no JSON-LD is found, `<script>`, `<style>`, and all HTML tags are removed; HTML entities are decoded; whitespace collapsed to single spaces.

**Tier 2 — Jina AI Reader** (fallback for JS-rendered pages):

```
https://r.jina.ai/{cleanJobUrl}
  → renders JavaScript, strips navigation/ads/boilerplate
  → returns clean plain text
```

Jina handles pages that need JavaScript rendering (some LinkedIn pages, Workday, some SPAs). If `JINA_API_KEY` is set, it is sent as `Authorization: Bearer …` for a higher request quota. Without a key, Jina's anonymous tier is used (subject to rate limits).

**Error handling:**

| Condition | Result |
|-----------|--------|
| All three tiers return < 300 chars | SSE `error` event — "Could not retrieve this job page" |
| Claude finds no role/company/skills | SSE `error` event (422) — extraction failed |
| LinkedIn login wall detected | SSE `error` event (422) — LinkedIn-specific message |

Final text is truncated to 8000 chars before passing to Claude.

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

**Extraction validation:** requires `(role AND company)` OR `skills`, AND description ≥ 80 words. Prevents login-wall pages that expose the job title in the HTML `<title>` tag from passing through with empty company/skills.

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

If `score < FIT_SCORE_THRESHOLD` (default 60), the job is saved as `skipped` and a `skipped` SSE event is sent. No further Claude calls, no documents generated.

### Step 4 — Tailor full CV

Claude reads the full CV via the **same cached content block** from Step 3 — this call gets a guaranteed prompt cache hit (the CV was written to cache seconds ago, well within the 5-minute TTL). Produces a complete restructured CV:

```typescript
{
  full_name, email, phone, location, linkedin,
  professional_summary,   // 3–4 sentences tailored to this role
  skills_to_highlight,    // string[] — ordered by relevance
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
- Key Skills — plain bullet list (`▪  Skill name`), one per line
- Experience — each role with dates and bullet points
- Education
- Languages

> **Note on Key Skills layout:** A two-column table was attempted but caused rendering issues in Apple Pages and other non-Word renderers due to OOXML `pct` width unit interpretation (values are in 1/50th-of-a-percent units, not plain percent). Plain bullets are universally compatible.

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

One `INSERT` into `job_applications` stores all extracted data, scores, tailored content, and file URLs. A `result` SSE event is sent with the full record so the dashboard row appears immediately.

### Claude call summary

| Step | Model | Max tokens | Caching | Approx cost |
|------|-------|-----------|---------|-------------|
| Extract job | claude-sonnet-4-6 | 1200 | — | ~$0.003 |
| Score fit | claude-sonnet-4-6 | 1200 | Cache **write** (CV block) | ~$0.003 |
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

**Documents are generated once, at processing time.** The download button is a direct link to the stored file — no regeneration on click, no AI tokens used. To get updated documents after a code change, re-process the job URL.

---

## 8. Frontend components

### `app/page.tsx` (Server Component)

Fetches the session, user profile, and all job applications in parallel. Passes `initialJobs` and `initialHasCv` to `DashboardClient`. Stats are not fetched from the DB — they are derived from the job list client-side.

### `DashboardClient.tsx` (Client Component)

The entire interactive UI. Key behaviours:

- **SSE stream reading** — `process()` in `ProcessJobBar` detects the `text/event-stream` Content-Type and reads the response body as a stream. Progress messages update a `progress` state variable shown under the Analyse button. On `result` or `skipped` events, the job is added to the list and a toast appears. On `error` events, an error toast is shown. Early-exit responses (JSON Content-Type) are handled as before.
- **Live state** — jobs are added to the local array immediately after the pipeline returns the `result` event (no page reload). Duplicate URLs are filtered on prepend to prevent double rows after re-processing.
- **Client-side stats** — `computeStats(jobs)` derives all dashboard header numbers from the in-memory job array, keeping them reactive to status changes and deletions.
- **CV section** — when no CV is uploaded, shows an inline upload form. When a CV is active, shows a compact "CV active · Replace" bar. No separate `/setup` route.
- **Responsive job list** — on desktop (`md+`) jobs render as a 6-column CSS grid table (Score · Company/Role · Location · Type · Date · Status). On mobile (`< md`) jobs render as cards: score badge + company/role + status pill in a single row, with location, work type, and date as a secondary line below. The status pill on cards has `stopPropagation` so tapping it doesn't open the detail panel.
- **StatusPill** — dropdown that uses `position: fixed` with coordinates from `getBoundingClientRect()` to escape any `overflow: hidden` ancestor (the table wrapper). When near the right edge of the viewport (e.g. in the detail panel or on mobile), the dropdown right-aligns to the button instead of left-aligning, preventing viewport overflow.
- **Filter bar** — two rows on all screen sizes: (1) a full-width search input (`flex-1`) with sort buttons inline to the right; (2) status filter pills in a horizontally scrollable single row on mobile (`overflow-x-auto`, `-mx-4 px-4` edge-to-edge bleed, `shrink-0` pills, hidden scrollbar), wrapping normally on desktop.
- **DetailPanel** — slide-in panel showing fit score, strengths/gaps, download buttons for CV + cover letter (.docx), copyable cover letter text, notes editor, and delete. Notes auto-save on blur (no button); a brief "Saved" indicator confirms persistence. The notes value is written back to the local `jobs` array via `onNotesChange` so reopening the panel always shows the current note without a page refresh. Delete uses an inline confirmation (first click reveals "Are you sure? / Cancel / Delete" in the footer row) — no browser `confirm()` dialog.
- **Pagination** — 20 jobs per page, with Prev/Next controls. Page resets to 0 when filter, search, or sort changes.
- **Icons** — `lucide-react` throughout: `Link2` in URL input, `Upload`/`FileText` for CV section, `Download`/`ExternalLink`/`Copy`/`Check` in detail panel, `Trash2`/`X` for delete/close, `Search` in search bar, `ChevronLeft`/`ChevronRight` for pagination.

### `Navbar.tsx` (Client Component)

Sticky top nav. Shows the SVG logo ("A" on indigo), "Apply**AI**" wordmark, user email, a **dark/light mode toggle** (Sun/Moon icons), and a sign-out button.

**Dark mode implementation:**
- `tailwind.config.js` uses `darkMode: 'class'`
- An anti-flicker inline script runs via `<Script strategy="beforeInteractive">` in `app/layout.tsx` — reads `localStorage.theme` or `prefers-color-scheme` and sets the `dark` class on `<html>` before React hydrates, preventing a flash of the wrong theme
- The toggle writes to `localStorage` and toggles the `dark` class on `document.documentElement`
- All components use `dark:` Tailwind variants (e.g. `dark:bg-gray-900`, `dark:text-gray-50`)

### `Toast.tsx`

`ToastProvider` wraps the app root. `useToast()` returns a `toast(type, message)` function used by `DashboardClient` for success, error, and info messages. Toasts auto-dismiss after 4 seconds.

Toast colours: `success` = green, `error` = red, `info` = `bg-gray-700` (dark neutral — avoids being invisible in dark mode).

### `ErrorBoundary.tsx`

Class component wrapping the app root. Catches unexpected React render errors and shows a "Something went wrong / Try again" recovery UI instead of a blank screen.

---

## 9. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key (server-side only, never sent to browser) |
| `JINA_API_KEY` | No | Jina AI API key for higher fetch rate limits. Get free at jina.ai. Without this, anonymous Jina requests are used as fallback (lower quota). |
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

**Timeout:** The pipeline runs ~20–60 seconds (depending on job board and AI response times). Vercel Hobby has a 10-second limit — **Vercel Pro ($20/month)** raises this to 60 seconds. Add this to the route:

```typescript
// app/api/process-job/route.ts
export const maxDuration = 60 // requires Vercel Pro
```

**SSE and Vercel:** Server-Sent Events work correctly on Vercel Pro with streaming enabled. The `X-Accel-Buffering: no` header is set to disable proxy buffering and ensure events reach the browser immediately.

### Alternative: Railway / Render

Both support Next.js with longer timeouts on free tiers. Deploy via GitHub integration and set environment variables in their dashboards.

---

## 12. Cost model

### Supabase (free tier)
- 500MB database, 1GB file storage, 50k MAU
- Sufficient for personal use and small teams

### Anthropic API
- ~$0.015–0.020 per job fully processed (4 Claude calls, with prompt caching)
- ~$0.006 per skipped job (2 calls: extract + score)
- ~$1.50–2.00 per 100 applications (vs ~$2.50–3.00 without caching)

### Jina AI Reader (fallback only)
- Used only when direct fetch + JSON-LD both fail (JS-rendered pages without structured data)
- Free anonymous tier: moderate rate limit, sufficient for personal use
- Optional `JINA_API_KEY` (free to obtain at jina.ai) for a higher quota

### Vercel
- Hobby: free, 10s function timeout (pipeline will hit this)
- Pro: $20/month, 60s timeout — required for production use

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

### Phase 8 — Document regeneration

A "Regenerate documents" button that rebuilds the `.docx` CV and cover letter from already-stored tailored data — no AI tokens used. Allows fixing formatting issues retroactively for existing jobs without re-running the full pipeline.

---

## 14. Known limitations

### Job page fetching

The pipeline uses a three-tier fetch strategy. Each tier is attempted in order:

| Tier | Method | Sites covered |
|------|--------|---------------|
| 1a | Direct fetch → JSON-LD | LinkedIn, Indeed, Greenhouse, Lever, Ashby, most career pages |
| 1b | Direct fetch → HTML strip | Simple static career pages |
| 2 | Jina AI Reader | JS-rendered pages without JSON-LD |
| — | ❌ Fail | SSO-gated ATS, pages requiring login |

| Site | Status | Notes |
|------|--------|-------|
| LinkedIn (public jobs) | ✅ Works | JSON-LD extraction; or Jina for login-wall pages |
| LinkedIn (login-required) | ❌ Auth wall | 422 error with LinkedIn-specific guidance |
| Indeed | ✅ Works | JSON-LD extraction |
| Greenhouse | ✅ Works | JSON-LD + direct fetch |
| Lever | ✅ Works | JSON-LD + direct fetch |
| Ashby | ✅ Works | JSON-LD + direct fetch |
| Workday | ✅ Improved | Jina handles JS rendering |
| Company career pages | ✅ Usually works | Varies; SPAs use Jina |
| Private ATS (SSO-gated) | ❌ Auth wall | No free solution; use a direct job URL instead |

Jina rate limits (anonymous tier): if many URLs are processed in a short window, Jina may return 451 or 429. The direct fetch tiers are not subject to any rate limits. Adding `JINA_API_KEY` raises the Jina quota significantly.

### PDF parsing

- `pdf-parse` handles text-based PDFs only
- Scanned image PDFs (photographed CVs) return empty text and are rejected with a clear error
- Fix: export your CV from Word or Google Docs as PDF — always text-based

### Claude output reliability

Claude is prompted to return strict JSON. Occasionally (~1–2% of calls) it may return malformed JSON or include unexpected content. `parseJson()` strips markdown fences. If parsing fails, the route sends an `error` SSE event — retry the URL.

### Vercel free tier timeout

The pipeline runs 4 Claude calls (two in parallel after tailoring). Total time: ~20–60 seconds. Vercel Hobby times out at 10 seconds. Use Vercel Pro or deploy to Railway/Render.

### Rate limits

- App-level: `DAILY_JOB_LIMIT` (default 10) analyses per user per day
- Anthropic API: 50 requests/minute on Tier 1. At 4 calls per job, ~12 jobs/minute before hitting limits — unlikely for personal use
