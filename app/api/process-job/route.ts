import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle,
} from 'docx'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const THRESHOLD   = parseInt(process.env.FIT_SCORE_THRESHOLD ?? '60')
const DAILY_LIMIT = parseInt(process.env.DAILY_JOB_LIMIT ?? '10')

// ── Claude helpers ────────────────────────────────────────────────────────────

type TextBlock = { type: 'text'; text: string }
type CachedBlock = { type: 'text'; text: string; cache_control: { type: 'ephemeral' } }

async function callClaude(prompt: string, maxTokens = 1000): Promise<string> {
  const msg = await ai.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = msg.content[0]
  if (!block || block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}

// Sends a message with content blocks, supporting cache_control on individual blocks.
// The first block with cache_control is written to Anthropic's prompt cache (5-min TTL).
// Subsequent calls with the same cached block as prefix get a cache read hit (~10x cheaper).
async function callClaudeWithBlocks(
  blocks: Array<CachedBlock | TextBlock>,
  maxTokens = 1000,
): Promise<string> {
  const msg = await ai.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    // Cast required: cache_control may not be in older SDK type definitions,
    // but is supported by the API and all recent SDK versions at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: [{ role: 'user', content: blocks as any }],
  })
  const block = msg.content[0]
  if (!block || block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

// CV block shared between scoreJob and tailorCV.
// Using 6000 chars (~1500 tokens) — above Anthropic's 1024-token cache minimum.
// scoreJob writes this block to cache; tailorCV reads it (guaranteed hit within
// the same pipeline run). Back-to-back jobs from the same user also hit cache
// for 5 minutes after the first run.
function cvCacheBlock(cvText: string): CachedBlock {
  return {
    type: 'text',
    text: `CANDIDATE CV:\n${cvText.slice(0, 6000)}`,
    cache_control: { type: 'ephemeral' },
  }
}

// ── Step 1: Fetch job page ────────────────────────────────────────────────────
// Fetches job page text. Tries a direct browser-like fetch first (works for most
// static job boards: Greenhouse, Lever, Ashby, Workable, company career pages).
// Falls back to Jina AI Reader for JS-rendered pages (e.g. LinkedIn).

// Known tracking-only query parameters that are safe to drop before fetching.
// Job identity is always in the URL path on major boards (LinkedIn, Greenhouse,
// Lever, Indeed, Ashby), so stripping these doesn't change which page loads.
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid',
  // LinkedIn-specific
  'trk', 'trkInfo', 'refId', 'trackingId', 'alternateChannel', 'eBP',
  // Indeed
  'from', 'vjs', 'jsa',
  // Generic
  'ref', 'source', 'src', 'campaign', 'medium',
])

function cleanJobUrl(raw: string): string {
  const u = new URL(raw)
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key)) u.searchParams.delete(key)
  }
  // If no meaningful params remain, drop the query string entirely
  if ([...u.searchParams.keys()].length === 0) u.search = ''
  return u.toString()
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extracts a JobPosting from schema.org JSON-LD embedded in raw HTML.
// Most major job boards (LinkedIn, Indeed, Greenhouse, Lever, Ashby) include
// this for SEO — it's structured and clean, better than scraped HTML text.
function extractJsonLd(html: string): string | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      const items: unknown[] = Array.isArray(data['@graph']) ? data['@graph'] : [data]
      for (const item of items) {
        if ((item as Record<string, unknown>)['@type'] !== 'JobPosting') continue
        const j = item as Record<string, unknown>
        const org   = (j.hiringOrganization as Record<string, unknown> | undefined)
        const loc   = (j.jobLocation      as Record<string, unknown> | undefined)
        const addr  = (loc?.address       as Record<string, unknown> | undefined)
        const title       = String(j.title            ?? '')
        const company     = String(org?.name          ?? '')
        const city        = String(addr?.addressLocality ?? '')
        const country     = String(addr?.addressCountry  ?? '')
        const employment  = String(j.employmentType   ?? '')
        const description = stripHtmlTags(String(j.description ?? ''))
        const parts = [
          title       && `Job Title: ${title}`,
          company     && `Company: ${company}`,
          (city || country) && `Location: ${[city, country].filter(Boolean).join(', ')}`,
          employment  && `Employment Type: ${employment}`,
          description && `\nJob Description:\n${description}`,
        ].filter(Boolean)
        const text = parts.join('\n')
        if (text.length >= 200) return text
      }
    } catch { /* malformed JSON — skip */ }
  }
  return null
}

