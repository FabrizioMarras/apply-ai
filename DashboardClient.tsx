'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { JobApplication, JobStats, JobStatus, STATUS_META, scoreColor } from '@/lib/types'

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100" style={{ borderLeft: `4px solid ${accent}` }}>
      <p className="text-xs font-bold uppercase tracking-widest text-slate mb-1">{label}</p>
      <p className="text-3xl font-extrabold text-ink leading-none">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate mt-1">{sub}</p>}
    </div>
  )
}

// ── Score Badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">—</div>
  const c = scoreColor(score)
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
      style={{ background: c + '22', color: c }}>{score}</div>
  )
}

// ── Status Pill ───────────────────────────────────────────────────────────────
function StatusPill({ status, onChange }: { status: JobStatus; onChange: (s: JobStatus) => void }) {
  const [open, setOpen] = useState(false)
  const m = STATUS_META[status]
  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="rounded-full px-3 py-1 text-xs font-bold cursor-pointer border-0"
        style={{ background: m.bg, color: m.color }}>
        {m.label} ▾
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-1.5 min-w-40"
          onClick={e => e.stopPropagation()}>
          {(Object.keys(STATUS_META) as JobStatus[]).map(k => (
            <button key={k} onClick={() => { onChange(k); setOpen(false) }}
              className="block w-full text-left px-3 py-2 rounded-lg text-xs font-bold hover:opacity-80"
              style={{ background: status === k ? STATUS_META[k].bg : 'transparent', color: STATUS_META[k].color }}>
              {STATUS_META[k].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ job, onClose, onStatusChange }: {
  job: JobApplication; onClose: () => void; onStatusChange: (id: string, s: JobStatus) => void
}) {
  const [copied, setCopied] = useState<'cv' | 'letter' | null>(null)
  const [notes, setNotes]   = useState(job.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function saveNotes() {
    setSaving(true)
    await fetch('/api/update-status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, notes }) })
    setSaving(false)
  }

  function copy(text: string, which: 'cv' | 'letter') {
    navigator.clipboard.writeText(text)
    setCopied(which); setTimeout(() => setCopied(null), 2000)
  }

  const strengths = Array.isArray(job.strengths) ? job.strengths : []
  const gaps      = Array.isArray(job.gaps)      ? job.gaps      : []

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start sticky top-0 bg-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate mb-1">{job.company}</p>
            <h2 className="text-xl font-bold text-ink">{job.role}</h2>
            <p className="text-sm text-slate mt-0.5">{job.location} · {job.work_type}</p>
          </div>
          <button onClick={onClose} className="text-slate hover:text-ink text-2xl leading-none font-light">×</button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5 flex-1">
          {/* Score + status row */}
          <div className="flex items-center gap-4">
            <ScoreBadge score={job.fit_score} />
            <div>
              <p className="text-sm font-semibold text-ink">Fit Score</p>
              <p className="text-xs text-slate">{job.salary ?? 'Salary not listed'}</p>
            </div>
            <div className="ml-auto">
              <StatusPill status={job.status} onChange={s => onStatusChange(job.id, s)} />
            </div>
          </div>

          {/* Fit reason */}
          {job.fit_reason && (
            <p className="text-sm text-slate bg-gray-50 rounded-xl p-4 leading-relaxed">{job.fit_reason}</p>
          )}

          {/* Strengths */}
          {strengths.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerge mb-2">Your strengths</p>
              <div className="flex flex-wrap gap-2">
                {strengths.map(s => <span key={s} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-50 text-green-800">{s}</span>)}
              </div>
            </div>
          )}

          {/* Gaps */}
          {gaps.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-danger mb-2">Gaps to address</p>
              <div className="flex flex-wrap gap-2">
                {gaps.map(g => <span key={g} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-50 text-red-800">{g}</span>)}
              </div>
            </div>
          )}

          {/* Download buttons — primary actions */}
          <div className="flex gap-2">
            {job.cv_file_url ? (
              <a href={job.cv_file_url} target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-brand text-white rounded-xl font-bold text-xs hover:bg-indigo-700">
                ⬇ Download Tailored CV (.docx)
              </a>
            ) : (
              <div className="flex-1 flex items-center justify-center py-2.5 bg-gray-100 text-gray-400 rounded-xl text-xs font-semibold">
                No CV generated
              </div>
            )}
            {job.cover_letter_url && (
              <a href={job.cover_letter_url} target="_blank" rel="noreferrer"
                className="px-4 py-2.5 bg-gray-100 text-slate rounded-xl font-semibold text-xs hover:bg-gray-200">
                ⬇ Cover Letter
              </a>
            )}
          </div>

          {/* Tailored summary preview */}
          {job.tailored_summary && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate">Summary preview</p>
                <button onClick={() => copy(job.tailored_summary!, 'cv')}
                  className="text-xs text-brand font-semibold hover:underline">
                  {copied === 'cv' ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-ink bg-gray-50 rounded-xl p-4 leading-relaxed">{job.tailored_summary}</p>
            </div>
          )}

          {/* Cover letter preview */}
          {job.cover_letter_text && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate">Cover letter</p>
                <button onClick={() => copy(job.cover_letter_text!, 'letter')}
                  className="text-xs text-brand font-semibold hover:underline">
                  {copied === 'letter' ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="text-sm text-ink bg-gray-50 rounded-xl p-4 leading-relaxed whitespace-pre-wrap font-sans">{job.cover_letter_text}</pre>
            </div>
          )}

          {/* Open job posting */}
          <a href={job.job_url} target="_blank" rel="noreferrer"
            className="block text-center py-3 bg-ink text-white rounded-xl font-bold text-sm hover:bg-gray-800">
            → Open job posting & apply
          </a>

          {/* Notes */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate mb-2">Notes</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about this application…"
              className="w-full min-h-24 p-3 rounded-xl border border-gray-200 text-sm resize-y focus:border-brand outline-none" />
            <button onClick={saveNotes} disabled={saving}
              className="mt-2 text-xs font-semibold text-brand hover:underline disabled:opacity-50">
              {saving ? 'Saving…' : 'Save notes'}
            </button>
          </div>

          <p className="text-xs text-gray-300 text-right">
            Added {new Date(job.created_at).toLocaleDateString('en-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>
    </>
  )
}

// ── Process Job Bar ───────────────────────────────────────────────────────────
function ProcessJobBar({ hasCv, onProcessed }: { hasCv: boolean; onProcessed: () => void }) {
  const [url, setUrl]         = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ type: 'success' | 'skip' | 'error'; msg: string } | null>(null)

  async function process() {
    if (!url.trim()) return
    setLoading(true); setResult(null)
    const res = await fetch('/api/process-job', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobUrl: url.trim() }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setResult({ type: 'error', msg: data.error ?? 'Something went wrong' })
    } else if (data.skipped) {
      setResult({ type: 'skip', msg: `Fit score ${data.score}/100 — below threshold. Logged as skipped.` })
      onProcessed()
    } else {
      setResult({ type: 'success', msg: `✓ ${data.role} at ${data.company} — score ${data.score}/100. CV and cover letter ready.` })
      setUrl('')
      onProcessed()
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
      <p className="text-xs font-bold uppercase tracking-widest text-slate mb-3">Process a new job</p>
      {!hasCv ? (
        <div className="text-sm text-warn bg-amber-50 rounded-xl p-4">
          Upload your CV first — <a href="/setup" className="font-semibold underline">go to setup →</a>
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <input value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && process()}
              placeholder="Paste a LinkedIn, Indeed, or any job URL…"
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-brand outline-none"
              disabled={loading}
            />
            <button onClick={process} disabled={loading || !url.trim()}
              className="px-5 py-2.5 bg-brand text-white rounded-xl font-semibold text-sm disabled:opacity-40 whitespace-nowrap">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  Processing…
                </span>
              ) : 'Analyse job'}
            </button>
          </div>
          {loading && (
            <p className="text-xs text-slate mt-3 animate-pulse">
              Fetching job → scoring your fit → tailoring CV → writing cover letter…
            </p>
          )}
          {result && (
            <p className={`text-sm mt-3 px-4 py-2.5 rounded-xl ${
              result.type === 'success' ? 'bg-green-50 text-green-800' :
              result.type === 'skip'    ? 'bg-amber-50 text-amber-800' :
                                          'bg-red-50 text-red-700'}`}>
              {result.msg}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DashboardClient({
  initialJobs, stats, hasCv
}: { initialJobs: JobApplication[]; stats: JobStats; hasCv: boolean }) {
  const router                  = useRouter()
  const [, startTransition]     = useTransition()
  const [jobs, setJobs]         = useState(initialJobs)
  const [selected, setSelected] = useState<JobApplication | null>(null)
  const [filter, setFilter]     = useState<JobStatus | 'all'>('all')
  const [search, setSearch]     = useState('')
  const [sortBy, setSort]       = useState<'date' | 'score' | 'company'>('date')

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function updateStatus(id: string, status: JobStatus) {
    await fetch('/api/update-status', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }) })
    setJobs(js => js.map(j => j.id === id ? { ...j, status } : j))
    if (selected?.id === id) setSelected(s => s ? { ...s, status } : null)
  }

  const displayed = jobs
    .filter(j => filter === 'all' || j.status === filter)
    .filter(j => !search || `${j.company} ${j.role} ${j.location}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortBy === 'score' ? (b.fit_score ?? 0) - (a.fit_score ?? 0)
      : sortBy === 'company' ? (a.company ?? '').localeCompare(b.company ?? '')
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const wtBg = (wt: string | null) =>
    wt === 'remote' ? 'bg-green-50 text-green-800' :
    wt === 'hybrid' ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-600'

  return (
    <main className="max-w-6xl mx-auto px-6 py-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Processed"      value={stats.total}                   sub={`${stats.skipped} skipped`}             accent="#6366f1" />
        <StatCard label="Applied"        value={stats.applied}                 sub={`${stats.interviewing} interviewing`}   accent="#0ea5e9" />
        <StatCard label="Avg Fit Score"  value={stats.avg_fit_score ?? '—'}    sub="out of 100"                             accent="#f59e0b" />
        <StatCard label="Interview Rate" value={stats.interview_rate_pct ? `${stats.interview_rate_pct}%` : '—'}
          sub={stats.offers > 0 ? `${stats.offers} offer${stats.offers > 1 ? 's' : ''}` : 'no offers yet'} accent="#10b981" />
      </div>

      {/* Process new job */}
      <ProcessJobBar hasCv={hasCv} onProcessed={refresh} />

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-brand w-44" />
        <div className="flex gap-2 flex-wrap">
          {(['all', ...Object.keys(STATUS_META)] as (JobStatus | 'all')[]).map(s => {
            const m = s !== 'all' ? STATUS_META[s as JobStatus] : null
            return (
              <button key={s} onClick={() => setFilter(s)}
                className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                style={filter === s ? { background: m?.bg ?? '#ede9fe', color: m?.color ?? '#6366f1', borderColor: m?.color ?? '#6366f1' }
                  : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }}>
                {s === 'all' ? 'All' : m!.label}
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex gap-2">
          {(['date', 'score', 'company'] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${sortBy === s ? 'bg-indigo-50 text-brand border-brand' : 'bg-white text-slate border-gray-200'}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="grid gap-0" style={{ gridTemplateColumns: '52px 1.5fr 1fr 100px 72px 140px' }}>
          {/* Header */}
          {['Score','Company / Role','Location','Type','Date','Status'].map(h => (
            <div key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate border-b border-gray-100">{h}</div>
          ))}

          {/* Rows */}
          {displayed.length === 0 && (
            <div className="col-span-6 py-16 text-center text-slate text-sm">
              {jobs.length === 0
                ? 'No applications yet. Paste a job URL above to get started.'
                : 'No applications match your filters.'}
            </div>
          )}
          {displayed.map((job, i) => (
            <div key={job.id} onClick={() => setSelected(job)} className="contents group cursor-pointer">
              {[
                <div key="score" className="px-3 py-4 flex items-center border-b border-gray-50 group-hover:bg-gray-50/80"><ScoreBadge score={job.fit_score} /></div>,
                <div key="company" className="px-4 py-4 border-b border-gray-50 group-hover:bg-gray-50/80">
                  <p className="font-semibold text-ink text-sm">{job.company}</p>
                  <p className="text-xs text-slate mt-0.5">{job.role}</p>
                </div>,
                <div key="loc" className="px-4 py-4 border-b border-gray-50 text-sm text-slate group-hover:bg-gray-50/80">{job.location}</div>,
                <div key="type" className="px-4 py-4 border-b border-gray-50 group-hover:bg-gray-50/80">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-md capitalize ${wtBg(job.work_type)}`}>{job.work_type}</span>
                </div>,
                <div key="date" className="px-4 py-4 border-b border-gray-50 text-xs text-slate group-hover:bg-gray-50/80">
                  {new Date(job.created_at).toLocaleDateString('en-NL', { day: 'numeric', month: 'short' })}
                </div>,
                <div key="status" className="px-4 py-4 border-b border-gray-50 group-hover:bg-gray-50/80" onClick={e => e.stopPropagation()}>
                  <StatusPill status={job.status} onChange={s => updateStatus(job.id, s)} />
                </div>,
              ]}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mt-4">
        {displayed.length} of {jobs.length} applications
      </p>

      {/* Detail panel */}
      {selected && <DetailPanel job={selected} onClose={() => setSelected(null)} onStatusChange={updateStatus} />}
    </main>
  )
}
