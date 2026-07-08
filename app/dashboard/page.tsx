import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import Navbar from '@/components/Navbar'
import DashboardClient from '@/components/DashboardClient'
import type { JobApplication } from '@/lib/types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: jobs }] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase.from('job_applications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  return (
    <>
      <Navbar userEmail={user.email ?? ''} />
      <DashboardClient
        initialJobs={(jobs ?? []) as JobApplication[]}
        initialHasCv={!!profile?.cv_raw_text}
        initialCvFileName={profile?.cv_file_name ?? null}
        initialCvUpdatedAt={profile?.cv_raw_text ? profile?.updated_at ?? null : null}
      />
    </>
  )
}
