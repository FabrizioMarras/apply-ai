'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { LogOut, Sun, Moon } from 'lucide-react'

export default function Navbar({ userEmail }: { userEmail: string }) {
  const router   = useRouter()
  const supabase = createClient()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 h-14 flex items-center px-6 justify-between sticky top-0 z-30">
      <Link href="/" className="flex items-center gap-2.5 group">
        <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0">
          <rect width="32" height="32" rx="6" fill="#4f46e5"/>
          <text x="16" y="23" textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif" fontSize="20" fontWeight="700" fill="white">A</text>
        </svg>
        <span className="font-extrabold text-sm text-ink dark:text-white tracking-tight">
          Apply<span className="text-brand">AI</span>
        </span>
      </Link>

      <div className="flex items-center gap-1">
        <span className="text-xs text-slate dark:text-gray-500 hidden sm:block mr-2">{userEmail}</span>

        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          onClick={signOut}
          aria-label="Sign out"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-ink dark:hover:text-white transition-colors"
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </nav>
  )
}
