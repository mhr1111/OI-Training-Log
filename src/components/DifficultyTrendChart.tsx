import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { DIFFICULTY_META } from '@/lib/constants'

type Granularity = 'day' | 'week' | 'month'

interface DifficultyPoint {
  key: string
  count: number
  /** 长度 9，index = difficulty 0..8 */
  byDifficulty: number[]
}

interface DifficultyTrendChartProps {
  data: Record<Granularity, DifficultyPoint[]>
}

const SLOT: Record<Granularity, { bar: number; gap: number }> = {
  day: { bar: 5, gap: 3 },
  week: { bar: 12, gap: 5 },
  month: { bar: 26, gap: 8 },
}

const TABS: { key: Granularity; label: string; hint: string }[] = [
  { key: 'day', label: '天', hint: '近 180 天' },
  { key: 'week', label: '周', hint: '近 52 周' },
  { key: 'month', label: '月', hint: '近 24 个月' },
]

/** 固定柱子高度（像素） */
const BAR_FIXED_HEIGHT = 132

/** 从上到下顺序：难度 8（最高）→ 0（暂无评定） */
const DIFF_ORDER_TOP_TO_BOTTOM = [8, 7, 6, 5, 4, 3, 2, 1, 0]

function tooltipText(g: Granularity, p: DifficultyPoint): string {
  const segParts = DIFF_ORDER_TOP_TO_BOTTOM
    .filter((d) => p.byDifficulty[d] > 0)
    .map((d) => `${DIFFICULTY_META[d]?.name ?? `难度${d}`} ${p.byDifficulty[d]}`)
  const header =
    g === 'month' ? p.key
    : g === 'week' ? `${p.key} 起一周`
    : p.key
  return `${header} · ${p.count} AC${segParts.length ? ' · ' + segParts.join(' / ') : ''}`
}

function xLabel(g: Granularity, p: DifficultyPoint, prev: DifficultyPoint | null): string {
  if (g === 'month') return `${parseInt(p.key.slice(5, 7), 10)}月`
  const thisMonth = parseInt(p.key.slice(5, 7), 10)
  const prevMonth = prev ? parseInt(prev.key.slice(5, 7), 10) : -1
  if (thisMonth !== prevMonth) return `${thisMonth}月`
  return ''
}

export function DifficultyTrendChart({ data }: DifficultyTrendChartProps) {
  const [granularity, setGranularity] = useState<Granularity>('day')

  const points = data[granularity]
  const slot = SLOT[granularity]

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
      })
    }
  }, [granularity])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-xs text-faint">
          {TABS.find((t) => t.key === granularity)?.hint} · 柱高固定 · 每段按难度 AC 比例分配
        </div>
        <div className="flex border border-line">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setGranularity(tab.key)}
              className={cn(
                'px-3.5 py-1.5 font-mono text-xs transition-colors',
                granularity === tab.key
                  ? 'bg-phosphor text-ink'
                  : 'text-dim hover:bg-ink-700 hover:text-paper',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* 横向网格线 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-dashed border-line/70" />
          ))}
        </div>

        <div ref={scrollRef} className="overflow-x-auto" style={{ paddingTop: 32 }}>
          <div
            className="flex items-end pt-1"
            style={{ gap: slot.gap, minWidth: '100%', width: points.length * (slot.bar + slot.gap) }}
          >
            {points.map((p, i) => {
              let visSum = 0
              for (const d of DIFF_ORDER_TOP_TO_BOTTOM) visSum += p.byDifficulty[d]
              const ratioBase = visSum > 0 ? visSum : 0

              return (
                <div
                  key={p.key}
                  className="group relative flex shrink-0 cursor-pointer flex-col justify-end"
                  style={{ width: slot.bar, height: BAR_FIXED_HEIGHT + 4 }}
                >
                  <div
                    className="flex h-full w-full flex-col overflow-hidden border border-line-soft/60 bg-ink-700/30"
                    style={{ height: BAR_FIXED_HEIGHT }}
                  >
                    {ratioBase === 0 ? (
                      <div className="w-full" style={{ height: 2 }} />
                    ) : (
                      DIFF_ORDER_TOP_TO_BOTTOM.map((d) => {
                        const count = p.byDifficulty[d]
                        if (count === 0) return null
                        const h = Math.max(1, (count / ratioBase) * BAR_FIXED_HEIGHT)
                        const meta = DIFFICULTY_META[d]
                        return (
                          <div
                            key={d}
                            className="w-full transition-opacity duration-150 group-hover:opacity-90"
                            style={{
                              height: h,
                              backgroundColor: meta?.color ?? '#596253',
                            }}
                            title={`${meta?.name ?? `难度${d}`}: ${count}`}
                          />
                        )
                      })
                    )}
                  </div>

                  <div className="mt-1.5 h-3 truncate text-center font-mono text-[8px] text-faint">
                    {xLabel(granularity, p, i > 0 ? points[i - 1] : null)}
                  </div>

                  <span className="trend-tip" role="tooltip">
                    {tooltipText(granularity, p)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 text-right font-mono text-[10px] text-faint">固定柱高 · 难度选择请到页面顶部全局筛选</div>
    </div>
  )
}
