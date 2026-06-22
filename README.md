# 🚀 ApplyAI

> AI-powered job application pipeline. Upload your CV once, paste a job URL, get a tailored CV (.docx), cover letter, and fit score — everything tracked in a personal dashboard.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Stack](https://img.shields.io/badge/stack-Next.js%2014%20%7C%20Supabase%20%7C%20Claude%20API-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What it does

```
You paste a job URL
        ↓
Claude extracts the job description
        ↓
Claude scores your fit (0–100) against your uploaded CV
        ↓
Score ≥ threshold?
  NO  → logged as "skipped", no documents generated
  YES ↓
Claude rewrites your full CV for this role
Claude writes a cover letter with a company-specific hook
A formatted .docx CV is built and saved
        ↓
Everything saved to Supabase (DB + Storage)
        ↓
Dashboard: scores, statuses, download CV, copy cover letter, open job → apply
```

---

## Quick start (15 minutes)

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account (free)
- An [Anthropic](https://console.anthropic.com) API key (add ~$5 credit)

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

| Bucket name    | Visibility |
|----------------|------------|
| `cv-uploads`   | Private    |
| `job-documents`| Private    |

4. For **each bucket**, go to Storage → Policies → New policy → paste these two:

```sql
-- Allow users to upload to their own folder
(auth.uid()::text = (storage.foldername(name))[1])

-- Allow users to read their own files
(auth.uid()::text = (storage.foldername(name))[1])
```

5. Copy your **Project URL** and **anon public key** from Settings → API

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
ANTHROPIC_API_KEY=sk-ant-your-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
FIT_SCORE_THRESHOLD=60
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## First use

1. **Sign up** with your email
2. **Upload your CV** (PDF) on the setup page — text is extracted and saved once
3. **Paste any job URL** on the dashboard (LinkedIn, Indeed, company careers page, etc.)
4. Wait ~20–30 seconds for the pipeline to run
5. **Click the job row** → download your tailored CV, copy the cover letter, open the posting

---

## Deploy to Vercel (free, 2 minutes)

```bash
npm install -g vercel
vercel
```

Then in your Vercel dashboard → Settings → Environment Variables → add all four variables from `.env.local`. Change `NEXT_PUBLIC_APP_URL` to your `.vercel.app` URL.

---

## Cost

| What | Cost |
|------|------|
| Supabase | Free (500MB DB, 1GB storage) |
| Vercel | Free |
| Claude API | ~€0.03–0.05 per job processed |
| **100 applications** | **~€3–5 total** |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Auth + DB + Storage | Supabase |
| AI | Anthropic Claude Sonnet 4.6 |
| PDF parsing | pdf-parse (server-side) |
| CV generation | docx (Node.js) |
| Styling | Tailwind CSS |
| Deploy | Vercel |

---

## Multi-user

Already supported from day one. Each user has their own CV, their own job applications, and their own documents. Supabase Row Level Security (RLS) enforces data isolation at the database level — no extra code needed.

---

## Roadmap

See [TECHNICAL.md](./TECHNICAL.md#roadmap) for the full phased plan.

**Next up:**
- Adzuna / LinkedIn job discovery (auto-fetch listings by criteria)
- Interview prep brief per job
- Weekly digest email
- Profile preferences (salary, work type, deal-breakers)
