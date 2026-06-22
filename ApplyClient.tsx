'use client'
import { useState } from 'react'
import Link from 'next/link'
import { JobApplication, STATUS_META, scoreColor } from '@/lib/types'

function CopyBlock({ label, content, mono = false }: { label: string; content: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(content)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <p className="text-xs font-bold uppercase tracking-widest text-slate">{label}</p>
        <button onClick={copy}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-slate hover:bg-indigo-50 hover:text-brand'}`}>
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>
      <pre className={`px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap text-ink max-h-72 overflow-y-auto ${mono ? 'font-mono text-xs' : 'font-sans'}`}>
        {content}
      </pre>
    </div>
  )
}

export default function ApplyClient({ job }: { job: JobApplication }) {
  const [status, setStatus] = useState(job.status)
  const [marking, setMarking] = useState(false)
  const strengths = Array.isArray(job.strengths) ? job.strengths : []
  const gaps = Array.isArray(job.gaps) ? job.gaps : []
  const sm = STATUS_META[status]
  const sc = scoreColor(job.fit_score ?? 0)

  async function markApplied() {
    setMarking(true)
    await fetch('/api/update-status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, status: 'applied' }) })
    setStatus('applied'); setMarking(false)
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8">
      {/* Back */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink mb-6">
        ← Back to dashboard
      </Link>

      {/* Job header */}
      <div className="bg-ink text-white rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white/50 text-sm font-semibold mb-1">{job.company}</p>
            <h1 className="text-2xl font-bold leading-tight">{job.role}</h1>
            <p className="text-white/60 text-sm mt-1">{job.location} · {job.work_type} {job.salary ? `· ${job.salary}` : ''}</p>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="w-14 h-14 rounded-full flex items-center justify-center font-extrabold text-lg"
              style={{ background: sc + '33', color: sc }}>
              {job.fit_score}
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: sm.bg, color: sm.color }}>{sm.label}</span>
          </div>
        </div>

        {/* Strengths / Gaps */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          {strengths.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-green-400 mb-2">Strengths</p>
              <div className="flex flex-wrap gap-1.5">
                {strengths.map(s => <span key={s} className="text-xs px-2 py-0.5 rounded bg-green-900/40 text-green-300 font-medium">{s}</span>)}
              </div>
            </div>
          )}
          {gaps.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">Gaps</p>
              <div className="flex flex-wrap gap-1.5">
                {gaps.map(g => <span key={g} className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-300 font-medium">{g}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex gap-3 mb-6">
        <a href={job.job_url} target="_blank" rel="noreferrer"
          className="flex-1 text-center py-3 bg-brand text-white rounded-xl font-bold text-sm hover:bg-indigo-700">
          Open job posting →
        </a>
        {status !== 'applied' && (
          <button onClick={markApplied} disabled={marking}
            className="px-5 py-3 bg-emerge text-white rounded-xl font-bold text-sm hover:bg-green-600 disabled:opacity-50">
            {marking ? 'Saving…' : '✓ Mark as applied'}
          </button>
        )}
        {status === 'applied' && (
          <div className="px-5 py-3 bg-green-50 text-green-700 rounded-xl font-bold text-sm flex items-center">
            ✓ Applied
          </div>
        )}
      </div>

      {/* Download CV — primary */}
      {job.cv_file_url && (
        <a href={job.cv_file_url} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 mb-4 border-2 border-brand text-brand rounded-xl font-bold text-sm hover:bg-indigo-50">
          ⬇ Download Tailored CV (.docx) — ready to attach
        </a>
      )}

      {/* Copy-paste content */}
      <div className="space-y-4">
        {job.tailored_summary && (
          <CopyBlock label="Tailored professional summary" content={job.tailored_summary} />
        )}
        {job.cover_letter_text && (
          <CopyBlock label="Cover letter" content={job.cover_letter_text} />
        )}
        {job.fit_reason && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-warn mb-2">Why this job fits</p>
            <p className="text-sm text-amber-900 leading-relaxed">{job.fit_reason}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center mt-8">
        Processed {new Date(job.created_at).toLocaleDateString('en-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
    </main>
  )
}
