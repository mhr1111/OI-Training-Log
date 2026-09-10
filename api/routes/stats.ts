/**
 * 数据汇总路由
 * GET /api/stats —— 指标卡 / 热力图 / 天周月趋势 / 难度分布 / 语言分布 / 连续打卡
 */
import { Router, type Request, type Response } from 'express'
import { loadStore, type Submission, type Platform, PLATFORMS } from '../store.js'
import { STATUS_AC, languageName, DIFFICULTY_META, actualDifficulty } from '../luogu.js'

const router = Router()

/** 本地时区日期键 YYYY-MM-DD */
function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

/** 周一为一周起点 */
function mondayOf(d: Date): Date {
  const day = d.getDay() // 0=周日 ... 6=周六
  const offset = day === 0 ? -6 : 1 - day
  return startOfDay(addDays(d, offset))
}

interface DayCount {
  date: string
  count: number
}

function buildAcDayMap(subs: Submission[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of subs) {
    if (s.status !== STATUS_AC || !s.submitTime) continue
    const key = dateKey(new Date(s.submitTime * 1000))
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

/** 每天 -> 各难度 AC 数量（用 actualDifficulty 含 T/U 排除） */
function buildAcDayDifficultyMap(subs: Submission[]): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const s of subs) {
    if (s.status !== STATUS_AC || !s.submitTime) continue
    const key = dateKey(new Date(s.submitTime * 1000))
    const diff = actualDifficulty(s)
    let bucket = map.get(key)
    if (!bucket) {
      bucket = new Array(9).fill(0)
      map.set(key, bucket)
    }
    if (diff >= 0 && diff <= 8) bucket[diff]++
  }
  return map
}

/** 聚合一批天桶 -> 单桶（9 格求和） */
function sumBuckets(buckets: (number[] | undefined)[]): number[] {
  const out = new Array(9).fill(0)
  for (const b of buckets) {
    if (!b) continue
    for (let i = 0; i < 9; i++) out[i] += b[i]
  }
  return out
}

function rangeDays(end: Date, count: number): DayCount[] {
  const out: DayCount[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = addDays(end, -i)
    out.push({ date: dateKey(d), count: 0 })
  }
  return out
}

