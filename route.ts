import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType,
} from 'docx'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const THRESHOLD = parseInt(process.env.FIT_SCORE_THRESHOLD ?? '60')

// ── Claude helper ─────────────────────────────────────────────────────────────

async function callClaude(prompt: string, maxTokens = 1000): Promise<string> {
  const msg = await ai.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  return (msg.content[0] as { text: string }).text
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

// ── Step 1: Fetch job page ────────────────────────────────────────────────────

async function fetchJobText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ApplyAI/1.0)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Could not fetch URL (${res.status})`)
  const html = await res.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
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
  const BRAND   = '2E3192'   // deep indigo
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

  // ── Name + contact header ──
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

  // Target role line
  children.push(new Paragraph({
    children: [new TextRun({ text: `Applying for: ${job.role} at ${job.company}`, size: 17, color: BRAND, italics: true, font: 'Calibri' })],
    spacing: { after: 200 },
  }))

  // ── Professional Summary ──
  children.push(sectionHeading('Professional Summary'))
  children.push(new Paragraph({
    children: [new TextRun({ text: tailored.professional_summary, size: 20, color: DARK, font: 'Calibri' })],
    spacing: { after: 120 },
  }))

  // ── Key Skills ──
  if (tailored.skills_to_highlight?.length) {
    children.push(sectionHeading('Key Skills'))
    // 2-column skill grid
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
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: {style:BorderStyle.NONE}, bottom: {style:BorderStyle.NONE}, left: {style:BorderStyle.NONE}, right: {style:BorderStyle.NONE}, insideH: {style:BorderStyle.NONE}, insideV: {style:BorderStyle.NONE} } }))
    children.push(new Paragraph({ children: [], spacing: { after: 120 } }))
  }

  // ── Experience ──
  if (tailored.experience?.length) {
    children.push(sectionHeading('Experience'))
    for (const exp of tailored.experience) {
      // Role + company row
      children.push(new Paragraph({
        children: [
          new TextRun({ text: exp.role, bold: true, size: 22, color: DARK, font: 'Calibri' }),
          new TextRun({ text: `  ·  ${exp.company}`, size: 20, color: MUTED, font: 'Calibri' }),
        ],
        spacing: { before: 160, after: 40 },
      }))
      // Dates
      children.push(new Paragraph({
        children: [new TextRun({ text: exp.dates, size: 17, color: MUTED, italics: true, font: 'Calibri' })],
        spacing: { after: 80 },
      }))
      // Bullets
      for (const b of exp.bullets) {
        children.push(bullet(b))
      }
    }
  }

  // ── Education ──
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

  // ── Languages ──
  if (tailored.languages?.length) {
    children.push(sectionHeading('Languages'))
    children.push(new Paragraph({
      children: [new TextRun({ text: tailored.languages.join('  ·  '), size: 19, color: DARK, font: 'Calibri' })],
      spacing: { after: 80 },
    }))
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 900, right: 900 },
        },
      },
      children,
    }],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

// ── Step 6: Cover letter ──────────────────────────────────────────────────────

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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('cv_raw_text')
    .eq('id', user.id)
    .single()

  if (!profile?.cv_raw_text) {
    return NextResponse.json({ error: 'No CV found. Please upload your CV first.' }, { status: 400 })
  }

  const { jobUrl } = await req.json()
  if (!jobUrl) return NextResponse.json({ error: 'jobUrl is required' }, { status: 400 })

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
    const rawText   = await fetchJobText(jobUrl)
    const job       = await extractJob(rawText)
    const fit       = await scoreJob(job, profile.cv_raw_text)

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

    // Below threshold → skip, no documents generated
    if (fit.score < THRESHOLD) {
      const { data } = await supabase
        .from('job_applications')
        .insert({ ...baseRecord, status: 'skipped' })
        .select('id')
        .single()
      return NextResponse.json({ id: data?.id, skipped: true, score: fit.score, reason: fit.reason })
    }

    // Tailor CV content (structured JSON)
    const tailored = await tailorCV(job, fit, profile.cv_raw_text)

    // Build full .docx CV
    const cvBuffer = await buildCvDocx(tailored, job)

    // Cover letter text
    const coverLetterText = await writeCoverLetter(job, fit, tailored.professional_summary)

    const ts = Date.now()
    const slug = `${user.id}/${ts}`

    // Upload tailored CV .docx
    await supabase.storage
      .from('job-documents')
      .upload(`${slug}-cv.docx`, cvBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: false,
      })
    const { data: cvUrlData } = supabase.storage.from('job-documents').getPublicUrl(`${slug}-cv.docx`)

    // Upload cover letter .txt
    await supabase.storage
      .from('job-documents')
      .upload(`${slug}-cover.txt`, coverLetterText, { contentType: 'text/plain', upsert: false })
    const { data: coverUrlData } = supabase.storage.from('job-documents').getPublicUrl(`${slug}-cover.txt`)

    // Save full record
    const { data: record } = await supabase
      .from('job_applications')
      .insert({
        ...baseRecord,
        tailored_summary:   tailored.professional_summary,
        tailored_bullets:   tailored.experience,      // full experience array
        tailored_skills:    tailored.skills_to_highlight,
        cover_letter_text:  coverLetterText,
        cover_letter_url:   coverUrlData?.publicUrl ?? null,
        cv_file_url:        cvUrlData?.publicUrl ?? null,  // downloadable .docx
        status: 'new',
      })
      .select('id')
      .single()

    return NextResponse.json({
      id:             record?.id,
      skipped:        false,
      score:          fit.score,
      company:        job.company,
      role:           job.role,
      recommendation: fit.recommendation,
    })

  } catch (err: unknown) {
    console.error('Pipeline error:', err)
    const message = err instanceof Error ? err.message : 'Pipeline failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
