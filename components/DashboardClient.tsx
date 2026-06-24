'use client'
import { useState, useEffect, useRef } from 'react'
import {
  CheckCircle2, Upload, FileText, Download, ExternalLink,
  Copy, Check, Trash2, X, Search, Link2,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { JobApplication, JobStats, JobStatus, STATUS_META, scoreColor } from '@/lib/types'
import { useToast } from '@/components/Toast'

const PAGE_SIZE = 20

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeStats(jobs: JobApplication[]): JobStats {
  const skipped      = jobs.filter(j => j.status === 'skipped').length
  const processed    = jobs.length - skipped   // jobs where documents were generated
  const interviewing = jobs.filter(j => j.status === 'interviewing').length
  const offers       = jobs.filter(j => j.status === 'offer').length
  const withScore    = jobs.filter(j => j.status !== 'skipped' && j.fit_score !== null)
  const avgScore     = withScore.length > 0
    ? Math.round(withScore.reduce((s, j) => s + (j.fit_score ?? 0), 0) / withScore.length * 10) / 10
    : null
  return {
    total:              jobs.length,
    processed,
    applied:            jobs.filter(j => j.status === 'applied').length,
    interviewing,
    offers,
    rejected:           jobs.filter(j => j.status === 'rejected').length,
    skipped,
    avg_fit_score:      avgScore,
    // % of processed jobs that reached interview stage or beyond
    interview_rate_pct: processed > 0 ? Math.round((interviewing + offers) / processed * 100) : null,
  }
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent: string
}) {
  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <p className="text-xs font-bold uppercase tracking-widest text-slate dark:text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-extrabold text-ink dark:text-gray-50 leading-none">{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

// ── Score Badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return (
    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-600 text-xs">—</div>
  )
  const c = scoreColor(score)
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
      style={{ background: c + '22', color: c }}>{score}</div>
  )
}

// ── Status Pill ───────────────────────────────────────────────────────────────

