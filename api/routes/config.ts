/**
 * 配置相关路由
 * - GET    /api/config              获取所有平台配置
 * - PUT    /api/config/luogu        保存洛谷 UID / client_id
 * - PUT    /api/config/atcoder      保存 AtCoder handle
 * - PUT    /api/config/codeforces   保存 Codeforces handle
 * - DELETE /api/data                清空全部提交记录（保留凭证）
 * - DELETE /api/data/:platform      清空指定平台的提交记录
 * - POST   /api/test/luogu          测试洛谷凭证
 */
import { Router, type Request, type Response } from 'express'
import { fetchUser, sanitizeClientId } from '../luogu.js'
import {
  loadStore,
  setLuoguConfig,
  setHandle,
  setProfile,
  clearAllSubmissions,
  clearPlatformSubmissions,
  maskSecret,
  type LuoguProfile,
  type Platform,
  PLATFORMS,
} from '../store.js'

const router = Router()

/** 判断是否为排除的洛谷题目（T/U 模板/工具题，非官方） */
function isOfficialLuoguPid(pid: string): boolean {
  return !/^[TU]\d+$/i.test(pid)
}

/** 过滤掉洛谷 T/U 题的 submissions — 所有统计/展示用 */
function filterOfficial<T extends { platform: string; pid: string }>(items: T[]): T[] {
  return items.filter((s) => s.platform !== 'luogu' || isOfficialLuoguPid(s.pid))
}

router.get('/', (_req: Request, res: Response) => {
  const data = loadStore()
  // 统计时排除洛谷 T/U 模板题
  const officialSubs = filterOfficial(data.submissions)
  const solvedSet = new Set(officialSubs.filter((s) => s.status === 12).map((s) => `${s.platform}:${s.pid}`))
  // 按平台聚合
  const byPlatform: Record<Platform, { submissions: number; problems: number }> = {
    luogu: { submissions: 0, problems: 0 },
    atcoder: { submissions: 0, problems: 0 },
    codeforces: { submissions: 0, problems: 0 },
  }
  const acPids: Record<string, Set<string>> = {}
  for (const s of officialSubs) {
    byPlatform[s.platform].submissions++
    const key = `${s.platform}:${s.pid}`
    if (s.status === 12) {
      if (!acPids[s.platform]) acPids[s.platform] = new Set()
      acPids[s.platform].add(s.pid)
    }
  }
  for (const p of PLATFORMS) byPlatform[p].problems = acPids[p]?.size ?? 0

  res.json({
    config: data.config,
    profile: data.profile,
    byPlatform,
    totalSubmissions: officialSubs.length,
    totalProblems: solvedSet.size,
    // 兼容旧前端字段
    luogu: {
      uid: data.config.luogu.uid || null,
      clientIdSet: Boolean(data.config.luogu.clientId),
      clientIdMasked: maskSecret(data.config.luogu.clientId),
      lastSyncAt: data.config.luogu.lastSyncAt,
    },
  })
})

router.put('/luogu', (req: Request, res: Response) => {
  const uid = String(req.body?.uid ?? '').trim()
  const clientId = sanitizeClientId(String(req.body?.clientId ?? ''))
  if (!/^\d+$/.test(uid)) {
    res.status(400).json({ ok: false, error: 'UID 应为纯数字' })
    return
  }
  if (!clientId) {
    res.status(400).json({ ok: false, error: 'client_id 不能为空' })
    return
  }
  setLuoguConfig(uid, clientId)
  res.json({ ok: true })
})

router.put('/atcoder', (req: Request, res: Response) => {
  const handle = String(req.body?.handle ?? '').trim()
  if (!handle) {
    res.status(400).json({ ok: false, error: 'handle 不能为空' })
    return
  }
  setHandle('atcoder', handle)
  res.json({ ok: true })
})

router.put('/codeforces', (req: Request, res: Response) => {
  const handle = String(req.body?.handle ?? '').trim()
  if (!handle) {
    res.status(400).json({ ok: false, error: 'handle 不能为空' })
    return
  }
  setHandle('codeforces', handle)
  res.json({ ok: true })
})

router.post('/test/luogu', async (req: Request, res: Response): Promise<void> => {
  const data = loadStore()
  const uid = String(req.body?.uid || data.config.luogu.uid || '').trim()
  const clientId = sanitizeClientId(String(req.body?.clientId || data.config.luogu.clientId || ''))
  if (!/^\d+$/.test(uid) || !clientId) {
    res.status(400).json({ ok: false, error: '请先填写有效的 UID 与 client_id' })
    return
  }
  try {
    const profile: LuoguProfile = await fetchUser(uid, clientId)
    setLuoguConfig(uid, clientId)
    setProfile(profile)
    res.json({ ok: true, profile })
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message })
  }
})

router.delete('/data', (_req: Request, res: Response) => {
  const removed = clearAllSubmissions()
  res.json({ ok: true, removed })
})

router.delete('/data/:platform', (req: Request, res: Response) => {
  const platform = req.params.platform as Platform
  if (!PLATFORMS.includes(platform)) {
    res.status(400).json({ ok: false, error: '未知平台' })
    return
  }
  const removed = clearPlatformSubmissions(platform)
  res.json({ ok: true, platform, removed })
})

export default router
