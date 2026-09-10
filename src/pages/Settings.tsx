import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KeyRound, UserRound, Save, PlugZap, AlertTriangle, CheckCircle2, Trash2, Globe, Sparkles, Target, Clock } from 'lucide-react'
import { Panel } from '@/components/Panel'
import { SyncTerminal } from '@/components/SyncTerminal'
import { DifficultySyncTerminal, type DifficultySyncBody } from '@/components/DifficultySyncTerminal'
import { useAppStore } from '@/store/useAppStore'
import {
  saveLuoguConfig,
  saveAtcoderHandle,
  saveCodeforcesHandle,
  testConnection,
  clearLocalData,
} from '@/api/client'
import { PLATFORMS, PLATFORM_META, formatIso, type Platform } from '@/lib/constants'
import { cn } from '@/lib/utils'

type PlatformState = {
  // luogu
  uid?: string
  clientId?: string
  showSecret?: boolean
  // atcoder / codeforces
  handle?: string
  // 通用
  busy?: 'save' | 'test' | null
  message?: { ok: boolean; text: string } | null
  clearState?: 'idle' | 'confirm1' | 'confirm2' | 'clearing' | 'done'
  clearedCount?: number | null
}

const DEFAULT_STATE = (p: Platform): PlatformState =>
  p === 'luogu'
    ? { uid: '', clientId: '', showSecret: false, busy: null, message: null, clearState: 'idle', clearedCount: null }
    : { handle: '', busy: null, message: null, clearState: 'idle', clearedCount: null }