async function fetchDirect(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const html = await res.text()
    // Prefer JSON-LD (structured) over raw HTML text when available
    const jsonLd = extractJsonLd(html)
    if (jsonLd) return jsonLd
    // Fall back to stripping HTML tags
    const text = stripHtmlTags(html)
    return text.length >= 300 ? text : null
  } catch {
    return null
  }
}

async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = { Accept: 'text/plain' }
    if (process.env.JINA_API_KEY) headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`
    const res = await fetch(`https://r.jina.ai/${url}`, { headers, signal: AbortSignal.timeout(25000) })
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return text.length >= 300 ? text : null
  } catch {
    return null
  }
}

async function fetchJobText(url: string): Promise<string> {
  const fetchUrl = cleanJobUrl(url)
  const text = (await fetchDirect(fetchUrl)) ?? (await fetchViaJina(fetchUrl))
  if (!text) {
    throw new Error(
      'Could not retrieve this job page. It may require a login, be JavaScript-rendered, or the URL may be incorrect.'
    )
  }
  return text.slice(0, 8000)
}

// ── Step 2: Extract job details ───────────────────────────────────────────────

async function extractJob(rawText: string) {
  const raw = await callClaude(`
Extract structured information from this job posting.
Return ONLY valid JSON, no markdown fences:
{
  "company": "string",
  "role": "string",
  "location": "string",
  "work_type": "remote|hybrid|onsite|unknown",
  "salary": "string or null",
  "seniority": "junior|mid|senior|lead|unknown",
  "description": "cleaned job description max 1200 words",
  "required_skills": ["skill1"],
  "nice_to_have": ["skill1"]
}

Job text:
${rawText}
`, 1200)
  return parseJson<{
    company: string; role: string; location: string; work_type: string
    salary: string | null; seniority: string; description: string
    required_skills: string[]; nice_to_have: string[]
  }>(raw)
}

// ── Step 3: Score fit ─────────────────────────────────────────────────────────

async function scoreJob(job: Awaited<ReturnType<typeof extractJob>>, cvText: string) {
  const raw = await callClaudeWithBlocks([
    cvCacheBlock(cvText),
    {
      type: 'text',
      text: `
You are a career coach. Score how well this candidate matches the job.
Return ONLY valid JSON, no markdown:
{
  "score": <0-100>,
  "reason": "<2-3 sentences>",
  "strengths": ["string"],
  "gaps": ["string"],
  "recommendation": "apply|skip|stretch"
}

JOB: ${job.company} — ${job.role}
${job.description.slice(0, 1500)}
Required: ${job.required_skills.join(', ')}
`,
    },
  ], 1200)
  return parseJson<{
    score: number; reason: string; strengths: string[]
    gaps: string[]; recommendation: string
  }>(raw)
}

// ── Step 4: Tailor CV content ─────────────────────────────────────────────────

async function tailorCV(
  job: Awaited<ReturnType<typeof extractJob>>,
  fit: Awaited<ReturnType<typeof scoreJob>>,
  cvText: string,
) {
  const raw = await callClaudeWithBlocks([
    cvCacheBlock(cvText),  // cache hit: same block written by scoreJob moments ago
    {
      type: 'text',
      text: `
You are an expert CV writer. Produce a full tailored CV for this candidate targeting this specific role.
Keep it honest — only highlight real experience, naturally reframed. Do not invent anything.

Return ONLY valid JSON, no markdown:
{
  "full_name": "extracted from CV or 'Candidate'",
  "email": "extracted from CV or ''",
  "phone": "extracted from CV or ''",
  "location": "extracted from CV or ''",
  "linkedin": "extracted from CV or ''",
  "professional_summary": "<3-4 sentence tailored summary for this specific role>",
  "skills_to_highlight": ["skill1","skill2","skill3","skill4","skill5","skill6"],
  "experience": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "dates": "Jan 2022 – Present",
      "bullets": [
        "Achievement or responsibility rewritten to highlight relevance to target role",
        "Another bullet — quantified where possible"
      ]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "Degree and Field",
      "dates": "2015 – 2018"
    }
  ],
  "languages": ["English (fluent)", "Dutch (basic)"]
}

TARGET ROLE: ${job.role} at ${job.company}
Location: ${job.location}
Key requirements: ${job.required_skills.join(', ')}
Nice to have: ${job.nice_to_have?.join(', ') ?? 'n/a'}
Candidate strengths to emphasise: ${fit.strengths.join(', ')}
Gaps (acknowledge honestly if relevant): ${fit.gaps.join(', ')}
`,
    },
  ], 2500)

  return parseJson<{
    full_name: string
    email: string
    phone: string
    location: string
    linkedin: string
    professional_summary: string
    skills_to_highlight: string[]
    experience: Array<{ company: string; role: string; dates: string; bullets: string[] }>
    education: Array<{ institution: string; degree: string; dates: string }>
    languages: string[]
  }>(raw)
}

