import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-mist flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-8xl font-extrabold text-brand mb-4">404</p>
        <h1 className="text-2xl font-bold text-ink mb-2">Page not found</h1>
        <p className="text-sm text-slate mb-8 leading-relaxed max-w-xs mx-auto">
          This application doesn&apos;t exist or may have been removed.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-brand text-white rounded-xl font-bold text-sm hover:bg-indigo-700"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  )
}