function StatusPill({ status, onChange }: { status: JobStatus; onChange: (s: JobStatus) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef  = useRef<HTMLButtonElement>(null)
  const m = STATUS_META[status]

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const dropdownW = 160 // min-w-40
      const left = r.left + dropdownW > window.innerWidth
        ? Math.max(0, r.right - dropdownW)
        : r.left
      setPos({ top: r.bottom + 4, left })
    }
    setOpen(o => !o)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        onClick={toggle}
        className="rounded-full px-3 py-1 text-xs font-bold cursor-pointer border-0 whitespace-nowrap"
        style={{ background: m.bg, color: m.color }}
      >
        {m.label} ▾
      </button>
      {open && (
        <div
          className="fixed z-[200] bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 p-1.5 min-w-40"
          style={{ top: pos.top, left: pos.left }}
        >
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

// ── CV Section ────────────────────────────────────────────────────────────────

function CvSection({ hasCv, onUploaded }: { hasCv: boolean; onUploaded: () => void }) {
  const { toast } = useToast()
  const [file, setFile]           = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [replacing, setReplacing] = useState(!hasCv)

  async function upload() {
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('cv', file)
    try {
      const res  = await fetch('/api/upload-cv', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        toast('error', data.error ?? 'Upload failed')
      } else {
        toast('success', `CV uploaded — ${data.charCount.toLocaleString()} characters extracted`)
        setFile(null)
        setReplacing(false)
        onUploaded()
      }
    } catch {
      toast('error', 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  if (hasCv && !replacing) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm px-5 py-3 mb-6 flex items-center gap-3">
        <CheckCircle2 size={16} className="text-emerge shrink-0" />
        <span className="text-emerge font-bold text-sm">CV active</span>
        <span className="text-xs text-slate dark:text-gray-400 flex-1">Your CV is ready for job analysis.</span>
        <button
          onClick={() => setReplacing(true)}
          className="text-xs font-semibold text-brand hover:underline"
        >
          Replace CV
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-slate dark:text-gray-400">
          {hasCv ? 'Replace your CV' : 'Upload your CV to get started'}
        </p>
        {hasCv && (
          <button onClick={() => { setReplacing(false); setFile(null) }}
            className="text-xs text-slate dark:text-gray-500 hover:text-ink dark:hover:text-white">
            Cancel
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className={`flex-1 flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-all
          ${file
            ? 'border-emerge bg-green-50 dark:bg-green-950/30'
            : 'border-gray-200 dark:border-gray-700 hover:border-brand'}`}>
          <input type="file" accept=".pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {file
            ? <FileText size={18} className="text-emerge shrink-0" />
            : <Upload size={18} className="text-gray-300 dark:text-gray-600 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink dark:text-gray-100 truncate">
              {file ? file.name : 'Choose PDF'}
            </p>
            <p className="text-xs text-slate dark:text-gray-400">
              {file ? `${(file.size / 1024).toFixed(0)} KB` : 'PDF only, max 10 MB'}
            </p>
          </div>
        </label>
        <button
          onClick={upload}
          disabled={!file || uploading}
          className="px-4 py-3 bg-brand text-white rounded-xl font-semibold text-sm disabled:opacity-40 whitespace-nowrap"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ job, onClose, onStatusChange, onDelete, onNotesChange }: {
  job: JobApplication
  onClose: () => void
  onStatusChange: (id: string, s: JobStatus) => void
  onDelete: (id: string) => void
  onNotesChange: (id: string, notes: string) => void
}) {
  const { toast }               = useToast()
  const [copied, setCopied]     = useState<'summary' | 'letter' | null>(null)
  const [notes, setNotes]       = useState(job.notes ?? '')
  const [notesSaved, setNotesSaved] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleNotesBlur() {
    if (notes === (job.notes ?? '')) return
    await fetch('/api/update-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id, notes }),
    })
    onNotesChange(job.id, notes)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch('/api/delete-job', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: job.id }),
    })
    if (res.ok) {
      onDelete(job.id)
      onClose()
      toast('success', 'Application deleted')
    } else {
      toast('error', 'Delete failed. Please try again.')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  function copy(text: string, which: 'summary' | 'letter') {
    navigator.clipboard.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  const strengths = Array.isArray(job.strengths) ? job.strengths : []
  const gaps      = Array.isArray(job.gaps)      ? job.gaps      : []

  return (
    <>
      <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col overflow-y-auto">

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start sticky top-0 bg-white dark:bg-gray-900 z-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate dark:text-gray-400 mb-1">{job.company}</p>
            <h2 className="text-xl font-bold text-ink dark:text-gray-50">{job.role}</h2>
            <p className="text-sm text-slate dark:text-gray-400 mt-0.5">{job.location} · {job.work_type}</p>
          </div>
          <button onClick={onClose} className="text-slate dark:text-gray-400 hover:text-ink dark:hover:text-white ml-4 mt-0.5">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5 flex-1">

          {/* Score + Status */}
          <div className="flex items-center gap-4">
            <ScoreBadge score={job.fit_score} />
            <div>
              <p className="text-sm font-semibold text-ink dark:text-gray-100">Fit Score</p>
              <p className="text-xs text-slate dark:text-gray-400">{job.salary ?? 'Salary not listed'}</p>
            </div>
            <div className="ml-auto">
              <StatusPill status={job.status} onChange={s => onStatusChange(job.id, s)} />
            </div>
          </div>

          {/* Fit reason */}
          {job.fit_reason && (
            <p className="text-sm text-slate dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 leading-relaxed">
              {job.fit_reason}
            </p>
          )}

          {/* Strengths */}
          {strengths.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerge mb-2">Your strengths</p>
              <div className="flex flex-wrap gap-2">
                {strengths.map(s => (
                  <span key={s} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-50 dark:bg-green-950/50 text-green-800 dark:text-green-300">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {gaps.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-danger mb-2">Gaps to address</p>
              <div className="flex flex-wrap gap-2">
                {gaps.map(g => (
                  <span key={g} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300">{g}</span>
                ))}
              </div>
            </div>
          )}

          {/* Downloads */}
          <div className="flex gap-2">
            {job.cv_file_url ? (
              <a href={job.cv_file_url} target="_blank" rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors">
                <Download size={13} />
                Tailored CV (.docx)
              </a>
            ) : (
              <div className="flex-1 flex items-center justify-center py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 rounded-xl text-xs font-semibold">
                No CV generated
              </div>
            )}
            {job.cover_letter_url && (
              <a href={job.cover_letter_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-slate dark:text-gray-300 rounded-xl font-semibold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                <Download size={13} />
                Cover Letter
              </a>
            )}
          </div>

          {/* Summary preview */}
          {job.tailored_summary && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate dark:text-gray-400">Summary preview</p>
                <button
                  onClick={() => copy(job.tailored_summary!, 'summary')}
                  className="flex items-center gap-1 text-xs text-brand font-semibold hover:underline"
                >
                  {copied === 'summary' ? <Check size={11} /> : <Copy size={11} />}
                  {copied === 'summary' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-ink dark:text-gray-200 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 leading-relaxed">
                {job.tailored_summary}
              </p>
            </div>
          )}

          {/* Cover letter */}
          {job.cover_letter_text && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-widest text-slate dark:text-gray-400">Cover letter</p>
                <button
                  onClick={() => copy(job.cover_letter_text!, 'letter')}
                  className="flex items-center gap-1 text-xs text-brand font-semibold hover:underline"
                >
                  {copied === 'letter' ? <Check size={11} /> : <Copy size={11} />}
                  {copied === 'letter' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="text-sm text-ink dark:text-gray-200 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 leading-relaxed whitespace-pre-wrap font-sans">
                {job.cover_letter_text}
              </pre>
            </div>
          )}

          {/* Open posting */}
          <a href={job.job_url} target="_blank" rel="noreferrer"
            className="flex items-center justify-center gap-2 py-3 bg-ink dark:bg-gray-800 text-white rounded-xl font-bold text-sm hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors">
            <ExternalLink size={14} />
            Open job posting & apply
          </a>

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-widest text-slate dark:text-gray-400">Notes</p>
              {notesSaved && <p className="text-xs text-emerge">Saved</p>}
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Add notes about this application…"
              className="w-full min-h-24 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-ink dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 resize-y focus:border-brand outline-none"
            />
          </div>

          {/* Footer: date + delete */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-300 dark:text-gray-600">
              Added {new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            {confirmDelete ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate dark:text-gray-400">Are you sure?</span>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs font-semibold text-slate dark:text-gray-400 hover:text-ink dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-danger px-2.5 py-1 rounded-lg disabled:opacity-50"
                >
                  <Trash2 size={11} />
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate dark:text-gray-500 hover:text-danger dark:hover:text-danger transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Process Job Bar ───────────────────────────────────────────────────────────

function ProcessJobBar({ hasCv, onJobAdded, onDuplicate }: {
  hasCv: boolean
  onJobAdded: (job: JobApplication) => void
  onDuplicate: (job: JobApplication) => void
}) {
  const { toast } = useToast()
  const [url, setUrl]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [progress, setProgress] = useState('')

  async function process() {
    const trimmed = url.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setProgress('Starting…')
    try {
      const res = await fetch('/api/process-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobUrl: trimmed }),
      })

      // Early checks (auth, rate-limit, dedup, bad URL) return plain JSON
      if (!res.headers.get('content-type')?.includes('text/event-stream')) {
        const data = await res.json()
        if (res.status === 409 && data.job) {
          toast('info', 'Already in your dashboard — opening it now.')
          onDuplicate(data.job as JobApplication)
          setUrl('')
        } else {
          toast('error', data.error ?? 'Something went wrong')
        }
        return
      }

      // SSE stream — pipeline is running
      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as Record<string, unknown>
            if (event.type === 'progress') {
              setProgress(event.message as string)
            } else if (event.type === 'result') {
              toast('success', `${event.role} at ${event.company} — score ${event.score}/100. CV & cover letter ready.`)
              if (event.job) onJobAdded(event.job as JobApplication)
              setUrl('')
            } else if (event.type === 'skipped') {
              toast('info', `Fit score ${event.score}/100 — not a strong match. Saved as skipped. Click the row to see why.`)
              if (event.job) onJobAdded(event.job as JobApplication)
              setUrl('')
            } else if (event.type === 'error') {
              toast('error', (event.message as string) ?? 'Something went wrong')
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch {
      toast('error', 'Request failed. Please check your connection.')
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 mb-6">
      <p className="text-xs font-bold uppercase tracking-widest text-slate dark:text-gray-400 mb-3">Process a new job</p>
      {!hasCv ? (
        <div className="text-sm text-warn bg-amber-50 dark:bg-amber-950/40 rounded-xl p-4">
          Upload your CV above before analysing jobs.
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Link2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600 pointer-events-none" />
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && process()}
                placeholder="Paste a LinkedIn, Indeed, or any job URL…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-ink dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:border-brand outline-none"
                disabled={loading}
              />
            </div>
            <button
              onClick={process}
              disabled={loading || !url.trim()}
              className="px-5 py-2.5 bg-brand text-white rounded-xl font-semibold text-sm disabled:opacity-40 whitespace-nowrap"
            >
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
          {loading && progress && (
            <p className="text-xs text-slate dark:text-gray-500 mt-3 animate-pulse">
              {progress}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DashboardClient({
  initialJobs, initialHasCv,
}: { initialJobs: JobApplication[]; initialHasCv: boolean }) {
  const [jobs, setJobs]         = useState(initialJobs)
  const [hasCv, setHasCv]       = useState(initialHasCv)
  const [selected, setSelected] = useState<JobApplication | null>(null)
  const [filter, setFilter]     = useState<JobStatus | 'all'>('all')
  const [search, setSearch]     = useState('')
  const [sortBy, setSort]       = useState<'date' | 'score' | 'company'>('date')
  const [page, setPage]         = useState(0)

  useEffect(() => { setPage(0) }, [filter, search, sortBy])

  const stats = computeStats(jobs)

  function addJob(job: JobApplication) {
    // Replace any existing entry with the same URL (e.g. a stale skipped record
    // that the server deleted before re-processing), then prepend the new one.
    setJobs(prev => [job, ...prev.filter(j => j.job_url !== job.job_url)])
  }

  async function updateStatus(id: string, status: JobStatus) {
    await fetch('/api/update-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setJobs(js => js.map(j => j.id === id ? { ...j, status } : j))
    if (selected?.id === id) setSelected(s => s ? { ...s, status } : null)
  }

  function removeJob(id: string) {
    setJobs(js => js.filter(j => j.id !== id))
  }

  function updateNotes(id: string, notes: string) {
    setJobs(js => js.map(j => j.id === id ? { ...j, notes } : j))
  }

  const filtered = jobs
    .filter(j => filter === 'all' || j.status === filter)
    .filter(j => !search || `${j.company} ${j.role} ${j.location}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortBy === 'score'   ? (b.fit_score ?? 0) - (a.fit_score ?? 0)
      : sortBy === 'company' ? (a.company ?? '').localeCompare(b.company ?? '')
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const displayed  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const wtBg = (wt: string | null) =>
    wt === 'remote' ? 'bg-green-50 dark:bg-green-950/50 text-green-800 dark:text-green-300' :
    wt === 'hybrid' ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300' :
    'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Processed"      value={stats.processed}                                                          sub={`${stats.skipped} skipped`}           accent="#6366f1" />
        <StatCard label="Applied"        value={stats.applied}                                                            sub={`${stats.interviewing} interviewing`} accent="#0ea5e9" />
        <StatCard label="Avg Fit Score"  value={stats.avg_fit_score ?? '—'}                                               sub="out of 100"                           accent="#f59e0b" />
        <StatCard label="Interview Rate" value={stats.interview_rate_pct != null ? `${stats.interview_rate_pct}%` : '—'}
          sub={stats.offers > 0 ? `${stats.offers} offer${stats.offers > 1 ? 's' : ''}` : `${stats.interviewing} interviewing`} accent="#10b981" />
      </div>

      {/* CV section */}
      <CvSection hasCv={hasCv} onUploaded={() => setHasCv(true)} />

      {/* Process job */}
      <ProcessJobBar hasCv={hasCv} onJobAdded={addJob} onDuplicate={j => setSelected(j)} />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-2">

        {/* Row 1: search (stretches) + sort buttons */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-ink dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 outline-none focus:border-brand w-full"
            />
          </div>
          <div className="flex gap-1.5 shrink-0">
            {(['date', 'score', 'company'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                  sortBy === s
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-brand border-brand'
                    : 'bg-white dark:bg-gray-900 text-slate dark:text-gray-400 border-gray-200 dark:border-gray-700'
                }`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: status pills — scrolls horizontally on mobile, wraps on desktop */}
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-0.5 sm:pb-0 [&::-webkit-scrollbar]:hidden">
          {(['all', ...Object.keys(STATUS_META)] as (JobStatus | 'all')[]).map(s => {
            const m = s !== 'all' ? STATUS_META[s as JobStatus] : null
            return (
              <button key={s} onClick={() => setFilter(s)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
                style={filter === s
                  ? { background: m?.bg ?? '#ede9fe', color: m?.color ?? '#6366f1', borderColor: m?.color ?? '#6366f1' }
                  : { background: 'transparent', color: '#6b7280', borderColor: '#e5e7eb' }}>
                {s === 'all' ? 'All' : m!.label}
              </button>
            )
          })}
        </div>

      </div>

      {/* Empty state */}
      {displayed.length === 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 py-16 text-center text-slate dark:text-gray-500 text-sm">
          {jobs.length === 0
            ? 'No applications yet. Paste a job URL above to get started.'
            : 'No applications match your filters.'}
        </div>
      )}

      {/* Table — desktop (md+) */}
      {displayed.length > 0 && (
        <div className="hidden md:block bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="grid gap-0" style={{ gridTemplateColumns: '52px 1.5fr 1fr 100px 72px 140px' }}>
            {['Score', 'Company / Role', 'Location', 'Type', 'Date', 'Status'].map(h => (
              <div key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">{h}</div>
            ))}
            {displayed.map(job => (
              <div key={job.id} onClick={() => setSelected(job)} className="contents group cursor-pointer">
                {[
                  <div key="score" className="px-3 py-4 flex items-center border-b border-gray-50 dark:border-gray-800 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-800/40">
                    <ScoreBadge score={job.fit_score} />
                  </div>,
                  <div key="company" className="px-4 py-4 border-b border-gray-50 dark:border-gray-800 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-800/40">
                    <p className="font-semibold text-ink dark:text-gray-100 text-sm">{job.company}</p>
                    <p className="text-xs text-slate dark:text-gray-400 mt-0.5">{job.role}</p>
                  </div>,
                  <div key="loc" className="px-4 py-4 border-b border-gray-50 dark:border-gray-800 text-sm text-slate dark:text-gray-400 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-800/40">{job.location}</div>,
                  <div key="type" className="px-4 py-4 border-b border-gray-50 dark:border-gray-800 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-800/40">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-md capitalize ${wtBg(job.work_type)}`}>{job.work_type}</span>
                  </div>,
                  <div key="date" className="px-4 py-4 border-b border-gray-50 dark:border-gray-800 text-xs text-slate dark:text-gray-400 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-800/40">
                    {new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>,
                  <div key="status" className="px-4 py-4 border-b border-gray-50 dark:border-gray-800 group-hover:bg-gray-50/80 dark:group-hover:bg-gray-800/40" onClick={e => e.stopPropagation()}>
                    <StatusPill status={job.status} onChange={s => updateStatus(job.id, s)} />
                  </div>,
                ]}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cards — mobile (< md) */}
      {displayed.length > 0 && (
        <div className="md:hidden bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden divide-y divide-gray-50 dark:divide-gray-800">
          {displayed.map(job => (
            <div
              key={job.id}
              onClick={() => setSelected(job)}
              className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50/80 dark:hover:bg-gray-800/40 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
            >
              <div className="pt-0.5 shrink-0">
                <ScoreBadge score={job.fit_score} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-ink dark:text-gray-100 truncate">{job.company}</p>
                    <p className="text-xs text-slate dark:text-gray-400 truncate">{job.role}</p>
                  </div>
                  <div className="shrink-0" onClick={e => e.stopPropagation()}>
                    <StatusPill status={job.status} onChange={s => updateStatus(job.id, s)} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {job.location && (
                    <span className="text-xs text-slate dark:text-gray-500 truncate max-w-[140px]">{job.location}</span>
                  )}
                  {job.work_type && job.work_type !== 'unknown' && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded capitalize ${wtBg(job.work_type)}`}>{job.work_type}</span>
                  )}
                  <span className="text-xs text-slate dark:text-gray-500">
                    {new Date(job.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-400 dark:text-gray-600">
          {filtered.length === 0
            ? '0 applications'
            : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg border bg-white dark:bg-gray-900 text-slate dark:text-gray-400 border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-xs text-slate dark:text-gray-400">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg border bg-white dark:bg-gray-900 text-slate dark:text-gray-400 border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {selected && (
        <DetailPanel
          job={selected}
          onClose={() => setSelected(null)}
          onStatusChange={updateStatus}
          onDelete={removeJob}
          onNotesChange={updateNotes}
        />
      )}
    </main>
  )
}
