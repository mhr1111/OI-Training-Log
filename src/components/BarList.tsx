interface BarItem {
  label: string
  value: number
  color?: string
  hint?: string
}

/** 横向条形分布列表 */
export function BarList({ items, unit = '道' }: { items: BarItem[]; unit?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  const hasZero = items.every((i) => i.value === 0)

  if (hasZero) {
    return <div className="py-8 text-center font-mono text-xs text-faint">// 暂无数据，请先同步提交记录</div>
  }

  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3">
          <div className="w-24 shrink-0 truncate text-xs text-dim" title={item.label}>
            {item.label}
          </div>
          <div className="relative h-5 flex-1 bg-ink">
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.max(item.value > 0 ? 2 : 0, (item.value / max) * 100)}%`,
                backgroundColor: item.color ?? 'rgba(200,245,66,0.75)',
              }}
            />
          </div>
          <div className="w-16 shrink-0 text-right font-mono text-xs text-paper">
            {item.value}
            <span className="ml-0.5 text-[10px] text-faint">{unit}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}
