import { useEffect, useRef } from 'react'

interface Cell {
  date: string
  count: number
}

function monthOf(key: string): number {
  return parseInt(key.slice(5, 7), 10)
}

function cellColor(count: number): string {
  if (count <= 0) return 'rgba(200,245,66,0.06)'
  if (count === 1) return 'rgba(200,245,66,0.30)'
  if (count === 2) return 'rgba(200,245,66,0.55)'
  if (count === 3) return 'rgba(200,245,66,0.80)'
  return 'rgba(200,245,66,1)'
}

const CELL = 12
const GAP = 3
const WEEKDAY_LABELS = ['一', '', '三', '', '五', '', '']

export function Heatmap({ data }: { data: Cell[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 默认滚到最右侧（最新的日期）
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  const weeks: Cell[][] = []
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7))
  }

  const totalAc = data.reduce((s, c) => s + c.count, 0)

  return (
    <div>
      {/* 外层负责横向滚动。padding-top 给顶部格子的 tooltip 留出空间，
          让 tooltip 完全在滚动容器内部（不被 overflow 裁剪） */}
      <div
        ref={scrollRef}
        className="overflow-x-auto pb-2"
        style={{ scrollBehavior: 'auto', paddingTop: 36 }}
      >
        {/* 内层做 flex 布局 */}
        <div className="flex gap-2">
          {/* 星期标签列 */}
          <div className="flex shrink-0 flex-col pr-1" style={{ gap: GAP, paddingTop: 18 }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={i}
                style={{ height: CELL, width: 14 }}
                className="flex items-center font-mono text-[9px] leading-none text-faint"
              >
                {label}
              </div>
            ))}
          </div>

          {/* 周列 */}
          {weeks.map((week, wi) => {
            const thisMonth = monthOf(week[0].date)
            const prevMonth = wi > 0 ? monthOf(weeks[wi - 1][0].date) : -1
            return (
              <div key={wi} className="flex shrink-0 flex-col" style={{ gap: GAP }}>
                <div style={{ height: 15 }} className="font-mono text-[9px] leading-none text-faint">
                  {thisMonth !== prevMonth ? `${thisMonth}月` : ''}
                </div>
                {week.map((cell, di) => (
                  <div
                    key={cell.date}
                    className="group relative animate-cellIn cursor-pointer"
                    style={{
                      width: CELL,
                      height: CELL,
                      backgroundColor: cellColor(cell.count),
                      outline: cell.count === 0 ? '1px solid rgba(233,239,230,0.05)' : 'none',
                      animationDelay: `${wi * 14 + di * 2}ms`,
                    }}
                  >
                    <span className="heatmap-tip" role="tooltip">
                      {cell.date} · {cell.count} 个 AC
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 font-mono text-[10px] text-faint">
        <span>近一年共 {totalAc} 个 AC</span>
        <span className="ml-3">少</span>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <span
            key={lvl}
            style={{ width: 10, height: 10, backgroundColor: cellColor(lvl) }}
            className="inline-block"
          />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}
