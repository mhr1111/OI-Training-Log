import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { BarChart3, ScrollText, SlidersHorizontal, TerminalSquare, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { PLATFORM_META, type ConfigResponse, formatIso } from '@/lib/constants'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/stats', index: '01', label: '数据汇总', en: 'OVERVIEW', icon: BarChart3 },
  { to: '/submissions', index: '02', label: '提交记录', en: 'SUBMISSIONS', icon: ScrollText },
  { to: '/settings', index: '03', label: '设置', en: 'SETTINGS', icon: SlidersHorizontal },
]

export function Sidebar() {
  const config: ConfigResponse | null = useAppStore((s) => s.config)
  const loading = useAppStore((s) => s.loading)
  const refresh = useAppStore((s) => s.refresh)

  const [justFinished, setJustFinished] = useState(false)

  useEffect(() => {
    if (justFinished) {
      const t = setTimeout(() => setJustFinished(false), 2400)
      return () => clearTimeout(t)
    }
  }, [justFinished])

  const handleRefresh = async () => {
    if (loading) return
    try {
      await refresh()
      setJustFinished(true)
    } catch {
      // refresh 内部已经处理了错误（loading=false 且 reloadTrigger+1）
      // 这里不做额外提示，让用户通过页面数据变化感知
    }
  }

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-ink-800/60 backdrop-blur-sm lg:w-56">
      {/* 标识 */}
      <div className="border-b border-line-soft px-5 py-6">
        <div className="flex items-center gap-2">
          <TerminalSquare className="h-5 w-5 text-phosphor" strokeWidth={1.75} />
          <span className="font-mono text-lg font-bold tracking-tight text-paper">
            OI<span className="text-phosphor">//</span>BOARD
          </span>
        </div>
        <div className="kicker mt-2 !tracking-[0.22em]">OI TRAINING LOG</div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 px-3 py-5">
        <div className="mb-3 px-2 font-mono text-[10px] tracking-[0.3em] text-faint">MENU</div>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 border-l-2 px-3 py-2.5 transition-colors duration-150',
                    isActive
                      ? 'border-phosphor bg-phosphor/[0.07] text-phosphor'
                      : 'border-transparent text-dim hover:bg-ink-700/60 hover:text-paper',
                  )
                }
              >
                <span className="font-mono text-[10px] text-faint group-hover:text-phosphor-dim">
                  {item.index}
                </span>
                <item.icon className="h-4 w-4" strokeWidth={1.75} />
                <span className="text-sm">{item.label}</span>
              </NavLink>
            </li>
          ))}

          {/* 刷新数据：MENU 最后一项，不是 NavLink，不跳转 */}
          <li>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              title="从本地 store.json 重新载入全部页面数据"
              className={cn(
                'group relative flex w-full items-center gap-3 border-l-2 px-3 py-2.5 transition-colors duration-150',
                loading
                  ? 'border-phosphor text-phosphor'
                  : 'border-transparent text-dim hover:bg-ink-700/60 hover:text-paper',
                justFinished && !loading && 'border-phosphor bg-phosphor/[0.07] text-phosphor',
              )}
            >
              <span className="font-mono text-[10px] text-faint group-hover:text-phosphor-dim">
                04
              </span>
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : justFinished ? (
                <CheckCircle2
                  className="h-4 w-4"
                  strokeWidth={1.75}
                />
              ) : (
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
              )}
              <span className="text-sm">
                {loading ? '刷新中…' : justFinished ? '数据已更新' : '刷新数据'}
              </span>
            </button>
          </li>
        </ul>
      </nav>

      {/* 底部同步状态 */}
      <div className="border-t border-line-soft px-5 py-4">
        <div className="font-mono text-[10px] tracking-[0.24em] text-faint">// SYNC STATUS</div>
        {config?.totalSubmissions ? (
          <div className="mt-2 space-y-1 text-xs text-dim">
            <div className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 bg-phosphor" />
              <span>共 <span className="font-mono text-paper">{config.totalSubmissions}</span> 条记录</span>
            </div>
            <div className="text-faint">
              {config.totalProblems} 道过题
            </div>
            {/* 各平台小徽章 */}
            <div className="flex flex-wrap gap-1 pt-1">
              {(['luogu', 'codeforces', 'atcoder'] as const).map((p) => {
                const cnt = config.byPlatform[p]?.submissions ?? 0
                if (!cnt) return null
                return (
                  <span
                    key={p}
                    className="rounded border border-line-soft px-1.5 py-0.5 font-mono text-[9px]"
                    style={{ borderColor: PLATFORM_META[p].color + '40', color: PLATFORM_META[p].color }}
                  >
                    {PLATFORM_META[p].labelZh} {cnt}
                  </span>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mt-2 text-xs leading-relaxed text-amber">
            尚未配置凭证
            <NavLink to="/settings" className="block font-mono text-[11px] underline underline-offset-4">
              → 前往设置
            </NavLink>
          </div>
        )}
      </div>
    </aside>
  )
}
