import { AC_STATUS, difficultyMeta, statusText } from '@/lib/constants'

/** 难度色点 + 名称 */
export function DifficultyTag({ difficulty, withName = true }: { difficulty: number; withName?: boolean }) {
  const meta = difficultyMeta(difficulty)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        className="inline-block h-2 w-2 rotate-45"
        style={{ backgroundColor: meta.color }}
        title={meta.name}
      />
      {withName && <span className="text-xs text-dim">{meta.name}</span>}
    </span>
  )
}

/** 判定结果徽章 */
export function StatusBadge({ status, score }: { status: number; score: number }) {
  const ac = status === AC_STATUS
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span
        className={
          ac
            ? 'border border-phosphor/60 bg-phosphor/10 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-phosphor'
            : 'border border-amber/50 bg-amber/10 px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-amber'
        }
      >
        {ac ? 'AC' : statusText(status).slice(0, 4)}
      </span>
      <span className="font-mono text-xs text-faint">{score}</span>
    </span>
  )
}
