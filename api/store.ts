/**
 * 本地 JSON 文件存储
 * - 数据文件：api/data/store.json
 * - 写入策略：写临时文件后 rename 原子替换
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// dev 模式（ESM）没有 __dirname，从 import.meta.url 算；
// 打包模式（CJS bundle）__dirname 是 Node 原生变量，直接用
declare const __dirname: string
declare const __filename: string
const __filenameComputed = typeof __filename !== 'undefined'
  ? __filename
  : fileURLToPath(import.meta.url)
const __dirnameComputed = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(__filenameComputed)

// 存储目录：优先用环境变量（Electron 主进程注入），否则默认 api/data/
const DATA_DIR = process.env.OI_DASHBOARD_DATA_DIR || path.join(__dirnameComputed, 'data')
const DATA_FILE = path.join(DATA_DIR, 'store.json')
const TMP_FILE = path.join(DATA_DIR, 'store.json.tmp')

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

export type Platform = 'luogu' | 'atcoder' | 'codeforces'

export const PLATFORMS: Platform[] = ['luogu', 'atcoder', 'codeforces']

export const PLATFORM_META: Record<Platform, { label: string; labelZh: string; color: string }> = {
  luogu: { label: 'Luogu', labelZh: '洛谷', color: '#BFBFBF' },
  atcoder: { label: 'AtCoder', labelZh: 'AtCoder', color: '#FF8F00' },
  codeforces: { label: 'Codeforces', labelZh: 'Codeforces', color: '#1F8ACB' },
}

export interface LuoguProfile {
  uid: number
  name: string
  avatar: string
  slogan: string
  color: string
  badge: string | null
}

export interface Submission {
  /** 平台联合唯一 ID：`{platform}-{id}`，避免不同平台 ID 冲突 */
  platform: Platform
  id: number
  pid: string
  title: string
  /** 洛谷用 0-8 新 9 档；其他平台暂时为 0（暂无评定） */
  difficulty: number
  difficultyLabel?: string
  status: number
  score: number
  language: number
  time: number
  memory: number
  submitTime: number
}

export interface PlatformConfig {
  /** 上次同步时间（每个平台独立） */
  lastSyncAt: string | null
}

export interface LuoguPlatformConfig extends PlatformConfig {
  uid: string
  clientId: string
}

export interface HandlePlatformConfig extends PlatformConfig {
  handle: string
}

export interface StoreData {
  config: {
    luogu: LuoguPlatformConfig
    atcoder: HandlePlatformConfig
    codeforces: HandlePlatformConfig
  }
  profile: LuoguProfile | null
  submissions: Submission[]
}

const EMPTY_STORE: StoreData = {
  config: {
    luogu: { uid: '', clientId: '', lastSyncAt: null },
    atcoder: { handle: '', lastSyncAt: null },
    codeforces: { handle: '', lastSyncAt: null },
  },
  profile: null,
  submissions: [],
}

let cache: StoreData | null = null
/** `platform-id` -> submissions 下标 */
const idIndex = new Map<string, number>()

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function rebuildIndex(): void {
  idIndex.clear()
  if (!cache) return
  cache.submissions.forEach((s, i) => idIndex.set(`${s.platform}-${s.id}`, i))
}

/** 从旧版 store 迁移：老版本 config 是 luogu 扁平结构 */
function migrateFromOld(parsed: any): StoreData {
  const oldConfig = parsed.config ?? {}
  return {
    config: {
      luogu: {
        uid: oldConfig.uid ?? '',
        clientId: oldConfig.clientId ?? '',
        lastSyncAt: oldConfig.lastSyncAt ?? null,
      },
      atcoder: { handle: '', lastSyncAt: null },
      codeforces: { handle: '', lastSyncAt: null },
    },
    profile: parsed.profile ?? null,
    submissions: Array.isArray(parsed.submissions)
      ? parsed.submissions.map((s: any) => ({
          ...s,
          platform: s.platform ?? 'luogu',
        }))
      : [],
  }
}

export function loadStore(): StoreData {
  if (cache) return cache
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as any
      if (parsed.config && ('uid' in parsed.config || 'luogu' in parsed.config)) {
        // 新版（带 luogu/atcoder/codeforces 嵌套）
        if (parsed.config.luogu) {
          cache = {
            config: {
              luogu: { ...EMPTY_STORE.config.luogu, ...parsed.config.luogu },
              atcoder: { ...EMPTY_STORE.config.atcoder, ...(parsed.config.atcoder ?? {}) },
              codeforces: { ...EMPTY_STORE.config.codeforces, ...(parsed.config.codeforces ?? {}) },
            },
            profile: parsed.profile ?? null,
            submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
          }
        } else {
          cache = migrateFromOld(parsed)
        }
      } else {
        cache = structuredClone(EMPTY_STORE)
      }
    } else {
      cache = structuredClone(EMPTY_STORE)
    }
  } catch (err) {
    console.error('[store] 读取数据文件失败，使用空存储:', err)
    cache = structuredClone(EMPTY_STORE)
  }
  rebuildIndex()
  return cache
}

export function saveStore(): void {
  if (!cache) return
  ensureDir()
  const raw = JSON.stringify(cache, null, 2)
  fs.writeFileSync(TMP_FILE, raw, 'utf-8')
  fs.renameSync(TMP_FILE, DATA_FILE)
}

/** 插入或更新一条提交记录，返回 true 表示新增 */
export function upsertSubmission(sub: Submission): boolean {
  const data = loadStore()
  const key = `${sub.platform}-${sub.id}`
  const idx = idIndex.get(key)
  if (idx === undefined) {
    data.submissions.push(sub)
    idIndex.set(key, data.submissions.length - 1)
    return true
  }
  data.submissions[idx] = sub
  return false
}

export function hasSubmission(platform: Platform, id: number): boolean {
  loadStore()
  return idIndex.has(`${platform}-${id}`)
}

// ---------- config setters ----------

export function setLuoguConfig(uid: string, clientId: string): void {
  const data = loadStore()
  data.config.luogu.uid = uid
  data.config.luogu.clientId = clientId
  saveStore()
}

export function setHandle(platform: Exclude<Platform, 'luogu'>, handle: string): void {
  const data = loadStore()
  ;(data.config[platform] as HandlePlatformConfig).handle = handle
  saveStore()
}

export function setProfile(profile: LuoguProfile | null): void {
  const data = loadStore()
  data.profile = profile
  saveStore()
}

export function markPlatformSynced(platform: Platform): string {
  const data = loadStore()
  const now = new Date().toISOString()
  data.config[platform].lastSyncAt = now
  saveStore()
  return now
}

/** 清空指定平台的提交记录 */
export function clearPlatformSubmissions(platform: Platform): number {
  const data = loadStore()
  const before = data.submissions.length
  data.submissions = data.submissions.filter((s) => s.platform !== platform)
  const removed = before - data.submissions.length
  data.config[platform].lastSyncAt = null
  rebuildIndex()
  saveStore()
  return removed
}

/** 清空所有提交记录（保留 config 与 profile） */
export function clearAllSubmissions(): number {
  const data = loadStore()
  const before = data.submissions.length
  data.submissions = []
  for (const p of PLATFORMS) data.config[p].lastSyncAt = null
  idIndex.clear()
  saveStore()
  return before
}

/** client_id 掩码，避免明文回传前端 */
export function maskSecret(secret: string): string | null {
  if (!secret) return null
  if (secret.length <= 8) return `${secret.slice(0, 2)}****`
  return `${secret.slice(0, 4)}****${secret.slice(-4)}`
}
