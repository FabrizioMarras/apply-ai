import { createClient } from '@/lib/supabase-server'
import Landing from '@/components/Landing'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <Landing isLoggedIn={!!user} />
}
