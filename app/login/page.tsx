'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

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
      <div className="min-h-screen bg-mist flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-10 w-full max-w-sm shadow-sm border border-gray-100 text-center">
          <div className="w-12 h-12 bg-brand rounded-xl inline-flex items-center justify-center text-2xl mb-4 mx-auto">📬</div>
          <h1 className="text-xl font-extrabold text-ink mb-2">Check your inbox</h1>
          <p className="text-sm text-slate leading-relaxed">
            We sent a confirmation link to <span className="font-semibold text-ink">{email}</span>.<br />
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
    <div className="min-h-screen bg-mist flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-10 w-full max-w-sm shadow-sm border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand rounded-xl inline-flex items-center justify-center text-2xl mb-3">🚀</div>
          <h1 className="text-2xl font-extrabold text-ink">ApplyAI</h1>
          <p className="text-sm text-slate mt-1">AI-powered job applications</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate uppercase tracking-widest mb-1.5">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-brand outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate uppercase tracking-widest mb-1.5">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-brand outline-none" />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-brand text-white rounded-xl font-bold text-sm disabled:opacity-50">
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <p className="text-sm text-slate text-center mt-6">
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
