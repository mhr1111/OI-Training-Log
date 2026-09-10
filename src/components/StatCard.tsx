import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  kicker: string
  value: ReactNode
  sub?: string
  accent?: 'phosphor' | 'paper' | 'amber'
  delay?: number
}

/** 核心指标卡：大号等宽数字 + 英文 kicker */
export function StatCard({ kicker, value, sub, accent = 'phosphor', delay = 0 }: StatCardProps) {
  const valueColor =
    accent === 'phosphor'
      ? 'text-phosphor'
      : accent === 'amber'
        ? 'text-amber'
        : 'text-paper'
  return (
    <div
      className="panel animate-fadeUp p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="corner-tl" />
      <span className="corner-br" />
      <div className="kicker">{kicker}</div>
      <div className={cn('mt-3 font-mono text-4xl font-bold leading-none tracking-tight', valueColor)}>
        {value}
      </div>
      {sub && <div className="mt-3 text-xs text-dim">{sub}</div>}
    </div>
  )
}
