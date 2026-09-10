import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Trophy, CalendarDays, History, BarChart3 } from 'lucide-react'
import { getStats } from '@/api/client'
import { useAppStore } from '@/store/useAppStore'
import { Panel } from '@/components/Panel'
import { StatCard } from '@/components/StatCard'
import { Heatmap } from '@/components/Heatmap'
import { TrendChart } from '@/components/TrendChart'
import { DifficultyTrendChart } from '@/components/DifficultyTrendChart'
import { BarList } from '@/components/BarList'
import {
  DIFFICULTY_META,
  PLATFORMS,
  PLATFORM_META,
  formatDateTime,
  type Platform,
  type StatsResponse,
} from '@/lib/constants'
import { cn } from '@/lib/utils'

function MiniMetric({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  delay,
}: {
  icon: typeof Flame
  label: string
  value: string | number
  unit?: string
  sub?: string
  delay: number
}) {
  return (
    <div className="panel flex items-center gap-4 p-4 animate-fadeUp" style={{ animationDelay: `${delay}ms` }}>
      <span className="corner-tl" />
      <span className="corner-br" />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-line bg-ink-700">
        <Icon className="h-5 w-5 text-phosphor" strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[10px] tracking-[0.22em] text-faint">{label}</div>
        <div className="mt-1 font-mono text-xl text-paper">
          {value}
          {unit && <span className="ml-1 text-xs text-faint">{unit}</span>}
        </div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-dim">{sub}</div>}
      </div>
    </div>
  )
}

const ALL_DIFFICULTIES = [0, 1, 2, 3, 4, 5, 6, 7, 8]