export default function Settings() {
  const { config, refresh } = useAppStore()
  const [searchParams] = useSearchParams()
  const [activePlatform, setActivePlatform] = useState<Platform>('luogu')
  const [states, setStates] = useState<Record<Platform, PlatformState>>(() => ({
    luogu: DEFAULT_STATE('luogu'),
    atcoder: DEFAULT_STATE('atcoder'),
    codeforces: DEFAULT_STATE('codeforces'),
  }))

  // 支持从 Stats 空数据横幅的 "前往设置" 链接带入目标平台
  useEffect(() => {
    const p = searchParams.get('platform') as Platform | null
    if (p && PLATFORMS.includes(p)) {
      setActivePlatform(p)
    }
  }, [searchParams])

  const update = (p: Platform, patch: Partial<PlatformState>) =>
    setStates((prev) => ({ ...prev, [p]: { ...prev[p], ...patch } }))

  // 从已保存配置回填表单
  useEffect(() => {
    if (!config) return
    update('luogu', { uid: config.config.luogu.uid, showSecret: false })
    update('atcoder', { handle: config.config.atcoder.handle })
    update('codeforces', { handle: config.config.codeforces.handle })
  }, [config])

  const cur = states[activePlatform]

  // -------- 难度同步 state（每个平台各自独立） --------
  const [diffScope, setDiffScope] = useState<'all' | 'single' | 'recent'>('all')
  const [diffPid, setDiffPid] = useState('')
  const [diffDays, setDiffDays] = useState(14)

  // 切换平台时重置难度同步表单
  useEffect(() => {
    setDiffScope('all')
    setDiffPid('')
    setDiffDays(14)
  }, [activePlatform])

  const diffLuoguReady = !!config?.config.luogu.clientId && !!config?.config.luogu.uid

  const difficultyBody: DifficultySyncBody = {
    scope: diffScope,
    platform: activePlatform,
    pid: diffScope === 'single' ? diffPid : undefined,
    days: diffScope === 'recent' ? diffDays : undefined,
  }

  const handleSave = async () => {
    if (activePlatform === 'luogu') {
      const s = states.luogu
      if (!s.uid || !s.clientId) return
      update('luogu', { busy: 'save', message: null })
      try {
        await saveLuoguConfig(s.uid.trim(), s.clientId.trim()!)
        update('luogu', { busy: null, message: { ok: true, text: '配置已保存。' }, clientId: '' })
        await refresh()
      } catch (err) {
        update('luogu', { busy: null, message: { ok: false, text: (err as Error).message } })
      }
    } else {
      const s = states[activePlatform]
      if (!s.handle) return
      update(activePlatform, { busy: 'save', message: null })
      try {
        if (activePlatform === 'atcoder') await saveAtcoderHandle(s.handle!.trim())
        else await saveCodeforcesHandle(s.handle!.trim())
        update(activePlatform, { busy: null, message: { ok: true, text: 'Handle 已保存。' } })
        await refresh()
      } catch (err) {
        update(activePlatform, { busy: null, message: { ok: false, text: (err as Error).message } })
      }
    }
  }

  const handleTestLuogu = async () => {
    const s = states.luogu
    if (!s.uid) return
    update('luogu', { busy: 'test', message: null })
    try {
      const res = await testConnection(s.uid.trim(), s.clientId?.trim() ?? '')
      if (res.ok && res.profile) {
        update('luogu', {
          busy: null,
          clientId: '',
          message: { ok: true, text: `连接成功：${res.profile.name}（UID ${res.profile.uid}），凭证已自动保存。` },
        })
        await refresh()
      } else {
        update('luogu', { busy: null, message: { ok: false, text: res.error ?? '连接失败' } })
      }
    } catch (err) {
      update('luogu', { busy: null, message: { ok: false, text: (err as Error).message } })
    }
  }

  const handleClear = async () => {
    if (cur.clearState !== 'confirm2') return
    update(activePlatform, { clearState: 'clearing' })
    try {
      const r = await clearLocalData(activePlatform)
      update(activePlatform, { clearState: 'done', clearedCount: r.removed })
      await refresh()
    } catch {
      update(activePlatform, { clearState: 'idle' })
    }
  }

  // SyncTerminal 的 body 参数
  const syncBody: Record<string, string> =
    activePlatform === 'luogu'
      ? {
          uid: (states.luogu.uid || config?.config.luogu.uid || '').trim(),
          clientId: (states.luogu.clientId || config?.config.luogu.clientId || '').trim(),
        }
      : {
          handle: (cur.handle || config?.config[activePlatform].handle || '').trim(),
        }

  const syncReady =
    activePlatform === 'luogu'
      ? !!(states.luogu.uid || config?.config.luogu.uid)
      : !!(cur.handle || config?.config[activePlatform].handle)

  // ====== 渲染 ======
  return (
    <div className="space-y-6">
      <header className="animate-fadeUp">
        <div className="kicker">// SETTINGS</div>
        <h1 className="mt-2 text-2xl font-bold tracking-wide">设置</h1>
        <p className="mt-1 text-sm text-dim">配置竞赛平台凭证，拉取并持久化全部提交记录。</p>
      </header>

      {/* 平台切换 */}
      <div className="animate-fadeUp" style={{ animationDelay: '40ms' }}>
        <div className="mb-2 font-mono text-[10px] tracking-[0.3em] text-faint">// PLATFORM</div>
        <div className="flex gap-2">
          {PLATFORMS.map((p) => {
            const saved = config?.config[p]
            const count = config?.byPlatform[p]?.submissions ?? 0
            const isActive = activePlatform === p
            return (
              <button
                key={p}
                onClick={() => setActivePlatform(p)}
                className={cn(
                  'flex items-center gap-2 border px-3 py-2 font-mono text-xs transition-colors',
                  isActive
                    ? 'border-phosphor bg-phosphor/[0.07] text-phosphor'
                    : 'border-line text-dim hover:border-phosphor-dim hover:text-paper',
                )}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>{PLATFORM_META[p].labelZh}</span>
                {count > 0 && (
                  <span className="rounded border border-line-soft bg-ink-700/60 px-1.5 py-0.5 text-[9px] text-faint">
                    {count}
                  </span>
                )}
                {(saved && ('handle' in saved || 'uid' in saved)) ? (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-phosphor" title="已配置" />
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* === 凭证表单 === */}
        <Panel
          kicker="CREDENTIALS"
          title={`${PLATFORM_META[activePlatform].labelZh} 凭证`}
          className="animate-fadeUp"
          bodyClassName="space-y-5"
        >
          {/* LUOGU */}
          {activePlatform === 'luogu' && (
            <>
              <div>
                <label className="field-label" htmlFor="uid">UID</label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                  <input
                    id="uid"
                    className="field-input !pl-10"
                    placeholder="例如 100001"
                    value={cur.uid ?? ''}
                    onChange={(e) => update('luogu', { uid: e.target.value.replace(/\D/g, '') })}
                    inputMode="numeric"
                  />
                </div>
                <p className="mt-1.5 text-xs text-faint">洛谷个人主页地址中的数字：luogu.com.cn/user/<span className="text-phosphor-dim">100001</span></p>
              </div>

              <div>
                <label className="field-label" htmlFor="clientId">CLIENT_ID（Cookie __client_id）</label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                  <input
                    id="clientId"
                    type={cur.showSecret ? 'text' : 'password'}
                    className="field-input !pl-10 !pr-16"
                    placeholder={config?.luogu.clientIdSet ? `已保存：${config.luogu.clientIdMasked ?? ''}（留空则沿用）` : '粘贴 __client_id 的值'}
                    value={cur.clientId ?? ''}
                    onChange={(e) => update('luogu', { clientId: e.target.value })}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => update('luogu', { showSecret: !cur.showSecret })}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] tracking-widest text-faint hover:text-phosphor"
                  >
                    {cur.showSecret ? '隐藏' : '显示'}
                  </button>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-faint">
                  获取方式：登录洛谷后按 <span className="font-mono text-dim">F12</span> → 应用 → Cookies →
                  <span className="font-mono text-dim"> https://www.luogu.com.cn</span> → 复制
                  <span className="font-mono text-dim"> __client_id </span> 的值。
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  className="btn-ghost"
                  onClick={handleSave}
                  disabled={cur.busy !== null || !cur.uid || !cur.clientId}
                >
                  <Save className="h-4 w-4" />
                  {cur.busy === 'save' ? '保存中…' : '保存配置'}
                </button>
                <button className="btn-primary" onClick={handleTestLuogu} disabled={cur.busy !== null || !cur.uid}>
                  <PlugZap className="h-4 w-4" />
                  {cur.busy === 'test' ? '测试中…' : '测试连接'}
                </button>
              </div>
            </>
          )}

          {/* AtCoder / Codeforces */}
          {activePlatform !== 'luogu' && (
            <>
              <div>
                <label className="field-label" htmlFor="handle">HANDLE（用户名）</label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                  <input
                    id="handle"
                    className="field-input !pl-10"
                    placeholder={`例如 ${activePlatform === 'codeforces' ? 'tourist' : 'tourist'}`}
                    value={cur.handle ?? ''}
                    onChange={(e) => update(activePlatform, { handle: e.target.value })}
                  />
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-faint">
                  无需 Cookie，{PLATFORM_META[activePlatform].labelZh} 公开 API 可直接查询提交记录。
                  {activePlatform === 'codeforces'
                    ? ' 个人主页：codeforces.com/profile/<handle>'
                    : ' 个人主页：atcoder.jp/users/<handle>'}
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  className="btn-primary flex-1"
                  onClick={handleSave}
                  disabled={cur.busy !== null || !cur.handle}
                >
                  <Save className="h-4 w-4" />
                  {cur.busy === 'save' ? '保存中…' : '保存 Handle'}
                </button>
              </div>
            </>
          )}

          {cur.message && (
            <div
              className={cn(
                'flex items-start gap-2 border px-3 py-2.5 text-xs leading-relaxed',
                cur.message.ok
                  ? 'border-phosphor/40 bg-phosphor/[0.06] text-phosphor'
                  : 'border-amber/40 bg-amber/[0.06] text-amber',
              )}
            >
              {cur.message.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{cur.message.text}</span>
            </div>
          )}
        </Panel>

        {/* === 右侧：用户名片 + 本地数据 === */}
        <div className="space-y-6">
          {activePlatform === 'luogu' && (
            <Panel kicker="PROFILE" title="洛谷账号" className="animate-fadeUp" style={{ animationDelay: '80ms' }}>
              {config?.profile ? (
                <div className="flex items-center gap-4">
                  {config.profile.avatar ? (
                    <img
                      src={config.profile.avatar}
                      alt="avatar"
                      className="h-16 w-16 shrink-0 border border-line object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center border border-line font-mono text-xl text-faint">
                      {config.profile.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-lg font-medium text-paper">{config.profile.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-faint">UID {config.profile.uid}</div>
                    {config.profile.slogan && (
                      <div className="mt-1.5 truncate text-xs text-dim">「{config.profile.slogan}」</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs leading-relaxed text-faint">
                  尚未连接洛谷账号
                  <div className="mt-1">填写凭证并点击「测试连接」后显示</div>
                </div>
              )}
            </Panel>
          )}

          {/* 平台数据概览 */}
          <Panel
            kicker="LOCAL DATA"
            title={`${PLATFORM_META[activePlatform].labelZh} 本地数据`}
            className="animate-fadeUp"
            style={{ animationDelay: activePlatform === 'luogu' ? '140ms' : '80ms' }}
          >
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="font-mono text-[10px] tracking-[0.22em] text-faint">提交记录</dt>
                <dd className="mt-1 font-mono text-2xl text-phosphor">
                  {config?.byPlatform[activePlatform]?.submissions ?? 0}
                  <span className="ml-1 text-xs text-faint">条</span>
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] tracking-[0.22em] text-faint">已过题目</dt>
                <dd className="mt-1 font-mono text-2xl text-phosphor">
                  {config?.byPlatform[activePlatform]?.problems ?? 0}
                  <span className="ml-1 text-xs text-faint">道</span>
                </dd>
              </div>
              <div className="col-span-2 border-t border-line-soft pt-3">
                <dt className="font-mono text-[10px] tracking-[0.22em] text-faint">上次同步</dt>
                <dd className="mt-1 font-mono text-sm text-paper/90">
                  {formatIso(config?.config[activePlatform].lastSyncAt ?? null)}
                </dd>
              </div>
            </dl>

            {/* 清空按钮 */}
            <div className="mt-4 border-t border-line-soft pt-4">
              {cur.clearState === 'idle' && (
                <button
                  type="button"
                  className="btn-danger w-full"
                  onClick={() => update(activePlatform, { clearState: 'confirm1' })}
                  disabled={(config?.byPlatform[activePlatform]?.submissions ?? 0) === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  清空 {PLATFORM_META[activePlatform].labelZh} 记录
                </button>
              )}

              {cur.clearState === 'confirm1' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded border border-amber/40 bg-amber/[0.06] px-3 py-2.5 text-xs leading-relaxed text-amber">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      将删除本地 {PLATFORM_META[activePlatform].labelZh} 的
                      <b> {config?.byPlatform[activePlatform]?.submissions ?? 0} </b>
                      条提交记录，其他平台数据不受影响。此操作不可恢复。
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-danger flex-1" onClick={() => update(activePlatform, { clearState: 'confirm2' })}>
                      <Trash2 className="h-4 w-4" />
                      确认清除
                    </button>
                    <button type="button" className="btn-ghost flex-1" onClick={() => update(activePlatform, { clearState: 'idle' })}>
                      取消
                    </button>
                  </div>
                </div>
              )}

              {cur.clearState === 'confirm2' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded border border-amber/40 bg-amber/[0.06] px-3 py-2.5 text-xs leading-relaxed text-amber">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      最终确认：真的要删除 {PLATFORM_META[activePlatform].labelZh} 的
                      <b> {config?.byPlatform[activePlatform]?.submissions ?? 0} </b>
                      条提交记录吗？
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-danger flex-1" onClick={handleClear}>
                      <Trash2 className="h-4 w-4" />
                      最终确认
                    </button>
                    <button type="button" className="btn-ghost flex-1" onClick={() => update(activePlatform, { clearState: 'idle' })}>
                      取消
                    </button>
                  </div>
                </div>
              )}

              {cur.clearState === 'clearing' && (
                <button type="button" className="btn-danger w-full" disabled>
                  正在清除…
                </button>
              )}

              {cur.clearState === 'done' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded border border-phosphor/40 bg-phosphor/[0.06] px-3 py-2.5 text-xs leading-relaxed text-phosphor">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>已清除 {cur.clearedCount} 条记录。凭证保留，可重新同步。</span>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost w-full"
                    onClick={() => update(activePlatform, { clearState: 'idle', clearedCount: null })}
                  >
                    关闭
                  </button>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* 同步终端 + 难度同步 */}
      <div className="animate-fadeUp" style={{ animationDelay: '200ms' }}>
        <div className="mb-3 flex items-baseline gap-3">
          <div className="kicker">// SYNC CONSOLE</div>
          <h2 className="text-[15px] font-medium tracking-wide text-paper">
            {PLATFORM_META[activePlatform].labelZh} 同步控制台
          </h2>
        </div>
        <SyncTerminal
          platform={activePlatform}
          syncBody={syncBody}
          ready={syncReady}
          onSynced={refresh}
        />
        <p className="mt-2 font-mono text-[11px] text-faint">
          {activePlatform === 'luogu'
            ? '* 同步从最新记录开始逐页拉取，遇到已存在的记录自动停止（增量同步）；页间隔 400ms 礼貌限速。'
            : `* ${PLATFORM_META[activePlatform].labelZh} 公开 API 无认证，一次返回全部记录；难度暂时标记为「暂无评定」。`}
        </p>

        {/* 难度同步面板 —— 所有平台可用 */}
        <div className="mt-8">
            <div className="mb-3 flex items-baseline gap-3">
              <div className="kicker">// DIFFICULTY SYNC</div>
              <h2 className="text-[15px] font-medium tracking-wide text-paper">
                难度同步（拉洛谷题库 / RemoteJudge 官方评定）
              </h2>
            </div>
            <Panel bodyClassName="p-4 space-y-4" className="mb-3">
              <div className="grid gap-4 md:grid-cols-2">
                {/* 范围选择（3 按钮） */}
                <div>
                  <label className="field-label">同步范围</label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDiffScope('all')}
                      className={cn(
                        'flex-1 border px-2 py-1.5 font-mono text-[11px] transition-colors',
                        diffScope === 'all'
                          ? 'border-phosphor bg-phosphor/[0.07] text-phosphor'
                          : 'border-line text-faint hover:border-phosphor-dim hover:text-dim',
                      )}
                    >
                      <Sparkles className="mr-1 inline h-3 w-3" />全部
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiffScope('recent')}
                      className={cn(
                        'flex-1 border px-2 py-1.5 font-mono text-[11px] transition-colors',
                        diffScope === 'recent'
                          ? 'border-phosphor bg-phosphor/[0.07] text-phosphor'
                          : 'border-line text-faint hover:border-phosphor-dim hover:text-dim',
                      )}
                    >
                      <Clock className="mr-1 inline h-3 w-3" />近 {diffDays} 天
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiffScope('single')}
                      className={cn(
                        'flex-1 border px-2 py-1.5 font-mono text-[11px] transition-colors',
                        diffScope === 'single'
                          ? 'border-phosphor bg-phosphor/[0.07] text-phosphor'
                          : 'border-line text-faint hover:border-phosphor-dim hover:text-dim',
                      )}
                    >
                      <Target className="mr-1 inline h-3 w-3" />单题
                    </button>
                  </div>
                </div>

                {/* 范围参数 */}
                <div>
                  <label className="field-label">
                    {diffScope === 'single' ? '指定题目 PID' : diffScope === 'recent' ? '天数' : '—'}
                  </label>
                  {diffScope === 'single' ? (
                    <input
                      className="field-input !py-2 !text-xs"
                      placeholder={`例如 ${activePlatform === 'atcoder' ? 'ABC360_A' : activePlatform === 'luogu' ? 'P1000' : 'CF2245G'}`}
                      value={diffPid}
                      onChange={(e) => setDiffPid(e.target.value)}
                    />
                  ) : diffScope === 'recent' ? (
                    <input
                      className="field-input !py-2 !text-xs"
                      type="number"
                      min={1}
                      max={365}
                      value={diffDays}
                      onChange={(e) => setDiffDays(Math.max(1, Math.min(365, parseInt(e.target.value || '14', 10))))}
                    />
                  ) : (
                    <div className="h-8 border border-line bg-ink px-3 py-1.5 font-mono text-xs text-faint">
                      {`所有已同步的 ${PLATFORM_META[activePlatform].labelZh} 题目`}
                    </div>
                  )}
                </div>
              </div>

              {!diffLuoguReady && (
                <div className="flex items-start gap-2 rounded border border-amber/40 bg-amber/[0.06] px-3 py-2.5 text-xs leading-relaxed text-amber">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    难度同步需要已保存的洛谷 <b>UID + __client_id</b>。请先切换到「洛谷」面板保存凭证。
                  </span>
                </div>
              )}
              {diffLuoguReady && (
                <div className="flex items-start gap-2 rounded border border-phosphor/40 bg-phosphor/[0.06] px-3 py-2.5 text-xs leading-relaxed text-phosphor">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>洛谷凭证已就绪，将抓取 {PLATFORM_META[activePlatform].labelZh} 题目在洛谷 RemoteJudge 上的官方难度评定。</span>
                </div>
              )}
            </Panel>
            <DifficultySyncTerminal
              body={difficultyBody}
              ready={diffLuoguReady && (diffScope !== 'single' || !!diffPid.trim())}
              onSynced={refresh}
            />
            <p className="mt-2 font-mono text-[11px] text-faint">
              * 难度来源：洛谷 RemoteJudge 收录的官方评定（即普通用户访问题库看到的难度）。
              * 洛谷未收录的题目（非比赛题等）将跳过，保留为「暂无评定」。
              * 请求间隔 400ms，防止洛谷 CDN 反爬。
            </p>
          </div>
        </div>

    </div>
  )
}
