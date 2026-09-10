/**
 * Codeforces 提交记录抓取
 * - 官方 API：https://codeforces.com/api/user.status?handle={handle}
 * - 一次返回全部，不需要 cookie / 分页
 * - 无难度标签（按需求暂时记为 0 暂无评定）
 */
import { upsertSubmission, type Platform, type Submission } from './store.js'

const AC_VERDICTS = new Set(['OK'])
const VERDICT_MAP: Record<string, number> = {
  OK: 12,
  WRONG_ANSWER: 7,
  TIME_LIMIT_EXCEEDED: 4,
  MEMORY_LIMIT_EXCEEDED: 5,
  RUNTIME_ERROR: 3,
  COMPILATION_ERROR: 2,
  PRESENTATION_ERROR: 7, // CF 没有 PE，通常算 WA
  FAILED: 14,
  PARTIAL: 10,
}

const LANGUAGE_MAP: Record<string, number> = {
  'C': 1,
  'C++': 3,
  'C++11': 4,
  'C++14': 12,
  'C++17': 13,
  'C++20': 28,
  'C++23': 37,
  'Java': 6,
  'Java 8': 6,
  'Java 17': 36,
  'Python': 10,
  'Python 3': 10,
  'PyPy': 17,
  'PyPy 3': 17,
  'Go': 8,
  'Rust': 9,
  'Haskell': 14,
  'Kotlin': 15,
  'Ruby': 18,
  'Scala': 20,
  'JavaScript': 22,
}

function mapLanguage(name: string): number {
  const lower = name.toLowerCase()
  for (const [key, code] of Object.entries(LANGUAGE_MAP)) {
    if (lower.includes(key.toLowerCase())) return code
  }
  return 0 // Unknown
}

function mapVerdict(v: string): number {
  return VERDICT_MAP[v] ?? 14
}

export interface CFSubmissionRaw {
  id: number
  contestId: number
  creationTimeSeconds: number
  relativeTimeSeconds?: number
  problem: {
    contestId: number
    index: string
    name: string
    type: string
    points?: number
    rating?: number
    tags?: string[]
  }
  programmingLanguage: string
  verdict?: string
  testset?: string
  passedTestCount: number
  timeConsumedMillis: number
  memoryConsumedBytes: number
}

export async function fetchCodeforcesSubmissions(handle: string): Promise<{ added: number; total: number }> {
  const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Codeforces API ${res.status}: ${res.statusText}`)
  }
  const json = (await res.json()) as { status: string; result: CFSubmissionRaw[]; comment?: string }
  if (json.status !== 'OK') {
    throw new Error(json.comment ?? 'Codeforces API 错误')
  }

  let added = 0
  const platform: Platform = 'codeforces'

  for (const raw of json.result) {
    const pid = `CF${raw.contestId}${raw.problem.index}`
    const sub: Submission = {
      platform,
      id: raw.id,
      pid,
      title: raw.problem.name,
      difficulty: 0, // 暂无评定
      status: mapVerdict(raw.verdict ?? ''),
      score: AC_VERDICTS.has(raw.verdict ?? '') ? 100 : 0,
      language: mapLanguage(raw.programmingLanguage),
      time: raw.timeConsumedMillis,
      memory: Math.round(raw.memoryConsumedBytes / 1024),
      submitTime: raw.creationTimeSeconds,
    }
    if (upsertSubmission(sub)) added++
  }

  return { added, total: json.result.length }
}
