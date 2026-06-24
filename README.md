# ApplyAI

> AI-powered job application pipeline. Upload your CV once, paste a job URL, get a tailored CV (.docx), a formatted cover letter (.docx), and a fit score — everything tracked in a personal dashboard.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Stack](https://img.shields.io/badge/stack-Next.js%20%7C%20Supabase%20%7C%20Claude%20API-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

> **New to coding?** Follow the [plain-English setup guide](./SETUP.md) — no experience needed.

---

## What it does

```
You paste a job URL
        ↓
Three-tier fetch (no rate limits on tiers 1–2):
  1. Direct fetch → JSON-LD structured data (LinkedIn, Greenhouse, Lever, Ashby, Indeed…)
  2. Direct fetch → HTML text strip (static career pages)
  3. Jina AI Reader fallback (JS-rendered pages)
        ↓
Real-time progress shown in the UI as each step completes
        ↓
Claude extracts job details (role, company, skills, seniority, salary…)
        ↓
Claude scores your fit (0–100) against your uploaded CV  [prompt cache write]
        ↓
Score ≥ threshold?
  NO  → logged as "skipped", no documents generated, no further AI calls
  YES ↓
Claude rewrites your full CV for this specific role       [prompt cache read — ~10× cheaper]
Claude writes a tailored cover letter (company-specific hook, 3 paragraphs, ≤320 words)
A formatted .docx CV is built and saved
A formatted .docx cover letter is built and saved
        ↓
Everything saved to Supabase (DB + Storage)
        ↓
Dashboard: fit scores, status tracking, download CV + cover letter (.docx), copy cover letter text
```

---

## Quick start

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account (free)
- An [Anthropic](https://console.anthropic.com) API key (~$5 credit)

### 1. Clone & install

```bash
git clone https://github.com/your-username/apply-ai.git
cd apply-ai
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste the contents of `supabase/schema.sql` → **Run**
3. Go to **Storage** → create two buckets:

| Bucket name     | Visibility  | Purpose |
|-----------------|-------------|---------|
| `cv-uploads`    | **Private** | Original uploaded PDFs |
| `job-documents` | **Public**  | Generated .docx files (CV + cover letter) |

4. For **each bucket**, go to Storage → Policies → New policy → add these two:

```sql
-- Allow users to upload to their own folder
(auth.uid()::text = (storage.foldername(name))[1])

-- Allow users to read their own files
(auth.uid()::text = (storage.foldername(name))[1])
```

5. Copy your **Project URL** and **anon public key** from Settings → API

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
FIT_SCORE_THRESHOLD=60
DAILY_JOB_LIMIT=10
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## First use

1. **Sign up** with your email
2. **Upload your CV** (PDF) directly from the dashboard — text is extracted and saved once
3. **Paste any job URL** in the "Process a new job" bar (LinkedIn, Indeed, Greenhouse, company careers pages, etc.)
4. Watch the live progress — each pipeline step updates in real time (~20–60 seconds total)
5. **Click the job row** → download your tailored CV (.docx), download cover letter (.docx), copy cover letter text, open the posting

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

In your Vercel dashboard → Settings → Environment Variables → add all variables from `.env.local`. The pipeline takes 20–35 seconds — upgrade to **Vercel Pro** for the 60-second function timeout, or deploy to Railway/Render (longer free-tier timeouts).

---

## Cost

| What | Cost |
|------|------|
| Supabase | Free (500MB DB, 1GB storage) |
| Vercel | Free (upgrade to Pro ~$20/mo for timeout) |
| Jina AI Reader | Free — used only as fallback for JS-rendered pages |
| Claude API | ~$0.015–0.020 per job processed (prompt caching saves ~30%) |
| **100 applications** | **~$1.50–2.00 total** |

Skipped jobs (below fit threshold) cost ~$0.006 — only extract and score steps run.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js App Router (TypeScript) |
| Auth + DB + Storage | Supabase |
| AI | Anthropic Claude Sonnet 4.6 (with prompt caching) |
| Job page fetching | Direct fetch + JSON-LD → HTML strip → Jina AI fallback |
| PDF parsing | pdf-parse (server-side) |
| Document generation | docx (Node.js) — CV + cover letter |
| Icons | lucide-react |
| Styling | Tailwind CSS (dark mode via `class` strategy) |
| Progress streaming | Server-Sent Events (SSE) |
| Deploy | Vercel / Railway / Render |

---

## Keeping Supabase active (free tier)

Supabase free-tier projects **pause after 7 days of inactivity**, which causes database errors for anyone who doesn't use the app regularly.

> **Not needed if you run Supabase locally** (`npx supabase start`). Local instances never pause.

### Automatic fix — GitHub Actions keep-alive

The repo includes `.github/workflows/keepalive.yml`, which pings your Supabase database every 3 days. To activate it:

1. Push the repo to GitHub (if you haven't already)
2. Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**
3. Add two secrets:

| Secret name | Value |
|-------------|-------|
| `SUPABASE_URL` | Your Supabase Project URL (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_ANON_KEY` | Your Supabase anon public key |

That's it. The workflow runs automatically every 3 days and keeps the project alive indefinitely. You can also trigger it manually from the **Actions** tab at any time.

---

## Multi-user

Already supported. Each user has their own CV, job applications, and documents. Supabase Row Level Security (RLS) enforces data isolation at the database level — no extra code required.

---

## Roadmap

See [TECHNICAL.md](./TECHNICAL.md#13-roadmap) for the full phased plan.

**Next up:**
- Adzuna / LinkedIn job discovery (auto-fetch listings by criteria)
- Interview prep brief per job
- Weekly digest email
- Profile preferences UI (salary, work type, deal-breakers)
