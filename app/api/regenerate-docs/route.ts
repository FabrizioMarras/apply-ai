import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { buildCvDocx, buildCoverLetterDocx, TailoredCV, JobSummary } from '@/lib/docx-builders'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: record, error } = await supabase
    .from('job_applications')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!record.tailored_summary || !record.tailored_bullets?.length) {
    return NextResponse.json(
      { error: 'No tailored data for this job. Re-process the job URL to generate documents.' },
      { status: 400 },
    )
  }

  // Fetch profile as fallback for jobs processed before tailored_contact was stored
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, location')
    .eq('id', user.id)
    .single()

  const contact = record.tailored_contact ?? {}
  const tailored: TailoredCV = {
    full_name:  contact.full_name  ?? profile?.full_name ?? '',
    email:      contact.email      ?? user.email         ?? '',
    phone:      contact.phone      ?? '',
    location:   contact.location   ?? profile?.location  ?? '',
    linkedin:   contact.linkedin   ?? '',
    professional_summary:  record.tailored_summary ?? '',
    skills_to_highlight:   record.tailored_skills  ?? [],
    experience:            record.tailored_bullets ?? [],
    education:             record.tailored_education ?? [],
    languages:             record.tailored_languages ?? [],
  }

  const job: JobSummary = {
    company:  record.company  ?? '',
    role:     record.role     ?? '',
    location: record.location ?? null,
  }

  const [cvBuffer, coverLetterBuffer] = await Promise.all([
    buildCvDocx(tailored, job),
    record.cover_letter_text
      ? buildCoverLetterDocx(record.cover_letter_text, tailored, job)
      : Promise.resolve(null),
  ])

  const ts   = Date.now()
  const slug = `${user.id}/${ts}`

  await supabase.storage.from('job-documents').upload(`${slug}-cv.docx`, cvBuffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  })
  const { data: cvUrlData } = supabase.storage.from('job-documents').getPublicUrl(`${slug}-cv.docx`)

  const updates: Record<string, string | null> = {
    cv_file_url: cvUrlData?.publicUrl ?? null,
  }

  if (coverLetterBuffer) {
    await supabase.storage.from('job-documents').upload(`${slug}-cover.docx`, coverLetterBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: false,
    })
    const { data: coverUrlData } = supabase.storage.from('job-documents').getPublicUrl(`${slug}-cover.docx`)
    updates.cover_letter_url = coverUrlData?.publicUrl ?? null
  }

  await supabase.from('job_applications').update(updates).eq('id', id)

  return NextResponse.json(updates)
}
