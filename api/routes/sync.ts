/**
 * 同步路由（多平台）
 * POST /api/sync/luogu         ->  SSE
 * POST /api/sync/codeforces    ->  SSE
 * POST /api/sync/atcoder       ->  SSE
 *
 * Luogu 需要 cookie，其他两个平台公开无认证。
 */
import { Router, type Request, type Response } from 'express'
import { fetchRecordPage, fetchUser, fetchProblemDifficulty, sanitizeClientId, sleep, STATUS_AC, DIFFICULTY_META } from '../luogu.js'
import { fetchCodeforcesSubmissions } from '../codeforces.js'
import { fetchAtCoderSubmissions } from '../atcoder.js'
import { syncDifficulties, toLuoguPid } from '../difficulty.js'
import {
  loadStore,
  upsertSubmission,
  saveStore,
  setLuoguConfig,
  setHandle,
  setProfile,
  markPlatformSynced,
  type Submission,
  type Platform,
} from '../store.js'

const router = Router()
const MAX_PAGES = 400
const PAGE_DELAY_MS = 200

type SyncEvent =
  | { type: 'log'; level: 'info' | 'success' | 'warn' | 'error'; message: string }
  | { type: 'progress'; page: number; fetched: number; added: number }
  | { type: 'done'; total: number; added: number; lastSyncAt: string }
  | { type: 'error'; error: string }

interface EnrichResult {
  total: number
  totalPids: number
  onlineToFetch: number
  onlineFetched: number
  onlineFailed: number
}

/**
 * 给洛谷 submissions 补 difficultyLabel：
 * - store.difficulty 0-5：离线直接填（映射一致）
 * - store.difficulty >= 6：抓题目详情页拿 problem list 精确难度
 * - 已填 label 的跳过（幂等）
 */
async function enrichDifficultyLabels(
  uid: string,
  clientId: string,
  log: (level: 'info' | 'success' | 'warn' | 'error', msg: string) => void,
  signal?: AbortSignal,
): Promise<EnrichResult> {
  const store = loadStore()
  const subs = store.submissions.filter((s) => s.platform === 'luogu')
  if (subs.length === 0) return { total: 0, totalPids: 0, onlineToFetch: 0, onlineFetched: 0, onlineFailed: 0 }

  const pidDifficulty = new Map<string, number>()
  for (const s of subs) if (!pidDifficulty.has(s.pid)) pidDifficulty.set(s.pid, s.difficulty)

  const offlinePids: string[] = []
  const onlinePids: string[] = []
  for (const [pid, d] of pidDifficulty) {
    if (d >= 6) onlinePids.push(pid)
    else offlinePids.push(pid)
  }

  let patched = 0

  for (const pid of offlinePids) {
    const d = pidDifficulty.get(pid) ?? 0
    const label = DIFFICULTY_META[d]?.name
    if (!label) continue
    for (const s of subs) {
      if (s.pid === pid && !s.difficultyLabel) {
        s.difficultyLabel = label
        patched++
      }
    }
  }

  const pidMeta = new Map<string, { idx: number; label: string }>()
  let fetched = 0
  let failed = 0
  log(
    'info',
    `正在精确化难度标签：${offlinePids.length} 题离线直填，${onlinePids.length} 题需抓取详情页…`,
  )

  for (let i = 0; i < onlinePids.length; i++) {
    if (signal?.aborted) break
    const pid = onlinePids[i]
    const alreadyDone = subs.find((s) => s.pid === pid && s.difficultyLabel)
    if (alreadyDone) {
      const meta = Object.values(DIFFICULTY_META).find((m) => m.name === alreadyDone.difficultyLabel)
      if (meta) {
        fetched++
        continue
      }
    }
    const meta = await fetchProblemDifficulty(pid, clientId, uid)
    if (meta) {
      pidMeta.set(pid, { idx: meta.difficultyIndex, label: meta.label })
      fetched++
      if ((i + 1) % 50 === 0 || i + 1 === onlinePids.length) {
        log('info', `  难度抓取进度 ${i + 1}/${onlinePids.length}（ok=${fetched} fail=${failed}）`)
      }
    } else {
      failed++
    }
    if (i + 1 < onlinePids.length) await sleep(550)
  }

  for (const pid of onlinePids) {
    const meta = pidMeta.get(pid)
    if (!meta) continue
    for (const s of subs) {
      if (s.pid === pid && s.difficultyLabel !== meta.label) {
        s.difficultyLabel = meta.label
        patched++
      }
    }
  }

  return {
    total: patched,
    totalPids: offlinePids.length + onlinePids.length,
    onlineToFetch: onlinePids.length,
    onlineFetched: fetched,
    onlineFailed: failed,
  }
}

function makeSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  // 客户端断开时置位 —— 所有 handler 循环每轮检查这个 signal，处理完当前批次后优雅退出
  const ctrl = new AbortController()
  res.on('close', () => ctrl.abort())

  const send = (event: SyncEvent): void => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
      // @ts-expect-error flush 在 compression 等中间件下存在
      res.flush?.()
    } catch {
      /* 连接已关，忽略 */
    }
  }
  return {
    send,
    signal: ctrl.signal,
    log: (level: 'info' | 'success' | 'warn' | 'error', message: string) => send({ type: 'log', level, message }),
  }
}

// ===================================================================
//  Luogu sync
// ===================================================================

router.post('/luogu', async (req: Request, res: Response): Promise<void> => {
  const { send, log, signal } = makeSSE(res)

  try {
    const data = loadStore()
    const uid = String(req.body?.uid || data.config.luogu.uid || '').trim()
    const clientId = sanitizeClientId(String(req.body?.clientId || data.config.luogu.clientId || ''))
    if (!/^\d+$/.test(uid) || !clientId) {
      send({ type: 'error', error: '未配置有效的 UID / client_id，请先在设置页填写并测试连接' })
      res.end()
      return
    }
    setLuoguConfig(uid, clientId)

    log('info', `$ luogu-sync --uid=${uid}`)
    log('info', '正在校验凭证并获取用户信息…')
    try {
      const profile = await fetchUser(uid, clientId)
      setProfile(profile)
      log('success', `凭证有效，当前用户：${profile.name}（UID ${profile.uid}）`)
    } catch (err) {
      log('warn', `用户信息获取失败：${(err as Error).message}（将继续尝试拉取记录）`)
    }

    let page = 1
    let totalAdded = 0
    let totalFetched = 0
    let hadError = false
    let stopReason = '已拉取全部记录'

    while (page <= MAX_PAGES) {
      if (signal.aborted) {
        stopReason = '用户已终止'
        log('warn', stopReason)
        break
      }

      let pageData
      try {
        pageData = await fetchRecordPage(uid, clientId, page)
      } catch (err) {
        hadError = true
        log('error', `第 ${page} 页拉取失败：${(err as Error).message}`)
        stopReason = '拉取中断'
        break
      }

      const { records, total } = pageData
      if (page === 1) {
        log('info', `洛谷侧共约 ${total} 条提交记录（含非官方题 T/U），本地已有 ${loadStore().submissions.filter(s => s.platform === 'luogu').length} 条`)
      }
      if (records.length === 0) {
        log('info', `第 ${page} 页无数据，同步结束`)
        break
      }

      let added = 0
      let allExisted = true
      for (const rec of records) {
        const isNew = upsertSubmission(rec)
        if (isNew) {
          added += 1
          allExisted = false
        }
      }
      totalAdded += added
      totalFetched += records.length
      markPlatformSynced('luogu')

      const acOnPage = records.filter((r: Submission) => r.status === STATUS_AC).length
      log(
        added > 0 ? 'success' : 'info',
        `第 ${page} 页：获取 ${records.length} 条，新增 ${added} 条（本页 AC ${acOnPage} 条）`,
      )
      send({ type: 'progress', page, fetched: totalFetched, added: totalAdded })

      if (allExisted && page > 1) {
        stopReason = '后续记录均已在本地，增量同步完成'
        break
      }
      if (page * 20 >= total && total > 0) {
        stopReason = '已到达最后一页'
        break
      }

      page += 1
      await sleep(PAGE_DELAY_MS)
    }

    if (page > MAX_PAGES) {
      stopReason = `达到页数上限 ${MAX_PAGES} 页`
      log('warn', stopReason)
    } else if (!hadError) {
      log('success', stopReason)
    }

    // ---- Enrich difficulty ----
    const enriched = await enrichDifficultyLabels(uid, clientId, log, signal)
    if (enriched.total > 0) {
      saveStore()
      log(
        'success',
        `难度精确化完成：${enriched.totalPids} 个唯一题目（抓取 ${enriched.onlineFetched} 个详情页，失败 ${enriched.onlineFailed} 个）`,
      )
    }

    const lastSyncAt = markPlatformSynced('luogu')
    const luoguSubs = loadStore().submissions.filter(s => s.platform === 'luogu')
    const acTotal = luoguSubs.filter((s) => s.status === STATUS_AC).length
    if (totalFetched === 0) {
      log('warn', '未能获取到任何记录，请检查 UID 与 client_id 是否正确后重试。')
    } else {
      log('success', `同步完成：本次新增 ${totalAdded} 条，洛谷本地共 ${luoguSubs.length} 条（AC ${acTotal} 条）`)
    }
    send({ type: 'done', total: luoguSubs.length, added: totalAdded, lastSyncAt })
    res.end()
  } catch (err) {
    send({ type: 'error', error: (err as Error).message })
    log('error', `同步异常：${(err as Error).message}`)
    res.end()
  }
})

