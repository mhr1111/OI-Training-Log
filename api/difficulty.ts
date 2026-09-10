/**
 * 跨平台题目 → 洛谷 PID 转换 + 难度回填
 *
 * 洛谷 RemoteJudge 收录了大量 CF / AtCoder 题目，格式：
 *   Codeforces:  CF{contestId}{index}        → 直接用，无需转换
 *   AtCoder:     AT_{contest}_{problem}（小写下划线分隔）
 *                我们 store 存的是 ABC360_A，要转 AT_abc360_a
 *
 * 注：不是所有 CF/AC 题目都在洛谷 RemoteJudge 中收录，
 * fetchProblemDifficulty 返回 null 时静默跳过（保留 difficulty=0）。
 */
import { fetchProblemDifficulty, DIFFICULTY_META } from './luogu.js'
import { loadStore, saveStore, type Platform, type Submission } from './store.js'
import { sleep } from './luogu.js'

export const DIFFICULTY_SYNC_DELAY_MS = 400 // 礼貌限速，洛谷反爬
export const BATCH_REPORT_INTERVAL = 20     // 每 N 题报告一次进度

/** 将 store 中某平台的 pid 转换成洛谷 problem pid */
export function toLuoguPid(platform: Platform, pid: string): string | null {
  switch (platform) {
    case 'luogu':
      // 洛谷 pid 本身就是洛谷 pid（排除 T/U 模板题 — 调用方已经过滤）
      if (/^P\d+$/i.test(pid)) return pid
      return null
    case 'codeforces':
      // CF2245G → CF2245G，格式一致；支持 CF2258B2（字母+可选数字后缀）
      if (/^CF\d+[A-Za-z]\d*$/.test(pid)) return pid
      return null
    case 'atcoder': {
      // ABC360_A → AT_abc360_a
      // 小写 + AT_ 前缀 + 下划线（原 pid 已经有下划线）
      const lower = pid.toLowerCase()
      // 如果已经是 AT_ 开头，直接返回
      if (lower.startsWith('at_')) return pid
      return `AT_${lower}`
    }
  }
}

export interface DifficultySyncOptions {
  /** all: 所有题；single: 指定 pid；recent: N 天内 */
  scope: 'all' | 'single' | 'recent'
  /** 限定哪个平台，undefined 表示 CF + AC 都做 */
  platform?: Platform
  /** single 时必填 */
  pid?: string
  /** recent 时可选，默认 14 */
  days?: number
  /** 已配置好的洛谷凭证（用于 fetchProblemDifficulty） */
  clientId: string
  uid: string
  /** 可选的中止信号（客户端断开时置位） */
  signal?: AbortSignal
}

export interface DifficultySyncPage {
  processed: number
  totalUnique: number
  updated: number
  upToDate: number
  notFound: number
  currentPid?: string
}

/**
 * 主逻辑：根据 options 选出需要同步难度的 submissions，
 * 去重得到唯一 pid 集合，逐个调用 fetchProblemDifficulty，
 * 成功则回填 store 中所有匹配 submissions 的 difficulty + difficultyLabel。
 *
 * 过程中每处理 BATCH_REPORT_INTERVAL 题调用一次 onProgress，
 * 便于 SSE 推送进度到前端。
 */
export async function syncDifficulties(
  opts: DifficultySyncOptions,
  onProgress?: (info: DifficultySyncPage) => void,
): Promise<{ updated: number; upToDate: number; notFound: number; uniqueTotal: number }> {
  const store = loadStore()

  // 1. 过滤目标 submissions
  const targetPlatforms: Platform[] = opts.platform
    ? [opts.platform]
    : ['luogu', 'atcoder', 'codeforces'] // 默认三个平台都做

  let candidates = store.submissions.filter((s) => targetPlatforms.includes(s.platform))

  // 洛谷平台：排除 T/U 开头的模板/工具题（非官方题）
  candidates = candidates.filter((s) => {
    if (s.platform !== 'luogu') return true
    return !/^[TU]\d+$/i.test(s.pid)
  })

  if (opts.scope === 'single') {
    if (!opts.pid) throw new Error('single 模式需要提供 pid')
    candidates = candidates.filter((s) => s.pid.toUpperCase() === opts.pid!.toUpperCase())
  } else if (opts.scope === 'recent') {
    const days = opts.days ?? 14
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400
    candidates = candidates.filter((s) => s.submitTime >= cutoff)
  }
  // all: 不过滤，用全部

  // 2. 按 platform+pid 去重，得到唯一题目集合
  const uniquePids = new Map<string, { platform: Platform; pid: string; luoguPid: string | null }>()
  for (const s of candidates) {
    const key = `${s.platform}:${s.pid}`
    if (uniquePids.has(key)) continue
    const luoguPid = toLuoguPid(s.platform, s.pid)
    uniquePids.set(key, { platform: s.platform, pid: s.pid, luoguPid })
  }

  // 3. 逐题抓取
  let updated = 0
  let upToDate = 0
  let notFound = 0
  let processed = 0

  const totalUnique = uniquePids.size
  const entries = Array.from(uniquePids.values())

  for (const entry of entries) {
    if (opts.signal?.aborted) break
    processed++

    // pid 无法转成洛谷格式 → 归入未找到
    if (!entry.luoguPid) {
      notFound++
      continue
    }

    const result = await fetchProblemDifficulty(entry.luoguPid, opts.clientId, opts.uid)

    // Luogu 返回 null（页面不存在 / 404） → 未收录
    if (!result) {
      notFound++
      continue
    }

    // Luogu 返回 difficulty=0（暂无评定） → 已收录但未评级
    if (result.difficultyIndex === 0) {
      notFound++
      continue
    }

    // Luogu 给了有效难度，回填所有匹配 submissions
    let changedCount = 0
    for (const s of store.submissions) {
      if (s.platform !== entry.platform || s.pid !== entry.pid) continue
      const newDiff = result.difficultyIndex
      if (s.difficulty !== newDiff || s.difficultyLabel !== result.label) {
        s.difficulty = newDiff
        s.difficultyLabel = result.label
        changedCount++
      }
    }
    if (changedCount > 0) updated++
    else upToDate++

    // 限速 + 进度报告
    if (processed % BATCH_REPORT_INTERVAL === 0 || processed === totalUnique) {
      onProgress?.({
        processed,
        totalUnique,
        updated,
        upToDate,
        notFound,
        currentPid: entry.pid,
      })
    }

    if (processed < totalUnique) {
      await sleep(DIFFICULTY_SYNC_DELAY_MS)
    }
  }

  saveStore()

  return { updated, upToDate, notFound, uniqueTotal: totalUnique }
}

/** 辅助：给前端看的当前 store 里各平台有多少未评定题目 */
export function countUnratedByPlatform(): Record<Platform, { total: number; unrated: number }> {
  const store = loadStore()
  const result: Record<Platform, { total: number; unrated: number }> = {
    luogu: { total: 0, unrated: 0 },
    atcoder: { total: 0, unrated: 0 },
    codeforces: { total: 0, unrated: 0 },
  }
  for (const s of store.submissions) {
    result[s.platform].total++
    if (s.difficulty === 0) result[s.platform].unrated++
  }
  return result
}

export function getDifficultyLabel(idx: number): string {
  return DIFFICULTY_META[idx]?.name ?? '暂无评定'
}

export type { Submission }
