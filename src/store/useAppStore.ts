import { create } from 'zustand'
import { getConfig } from '@/api/client'
import type { ConfigResponse } from '@/lib/constants'

interface AppState {
  config: ConfigResponse | null
  loading: boolean
  /**
   * 每次 refresh() 完成后 +1，下游页面（Stats / Submissions）
   * 订阅此字段作为 useEffect 依赖，从而在 Sidebar「刷新数据」后
   * 各自重新拉取自己的数据。
   */
  reloadTrigger: number
  /**
   * 串行 refresh：防止 StrictMode 下并发多次 fetch 造成状态抖动。
   * 后续调用会复用第一次 in-flight 的 Promise。
   */
  _inFlight?: Promise<void> | null
  refresh: () => Promise<void>
  setConfig: (config: ConfigResponse | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  config: null,
  loading: false,
  reloadTrigger: 0,
  _inFlight: null,
  setConfig: (config) => set({ config }),
  refresh: async () => {
    const existing = get()._inFlight
    if (existing) return existing
    const p = (async () => {
      try {
        const config = await getConfig()
        set({ config, loading: false, _inFlight: null, reloadTrigger: get().reloadTrigger + 1 })
      } catch {
        set({ config: null, loading: false, _inFlight: null, reloadTrigger: get().reloadTrigger + 1 })
      }
    })()
    set({ _inFlight: p, loading: true })
    await p
  },
}))
