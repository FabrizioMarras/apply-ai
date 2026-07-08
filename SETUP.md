# ApplyAI — Setup Guide for Non-Developers

> You don't need to know how to code to run this app. This guide walks you through every step, one at a time.

---

## What you'll need

Before you start, make sure you have:

- A computer running **Windows, Mac, or Linux**
- An internet connection
- About **20–30 minutes** to complete the setup

You'll create free accounts on two services during setup:
- **Supabase** — stores your data (jobs, CV, documents). Free.
- **Anthropic** — the AI that powers the analysis. Costs a few dollars depending on use.

---

## Step 1 — Install Node.js

Node.js is the software that runs the app on your computer. You only do this once.

1. Go to [nodejs.org](https://nodejs.org)
2. Click the button that says **"LTS"** (it's the recommended version)
3. Download and run the installer
4. Click through the installer with all default settings

**To check it worked:** open a Terminal (Mac/Linux) or Command Prompt (Windows) and type:

```
node --version
```

You should see something like `v20.x.x`. If you do, you're good.

> **How to open Terminal on Mac:** Press `Cmd + Space`, type "Terminal", press Enter.
> **How to open Command Prompt on Windows:** Press `Win + R`, type `cmd`, press Enter.

---

## Step 2 — Download the app

1. Go to the ApplyAI GitHub page
2. Click the green **"Code"** button near the top right
3. Click **"Download ZIP"**
4. Once downloaded, **unzip the file** (double-click it on Mac; right-click → "Extract All" on Windows)
5. You'll have a folder called something like `apply-ai-main` — move it somewhere easy to find, like your Desktop

---

## Step 3 — Open the app folder in Terminal

You need to navigate to the folder you just downloaded using the Terminal.

**On Mac:**
1. Open Terminal
2. Type `cd ` (with a space after it — don't press Enter yet)
3. Drag the `apply-ai-main` folder from Finder into the Terminal window — it will paste the path
4. Press Enter

**On Windows:**
1. Open the `apply-ai-main` folder in File Explorer
2. Click the address bar at the top (where it shows the folder path)
3. Type `cmd` and press Enter — a Command Prompt opens already in that folder

**Check it worked:** type `ls` (Mac/Linux) or `dir` (Windows) and press Enter. You should see a list of files including `package.json`.

---

## Step 4 — Set up Supabase (your database)

Supabase is where all your data gets stored — your CV, your job applications, your documents. It's free.

### 4a. Create a Supabase account

1. Go to [supabase.com](https://supabase.com) and click **"Start your project"**
2. Sign up with GitHub or email
3. Once logged in, click **"New project"**
4. Fill in:
   - **Name:** anything (e.g. `applyai`)
   - **Database Password:** choose a strong password — save it somewhere, you'll need it later
   - **Region:** pick the one closest to you
5. Click **"Create new project"** — wait about 1 minute for it to set up

### 4b. Create the database tables

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Go back to the `apply-ai-main` folder on your computer and open the file `supabase/schema.sql` in any text editor (Notepad on Windows, TextEdit on Mac)
4. Select all the text (`Ctrl+A` or `Cmd+A`) and copy it
5. Paste it into the Supabase SQL Editor
6. Click the green **"Run"** button
7. You should see "Success" — your tables are created

### 4c. Create the two Storage buckets

Supabase Storage is like a file folder in the cloud where your CV and generated documents are saved.

1. In the left sidebar, click **"Storage"**
2. Click **"New bucket"**
3. Create the first bucket:
   - **Name:** `cv-uploads`
   - Leave **"Public bucket"** turned **OFF**
   - Click "Save"
4. Create the second bucket:
   - Click **"New bucket"** again
   - **Name:** `job-documents`
   - Turn **"Public bucket"** **ON**
   - Click "Save"

### 4d. Add storage access rules

You need to tell Supabase who can upload and read files. Do this for **both buckets**.

For `cv-uploads`:

1. Click on the `cv-uploads` bucket
2. Click **"Policies"** (or find the Policies section)
3. Click **"New policy"** → choose **"For full customization"**
4. Set the policy name to `Users can upload their own CV`
5. Choose **INSERT** as the allowed operation
6. In the **"Policy definition"** box, paste:
   ```
   (auth.uid()::text = (storage.foldername(name))[1])
   ```
7. Click Save
8. Repeat to create a second policy for **SELECT** (reading), with the same definition

Repeat steps 1–8 for the `job-documents` bucket.

### 4e. Copy your Supabase credentials

1. In Supabase, click the **gear icon** (Settings) at the bottom of the left sidebar
2. Click **"API"**
3. You'll see:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

Keep this page open — you'll paste these in the next step.

---

## Step 5 — Get an Anthropic API key

Anthropic's Claude AI is what analyses jobs and tailors your CV.

1. Go to [console.anthropic.com](https://console.anthropic.com) and create an account
2. Add a small amount of credit (recommended: **$5–10** — this covers hundreds of applications)
3. Go to **"API Keys"** in the top menu
4. Click **"Create Key"**, give it a name (e.g. `applyai`), and click Create
5. **Copy the key immediately** — it starts with `sk-ant-...` and won't be shown again

> Keep your API key private. Don't share it or post it online.

---

## Step 6 — Create your environment file

This file tells the app your credentials. It stays on your computer and is never uploaded anywhere.

1. In the `apply-ai-main` folder, find the file called `.env.example`

   > If you can't see it on Mac, press `Cmd + Shift + .` in Finder to show hidden files.

2. Make a copy of it and name the copy **`.env.local`** (with the dot at the start, no other extension)

3. Open `.env.local` in a text editor and fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=paste-your-supabase-project-url-here
NEXT_PUBLIC_SUPABASE_ANON_KEY=paste-your-supabase-anon-key-here
ANTHROPIC_API_KEY=paste-your-anthropic-key-here
JINA_API_KEY=
FIT_SCORE_THRESHOLD=60
DAILY_JOB_LIMIT=10
```

Replace the placeholder text (e.g. `paste-your-supabase-project-url-here`) with the actual values from Steps 4e and 5. Keep the formatting exactly as shown — no spaces around the `=` sign. You can leave `JINA_API_KEY` blank — it's optional and only raises a rate limit on one fallback feature.

4. Save the file

---

## Step 7 — Install the app's dependencies

In your Terminal (still in the `apply-ai-main` folder), type:

```
npm install
```

Press Enter and wait. This downloads all the code the app needs. It may take 1–2 minutes. You'll see a lot of text scrolling by — that's normal.

---

## Step 8 — Start the app

In the same Terminal window, type:

```
npm run dev
```

Press Enter. After a few seconds you'll see something like:

```
▲ Next.js 16.x.x
- Local: http://localhost:3000
```

**Open your web browser and go to:** [http://localhost:3000](http://localhost:3000)

You should see the ApplyAI homepage. Click **Log in** in the top right to sign up or log in.

---

## Step 9 — Create your account and start using the app

1. Click **"Sign up"** and create an account with your email address
2. Once logged in, you'll see the dashboard
3. Click **"Upload CV"** and upload your CV as a PDF
   - Make sure it's a proper PDF (exported from Word or Google Docs) — scanned image PDFs won't work
4. Once uploaded, paste any job URL in the input bar at the top and press **"Analyse"**
5. Wait 20–30 seconds — the app will show your fit score, tailored CV (.docx), and cover letter (.docx)

---

## Preventing Supabase from pausing

Supabase's free plan **automatically pauses your database after 7 days without activity**. If this happens, the app will show errors until you log in to Supabase and click "Restore project".

To prevent this automatically, the app includes a keep-alive workflow for GitHub Actions — a free service that runs a tiny check every 3 days to keep your database active.

> **Skip this if you're running Supabase locally** (using `npx supabase start`). Local databases never pause.

### How to activate it

1. Make sure your project is on GitHub (if you downloaded the ZIP, you'll need to upload it)
2. On your GitHub repository page, go to **Settings → Secrets and variables → Actions**
3. Click **"New repository secret"** and add these two secrets:

   | Name | Value |
   |------|-------|
   | `SUPABASE_URL` | Your Supabase Project URL (from Step 4e — looks like `https://abc123.supabase.co`) |
   | `SUPABASE_ANON_KEY` | Your Supabase anon public key (from Step 4e — the long `eyJ...` string) |

4. Done — GitHub will automatically ping your database every 3 days

You can also go to the **Actions** tab on your repository and run it manually at any time to test it.

---

## How to start the app again next time

Every time you want to use the app, you need to:

1. Open Terminal
2. Navigate to the `apply-ai-main` folder (Step 3)
3. Type `npm run dev` and press Enter
4. Go to [http://localhost:3000](http://localhost:3000)

Your data is always saved in Supabase, so nothing is lost between sessions.

---

## Costs

| What | Cost |
|------|------|
| Supabase | Free |
| Anthropic (Claude AI) | ~€0.02–0.03 per job analysed |
| Running on your computer | Free |

$5 of Anthropic credit covers roughly 200–300 full job analyses.

---

## Something went wrong?

**The app won't start:**
- Make sure you're in the right folder in Terminal (you should see `package.json` when you type `ls`)
- Make sure Node.js is installed: type `node --version` — it should show a version number
- Make sure `.env.local` exists and has the correct values (no extra spaces, correct URLs)

**"Unauthorized" error when processing a job:**
- Your Supabase credentials in `.env.local` may be wrong — double-check the URL and anon key

**Job processing fails with an error:**
- Check your Anthropic API key is correct and your account has credit
- Some job URLs require a login (e.g. private company portals) — try a public job board URL instead

**Can't see `.env.example` on Mac:**
- Press `Cmd + Shift + .` in Finder to show hidden files

**Still stuck?** Open a GitHub issue on the ApplyAI repository and describe what you see.

---

## Deploying online (optional)

If you want the app to be accessible from any device — not just your computer — you can deploy it to a hosting service for free. This lets you use it from your phone or anywhere without keeping your computer on.

[Render](https://render.com) is the easiest free option (Vercel's free tier isn't quite big enough for this particular app). See the **Deploy** section in the [README](./README.md) for instructions. You'll need a free Render account and to connect your GitHub repository.
