import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Granularity = 'day' | 'week' | 'month'

interface Point {
  key: string
  count: number
}

interface TrendChartProps {
  data: Record<Granularity, Point[]>
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

function tooltipText(g: Granularity, p: Point): string {
  if (g === 'month') return `${p.key} · ${p.count} 个 AC`
  if (g === 'week') return `${p.key} 起一周 · ${p.count} 个 AC`
  return `${p.key} · ${p.count} 个 AC`
}

/** x 轴稀疏标签：月粒度显示全部；周/天在跨月处显示 */
function xLabel(g: Granularity, p: Point, prev: Point | null): string {
  if (g === 'month') return `${parseInt(p.key.slice(5, 7), 10)}月`
  const thisMonth = parseInt(p.key.slice(5, 7), 10)
  const prevMonth = prev ? parseInt(prev.key.slice(5, 7), 10) : -1
  if (thisMonth !== prevMonth) return `${thisMonth}月`
  return ''
}

export function TrendChart({ data }: TrendChartProps) {
  const [granularity, setGranularity] = useState<Granularity>('day')
  const points = data[granularity]
  const max = Math.max(...points.map((p) => p.count), 1)
  const total = points.reduce((s, p) => s + p.count, 0)
  const slot = SLOT[granularity]

  const scrollRef = useRef<HTMLDivElement>(null)

  // 粒度切换后默认滚到最右
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="font-mono text-xs text-faint">
          {TABS.find((t) => t.key === granularity)?.hint} · 共 <span className="text-phosphor">{total}</span> 个 AC
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

        {/* 外层负责横向滚动。padding-top 给柱子顶部的 tooltip 留出空间 */}
        <div ref={scrollRef} className="overflow-x-auto" style={{ paddingTop: 32 }}>
          <div
            className="flex items-end pt-1"
            style={{ gap: slot.gap, minWidth: '100%', width: points.length * (slot.bar + slot.gap) }}
          >
            {points.map((p, i) => (
              <div
                key={p.key}
                className="group relative flex shrink-0 cursor-pointer flex-col justify-end"
                style={{ width: slot.bar }}
              >
                <div
                  className={cn(
                    'w-full transition-colors duration-100',
                    p.count > 0
                      ? 'bg-phosphor/80 group-hover:bg-paper'
                      : 'bg-paper/[0.06] group-hover:bg-paper/25',
                  )}
                  style={{ height: p.count > 0 ? Math.max(4, (p.count / max) * 132) : 2 }}
                />
                <div className="mt-1.5 h-3 truncate text-center font-mono text-[8px] text-faint">
                  {xLabel(granularity, p, i > 0 ? points[i - 1] : null)}
                </div>

                {/* CSS :hover tooltip — 100% 不透明背景，在柱子上方 */}
                <span className="trend-tip" role="tooltip">
                  {tooltipText(granularity, p)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 text-right font-mono text-[10px] text-faint">峰值 {max} 个 AC / {granularity === 'day' ? '天' : granularity === 'week' ? '周' : '月'}</div>
    </div>
  )
}
