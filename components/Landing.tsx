import Link from 'next/link'
import { Fraunces } from 'next/font/google'
import {
  GitFork, ArrowRight, Upload, Link2, Sparkles, LayoutGrid, CheckCircle2, Search,
  Target, FileText, Gauge, Users, Cable, ShieldCheck,
} from 'lucide-react'
import { scoreColor, STATUS_META, JobStatus } from '@/lib/types'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
})

const REPO_URL = 'https://github.com/FabrizioMarras/apply-ai'

// ── Placeholder dashboard data — for the hero background reproduction only, not real user data ──

const mockStats = [
  { label: 'Processed',      value: 24,   sub: '5 skipped',       accent: '#6366f1' },
  { label: 'Applied',        value: 9,    sub: '2 interviewing',  accent: '#0ea5e9' },
  { label: 'Avg Fit Score',  value: 78,   sub: 'out of 100',      accent: '#f59e0b' },
  { label: 'Interview Rate', value: '22%', sub: '1 offer',        accent: '#10b981' },
]

const mockRows: { score: number; company: string; role: string; location: string; type: 'remote' | 'hybrid' | 'onsite'; date: string; status: JobStatus }[] = [
  { score: 91, company: 'Meridian Robotics',   role: 'Senior Product Manager', location: 'Berlin, Germany', type: 'remote', date: '3 Jul',  status: 'interviewing' },
  { score: 78, company: 'Northwind Analytics', role: 'Group PM',               location: 'Amsterdam, NL',   type: 'hybrid', date: '1 Jul',  status: 'applied' },
  { score: 64, company: 'Vantage Cloud Co.',   role: 'Product Owner',          location: 'Remote',           type: 'remote', date: '28 Jun', status: 'new' },
]

const mockFilters: (JobStatus | 'all')[] = ['all', 'new', 'applied', 'interviewing', 'offer', 'rejected', 'skipped']

const wtBg = (wt: string) =>
  wt === 'remote' ? 'bg-green-50 dark:bg-green-950/50 text-green-800 dark:text-green-300' :
  wt === 'hybrid' ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300' :
  'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'

