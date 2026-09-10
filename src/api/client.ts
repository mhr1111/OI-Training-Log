/** 后端 API 封装（含 SSE 同步流读取） */
import type { ConfigResponse, StatsResponse, Submission, LuoguProfile, Platform } from '@/lib/constants'
import { PLATFORMS } from '@/lib/constants'

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`请求失败（HTTP ${res.status}）`)
  return (await res.json()) as T
}

export async function getConfig(): Promise<ConfigResponse> {
  return jsonOrThrow<ConfigResponse>(await fetch('/api/config'))
}

export async function saveLuoguConfig(uid: string, clientId: string): Promise<void> {
  const res = await fetch('/api/config/luogu', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, clientId }),
  })
  const data = await jsonOrThrow<{ ok?: boolean; error?: string }>(res)
  if (!data.ok) throw new Error(data.error || '保存失败')
}

export async function saveAtcoderHandle(handle: string): Promise<void> {
  const res = await fetch('/api/config/atcoder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
  })
  const data = await jsonOrThrow<{ ok?: boolean; error?: string }>(res)
  if (!data.ok) throw new Error(data.error || '保存失败')
}

export async function saveCodeforcesHandle(handle: string): Promise<void> {
  const res = await fetch('/api/config/codeforces', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle }),
  })
  const data = await jsonOrThrow<{ ok?: boolean; error?: string }>(res)
  if (!data.ok) throw new Error(data.error || '保存失败')
}

export async function testConnection(
  uid: string,
  clientId: string,
): Promise<{ ok: boolean; profile?: LuoguProfile; error?: string }> {
  const res = await fetch('/api/config/test/luogu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, clientId }),
  })
  return jsonOrThrow(res)
}

export interface SyncEvent {
  type: 'log' | 'progress' | 'done' | 'error'
  level?: 'info' | 'success' | 'warn' | 'error'
  message?: string
  page?: number
  fetched?: number
  added?: number
  total?: number
  lastSyncAt?: string
  error?: string
}

/** 发起指定平台的同步，逐事件回调；完成后 resolve */
export async function startSync(
  platform: Platform,
  body: Record<string, string>,
  onEvent: (e: SyncEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/sync/${platform}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`同步请求失败（HTTP ${res.status}）`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))
      if (!dataLine) continue
      try {
        onEvent(JSON.parse(dataLine.slice(5).trim()) as SyncEvent)
      } catch {
        /* 忽略半行 */
      }
    }
  }
}

/** 发起难度同步（跨平台 → 洛谷 RemoteJudge 评定），同样的 SSE 协议 */
export async function startDifficultySync(
  body: {
    scope: 'all' | 'single' | 'recent'
    platform?: Platform
    pid?: string
    days?: number
  },
  onEvent: (e: SyncEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/sync/difficulty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`难度同步请求失败（HTTP ${res.status}）`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))
      if (!dataLine) continue
      try {
        onEvent(JSON.parse(dataLine.slice(5).trim()) as SyncEvent)
      } catch {
        /* 忽略半行 */
      }
    }
  }
}

export interface SubmissionQuery {
  page: number
  pageSize?: number
  status?: string
  difficulty?: string
  keyword?: string
  platform?: string
}

export async function getSubmissions(
  q: SubmissionQuery,
): Promise<{ items: Submission[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams({
    page: String(q.page),
    pageSize: String(q.pageSize ?? 20),
    status: q.status ?? 'all',
    difficulty: q.difficulty ?? 'all',
    platform: q.platform ?? 'all',
  })
  if (q.keyword) params.set('keyword', q.keyword)
  return jsonOrThrow(await fetch(`/api/submissions?${params.toString()}`))
}

export interface StatsQuery {
  platforms?: Platform[]
  difficulties?: number[]
}

export async function getStats(q: StatsQuery = {}): Promise<StatsResponse> {
  const params = new URLSearchParams()
  if (q.platforms && q.platforms.length && q.platforms.length < PLATFORMS.length) {
    params.set('platforms', q.platforms.join(','))
  }
  if (q.difficulties && q.difficulties.length && q.difficulties.length < 9) {
    params.set('difficulties', q.difficulties.join(','))
  }
  const qs = params.toString()
  return jsonOrThrow<StatsResponse>(await fetch(`/api/stats${qs ? '?' + qs : ''}`))
}

export async function clearLocalData(platform?: Platform): Promise<{ ok: boolean; removed: number }> {
  const url = platform ? `/api/config/data/${platform}` : '/api/config/data'
  const res = await fetch(url, { method: 'DELETE' })
  return jsonOrThrow(res)
}
