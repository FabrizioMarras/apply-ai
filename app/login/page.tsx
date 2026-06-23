'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Mail } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const supabase = createClient()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false) }
      else router.push('/')
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false) }
      else if (!data.session) { setConfirming(true); setLoading(false) }
      else router.push('/')
    }
  }

  if (confirming) {
    return (
      <div className="min-h-screen bg-mist dark:bg-gray-950 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-10 w-full max-w-sm shadow-sm border border-gray-100 dark:border-gray-800 text-center">
          <div className="w-12 h-12 bg-brand/10 rounded-xl inline-flex items-center justify-center mb-4 mx-auto">
            <Mail size={24} className="text-brand" />
          </div>
          <h1 className="text-xl font-extrabold text-ink dark:text-gray-50 mb-2">Check your inbox</h1>
          <p className="text-sm text-slate dark:text-gray-400 leading-relaxed">
            We sent a confirmation link to <span className="font-semibold text-ink dark:text-gray-200">{email}</span>.<br />
            Click the link to activate your account, then come back to log in.
          </p>
          <button onClick={() => { setConfirming(false); setMode('login') }}
            className="mt-6 text-sm font-bold text-brand hover:underline">
            Back to log in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-mist dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-10 w-full max-w-sm shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <svg viewBox="0 0 32 32" className="w-10 h-10">
              <rect width="32" height="32" rx="6" fill="#4f46e5"/>
              <text x="16" y="23" textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif" fontSize="20" fontWeight="700" fill="white">A</text>
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-ink dark:text-gray-50">
            Apply<span className="text-brand">AI</span>
          </h1>
          <p className="text-sm text-slate dark:text-gray-400 mt-1">AI-powered job applications</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate dark:text-gray-400 uppercase tracking-widest mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-ink dark:text-gray-100 focus:border-brand outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate dark:text-gray-400 uppercase tracking-widest mb-1.5">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-ink dark:text-gray-100 focus:border-brand outline-none" />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-brand text-white rounded-xl font-bold text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors">
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <p className="text-sm text-slate dark:text-gray-400 text-center mt-6">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => setMode(m => m === 'login' ? 'signup' : 'login')}
            className="font-bold text-brand hover:underline">
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}
