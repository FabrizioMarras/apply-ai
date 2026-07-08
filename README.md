# ApplyAI

> AI-powered job application pipeline. Upload your CV once, paste a job URL, get a tailored CV (.docx), a formatted cover letter (.docx), and a fit score — everything tracked in a personal dashboard.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Stack](https://img.shields.io/badge/stack-Next.js%20%7C%20Supabase%20%7C%20Claude%20API-blue)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](./LICENSE)

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
Dashboard: fit scores, sortable table, status tracking, download CV + cover letter (.docx), copy cover letter text, regenerate documents from stored data without re-running AI
```

---

## Quick start

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) account (free)
- An [Anthropic](https://console.anthropic.com) API key (~$5 credit)

### 1. Clone & install

```bash
git clone https://github.com/FabrizioMarras/apply-ai.git
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
JINA_API_KEY=                     # optional — raises the rate limit for the JS-rendered-page fallback fetch
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

1. **Sign up** with your email (self-service signup is on by default for a fresh deploy — you can disable it later in Supabase → Authentication → Providers → Email if you want to lock the app down to invite-only, see [TECHNICAL.md §6](./TECHNICAL.md#6-authentication--security))
2. **Upload your CV** (PDF) directly from the dashboard — text is extracted and saved once
3. **Paste any job URL** in the "Process a new job" bar (LinkedIn, Indeed, Greenhouse, company careers pages, etc.)
4. Watch the live progress — each pipeline step updates in real time (~20–60 seconds total)
5. **Click the job row** → download your tailored CV (.docx), download cover letter (.docx), copy cover letter text, open the posting

---

## Deploy

The pipeline takes 20–60 seconds per job, which exceeds Vercel's free-tier serverless timeout — **Render or Railway are recommended** since they run the app as a persistent server with no per-request time limit.

**Render** (free): New Web Service → connect this GitHub repo → Build command `npm install && npm run build`, Start command `npm start` → add all variables from `.env.local` under the Environment tab. Free tier sleeps after 15 min idle (adds ~1 min to the first request after that).

**Railway**: New Project → Deploy from GitHub repo → same build/start commands, auto-detected. One-time $5 trial credit for 30 days, then $5/month to keep it running continuously.

**Vercel** (alternative — needs a paid plan for this app): free Hobby tier's 10-second function timeout will cause jobs to fail. Upgrade to **Vercel Pro** ($20/mo) and add `export const maxDuration = 60` to `app/api/process-job/route.ts`, then:
```bash
npm install -g vercel
vercel
```
Add all variables from `.env.local` in Vercel dashboard → Settings → Environment Variables.

Whichever platform you use: after the first deploy, set `NEXT_PUBLIC_APP_URL` to the assigned domain and redeploy, then add that domain to Supabase → Authentication → URL Configuration (Site URL + Redirect URLs) so auth emails work.

---

## Cost

| What | Cost |
|------|------|
| Supabase | Free (500MB DB, 1GB storage) |
| Hosting | Free on Render (or Railway's 30-day trial); Vercel needs the $20/mo Pro plan for this app |
| Jina AI Reader | Free — used only as fallback for JS-rendered pages |
| Claude API | ~$0.015–0.020 per job processed (prompt caching saves ~30%) — swap in a different provider or a local model any time, see below |
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
| Deploy | Render / Railway (Vercel needs a paid plan) |

---

## Using a different AI provider

The project uses **Anthropic Claude Sonnet 4.6** via the `@anthropic-ai/sdk` package. All AI calls live in a single file — [`app/api/process-job/route.ts`](./app/api/process-job/route.ts) — so switching provider is a contained change.

### Switching to OpenAI (GPT-4o, etc.)

1. Replace the SDK:
   ```bash
   npm remove @anthropic-ai/sdk
   npm install openai
   ```
2. In `route.ts`, replace the client initialisation (top of file):
   ```ts
   // Before
   import Anthropic from '@anthropic-ai/sdk';
   const ai = new Anthropic();

   // After
   import OpenAI from 'openai';
   const ai = new OpenAI(); // reads OPENAI_API_KEY from env
   ```
3. Rewrite `callClaude()` and `callClaudeWithBlocks()` to use `ai.chat.completions.create()`. Remove the `cache_control` blocks inside `callClaudeWithBlocks` — they are Anthropic-specific and have no OpenAI equivalent.
4. Update `.env.local`: replace `ANTHROPIC_API_KEY` with `OPENAI_API_KEY`.

### Switching to a local model (Ollama, LM Studio, llama.cpp)

Local model servers expose an **OpenAI-compatible API**, so the same steps above apply — plus one extra: point the client at your local endpoint instead of the cloud.

```ts
import OpenAI from 'openai';
const ai = new OpenAI({
  baseURL: 'http://localhost:11434/v1', // Ollama default; adjust for LM Studio or llama.cpp
  apiKey: 'ollama',                     // any non-empty string works for local servers
});
```

Then update the model name in `callClaude()` and `callClaudeWithBlocks()` to match whatever model you have pulled locally (e.g. `llama3.1:70b`, `mistral:7b`).

> **Note on quality:** The four pipeline tasks (job extraction, fit scoring, CV rewriting, cover letter) rely on reliable structured JSON output. Models with 30B+ parameters generally handle this well; smaller models may produce malformed JSON. If you see parse errors, try a larger model or add stricter output instructions to the prompts.

> **Note on prompt caching:** The `callClaudeWithBlocks()` function uses Anthropic's prompt caching to reduce cost when the same CV is reused across the scoring and tailoring steps. This feature does not exist in OpenAI or local model APIs — simply remove the `cache_control` fields and use `callClaude()` for all four steps instead.

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

---

## License

[MIT](./LICENSE) — free to fork, modify, and self-host.
