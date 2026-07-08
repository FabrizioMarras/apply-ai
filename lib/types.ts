export type JobStatus = 'new' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'skipped'
export type Recommendation = 'apply' | 'skip' | 'stretch'
export type WorkType = 'remote' | 'hybrid' | 'onsite' | 'unknown'
export type Seniority = 'junior' | 'mid' | 'senior' | 'lead' | 'unknown'

export interface JobApplication {
  id: string
  user_id: string
  job_url: string
  company: string | null
  role: string | null
  location: string | null
  work_type: WorkType | null
  salary: string | null
  seniority: Seniority | null
  job_description: string | null
  fit_score: number | null
  fit_reason: string | null
  strengths: string[]
  gaps: string[]
  recommendation: Recommendation | null
  cv_file_url: string | null
  cover_letter_url: string | null
  cover_letter_text: string | null
  tailored_summary: string | null
  tailored_bullets: Array<{ company: string; role: string; dates: string; bullets: string[] }> | null
  tailored_skills: string[] | null
  tailored_contact: { full_name: string; email: string; phone: string; location: string; linkedin: string } | null
  tailored_education: Array<{ institution: string; degree: string; dates: string }> | null
  tailored_languages: string[] | null
  status: JobStatus
  notes: string | null
  archived_at: string | null
  created_at: string
  applied_at: string | null
  updated_at: string
}

export interface UserProfile {
  id: string
  cv_raw_text: string | null
  cv_file_url: string | null
  cv_file_name: string | null
  full_name: string | null
  location: string | null
  target_roles: string | null
  preferences: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface JobStats {
  total: number
  processed: number
  applied: number
  interviewing: number
  offers: number
  rejected: number
  skipped: number
  avg_fit_score: number | null
  interview_rate_pct: number | null
}

export const STATUS_META: Record<JobStatus, { label: string; color: string; bg: string }> = {
  new:          { label: 'New',          color: '#6366f1', bg: '#ede9fe' },
  applied:      { label: 'Applied',      color: '#0ea5e9', bg: '#e0f2fe' },
  interviewing: { label: 'Interviewing', color: '#f59e0b', bg: '#fef3c7' },
  offer:        { label: 'Offer 🎉',     color: '#10b981', bg: '#d1fae5' },
  rejected:     { label: 'Rejected',     color: '#ef4444', bg: '#fee2e2' },
  skipped:      { label: 'Skipped',      color: '#9ca3af', bg: '#f3f4f6' },
}

export const scoreColor = (s: number) =>
  s >= 80 ? '#10b981' : s >= 65 ? '#f59e0b' : s >= 50 ? '#f97316' : '#ef4444'
