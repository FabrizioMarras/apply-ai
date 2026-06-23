import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType,
} from 'docx'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const THRESHOLD   = parseInt(process.env.FIT_SCORE_THRESHOLD ?? '60')
const DAILY_LIMIT = parseInt(process.env.DAILY_JOB_LIMIT ?? '10')

// ── Claude helper ─────────────────────────────────────────────────────────────

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

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

// ── Step 1: Fetch job page ────────────────────────────────────────────────────
// Uses Jina AI Reader (r.jina.ai) to extract clean text from any URL,
// including JavaScript-rendered job boards like LinkedIn, Greenhouse, Lever.

async function fetchJobText(url: string): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: 'text/plain' },
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) throw new Error(`Could not fetch job page (${res.status}). Check the URL is publicly accessible.`)
  const text = (await res.text()).trim()
  if (text.length < 200) {
    throw new Error('Job page returned too little content. The URL may require a login or the page may be empty.')
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
  const raw = await callClaude(`
You are a career coach. Score how well this candidate matches the job.
Return ONLY valid JSON, no markdown:
{
  "score": <0-100>,
  "reason": "<2-3 sentences>",
  "strengths": ["string"],
  "gaps": ["string"],
  "recommendation": "apply|skip|stretch"
}

CANDIDATE CV:
${cvText.slice(0, 3000)}

JOB: ${job.company} — ${job.role}
${job.description.slice(0, 1500)}
Required: ${job.required_skills.join(', ')}
`, 600)
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
  const raw = await callClaude(`
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

CANDIDATE CV TEXT:
${cvText.slice(0, 4000)}

TARGET ROLE: ${job.role} at ${job.company}
Location: ${job.location}
Key requirements: ${job.required_skills.join(', ')}
Nice to have: ${job.nice_to_have?.join(', ') ?? 'n/a'}
Candidate strengths to emphasise: ${fit.strengths.join(', ')}
Gaps (acknowledge honestly if relevant): ${fit.gaps.join(', ')}
`, 2500)

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
    spacing: { before: 280, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DIVIDER } },
  })

  const bullet = (text: string) => new Paragraph({
    children: [new TextRun({ text, size: 20, color: DARK, font: 'Calibri' })],
    bullet: { level: 0 },
    spacing: { after: 60 },
  })

  const children: (Paragraph | Table)[] = []

  children.push(new Paragraph({
    children: [new TextRun({ text: tailored.full_name || 'Your Name', bold: true, size: 52, color: DARK, font: 'Calibri' })],
    alignment: AlignmentType.LEFT,
    spacing: { after: 60 },
  }))

  const contactParts = [tailored.email, tailored.phone, tailored.location, tailored.linkedin].filter(Boolean)
  if (contactParts.length) {
    children.push(new Paragraph({
      children: [new TextRun({ text: contactParts.join('  ·  '), size: 18, color: MUTED, font: 'Calibri' })],
      spacing: { after: 40 },
    }))
  }

  children.push(new Paragraph({
    children: [new TextRun({ text: `Applying for: ${job.role} at ${job.company}`, size: 17, color: BRAND, italics: true, font: 'Calibri' })],
    spacing: { after: 200 },
  }))

  children.push(sectionHeading('Professional Summary'))
  children.push(new Paragraph({
    children: [new TextRun({ text: tailored.professional_summary, size: 20, color: DARK, font: 'Calibri' })],
    spacing: { after: 120 },
  }))

  if (tailored.skills_to_highlight?.length) {
    children.push(sectionHeading('Key Skills'))
    const half = Math.ceil(tailored.skills_to_highlight.length / 2)
    const col1 = tailored.skills_to_highlight.slice(0, half)
    const col2 = tailored.skills_to_highlight.slice(half)
    const maxRows = Math.max(col1.length, col2.length)
    const rows = Array.from({ length: maxRows }, (_, i) =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: col1[i] ? `▪  ${col1[i]}` : '', size: 19, font: 'Calibri', color: DARK })] })], width: { size: 50, type: WidthType.PERCENTAGE }, borders: { top: {style:BorderStyle.NONE}, bottom: {style:BorderStyle.NONE}, left: {style:BorderStyle.NONE}, right: {style:BorderStyle.NONE} } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: col2[i] ? `▪  ${col2[i]}` : '', size: 19, font: 'Calibri', color: DARK })] })], width: { size: 50, type: WidthType.PERCENTAGE }, borders: { top: {style:BorderStyle.NONE}, bottom: {style:BorderStyle.NONE}, left: {style:BorderStyle.NONE}, right: {style:BorderStyle.NONE} } }),
        ],
      })
    )
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: {style:BorderStyle.NONE}, bottom: {style:BorderStyle.NONE}, left: {style:BorderStyle.NONE}, right: {style:BorderStyle.NONE} } }))
    children.push(new Paragraph({ children: [], spacing: { after: 120 } }))
  }

  if (tailored.experience?.length) {
    children.push(sectionHeading('Experience'))
    for (const exp of tailored.experience) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: exp.role, bold: true, size: 22, color: DARK, font: 'Calibri' }),
          new TextRun({ text: `  ·  ${exp.company}`, size: 20, color: MUTED, font: 'Calibri' }),
        ],
        spacing: { before: 160, after: 40 },
      }))
      children.push(new Paragraph({
        children: [new TextRun({ text: exp.dates, size: 17, color: MUTED, italics: true, font: 'Calibri' })],
        spacing: { after: 80 },
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
        spacing: { before: 100, after: 40 },
      }))
      children.push(new Paragraph({
        children: [new TextRun({ text: edu.dates, size: 17, color: MUTED, italics: true, font: 'Calibri' })],
        spacing: { after: 80 },
      }))
    }
  }

  if (tailored.languages?.length) {
    children.push(sectionHeading('Languages'))
    children.push(new Paragraph({
      children: [new TextRun({ text: tailored.languages.join('  ·  '), size: 19, color: DARK, font: 'Calibri' })],
      spacing: { after: 80 },
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
    .select('id')
    .eq('user_id', user.id)
    .eq('job_url', jobUrl)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'You have already processed this job URL.' }, { status: 409 })
  }

  try {
    const rawText = await fetchJobText(jobUrl)
    const job     = await extractJob(rawText)

    // Guard: if extraction couldn't find a role or company, the page was
    // likely a login wall, a redirect, or not a job posting at all.
    if (
      (!job.role    || job.role    === 'unknown') &&
      (!job.company || job.company === 'unknown') &&
      job.required_skills.length === 0
    ) {
      return NextResponse.json({
        error: 'Could not extract job details from this URL. The page may require login, or it may not be a job posting. Try a direct link to the job listing.',
      }, { status: 422 })
    }

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
      return NextResponse.json({ skipped: true, score: fit.score, reason: fit.reason, job: data })
    }

    const tailored = await tailorCV(job, fit, profile.cv_raw_text)

    // Build CV docx and write cover letter text in parallel
    const [cvBuffer, coverLetterText] = await Promise.all([
      buildCvDocx(tailored, job),
      writeCoverLetter(job, fit, tailored.professional_summary),
    ])

    // Build formatted cover letter docx from the generated text
    const coverLetterBuffer = await buildCoverLetterDocx(coverLetterText, tailored, job)

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

    return NextResponse.json({
      skipped:        false,
      score:          fit.score,
      company:        job.company,
      role:           job.role,
      recommendation: fit.recommendation,
      job:            record,
    })

  } catch (err: unknown) {
    console.error('Pipeline error:', err)
    const message = err instanceof Error ? err.message : 'Pipeline failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
