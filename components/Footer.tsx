import { GitFork } from 'lucide-react'

const REPO_URL = 'https://github.com/FabrizioMarras/apply-ai'

export default function Footer() {
  return (
    <footer>
      <div className="w-12 h-px bg-gray-200 dark:bg-gray-800 mx-auto mt-8" />
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate dark:text-gray-500">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 32 32" className="w-5 h-5 shrink-0">
            <rect width="32" height="32" rx="6" fill="#4f46e5" />
            <text x="16" y="23" textAnchor="middle" fontFamily="system-ui,-apple-system,sans-serif" fontSize="20" fontWeight="700" fill="white">A</text>
          </svg>
          © {new Date().getFullYear()} ApplyAI —{' '}
          <a href="https://fabriziomarras.com" target="_blank" rel="noreferrer"
            className="font-semibold hover:text-ink dark:hover:text-white transition-colors">
            FM Consultancy
          </a>
          {' '}— MIT licensed
        </div>

        <a href={REPO_URL} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 font-semibold hover:text-ink dark:hover:text-white transition-colors">
          <GitFork size={14} /> github.com/FabrizioMarras/apply-ai
        </a>
      </div>
    </footer>
  )
}
