import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import pdf from 'pdf-parse'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('cv') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let text: string
  try {
    const parsed = await pdf(buffer)
    text = parsed.text.trim()
  } catch {
    return NextResponse.json({ error: 'Could not parse PDF. Ensure it is text-based (not scanned).' }, { status: 400 })
  }

  if (text.length < 100) {
    return NextResponse.json({ error: 'PDF appears to be scanned or empty. Please use a text-based PDF.' }, { status: 400 })
  }

  const ts = Date.now()
  const path = `${user.id}/cv-${ts}.pdf`
  const { error: storageErr } = await supabase.storage.from('cv-uploads').upload(path, buffer, {
    contentType: 'application/pdf', upsert: false,
  })
  if (storageErr) return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })

  const { data: signedData } = await supabase.storage
    .from('cv-uploads')
    .createSignedUrl(path, 60 * 60 * 24 * 365) // 1-year signed URL for private bucket

  const { error: dbErr } = await supabase.from('user_profiles').upsert({
    id: user.id,
    cv_raw_text: text,
    cv_file_url: signedData?.signedUrl ?? null,
    cv_file_name: file.name,
    updated_at: new Date().toISOString(),
  })
  if (dbErr) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  return NextResponse.json({ success: true, charCount: text.length, preview: text.slice(0, 200), fileName: file.name })
}