// Non-interactive reproduction of the real dashboard UI, with placeholder data,
// used purely as the hero's background art.
function DashboardMockup() {
  return (
    <div className="select-none">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-5">
        {mockStats.map(s => (
          <div key={s.label}
            className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800"
            style={{ borderLeft: `4px solid ${s.accent}` }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate dark:text-gray-400 mb-1">{s.label}</p>
            <p className="text-2xl font-extrabold text-ink dark:text-gray-50 leading-none">{s.value}</p>
            <p className="text-[11px] text-slate dark:text-gray-500 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm px-4 py-2.5 mb-4 sm:mb-5 flex items-center gap-3">
        <CheckCircle2 size={14} className="text-emerge shrink-0" />
        <span className="text-emerge font-bold text-xs">CV active</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-slate dark:text-gray-400 truncate">resume_product_lead.pdf</p>
        </div>
        <span className="text-[11px] font-semibold text-brand">Replace CV</span>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-4 mb-4 sm:mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate dark:text-gray-400 mb-2.5">Process a new job</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] text-gray-300 dark:text-gray-600">
            Paste a LinkedIn, Indeed, or any job URL…
          </div>
          <div className="px-3.5 py-2 bg-brand text-white rounded-lg text-[11px] font-bold whitespace-nowrap">Analyse job</div>
        </div>
      </div>

      <div className="mb-3 sm:mb-4 flex flex-col gap-2">
        <div className="relative">
          <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-600" />
          <div className="pl-7 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[11px] text-gray-300 dark:text-gray-600">Search…</div>
        </div>
        <div className="flex gap-1.5">
          {mockFilters.map(s => (
            <span key={s}
              className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border capitalize"
              style={s === 'all'
                ? { background: '#ede9fe', color: '#6366f1', borderColor: '#6366f1' }
                : { background: 'transparent', color: '#9ca3af', borderColor: '#e5e7eb' }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: '56px 1.6fr 1fr 90px 60px 110px' }}>
          {['Score', 'Company / Role', 'Location', 'Type', 'Date', 'Status'].map(h => (
            <div key={h} className="px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-slate dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">{h}</div>
          ))}
          {mockRows.map(job => (
            <div key={job.company} className="contents">
              <div className="px-3 py-3 flex items-center border-b border-gray-50 dark:border-gray-800">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px]"
                  style={{ background: scoreColor(job.score) + '22', color: scoreColor(job.score) }}>
                  {job.score}
                </div>
              </div>
              <div className="px-3 py-3 border-b border-gray-50 dark:border-gray-800">
                <p className="font-semibold text-ink dark:text-gray-100 text-[12px] truncate">{job.company}</p>
                <p className="text-[11px] text-slate dark:text-gray-400 truncate">{job.role}</p>
              </div>
              <div className="px-3 py-3 border-b border-gray-50 dark:border-gray-800 text-[11px] text-slate dark:text-gray-400 truncate">{job.location}</div>
              <div className="px-3 py-3 border-b border-gray-50 dark:border-gray-800">
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md capitalize ${wtBg(job.type)}`}>{job.type}</span>
              </div>
              <div className="px-3 py-3 border-b border-gray-50 dark:border-gray-800 text-[10px] text-slate dark:text-gray-400">{job.date}</div>
              <div className="px-3 py-3 border-b border-gray-50 dark:border-gray-800">
                <span className="text-[9px] font-bold px-1.5 py-1 rounded-md"
                  style={{ background: STATUS_META[job.status].bg, color: STATUS_META[job.status].color }}>
                  {STATUS_META[job.status].label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const steps = [
  { title: 'Upload your CV',  desc: 'Once, as a PDF. Text is extracted and reused for every job — you never touch it again.', icon: Upload },
  { title: 'Paste a job URL', desc: 'LinkedIn, Greenhouse, Lever, Indeed, or a plain company careers page — all supported.', icon: Link2 },
  { title: 'Score & tailor',  desc: 'Claude scores your fit 0–100. Above your threshold, it rewrites your CV and writes a cover letter.', icon: Target },
  { title: 'Track it',        desc: 'Every application lands in a sortable dashboard, from New through Offer.', icon: LayoutGrid },
]

const features = [
  { title: 'Real fit scoring',       desc: 'A 0–100 score with strengths, gaps, and reasoning — so you skip listings before wasting time on them.', icon: Sparkles },
  { title: 'Tailored documents',     desc: 'A fresh .docx CV and cover letter generated per job, ready to submit.', icon: FileText },
  { title: 'Efficient by design',    desc: 'Prompt caching cuts redundant AI calls, and jobs below your fit threshold stop before the expensive steps run at all.', icon: Gauge },
  { title: 'Multi-user by default',  desc: 'Supabase Row-Level Security isolates every user’s data at the database level. No extra code.', icon: Users },
  { title: 'Swap the AI provider',   desc: 'One file, one client init. Drop in OpenAI or a local model (Ollama, LM Studio) instead of Claude.', icon: Cable },
  { title: 'Your data, your infra',  desc: 'Runs on your own Supabase project and API keys. Nothing leaves infrastructure you control.', icon: ShieldCheck },
]

export default function Landing() {
  return (
    <div className="relative overflow-x-hidden">

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="relative z-20 max-w-6xl mx-auto px-6 sm:px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0">
            <rect width="32" height="32" rx="6" fill="#4f46e5" />
            <text x="16" y="23" textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif" fontSize="20" fontWeight="700" fill="white">A</text>
          </svg>
          <span className="font-extrabold text-sm text-ink dark:text-white tracking-tight">
            Apply<span className="text-brand">AI</span>
          </span>
        </div>
        <div className="flex items-center gap-5">
          <a href={REPO_URL} target="_blank" rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate dark:text-gray-400 hover:text-ink dark:hover:text-white transition-colors">
            <GitFork size={15} /> GitHub
          </a>
          <Link href="/login"
            className="text-xs font-semibold text-slate dark:text-gray-400 hover:text-ink dark:hover:text-white transition-colors">
            Log in
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative">
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 -left-24 w-[36rem] h-[36rem] rounded-full bg-brand/20 dark:bg-brand/25 blur-[100px]" />
          <div className="absolute top-10 right-[-10rem] w-[30rem] h-[30rem] rounded-full bg-emerge/20 dark:bg-emerge/10 blur-[110px]" />
          <div className="absolute inset-0 landing-grain" />
        </div>

        <div className="max-w-6xl mx-auto px-6 sm:px-8 pt-10 sm:pt-16 pb-24 grid lg:grid-cols-[1fr_1.1fr] gap-16 items-center">
          <div>
            <span className="landing-rise inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-brand/30 bg-brand/5 text-brand text-[11px] font-bold uppercase tracking-widest mb-6">
              Open source · MIT licensed
            </span>
            <h1
              className={`${fraunces.className} landing-rise text-[2.6rem] sm:text-6xl leading-[1.05] tracking-tight text-ink dark:text-white mb-6`}
              style={{ animationDelay: '0.08s' }}
            >
              Paste a job link.<br />
              Get a <em className="text-brand font-medium">tailored CV</em> back.
            </h1>
            <p className="landing-rise text-base sm:text-lg text-slate dark:text-gray-400 leading-relaxed max-w-lg mb-8" style={{ animationDelay: '0.16s' }}>
              ApplyAI scores every listing against your résumé, rewrites your CV and cover letter for the role,
              and tracks the whole search — in under a minute, using whatever AI provider you point it at.
            </p>
            <div className="landing-rise flex flex-wrap items-center gap-3" style={{ animationDelay: '0.24s' }}>
              <a href={REPO_URL} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand text-white text-sm font-bold hover:bg-indigo-600 transition-colors shadow-sm shadow-brand/20">
                <GitFork size={16} /> View on GitHub
              </a>
              <a href="#how-it-works"
                className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-bold text-ink dark:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-800/60 transition-colors">
                How it works <ArrowRight size={14} />
              </a>
            </div>
          </div>

          {/* Boxed product screenshot: full dashboard UI, reproduced with placeholder data, framed like a browser window */}
          <div className="landing-rise" style={{ animationDelay: '0.3s' }}>
            <div className="relative rotate-[1deg] hover:rotate-0 transition-transform duration-500 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-ink/10 dark:shadow-black/40 border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
                <span className="ml-3 text-[11px] text-gray-300 dark:text-gray-600 font-mono">your-app.example.com/dashboard</span>
              </div>
              <div className="overflow-hidden bg-mist dark:bg-gray-950 p-3">
                <div className="landing-mockup w-[900px]">
                  <DashboardMockup />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 sm:px-8 py-20 sm:py-24">
        <h2 className={`${fraunces.className} text-3xl sm:text-4xl text-ink dark:text-white mb-3`}>How it works</h2>
        <p className="text-slate dark:text-gray-400 mb-14 max-w-xl">
          Four steps, mostly automated. You only touch the app to upload your CV once and paste job links.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <div key={s.title}
              className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
              <div className="absolute top-5 right-5 w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center text-brand">
                <s.icon size={16} />
              </div>
              <div className={`${fraunces.className} text-5xl leading-none text-brand mb-5 pr-8`}>0{i + 1}</div>
              <h3 className="font-bold text-ink dark:text-gray-100 mb-1.5">{s.title}</h3>
              <p className="text-sm text-slate dark:text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-900/40 border-y border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-20 sm:py-24">
          <h2 className={`${fraunces.className} text-3xl sm:text-4xl text-ink dark:text-white mb-3`}>Built for the job hunt, not a demo</h2>
          <p className="text-slate dark:text-gray-400 mb-14 max-w-xl">Everything that made the cut is in the repo — no waitlist, no paywall.</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(f => (
              <div key={f.title}
                className="bg-mist dark:bg-gray-800/40 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 hover:border-brand/30 dark:hover:border-brand/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center text-brand shrink-0 mb-4 shadow-sm">
                  <f.icon size={16} />
                </div>
                <h3 className="font-bold text-sm text-ink dark:text-gray-100 mb-1.5">{f.title}</h3>
                <p className="text-sm text-slate dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Open source CTA ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 sm:px-8 py-24 sm:py-28 text-center">
        <h2 className={`${fraunces.className} text-3xl sm:text-5xl text-ink dark:text-white mb-4`}>Run it yourself.</h2>
        <p className="text-slate dark:text-gray-400 max-w-lg mx-auto mb-10 leading-relaxed">
          MIT licensed. Clone it, point it at your own Supabase project and Anthropic key, and it&apos;s yours —
          free to fork, modify, or ship as your own.
        </p>

        <div className="inline-flex flex-col items-start bg-ink dark:bg-black rounded-2xl p-5 sm:p-6 text-left mb-10 shadow-xl shadow-ink/10">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
          </div>
          <code className="font-mono text-[13px] sm:text-sm text-gray-300 leading-loose whitespace-pre-wrap break-all">
            <span className="text-emerge">git</span> clone {REPO_URL}.git{'\n'}
            <span className="text-emerge">cd</span> apply-ai && npm install
          </code>
        </div>

        <div>
          <a href={REPO_URL} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-brand text-white text-sm font-bold hover:bg-indigo-600 transition-colors shadow-sm shadow-brand/20">
            <GitFork size={16} /> View on GitHub
          </a>
          <p className="text-xs text-slate dark:text-gray-500 mt-4">Full plain-English setup guide included — no coding experience required.</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate dark:text-gray-500">
            <svg viewBox="0 0 32 32" className="w-5 h-5 shrink-0">
              <rect width="32" height="32" rx="6" fill="#4f46e5" />
              <text x="16" y="23" textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif" fontSize="20" fontWeight="700" fill="white">A</text>
            </svg>
            © {new Date().getFullYear()} ApplyAI — MIT licensed
          </div>
          <a href={REPO_URL} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate dark:text-gray-400 hover:text-ink dark:hover:text-white transition-colors">
            <GitFork size={14} /> github.com/FabrizioMarras/apply-ai
          </a>
        </div>
      </footer>
    </div>
  )
}
