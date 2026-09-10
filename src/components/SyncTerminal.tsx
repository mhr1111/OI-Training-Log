import { useEffect, useRef, useState } from 'react'
import { Play, Square, Octagon } from 'lucide-react'
import { startSync, type SyncEvent } from '@/api/client'
import { PLATFORM_META, type Platform } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface LogLine {
  id: number
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
}

const LEVEL_COLOR: Record<LogLine['level'], string> = {
  info: 'text-paper/75',
  success: 'text-phosphor',
  warn: 'text-amber',
  error: 'text-danger',
}

export function SyncTerminal({
  platform,
  syncBody,
  ready,
  onSynced,
}: {
  platform: Platform
  syncBody: Record<string, string>
  ready: boolean
  onSynced: () => void
}) {
  const [logs, setLogs] = useState<LogLine[]>([
    { id: 0, level: 'info', message: '终端就绪。填写凭证后点击「开始同步」拉取提交记录。' },
  ])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ page: number; fetched: number; added: number } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const logId = useRef(1)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logs])

  const append = (level: LogLine['level'], message: string) => {
    setLogs((prev) => [...prev.slice(-199), { id: logId.current++, level, message }])
  }

  const handleStop = () => {
    if (abortRef.current) {
      append('warn', '用户已终止同步请求…')
      abortRef.current.abort()
      abortRef.current = null
    }
  }

  const handleSync = async () => {
    if (running) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)
    setProgress(null)
    setLogs([])
    logId.current = 0

    let finishedNormally = false
    try {
      await startSync(platform, syncBody, (e: SyncEvent) => {
        if (e.type === 'log' && e.message && e.level) {
          append(e.level, e.message)
        } else if (e.type === 'progress') {
          setProgress({ page: e.page ?? 0, fetched: e.fetched ?? 0, added: e.added ?? 0 })
        } else if (e.type === 'done') {
          append('success', `DONE. 本地共 ${e.total ?? 0} 条记录，本次新增 ${e.added ?? 0} 条。`)
          append('info', '若有数据未更新，可在「设置」页点击「重新载入数据」。')
          finishedNormally = true
          setRunning(false)
          onSynced()
        } else if (e.type === 'error') {
          append('error', `ERROR: ${e.error ?? '未知错误'}`)
          setRunning(false)
        }
      }, ctrl.signal)
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') {
        append('warn', '已终止（前端断开连接，后端可能还在运行）')
      } else {
        append('error', `FATAL: ${(err as Error).message}`)
      }
    } finally {
      if (!finishedNormally) setRunning(false)
      abortRef.current = null
    }
  }

  const terminalLabel = `${platform}-sync — bash`

  return (
    <div className="border border-line bg-black/60">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <span className="ml-3 font-mono text-xs text-dim">{terminalLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <button
              onClick={handleStop}
              title="终止同步（前端断开连接，后端会继续跑）"
              className="btn-danger !py-1.5 !text-xs"
            >
              <Octagon className="h-3.5 w-3.5" fill="currentColor" />
              终止
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={running || !ready}
            title={!ready ? `请先填写 ${PLATFORM_META[platform].labelZh} 的凭证` : undefined}
            className={running ? 'btn-ghost !py-1.5 !text-xs' : 'btn-primary !py-1.5 !text-xs'}
          >
            {running ? (
              <>
                <Square className="h-3.5 w-3.5" fill="currentColor" />
                同步中…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" fill="currentColor" />
                开始同步
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 border-b border-line-soft px-4 py-2 font-mono text-[11px] text-dim">
        {progress ? (
          <>
            <span className="text-phosphor">PAGE {String(progress.page).padStart(3, '0')}</span>
            <div className="h-1 flex-1 bg-ink-600">
              <div
                className="h-full bg-phosphor transition-all duration-300"
                style={{ width: `${Math.min(100, (progress.added / Math.max(progress.fetched, 1)) * 100)}%` }}
              />
            </div>
            <span>已获取 {progress.fetched} 条 / 新增 {progress.added} 条</span>
          </>
        ) : (
          <span className="text-faint">{running ? `正在连接 ${PLATFORM_META[platform].labelZh}…` : '空闲'}</span>
        )}
      </div>

      <div ref={logRef} className="h-72 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.7]">
        {logs.map((line) => (
          <div key={line.id} className="flex gap-3">
            <span className="select-none text-faint">{String(line.id + 1).padStart(3, '0')}</span>
            <span className={cn('whitespace-pre-wrap break-all', LEVEL_COLOR[line.level])}>
              {line.message}
            </span>
          </div>
        ))}
        {running && <span className="ml-9 inline-block h-3.5 w-2 animate-blink bg-phosphor align-middle" />}
      </div>
    </div>
  )
}