export default function Stats() {
  const reloadTrigger = useAppStore((s) => s.reloadTrigger)

  // 多选 OJ：默认全选
  const [platforms, setPlatforms] = useState<Set<Platform>>(() => new Set(PLATFORMS))
  // 多选难度：默认全选
  const [difficulties, setDifficulties] = useState<Set<number>>(
    () => new Set(ALL_DIFFICULTIES),
  )

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState(false)

  // 稳定序列化 key（每次 toggle 都会变化）
  const platformsKey = Array.from(platforms).sort().join(',')
  const difficultiesKey = Array.from(difficulties).sort((a, b) => a - b).join(',')

  useEffect(() => {
    if (platforms.size === 0) {
      setStats(null)
      return
    }
    const pList = Array.from(platforms).sort()
    const dList = Array.from(difficulties).sort((a, b) => a - b)
    console.log('[Stats] fetching /api/stats with', { platforms: pList, difficulties: dList })
    getStats({ platforms: pList, difficulties: dList })
      .then((data) => {
        setStats(data)
        setError(false)
      })
      .catch((err) => {
        console.error('[Stats] fetch failed:', err)
        setError(true)
      })
  }, [platformsKey, difficultiesKey, reloadTrigger])

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => {
      const next = new Set(prev)
      if (next.has(p)) {
        if (next.size === 1) return prev
        next.delete(p)
      } else {
        next.add(p)
      }
      return next
    })
  }

  const toggleDifficulty = (d: number) => {
    setDifficulties((prev) => {
      const next = new Set(prev)
      if (next.has(d)) {
        if (next.size === 1) return prev
        next.delete(d)
      } else {
        next.add(d)
      }
      return next
    })
  }

  // 用于「前往设置」跳转时选一个默认 OJ
  const firstPlatform = PLATFORMS.find((p) => platforms.has(p)) ?? 'luogu'

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
        <BarChart3 className="h-10 w-10 text-faint" strokeWidth={1.25} />
        <div className="text-sm text-dim">无法加载统计数据，请确认本地服务正在运行。</div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse bg-ink-800" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse bg-ink-800" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className="h-72 animate-pulse bg-ink-800" />
      </div>
    )
  }

  const { totals, streak } = stats
  const isEmpty = totals.submissions === 0

  const difficultyItems = stats.difficulty.map((d) => ({
    label: DIFFICULTY_META[d.difficulty]?.name ?? `难度 ${d.difficulty}`,
    value: d.solved,
    color: DIFFICULTY_META[d.difficulty]?.color ?? '#596253',
    hint: `提交 ${d.submissions}`,
  }))

  const languageItems = stats.languages.slice(0, 8).map((l) => ({
    label: l.name,
    value: l.count,
  }))

  // 顶部 OJ 多选按钮（一行内放 3 个药丸，默认选中的有高亮）

  return (
    <div className="space-y-6">
      <header className="animate-fadeUp">
        <div className="kicker">// OVERVIEW</div>
        <h1 className="mt-2 text-2xl font-bold tracking-wide">数据汇总</h1>
        <p className="mt-1 text-sm text-dim">
          查看你过往的训练情况，可自由选择 OJ 与难度。
        </p>
      </header>

      {/* OJ 多选药丸 */}
      <div className="animate-fadeUp" style={{ animationDelay: '40ms' }}>
        <div className="mb-1.5 font-mono text-[10px] tracking-[0.22em] text-faint">// OJ PLATFORMS（至少选一个）</div>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const active = platforms.has(p)
            const meta = PLATFORM_META[p]
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={cn(
                  'inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-xs transition-colors',
                  active
                    ? 'border-phosphor bg-phosphor/[0.07] text-phosphor'
                    : 'border-line text-dim hover:border-phosphor-dim hover:text-paper',
                )}
              >
                <span
                  className={cn('inline-block h-2.5 w-2.5 shrink-0', !active && 'opacity-30')}
                  style={{ backgroundColor: meta.color }}
                />
                {meta.labelZh}
              </button>
            )
          })}
        </div>
      </div>

      {/* 难度多选药丸（OJ 下方） */}
      <div className="animate-fadeUp" style={{ animationDelay: '60ms' }}>
        <div className="mb-1.5 font-mono text-[10px] tracking-[0.22em] text-faint">// DIFFICULTY（至少选一个）</div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_DIFFICULTIES.map((d) => {
            const active = difficulties.has(d)
            const meta = DIFFICULTY_META[d]
            return (
              <button
                key={d}
                onClick={() => toggleDifficulty(d)}
                className={cn(
                  'inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] transition-colors',
                  active
                    ? 'border-line text-paper bg-ink-700/60'
                    : 'border-line/40 text-faint/70 hover:text-faint',
                )}
                title={meta?.name ?? `难度${d}`}
              >
                <span
                  className={cn('inline-block h-2.5 w-2.5 shrink-0', !active && 'opacity-30')}
                  style={{ backgroundColor: meta?.color ?? '#596253' }}
                />
                <span className="truncate">{meta?.name ?? `难度${d}`}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 空数据提示 banner — 筛选下方、指标上方 */}
      {isEmpty && (
        <div
          className="animate-fadeUp flex items-center justify-between gap-4 border border-amber/40 bg-amber/[0.06] px-5 py-3"
          style={{ animationDelay: '100ms' }}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 shrink-0 text-amber" strokeWidth={1.5} />
            <div>
              <div className="font-mono text-[11px] tracking-[0.22em] text-amber">NO DATA</div>
              <div className="mt-1 text-sm leading-relaxed text-paper/90">
                当前筛选条件下没有训练数据。请前往「设置」页配置对应平台凭证并同步提交记录，
                或调整上方 OJ / 难度选择。
              </div>
            </div>
          </div>
          <Link
            to={{
              pathname: '/settings',
              search: `?platform=${firstPlatform}`,
            }}
            className="btn-primary shrink-0"
          >
            前往设置
          </Link>
        </div>
      )}

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard kicker="SUBMISSIONS" value={totals.submissions} sub="总提交数" accent="paper" delay={0} />
        <StatCard kicker="ACCEPTED" value={totals.accepted} sub="AC 提交数" accent="phosphor" delay={70} />
        <StatCard kicker="AC RATE" value={`${(totals.acRate * 100).toFixed(1)}%`} sub="一次及以上 AC 占比" accent="phosphor" delay={140} />
        <StatCard kicker="PROBLEMS SOLVED" value={totals.solvedProblems} sub="已过题目数（去重）" accent="paper" delay={210} />
      </div>

      {/* 亮点数据 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniMetric icon={Flame} label="当前连续打卡" value={streak.current} unit="天" delay={0} />
        <MiniMetric icon={Trophy} label="最长连续打卡" value={streak.longest} unit="天" delay={60} />
        <MiniMetric
          icon={CalendarDays}
          label="最佳单日"
          value={streak.bestDay ? streak.bestDay.count : '—'}
          unit=" AC"
          sub={streak.bestDay?.date}
          delay={120}
        />
        <MiniMetric
          icon={History}
          label="最近一次 AC"
          value={streak.lastAcAt ? formatDateTime(streak.lastAcAt).slice(5, 10) : '—'}
          sub={streak.lastAcAt ? formatDateTime(streak.lastAcAt).slice(11) : ''}
          delay={180}
        />
      </div>

      {/* 热力图 */}
      <Panel kicker="ACTIVITY HEATMAP" title="AC 活跃热力图" className="animate-fadeUp" bodyClassName="pt-4" style={{ animationDelay: '120ms' }}>
        <Heatmap data={stats.heatmap} />
      </Panel>

      {/* 趋势 */}
      <Panel kicker="AC TREND" title="AC 数量趋势" className="animate-fadeUp" style={{ animationDelay: '180ms' }}>
        <TrendChart data={stats.trend} />
      </Panel>

      {/* 难度构成趋势 */}
      <Panel kicker="DIFFICULTY TREND" title="难度构成（按周期固定比例）" className="animate-fadeUp" style={{ animationDelay: '220ms' }}>
        <DifficultyTrendChart data={stats.difficultyTrend} />
      </Panel>

      {/* 分布 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel kicker="DIFFICULTY" title="难度分布（已过题目数）" className="animate-fadeUp" style={{ animationDelay: '220ms' }}>
          <BarList items={difficultyItems} unit="道" />
        </Panel>
        <Panel kicker="LANGUAGES" title="编程语言分布（提交次数）" className="animate-fadeUp" style={{ animationDelay: '280ms' }}>
          <BarList items={languageItems} unit="次" />
        </Panel>
      </div>
    </div>
  )
}
