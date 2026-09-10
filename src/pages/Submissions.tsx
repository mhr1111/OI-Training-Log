import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, Inbox, SlidersHorizontal, Globe } from 'lucide-react'
import { getSubmissions } from '@/api/client'
import { useAppStore } from '@/store/useAppStore'
import { DifficultyTag, StatusBadge } from '@/components/Badges'
import {
  DIFFICULTY_META,
  PLATFORMS,
  PLATFORM_META,
  formatDateTime,
  formatMemory,
  formatTime,
  languageName,
  type Platform,
  type Submission,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

function getProblemUrl(s: Submission): string {
  switch (s.platform) {
    case 'luogu':
      return `https://www.luogu.com.cn/problem/${s.pid}`
    case 'codeforces': {
      const m = s.pid.match(/^CF(\d+)([A-Za-z]\d*)$/)
      if (m) return `https://codeforces.com/contest/${m[1]}/problem/${m[2]}`
      return `https://codeforces.com/problemset/problem/?pid=${s.pid}`
    }
    case 'atcoder':
      return `https://atcoder.jp/contests/${s.pid.split('_')[0]}/tasks/${s.pid}`
  }
}

const selectCls =
  'border border-line bg-ink px-3 py-2 font-mono text-xs text-paper outline-none transition-colors hover:border-ink-500 focus:border-phosphor appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22%3E%3Cpath d=%22M1 1l4 4 4-4%22 stroke=%22%238B9486%22 stroke-width=%221.5%22 fill=%22none%22/%3E%3C/svg%3E")] bg-[position:right_10px_center] bg-no-repeat pr-8'

export default function Submissions() {
  const reloadTrigger = useAppStore((s) => s.reloadTrigger)
  const [status, setStatus] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [platform, setPlatform] = useState('all')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Submission[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setKeyword(keywordInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [keywordInput])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getSubmissions({ page, pageSize: PAGE_SIZE, status, difficulty, keyword, platform })
      setItems(res.items)
      setTotal(res.total)
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, status, difficulty, keyword, platform])

  useEffect(() => {
    fetchData()
  }, [fetchData, reloadTrigger])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasData = total > 0 || loading
  const empty = !loading && total === 0

  return (
    <div className="space-y-6">
      <header className="animate-fadeUp">
        <div className="kicker">// SUBMISSIONS</div>
        <h1 className="mt-2 text-2xl font-bold tracking-wide">提交记录</h1>
        <p className="mt-1 text-sm text-dim">浏览全部已同步的 OI 平台提交，支持按平台、结果、难度筛选与题号 / 题名搜索。</p>
      </header>

      {/* 筛选工具栏 */}
      <div className="panel flex animate-fadeUp flex-wrap items-center gap-3 px-4 py-3" style={{ animationDelay: '60ms' }}>
        <span className="corner-tl" />
        <span className="corner-br" />
        <SlidersHorizontal className="h-4 w-4 text-faint" />
        <select
          className={selectCls}
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">全部平台</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{PLATFORM_META[p].labelZh}</option>
          ))}
        </select>
        <select
          className={selectCls}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">全部结果</option>
          <option value="ac">仅 AC</option>
          <option value="nac">仅未 AC</option>
        </select>
        <select
          className={selectCls}
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">全部难度</option>
          {Object.entries(DIFFICULTY_META).map(([code, meta]) => (
            <option key={code} value={code}>{meta.name}</option>
          ))}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            className="field-input !py-2 !pl-9 !text-xs"
            placeholder="搜索题号 / 题名，例如 P1000 或 超级玛丽"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
          />
        </div>
        <span className="font-mono text-xs text-faint">
          共 <span className="text-phosphor">{total}</span> 条
        </span>
      </div>

      {/* 记录表 */}
      <div className="panel animate-fadeUp overflow-hidden" style={{ animationDelay: '120ms' }}>
        <span className="corner-tl" />
        <span className="corner-br" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-ink-700/50">
                <th className="th-cell w-16">平台</th>
                <th className="th-cell w-28">题目</th>
                <th className="th-cell">题名</th>
                <th className="th-cell w-28">难度</th>
                <th className="th-cell w-32">结果</th>
                <th className="th-cell w-24">语言</th>
                <th className="th-cell w-24">耗时</th>
                <th className="th-cell w-24">内存</th>
                <th className="th-cell w-40">提交时间</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line-soft">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-3.5 animate-pulse bg-ink-500/60" style={{ width: `${55 + ((i + j) % 4) * 12}%` }} />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                items.map((s) => {
                  const ac = s.status === 12
                  const platformUrl = getProblemUrl(s)
                  const platformColor = PLATFORM_META[s.platform].color
                  return (
                    <tr
                      key={`${s.platform}-${s.id}`}
                      className="group border-b border-line-soft transition-colors last:border-0 hover:bg-ink-700/40"
                    >
                      <td className="td-cell">
                        <span
                          className="inline-block rounded border px-1.5 py-0.5 font-mono text-[9px]"
                          style={{ borderColor: platformColor + '60', color: platformColor }}
                          title={PLATFORM_META[s.platform].labelZh}
                        >
                          {PLATFORM_META[s.platform].label}
                        </span>
                      </td>
                      <td className="td-cell border-l-2 border-transparent font-mono text-xs" style={{ borderLeftColor: ac ? '#C8F542' : 'transparent' }}>
                        <a
                          href={platformUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-phosphor-dim hover:text-phosphor hover:underline underline-offset-4"
                        >
                          {s.pid}
                        </a>
                      </td>
                      <td className="td-cell max-w-64">
                        <a
                          href={platformUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-paper/90 hover:text-phosphor"
                          title={s.title}
                        >
                          {s.title}
                        </a>
                      </td>
                      <td className="td-cell"><DifficultyTag difficulty={s.difficulty} /></td>
                      <td className="td-cell"><StatusBadge status={s.status} score={s.score} /></td>
                      <td className="td-cell font-mono text-xs text-dim">{languageName(s.language)}</td>
                      <td className="td-cell font-mono text-xs text-dim">{formatTime(s.time)}</td>
                      <td className="td-cell font-mono text-xs text-dim">{formatMemory(s.memory)}</td>
                      <td className="td-cell font-mono text-xs text-dim">{formatDateTime(s.submitTime)}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {empty && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Inbox className="h-10 w-10 text-faint" strokeWidth={1.25} />
            <div className="text-sm text-dim">
              {keyword || status !== 'all' || difficulty !== 'all'
                ? '没有符合筛选条件的提交记录'
                : '本地还没有提交记录'}
            </div>
            <Link to="/settings" className="btn-ghost !py-2 !text-xs">
              前往设置页同步记录
            </Link>
          </div>
        )}

        {/* 分页 */}
        {hasData && (
          <div className="flex items-center justify-between border-t border-line-soft px-4 py-3 font-mono text-xs text-dim">
            <span>
              PAGE <span className="text-paper">{page}</span> / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="btn-ghost !px-3 !py-1.5 !text-xs"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                上一页
              </button>
              <button
                className="btn-ghost !px-3 !py-1.5 !text-xs"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