// ===================================================================
//  Codeforces sync
// ===================================================================

router.post('/codeforces', async (req: Request, res: Response): Promise<void> => {
  const { send, log } = makeSSE(res)
  try {
    const data = loadStore()
    const handle = String(req.body?.handle || data.config.codeforces.handle || '').trim()
    if (!handle) {
      send({ type: 'error', error: '未配置 Codeforces handle' })
      res.end()
      return
    }
    setHandle('codeforces', handle)

    log('info', `$ codeforces-sync --handle=${handle}`)
    log('info', '正在拉取 Codeforces 提交记录（API 一次性返回全部）…')

    const { added, total } = await fetchCodeforcesSubmissions(handle)
    saveStore()
    markPlatformSynced('codeforces')

    const cfSubs = loadStore().submissions.filter(s => s.platform === 'codeforces')
    const acTotal = cfSubs.filter((s) => s.status === STATUS_AC).length
    log('success', `Codeforces 同步完成：API 返回 ${total} 条，本次新增 ${added} 条（AC ${acTotal} 条）`)
    send({ type: 'done', total: cfSubs.length, added, lastSyncAt: data.config.codeforces.lastSyncAt ?? new Date().toISOString() })
    res.end()
  } catch (err) {
    send({ type: 'error', error: (err as Error).message })
    log('error', `Codeforces 同步异常：${(err as Error).message}`)
    res.end()
  }
})

// ===================================================================
//  AtCoder sync
// ===================================================================