// ── Step 5: Build .docx ───────────────────────────────────────────────────────

async function buildCvDocx(
  tailored: Awaited<ReturnType<typeof tailorCV>>,
  job: Awaited<ReturnType<typeof extractJob>>,
): Promise<Buffer> {
  const BRAND   = '2E3192'
  const DARK    = '111827'
  const MUTED   = '6B7280'
  const DIVIDER = 'E5E7EB'

  const sectionHeading = (text: string) => new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: BRAND, font: 'Calibri' })],
    spacing: { before: 560, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DIVIDER } },
  })

  const bullet = (text: string) => new Paragraph({
    children: [new TextRun({ text, size: 20, color: DARK, font: 'Calibri' })],
    bullet: { level: 0 },
    spacing: { after: 80 },
  })

  const children: Paragraph[] = []

  children.push(new Paragraph({
    children: [new TextRun({ text: tailored.full_name || 'Your Name', bold: true, size: 52, color: DARK, font: 'Calibri' })],
    alignment: AlignmentType.LEFT,
    spacing: { after: 80 },
  }))

  const contactParts = [tailored.email, tailored.phone, tailored.location, tailored.linkedin].filter(Boolean)
  if (contactParts.length) {
    children.push(new Paragraph({
      children: [new TextRun({ text: contactParts.join('  ·  '), size: 18, color: MUTED, font: 'Calibri' })],
      spacing: { after: 60 },
    }))
  }

  children.push(new Paragraph({
    children: [new TextRun({ text: `Applying for: ${job.role} at ${job.company}`, size: 17, color: BRAND, italics: true, font: 'Calibri' })],
    spacing: { after: 80 },
  }))

  children.push(sectionHeading('Professional Summary'))
  children.push(new Paragraph({
    children: [new TextRun({ text: tailored.professional_summary, size: 20, color: DARK, font: 'Calibri' })],
    spacing: { after: 160 },
  }))

  if (tailored.skills_to_highlight?.length) {
    children.push(sectionHeading('Key Skills'))
    for (const skill of tailored.skills_to_highlight) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `▪  ${skill}`, size: 19, font: 'Calibri', color: DARK })],
        spacing: { after: 80 },
      }))
    }
  }

  if (tailored.experience?.length) {
    children.push(sectionHeading('Experience'))
    for (const exp of tailored.experience) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: exp.role, bold: true, size: 22, color: DARK, font: 'Calibri' }),
          new TextRun({ text: `  ·  ${exp.company}`, size: 20, color: MUTED, font: 'Calibri' }),
        ],
        spacing: { before: 200, after: 40 },
      }))
      children.push(new Paragraph({
        children: [new TextRun({ text: exp.dates, size: 17, color: MUTED, italics: true, font: 'Calibri' })],
        spacing: { after: 100 },
      }))
      for (const b of exp.bullets) {
        children.push(bullet(b))
      }
    }
  }

  if (tailored.education?.length) {
    children.push(sectionHeading('Education'))
    for (const edu of tailored.education) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: edu.degree, bold: true, size: 20, color: DARK, font: 'Calibri' }),
          new TextRun({ text: `  ·  ${edu.institution}`, size: 19, color: MUTED, font: 'Calibri' }),
        ],
        spacing: { before: 160, after: 40 },
      }))
      children.push(new Paragraph({
        children: [new TextRun({ text: edu.dates, size: 17, color: MUTED, italics: true, font: 'Calibri' })],
        spacing: { after: 100 },
      }))
    }
  }

  if (tailored.languages?.length) {
    children.push(sectionHeading('Languages'))
    children.push(new Paragraph({
      children: [new TextRun({ text: tailored.languages.join('  ·  '), size: 19, color: DARK, font: 'Calibri' })],
      spacing: { after: 120 },
    }))
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      children,
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

// ── Step 6: Cover letter text ─────────────────────────────────────────────────

async function writeCoverLetter(
  job: Awaited<ReturnType<typeof extractJob>>,
  fit: Awaited<ReturnType<typeof scoreJob>>,
  summary: string,
): Promise<string> {
  return callClaude(`
Write a compelling, authentic cover letter for this application.

Rules:
- Open with ONE specific hook about this company or role (not generic flattery)
- 3 paragraphs: hook + fit evidence / specific value you bring / confident close
- Max 320 words. No clichés like "I am writing to express my interest"
- Confident, human tone. End with a clear call to action.
- Return plain text only — no JSON, no markdown.

JOB: ${job.role} at ${job.company} (${job.location})
Requirements: ${job.required_skills.join(', ')}
Candidate strengths: ${fit.strengths.join(', ')}
Gaps acknowledged: ${fit.gaps.join(', ')}
Summary: ${summary}
`, 800)
}

// ── Step 7: Cover letter .docx ────────────────────────────────────────────────

async function buildCoverLetterDocx(
  text: string,
  tailored: Awaited<ReturnType<typeof tailorCV>>,
  job: Awaited<ReturnType<typeof extractJob>>,
): Promise<Buffer> {
  const BRAND = '2E3192'
  const DARK  = '111827'
  const MUTED = '6B7280'
  const DIVIDER = 'E5E7EB'

  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  // Split on blank lines; collapse any inline newlines within a paragraph
  const paras = text
    .split(/\n{2,}/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)

  const contactParts = [
    tailored.email, tailored.phone, tailored.location, tailored.linkedin,
  ].filter(Boolean)

  const children: Paragraph[] = [
    // Candidate name
    new Paragraph({
      children: [new TextRun({ text: tailored.full_name || 'Your Name', bold: true, size: 52, color: DARK, font: 'Calibri' })],
      spacing: { after: 60 },
    }),
    // Contact line
    ...(contactParts.length ? [new Paragraph({
      children: [new TextRun({ text: contactParts.join('  ·  '), size: 18, color: MUTED, font: 'Calibri' })],
      spacing: { after: 40 },
    })] : []),
    // Divider spacer
    new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DIVIDER } },
      spacing: { after: 280 },
    }),
    // Date
    new Paragraph({
      children: [new TextRun({ text: today, size: 19, color: MUTED, font: 'Calibri', italics: true })],
      spacing: { after: 240 },
    }),
    // Addressee
    new Paragraph({
      children: [new TextRun({ text: 'Hiring Manager', bold: true, size: 20, color: DARK, font: 'Calibri' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: job.company, size: 20, color: DARK, font: 'Calibri' })],
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [new TextRun({ text: job.location ?? '', size: 19, color: MUTED, font: 'Calibri' })],
      spacing: { after: 320 },
    }),
    // Body paragraphs
    ...paras.map(p => new Paragraph({
      children: [new TextRun({ text: p, size: 20, color: DARK, font: 'Calibri' })],
      spacing: { after: 200 },
    })),
    // Closing
    new Paragraph({
      children: [new TextRun({ text: 'Sincerely,', size: 20, color: DARK, font: 'Calibri' })],
      spacing: { before: 280, after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: tailored.full_name || 'Your Name', bold: true, size: 20, color: BRAND, font: 'Calibri' })],
    }),
  ]

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
      children,
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate limiting: check daily usage
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('job_applications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', dayStart.toISOString())
  if (count !== null && count >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Daily limit of ${DAILY_LIMIT} job analyses reached. Try again tomorrow.` },
      { status: 429 }
    )
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('cv_raw_text')
    .eq('id', user.id)
    .single()

  if (!profile?.cv_raw_text) {
    return NextResponse.json({ error: 'No CV found. Please upload your CV first.' }, { status: 400 })
  }

  const body = await req.json()
  const { jobUrl } = body
  if (!jobUrl) return NextResponse.json({ error: 'jobUrl is required' }, { status: 400 })

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(jobUrl)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('invalid protocol')
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL. Please provide a valid http or https link.' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('job_applications')
    .select('*')
    .eq('user_id', user.id)
    .eq('job_url', jobUrl)
    .single()

  if (existing) {
    // Skipped records may be re-processed: the user may have updated their CV
    // or the previous attempt fetched a login-wall page with a low score.
    // Delete the stale record and let the pipeline run fresh.
    if (existing.status === 'skipped') {
      await supabase.from('job_applications').delete().eq('id', existing.id)
    } else {
      return NextResponse.json({
        error: 'This job URL is already in your dashboard.',
        job: existing,
      }, { status: 409 })
    }
  }

  // All pre-flight checks passed — stream pipeline progress via SSE
  const encoder = new TextEncoder()
  const xform   = new TransformStream<Uint8Array, Uint8Array>()
  const writer  = xform.writable.getWriter()

  const emit = (event: object) =>
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

  ;(async () => {
    try {
      emit({ type: 'progress', message: 'Fetching job page…' })
      const rawText = await fetchJobText(jobUrl)

      emit({ type: 'progress', message: 'Extracting job details…' })
      const job = await extractJob(rawText)

      const hasRole    = job.role    && job.role    !== 'unknown'
      const hasCompany = job.company && job.company !== 'unknown'
      const hasSkills  = job.required_skills.length > 0
      const hasDesc    = (job.description ?? '').split(/\s+/).length >= 80

      if ((!(hasRole && hasCompany) && !hasSkills) || !hasDesc) {
        const isLinkedIn = parsedUrl.hostname.includes('linkedin.com')
        emit({
          type: 'error',
          status: 422,
          message: isLinkedIn
            ? 'Could not read this LinkedIn page — it likely requires a sign-in. Try opening the job in an incognito window first to confirm it\'s public, or use the company\'s own careers page instead.'
            : 'Could not extract enough job details from this URL. The page may require a login or may not be a job posting.',
        })
        return
      }

      emit({ type: 'progress', message: 'Scoring your fit…' })
      const fit = await scoreJob(job, profile.cv_raw_text)

      const baseRecord = {
        user_id:         user.id,
        job_url:         jobUrl,
        company:         job.company,
        role:            job.role,
        location:        job.location,
        work_type:       job.work_type,
        salary:          job.salary,
        seniority:       job.seniority,
        job_description: job.description,
        fit_score:       fit.score,
        fit_reason:      fit.reason,
        strengths:       fit.strengths,
        gaps:            fit.gaps,
        recommendation:  fit.recommendation,
      }

      if (fit.score < THRESHOLD) {
        const { data } = await supabase
          .from('job_applications')
          .insert({ ...baseRecord, status: 'skipped' })
          .select('*')
          .single()
        emit({ type: 'skipped', score: fit.score, reason: fit.reason, job: data })
        return
      }

      emit({ type: 'progress', message: 'Tailoring your CV…' })
      const tailored = await tailorCV(job, fit, profile.cv_raw_text)

      emit({ type: 'progress', message: 'Writing cover letter…' })
      const [cvBuffer, coverLetterText] = await Promise.all([
        buildCvDocx(tailored, job),
        writeCoverLetter(job, fit, tailored.professional_summary),
      ])
      const coverLetterBuffer = await buildCoverLetterDocx(coverLetterText, tailored, job)

      emit({ type: 'progress', message: 'Saving documents…' })
      const ts   = Date.now()
      const slug = `${user.id}/${ts}`

      await supabase.storage.from('job-documents').upload(`${slug}-cv.docx`, cvBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      })
      const { data: cvUrlData } = supabase.storage.from('job-documents').getPublicUrl(`${slug}-cv.docx`)

      await supabase.storage.from('job-documents').upload(`${slug}-cover.docx`, coverLetterBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      })
      const { data: coverUrlData } = supabase.storage.from('job-documents').getPublicUrl(`${slug}-cover.docx`)

      const { data: record } = await supabase
        .from('job_applications')
        .insert({
          ...baseRecord,
          tailored_summary:  tailored.professional_summary,
          tailored_bullets:  tailored.experience,
          tailored_skills:   tailored.skills_to_highlight,
          cover_letter_text: coverLetterText,
          cover_letter_url:  coverUrlData?.publicUrl ?? null,
          cv_file_url:       cvUrlData?.publicUrl ?? null,
          status: 'new',
        })
        .select('*')
        .single()

      emit({ type: 'result', score: fit.score, company: job.company, role: job.role, recommendation: fit.recommendation, job: record })

    } catch (err: unknown) {
      console.error('Pipeline error:', err)
      emit({ type: 'error', message: err instanceof Error ? err.message : 'Pipeline failed' })
    } finally {
      writer.close()
    }
  })()

  return new Response(xform.readable, {
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