router.get('/', (req: Request, res: Response) => {
  const data = loadStore()

  // ---- 1. 解析筛选参数 ----
  // platforms: 逗号分隔，缺省 = 全部平台
  let platforms: Platform[] = PLATFORMS
  const platformsQuery = String(req.query.platforms ?? '')
  if (platformsQuery.trim()) {
    const parsed = platformsQuery.split(',').map((s) => s.trim() as Platform)
    const ok = parsed.filter((p) => PLATFORMS.includes(p))
    if (ok.length) platforms = ok
  }

  // difficulties: 逗号分隔 0-8，缺省 = 全部 9 个难度
  let difficulties: Set<number> | null = null
  const diffQuery = String(req.query.difficulties ?? '')
  if (diffQuery.trim()) {
    difficulties = new Set(
      diffQuery
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 8),
    )
    if (difficulties.size === 0) difficulties = null
  }

  // ---- 2. 过滤 subs ----
  // 基础：luogu T/U 题排除（模板题）
  let subs = data.submissions.filter((s) => s.platform !== 'luogu' || !/^[TU]\d+$/i.test(s.pid))
  // 平台多选
  subs = subs.filter((s) => platforms.includes(s.platform))
  // 难度多选（只要 actualDifficulty 在白名单内就保留）
  if (difficulties) {
    subs = subs.filter((s) => {
      const d = actualDifficulty(s)
      return difficulties!.has(d)
    })
  }
  const acSubs = subs.filter((s) => s.status === STATUS_AC)
  const acDayMap = buildAcDayMap(subs)
  const acDayDiffMap = buildAcDayDifficultyMap(subs)

  // ---- 核心指标 ----
  const solvedSet = new Set(acSubs.map((s) => `${s.platform}:${s.pid}`))
  const totals = {
    submissions: subs.length,
    accepted: acSubs.length,
    acRate: subs.length ? acSubs.length / subs.length : 0,
    solvedProblems: solvedSet.size,
  }

  // ---- 热力图：近 371 天（53 周）----
  const today = startOfDay(new Date())
  const heatStart = addDays(mondayOf(today), -7 * 52)
  const heatmap: DayCount[] = []
  for (let d = heatStart; d <= today; d = addDays(d, 1)) {
    const key = dateKey(d)
    heatmap.push({ date: key, count: acDayMap.get(key) ?? 0 })
  }

  // ---- 趋势：天（180 天）/ 周（52 周）/ 月（24 个月）----
  const dayTrend = rangeDays(today, 180).map((d) => ({
    key: d.date,
    count: acDayMap.get(d.date) ?? 0,
  }))

  const weekTrend: { key: string; count: number }[] = []
  const thisMonday = mondayOf(today)
  for (let w = 51; w >= 0; w--) {
    const mon = addDays(thisMonday, -7 * w)
    let count = 0
    for (let i = 0; i < 7; i++) {
      count += acDayMap.get(dateKey(addDays(mon, i))) ?? 0
    }
    weekTrend.push({ key: dateKey(mon), count })
  }

  const monthTrend: { key: string; count: number }[] = []
  const now = new Date()
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let count = 0
    for (const [dateStr, c] of acDayMap) {
      if (dateStr.startsWith(key)) count += c
    }
    monthTrend.push({ key, count })
  }

  // ---- 难度构成趋势（天/周/月，每桶 9 格 = difficulty 0..8 的 AC 数量）----
  const dayTrendDifficulty = rangeDays(today, 180).map((d) => ({
    key: d.date,
    count: acDayMap.get(d.date) ?? 0,
    byDifficulty: acDayDiffMap.get(d.date) ?? new Array(9).fill(0),
  }))

  const weekTrendDifficulty: { key: string; count: number; byDifficulty: number[] }[] = []
  for (let w = 51; w >= 0; w--) {
    const mon = addDays(thisMonday, -7 * w)
    const buckets: (number[] | undefined)[] = []
    let count = 0
    for (let i = 0; i < 7; i++) {
      const k = dateKey(addDays(mon, i))
      count += acDayMap.get(k) ?? 0
      buckets.push(acDayDiffMap.get(k))
    }
    weekTrendDifficulty.push({ key: dateKey(mon), count, byDifficulty: sumBuckets(buckets) })
  }

  const monthTrendDifficulty: { key: string; count: number; byDifficulty: number[] }[] = []
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const buckets: (number[] | undefined)[] = []
    let count = 0
    for (const [dateStr, c] of acDayMap) {
      if (dateStr.startsWith(key)) {
        count += c
        buckets.push(acDayDiffMap.get(dateStr))
      }
    }
    monthTrendDifficulty.push({ key, count, byDifficulty: sumBuckets(buckets) })
  }

  // ---- 难度分布 ----
  // 同一 (platform, pid) 多次提交只算一次
  const pidFirst = new Map<string, Submission>()
  for (const s of subs) {
    const key = `${s.platform}:${s.pid}`
    if (!pidFirst.has(key)) pidFirst.set(key, s)
  }
  const uniqueByPid = [...pidFirst.values()]

  const difficulty = Array.from({ length: 9 }, (_, dIdx) => {
    const inDiff = uniqueByPid.filter((s) => actualDifficulty(s) === dIdx)
    const solved = new Set(
      subs.filter((s) => actualDifficulty(s) === dIdx && s.status === STATUS_AC).map((s) => `${s.platform}:${s.pid}`),
    ).size
    return { difficulty: dIdx, solved, submissions: inDiff.length }
  })

  // ---- 语言分布 ----
  const langMap = new Map<number, number>()
  for (const s of subs) {
    langMap.set(s.language, (langMap.get(s.language) ?? 0) + 1)
  }
  const languages = [...langMap.entries()]
    .map(([language, count]) => ({ language, name: languageName(language), count }))
    .sort((a, b) => b.count - a.count)

  // ---- 连续打卡 / 最佳单日 ----
  const acDays = [...acDayMap.entries()]
    .filter(([, c]) => c > 0)
    .map(([d]) => d)
    .sort()
  const acDaySet = new Set(acDays)

  let longest = 0
  let run = 0
  let prev: Date | null = null
  for (const key of acDays) {
    const d = new Date(key + 'T00:00:00')
    if (prev && Math.round((d.getTime() - prev.getTime()) / 86400000) === 1) {
      run += 1
    } else {
      run = 1
    }
    longest = Math.max(longest, run)
    prev = d
  }

  let current = 0
  let cursor = acDaySet.has(dateKey(today)) ? today : addDays(today, -1)
  while (acDaySet.has(dateKey(cursor))) {
    current += 1
    cursor = addDays(cursor, -1)
  }

  let bestDay: { date: string; count: number } | null = null
  for (const [date, count] of acDayMap) {
    if (count > 0 && (!bestDay || count > bestDay.count)) {
      bestDay = { date, count }
    }
  }

  const lastAcAt = acSubs.reduce((max, s) => Math.max(max, s.submitTime), 0) || null

  res.json({
    totals,
    heatmap,
    trend: { day: dayTrend, week: weekTrend, month: monthTrend },
    difficultyTrend: {
      day: dayTrendDifficulty,
      week: weekTrendDifficulty,
      month: monthTrendDifficulty,
    },
    difficulty,
    languages,
    streak: { current, longest, bestDay, lastAcAt },
  })
})

export default router
