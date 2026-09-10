/** 洛谷领域常量（前端展示用，与后端 luogu.ts 保持一致） */

export type Platform = 'luogu' | 'atcoder' | 'codeforces'

export const PLATFORMS: Platform[] = ['luogu', 'atcoder', 'codeforces']

export const PLATFORM_META: Record<Platform, { label: string; labelZh: string; color: string }> = {
  luogu: { label: 'Luogu', labelZh: '洛谷', color: '#BFBFBF' },
  atcoder: { label: 'AtCoder', labelZh: 'AtCoder', color: '#FF8F00' },
  codeforces: { label: 'Codeforces', labelZh: 'Codeforces', color: '#1F8ACB' },
}

export const AC_STATUS = 12

export const DIFFICULTY_META: Record<number, { name: string; color: string }> = {
  0: { name: '暂无评定', color: '#BFBFBF' },
  1: { name: '入门', color: '#FE4C61' },
  2: { name: '普及−', color: '#F39C11' },
  3: { name: '普及', color: '#FFC116' },
  4: { name: '普及+/提高−', color: '#52C41A' },
  5: { name: '提高', color: '#13C2C2' },
  6: { name: '提高+/省选−', color: '#3498DB' },
  7: { name: '省选/NOI−', color: '#9D3DCF' },
  8: { name: 'NOI/NOI+/CTS', color: '#0E1D69' },
}

export const STATUS_TEXT: Record<number, string> = {
  0: '等待评测',
  1: '正在评测',
  2: '编译错误',
  3: '运行错误',
  4: '时间超限',
  5: '内存超限',
  6: '输出超限',
  7: '答案错误',
  8: '通过',
  9: '系统错误',
  10: '部分正确',
  11: '系统错误',
  12: '通过',
  13: '格式错误',
  14: '未通过',
}

const LANGUAGE_TEXT: Record<number, string> = {
  0: 'Pascal',
  1: 'C',
  2: 'C++ (C++98)',
  3: 'C++',
  4: 'C++11',
  5: 'C++14',
  6: 'Java 8',
  7: 'Python 2',
  8: 'Go',
  9: 'Rust',
  10: 'Python 3',
  11: 'C#',
  12: 'C++14',
  13: 'C++17',
  14: 'Haskell',
  15: 'Kotlin',
  16: 'Python 3',
  17: 'PyPy 3',
  18: 'Ruby',
  19: 'Rust',
  20: 'Scala',
  21: 'Shell',
  22: 'JavaScript',
  23: 'VB.NET',
  24: 'Vim',
  25: 'JavaScript (内置)',
  26: 'Zig',
  27: 'C# (.NET)',
  28: 'C++20',
  29: 'C (旧版)',
  30: 'C++ (旧版)',
  31: 'C (新版)',
  32: 'C++ (新版)',
  33: 'Python 3 (新版)',
  34: 'Python 2 (旧版)',
  35: 'C++ (比赛)',
  36: 'Java 17',
  37: 'C++23',
}

export function languageName(code: number): string {
  return LANGUAGE_TEXT[code] ?? `Lang ${code}`
}

export function statusText(status: number): string {
  return STATUS_TEXT[status] ?? `状态 ${status}`
}

export function difficultyMeta(d: number): { name: string; color: string } {
  return DIFFICULTY_META[d] ?? { name: '未知', color: '#596253' }
}

/** Unix 秒 -> 本地时间 YYYY-MM-DD HH:mm */
export function formatDateTime(unixSec: number): string {
  if (!unixSec) return '—'
  const d = new Date(unixSec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** ISO 字符串 -> 本地时间 YYYY-MM-DD HH:mm */
export function formatIso(iso: string | null): string {
  if (!iso) return '从未同步'
  return formatDateTime(Math.floor(new Date(iso).getTime() / 1000))
}

/** 内存 KB -> MB 展示 */
export function formatMemory(kb: number): string {
  if (!kb) return '—'
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/** 耗时 ms 展示 */
export function formatTime(ms: number): string {
  if (!ms) return '—'
  if (ms >= 10000) return `${(ms / 1000).toFixed(2)} s`
  return `${ms} ms`
}

// ---- 接口类型 ----

export interface Submission {
  platform: Platform
  id: number
  pid: string
  title: string
  difficulty: number
  difficultyLabel?: string
  status: number
  score: number
  language: number
  time: number
  memory: number
  submitTime: number
}

export interface LuoguProfile {
  uid: number
  name: string
  avatar: string
  slogan: string
  color: string
  badge: string | null
}

export interface ConfigResponse {
  config: {
    luogu: { uid: string; clientId: string; lastSyncAt: string | null }
    atcoder: { handle: string; lastSyncAt: string | null }
    codeforces: { handle: string; lastSyncAt: string | null }
  }
  profile: LuoguProfile | null
  byPlatform: Record<Platform, { submissions: number; problems: number }>
  totalSubmissions: number
  totalProblems: number
  // 兼容旧字段（Settings 页用到）
  luogu: {
    uid: string | null
    clientIdSet: boolean
    clientIdMasked: string | null
    lastSyncAt: string | null
  }
}

export interface StatsResponse {
  totals: {
    submissions: number
    accepted: number
    acRate: number
    solvedProblems: number
  }
  heatmap: { date: string; count: number }[]
  trend: {
    day: { key: string; count: number }[]
    week: { key: string; count: number }[]
    month: { key: string; count: number }[]
  }
  difficultyTrend: {
    day: { key: string; count: number; byDifficulty: number[] }[]
    week: { key: string; count: number; byDifficulty: number[] }[]
    month: { key: string; count: number; byDifficulty: number[] }[]
  }
  difficulty: { difficulty: number; solved: number; submissions: number }[]
  languages: { language: number; name: string; count: number }[]
  streak: {
    current: number
    longest: number
    bestDay: { date: string; count: number } | null
    lastAcAt: number | null
  }
}