router.post('/atcoder', async (req: Request, res: Response): Promise<void> => {
  const { send, log, signal } = makeSSE(res)
  try {
    const data = loadStore()
    const handle = String(req.body?.handle || data.config.atcoder.handle || '').trim()
    if (!handle) {
      send({ type: 'error', error: '未配置 AtCoder handle' })
      res.end()
      return
    }
    setHandle('atcoder', handle)

    log('info', `$ atcoder-sync --handle=${handle}`)

    // 增量：取已有最新提交时间 - 1s，避免漏边界
    const existing = data.submissions.filter((s) => s.platform === 'atcoder')
    let fromSecond = 0
    if (existing.length > 0) {
      fromSecond = Math.max(0, ...existing.map((s) => s.submitTime)) - 1
      log('info', `增量同步：从 ${new Date(fromSecond * 1000).toISOString()} 开始`)
    } else {
      log('info', '首次同步，抓取全部 AtCoder 提交记录…')
    }

    const { added, total, pages } = await fetchAtCoderSubmissions(handle, fromSecond, ({ page, pageCount, pageAdded, lastEpoch }) => {
      log('info', `  第 ${page} 页：获取 ${pageCount} 条，新增 ${pageAdded} 条（截至 ${new Date(lastEpoch * 1000).toISOString()}）`)
      send({ type: 'progress', page, fetched: pageCount, added: pageAdded })
    }, signal)
    saveStore()
    markPlatformSynced('atcoder')

    const after = loadStore().submissions.filter((s) => s.platform === 'atcoder')
    const acTotal = after.filter((s) => s.status === STATUS_AC).length
    log('success', `AtCoder 同步完成：共 ${pages} 页，本次新增 ${added} 条（共获取 ${total} 条），本地共 ${after.length} 条（AC ${acTotal} 条）`)
    send({ type: 'done', total: after.length, added, lastSyncAt: data.config.atcoder.lastSyncAt ?? new Date().toISOString() })
    res.end()
  } catch (err) {
    send({ type: 'error', error: (err as Error).message })
    log('error', `AtCoder 同步异常：${(err as Error).message}`)
    res.end()
  }
})

// ---------------------------------------------------------------------------
// 难度同步（非洛谷平台的题目 → 拉洛谷 RemoteJudge 评定的难度）
// ---------------------------------------------------------------------------
router.post('/difficulty', async (req: Request, res: Response): Promise<void> => {
  const { send, log, signal } = makeSSE(res)
  try {
    const data = loadStore()

    // 难度同步必须有洛谷凭证（用来访问洛谷题目详情页拿难度）
    const clientId = String(data.config.luogu.clientId || '').trim()
    const uid = String(data.config.luogu.uid || '').trim()
    if (!clientId || !uid) {
      send({ type: 'error', error: '难度同步需要洛谷凭证：请先在设置页配置并保存洛谷 UID + __client_id' })
      res.end()
      return
    }

    // 参数解析
    const body = req.body ?? {}
    const scope = (String(body.scope || 'all') as 'all' | 'single' | 'recent')
    const platformRaw = body.platform
    const platform: Platform | undefined =
      platformRaw === 'atcoder' || platformRaw === 'codeforces' || platformRaw === 'luogu'
        ? platformRaw
        : undefined
    const pid = body.pid ? String(body.pid).trim() : undefined
    const days = Number(body.days ?? 14)

    const platformsLabel = platform ? (platform === 'atcoder' ? 'AtCoder' : platform === 'codeforces' ? 'Codeforces' : '洛谷') : 'AtCoder + Codeforces'
    const scopeLabel = scope === 'all' ? '全部题目' : scope === 'single' ? `单题（${pid}）` : `近 ${days} 天`

    log('info', `$ difficulty-sync --scope=${scope} --platform=${platform ?? 'all'}${scope === 'recent' ? ` --days=${days}` : ''}`)
    log('info', `目标：${platformsLabel} · ${scopeLabel}`)

    const opts = { scope, platform, pid, days, clientId, uid, signal }
    const { updated, upToDate, notFound, uniqueTotal } = await syncDifficulties(opts, ({
      processed, totalUnique, updated: u, upToDate: u2d, notFound: n, currentPid,
    }) => {
      const progress = Math.round((processed / Math.max(totalUnique, 1)) * 100)
      const pct = `${progress}%`
      log('info', `  [${pct}] ${processed}/${totalUnique}  更新 ${u}  已是最新 ${u2d}  未找到 ${n}${currentPid ? `  当前 ${currentPid}` : ''}`)
      send({ type: 'progress', page: processed, fetched: totalUnique, added: u })
    })

    log('success', `难度同步完成：共 ${uniqueTotal} 题，更新 ${updated} 题，已是最新 ${upToDate} 题，未找到有效难度 ${notFound} 题`)
    send({ type: 'done', total: uniqueTotal, added: updated, lastSyncAt: new Date().toISOString() })
    res.end()
  } catch (err) {
    send({ type: 'error', error: (err as Error).message })
    log('error', `难度同步异常：${(err as Error).message}`)
    res.end()
  }
})

export default router
