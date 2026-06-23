'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function Navbar({ userEmail }: { userEmail: string }) {
  const router   = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="bg-ink h-14 flex items-center px-7 justify-between sticky top-0 z-30">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center text-sm">🚀</div>
        <span className="text-white font-extrabold text-sm">ApplyAI</span>
      </Link>
      <div className="flex items-center gap-4">
        <span className="text-white/30 text-xs hidden sm:block">{userEmail}</span>
        <button onClick={signOut} className="text-white/40 text-xs font-semibold hover:text-white/70">
          Sign out
        </button>
      </div>
    </nav>
  )
}
