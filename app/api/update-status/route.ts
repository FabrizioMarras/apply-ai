import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { JobStatus } from '@/lib/types'

const VALID_STATUSES: JobStatus[] = ['new', 'applied', 'interviewing', 'offer', 'rejected', 'skipped']

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, notes, archived_at } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (status) {
    update.status = status
    if (status === 'applied') update.applied_at = new Date().toISOString()
  }
  if (notes !== undefined) update.notes = notes
  if (archived_at !== undefined) update.archived_at = archived_at

  const { error } = await supabase
    .from('job_applications')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
