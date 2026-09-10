/**
 * 提交记录查询路由
 * GET /api/submissions?page=&pageSize=&status=&difficulty=&keyword=&platform=
 */
import { Router, type Request, type Response } from 'express'
import { loadStore, type Platform, PLATFORMS } from '../store.js'
import { STATUS_AC, actualDifficulty } from '../luogu.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  const data = loadStore()

  const statusFilter = String(req.query.status ?? 'all')
  const difficultyFilter = String(req.query.difficulty ?? 'all')
  const keyword = String(req.query.keyword ?? '').trim().toLowerCase()
  const platformFilter = String(req.query.platform ?? 'all')
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20))

  let items = data.submissions.filter((s) => s.platform !== 'luogu' || !/^[TU]\d+$/i.test(s.pid))

  // 平台筛选
  if (platformFilter !== 'all' && PLATFORMS.includes(platformFilter as Platform)) {
    items = items.filter((s) => s.platform === (platformFilter as Platform))
  }

  if (statusFilter === 'ac') items = items.filter((s) => s.status === STATUS_AC)
  else if (statusFilter === 'nac') items = items.filter((s) => s.status !== STATUS_AC)

  if (difficultyFilter !== 'all') {
    const d = parseInt(difficultyFilter, 10)
    if (!Number.isNaN(d)) items = items.filter((s) => actualDifficulty(s) === d)
  }

  if (keyword) {
    items = items.filter(
      (s) => s.pid.toLowerCase().includes(keyword) || s.title.toLowerCase().includes(keyword),
    )
  }

  // 按平台+时间排序（防止不同平台相同 id 乱序）
  items.sort((a, b) => b.submitTime - a.submitTime || (a.platform + '-' + a.id).localeCompare(b.platform + '-' + b.id))

  const total = items.length
  const start = (page - 1) * pageSize
  const paged = items.slice(start, start + pageSize).map((s) => ({
    ...s,
    difficulty: actualDifficulty(s),
  }))

  res.json({ items: paged, total, page, pageSize })
})

export default router
