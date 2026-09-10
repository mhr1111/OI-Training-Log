import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps {
  kicker?: string
  title?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  style?: CSSProperties
}

/** 发丝描边面板，四角带制图刻度角标 */
export function Panel({ kicker, title, right, children, className, bodyClassName, style }: PanelProps) {
  return (
    <section className={cn('panel', className)} style={style}>
      <span className="corner-tl" />
      <span className="corner-br" />
      {(kicker || title || right) && (
        <header className="flex items-end justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            {kicker && <div className="kicker">{kicker}</div>}
            {title && (
              <h2 className="mt-1.5 text-[15px] font-medium tracking-wide text-paper">{title}</h2>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}
