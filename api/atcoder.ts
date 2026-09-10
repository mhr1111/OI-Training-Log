/**
 * AtCoder 提交记录抓取
 * - 使用 AtCoder Problems 非官方 API（kenkoooo.com）
 *   https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user={handle}&from_second={ts}
 * - 题目名称单独从 https://kenkoooo.com/atcoder/resources/problems.json 拉取
 *   （submission API 只返回 problem_id，不带标题）
 * - API 单次最多返回 500 条，分页策略：
 *   1. 调 API 拿 >= fromSecond 的记录
 *   2. 若本页条数 == 500，用最后一条 epoch_second + 1 继续请求
 *   3. 若本页条数 < 500，说明到底，退出
 *   4. 上限保护：最多 200 页，防止死循环
 * - 难度暂时记为 0（暂无评定）
 */
import { upsertSubmission, type Platform, type Submission } from './store.js'

const API_URL = 'https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions'
const PROBLEMS_URL = 'https://kenkoooo.com/atcoder/resources/problems.json'
const PAGE_SIZE = 500 // AtCoder Problems API 硬上限
const MAX_PAGES = 200 // 安全保护
const PAGE_DELAY_MS = 150 // 礼貌限速

/** 进程内缓存（problems.json 约 17KB，基本不变） */
let problemsCache: Map<string, string> | null = null
let problemsPromise: Promise<Map<string, string>> | null = null

interface ACProblemRaw {
  id: string
  contest_id: string
  problem_index: string
  /** 纯净题目名，如 "A+BB" / "Forbidden Integer" / "素因数分解" */
  name: string
  /** 带序号前缀的完整标题，如 "A. A+BB" */
  title: string
}

async function getProblemMap(): Promise<Map<string, string>> {
  if (problemsCache) return problemsCache
  if (problemsPromise) return problemsPromise
  problemsPromise = (async () => {
    try {
      const res = await fetch(PROBLEMS_URL, {
        headers: { Accept: 'application/json', 'User-Agent': 'OI-Dashboard/1.0' },
      })
      if (!res.ok) throw new Error(`problems.json ${res.status}`)
      const list = (await res.json()) as ACProblemRaw[]
      const m = new Map<string, string>()
      for (const p of list) m.set(p.id.toLowerCase(), p.name)
      problemsCache = m
      return m
    } catch (err) {
      console.warn('[atcoder] 拉取 problems.json 失败，将使用 pid 作为标题:', (err as Error).message)
      problemsCache = new Map()
      return problemsCache
    } finally {
      problemsPromise = null
    }
  })()
  return problemsPromise
}

const RESULT_MAP: Record<string, number> = {
  AC: 12,
  WA: 7,
  TLE: 4,
  MLE: 5,
  RE: 3,
  CE: 2,
  OLE: 7,
  IE: 9,
  Pending: 14,
  'Partial AC': 10,
}

const LANGUAGE_MAP: Record<string, number> = {
  'C++': 3,
  'C++14': 12,
  'C++17': 13,
  'C++20': 28,
  'C++23': 37,
  'C': 1,
  'C#': 11,
  'Java': 6,
  'Python': 10,
  'Python3': 10,
  'PyPy': 17,
  'PyPy3': 17,
  'Go': 8,
  'Rust': 9,
  'Kotlin': 15,
  'Ruby': 18,
  'Haskell': 14,
  'JavaScript': 22,
  'OCaml': 0,
  'Bash': 21,
  'D': 0,
  'Pascal': 0,
  'Fortran': 0,
  'Scheme': 0,
  'Scala': 20,
}

function mapLanguage(name: string): number {
  const lower = name.toLowerCase()
  for (const [key, code] of Object.entries(LANGUAGE_MAP)) {
    if (lower.includes(key.toLowerCase())) return code
  }
  return 0
}

function mapResult(r: string): number {
  return RESULT_MAP[r] ?? 14
}

interface ACSubmissionRaw {
  id: number
  epoch_second: number
  problem_id: string
  contest_id: string
  user_id: string
  language: string
  point: number
  length: number
  result: string
  execution_time?: number
}

export interface FetchPageResult {
  page: number
  pageCount: number
  pageAdded: number
  lastEpoch: number
}

export async function fetchAtCoderSubmissions(
  handle: string,
  fromSecond = 0,
  onPage?: (info: FetchPageResult) => void,
  signal?: AbortSignal,
): Promise<{ added: number; total: number; pages: number }> {
  const platform: Platform = 'atcoder'
  let added = 0
  let total = 0
  let pages = 0
  let cursor = fromSecond

  // 拉一次 problems.json，拿到 pid -> 标题映射（模块级缓存，后续不会再拉）
  const problemMap = await getProblemMap()

  while (pages < MAX_PAGES) {
    if (signal?.aborted) break
    pages++
    const url = `${API_URL}?user=${encodeURIComponent(handle)}&from_second=${cursor}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'OI-Dashboard/1.0',
        Accept: 'application/json',
      },
      signal,
    })
    if (!res.ok) {
      if (signal?.aborted) break
      throw new Error(`AtCoder API ${res.status}: ${res.statusText}`)
    }
    const list = (await res.json()) as ACSubmissionRaw[]
    if (!Array.isArray(list)) {
      throw new Error('AtCoder API 返回格式异常')
    }

    let pageAdded = 0
    let lastEpoch = cursor
    for (const raw of list) {
      const pid = raw.problem_id.toUpperCase()
      const status = mapResult(raw.result)
      const title = problemMap.get(raw.problem_id.toLowerCase()) ?? pid
      const sub: Submission = {
        platform,
        id: raw.id,
        pid,
        title,
        difficulty: 0,
        status,
        score: status === 12 ? Math.round(raw.point) || 100 : 0,
        language: mapLanguage(raw.language),
        time: raw.execution_time ?? 0,
        memory: 0,
        submitTime: raw.epoch_second,
      }
      if (upsertSubmission(sub)) pageAdded++
      if (raw.epoch_second > lastEpoch) lastEpoch = raw.epoch_second
    }

    total += list.length
    added += pageAdded

    onPage?.({ page: pages, pageCount: list.length, pageAdded, lastEpoch })

    // 确定性信号：本页数量 < PAGE_SIZE 说明已经到末尾
    if (list.length < PAGE_SIZE) break

    // 用最后一条时间作为下一页起点（from_second 是 >= 边界），同秒的剩余记录会在下一页返回
    // upsertSubmission 会按 id 去重，所以重复 1 条无影响
    cursor = lastEpoch

    // 礼貌限速（第 2 页起）
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS))
  }

  return { added, total, pages }
}
