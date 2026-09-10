/**
 * 洛谷 Web 客户端（服务端代理用）
 *
 * 洛谷边缘 CDN（网宿）有反爬机制：
 * 1. 首次请求返回 302 + Set-Cookie: C3VK=...，客户端必须携带该 cookie 重试才放行；
 *    Node 内置 fetch 不维护 cookie jar，需手动跟随并回传。
 * 2. 新版前端不再对 _contentOnly 返回 JSON，页面数据嵌在
 *    <script id="lentille-context" type="application/json"> 中。
 * 3. 偶发返回 JS 挑战页（混淆脚本），检测到后短暂等待重试一次。
 */
import type { LuoguProfile, Submission } from './store.js'

const BASE = 'https://www.luogu.com.cn'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** 清洗用户粘贴的 client_id：去空白、引号、可能误带的 __client_id= 前缀 */
export function sanitizeClientId(raw: string): string {
  let s = String(raw ?? '').trim()
  s = s.replace(/^["']+|["']+$/g, '')
  if (/^__client_id\s*=\s*/i.test(s)) s = s.replace(/^__client_id\s*=\s*/i, '')
  return s.trim()
}

/**
 * 洛谷 record list 返回的 status 码（注意：新版 API 将所有非 AC 聚合为 status=14）
 * 数据实测：6496 条记录里只有 0/1/2/11/12/14 六种
 * 其中 status=14 是 WA/TLE/RE/MLE/OLE 等的聚合态
 */
export const STATUS_TEXT: Record<number, string> = {
  0: '等待评测',
  1: '正在评测',
  2: '编译错误',
  3: '运行错误',
  4: '时间超限',
  5: '内存超限',
  6: '输出超限',
  7: '答案错误',
  8: '通过',
  9: '系统错误',
  10: '部分正确',
  11: '系统错误',
  12: '通过',
  13: '格式错误',
  14: '未通过',
}

export const STATUS_AC = 12

/**
 * 难度码 -> 中文名 / 洛谷官方色（problem list 9 档，实测官网页面）
 * 编号说明：record list API 返回的 difficulty 是旧 8 档（0-7），
 * problem list API 用新 9 档（0-8），需抓取题目详情页做 enrich。
 * class: lcolor--grey-3/pink-3/orange-3/gold-3/green-3/cyan-3/blue-3/purple-3/lapis-4
 */
export const DIFFICULTY_META: Record<number, { name: string; color: string }> = {
  0: { name: '暂无评定', color: '#BFBFBF' },
  1: { name: '入门', color: '#FE4C61' },
  2: { name: '普及−', color: '#F39C11' },
  3: { name: '普及', color: '#FFC116' },
  4: { name: '普及+/提高−', color: '#52C41A' },
  5: { name: '提高', color: '#13C2C2' },
  6: { name: '提高+/省选−', color: '#3498DB' },
  7: { name: '省选/NOI−', color: '#9D3DCF' },
  8: { name: 'NOI/NOI+/CTS', color: '#0E1D69' },
}

/**
 * 将 Submission 映射到洛谷 problem list 的 9 档难度编号（0-8）。
 * 优先用 difficultyLabel（enriched 精确值），回退到 store.difficulty（record list 旧 8 档）。
 */
export function actualDifficulty(s: Submission): number {
  if (s.difficultyLabel) {
    for (const [k, v] of Object.entries(DIFFICULTY_META)) {
      if (s.difficultyLabel === v.name) return Number(k)
    }
  }
  // 回退：store.difficulty 7 实际对应 problem list 8（NOI/NOI+/CTS）
  if (s.difficulty === 7) return 8
  return s.difficulty
}

/**
 * 洛谷语言码表（多次评测机升级后保留的历史编号，来自 luogu-dev/judge-env 与前端源码交叉验证）
 * 实际 store.json 中出现的 code：1,3,4,7,11,12,16,25,27,28,34
 */
export const LANGUAGE_TEXT: Record<number, string> = {
  0: 'Pascal',
  1: 'C',
  2: 'C++ (C++98)',
  3: 'C++',
  4: 'C++11',
  5: 'C++14',
  6: 'Java 8',
  7: 'Python 2',
  8: 'Go',
  9: 'Rust',
  10: 'Python 3',
  11: 'C#',
  12: 'C++14',
  13: 'C++17',
  14: 'Haskell',
  15: 'Kotlin',
  16: 'Python 3',
  17: 'PyPy 3',
  18: 'Ruby',
  19: 'Rust',
  20: 'Scala',
  21: 'Shell',
  22: 'JavaScript',
  23: 'VB.NET',
  24: 'Vim',
  25: 'JavaScript (内置)',
  26: 'Zig',
  27: 'C# (.NET)',
  28: 'C++20',
  29: 'C (旧版)',
  30: 'C++ (旧版)',
  31: 'C (新版)',
  32: 'C++ (新版)',
  33: 'Python 3 (新版)',
  34: 'Python 2 (旧版)',
  35: 'C++ (比赛)',
  36: 'Java 17',
  37: 'C++23',
}

export function languageName(code: number): string {
  return LANGUAGE_TEXT[code] ?? `Lang ${code}`
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// HTTP 层：cookie jar + 手动 302 挑战跟随
// ---------------------------------------------------------------------------

/** CDN 挑战 cookie（C3VK 等），进程内复用，每次响应都会刷新 */
const jar = new Map<string, string>()

function absorbSetCookies(res: Response): void {
  const headers = res.headers as unknown as { getSetCookie?: () => string[] }
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  for (const sc of list) {
    const pair = sc.split(';')[0] ?? ''
    const eq = pair.indexOf('=')
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
  }
}

/**
 * 构造 Cookie 请求头：
 * - __client_id 和 _uid（用户数字 UID）是洛谷登录态双 cookie，缺一不可
 * - C3VK 等 CDN 挑战 cookie 由 jar 自动吸收回传
 */
function cookieHeader(clientId: string, uid?: string): string {
  const parts: string[] = []
  if (clientId) parts.push(`__client_id=${clientId}`)
  if (uid) parts.push(`_uid=${uid}`)
  for (const [k, v] of jar) {
    // __client_id / _uid 由参数显式控制，跳过 jar 里服务器给的未登录版本
    if (k === '__client_id' || k === '_uid') continue
    parts.push(`${k}=${v}`)
  }
  return parts.join('; ')
}

/** JS 挑战页特征：200 但无 lentille-context，且含混淆脚本变量 */
function isJsChallengePage(html: string): boolean {
  return (
    !html.includes('lentille-context') &&
    /var\s+_\$[a-z]+/.test(html) &&
    html.length < 30000
  )
}

interface FetchResult {
  status: number
  html: string
  challengeHops: number
}

/**
 * 发起洛谷页面请求：手动跟随 302（携带/回传 C3VK 挑战 cookie）。
 * 遇到 JS 挑战页时等待后重试。
 */
async function luoguPageFetch(url: string, clientId: string, uid: string, attempt = 0): Promise<FetchResult> {
  let cur = url
  let challengeHops = 0

  for (let hop = 0; hop < 6; hop++) {
    let res: Response
    try {
      res = await fetch(cur, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Referer: BASE + '/',
          'Upgrade-Insecure-Requests': '1',
          Cookie: cookieHeader(clientId, uid),
        },
      })
    } catch (err) {
      throw new Error(`网络请求失败，无法连接洛谷（${(err as Error).message}）`)
    }

    absorbSetCookies(res)

    if (res.status >= 300 && res.status < 400) {
      challengeHops += 1
      const loc = res.headers.get('location')
      cur = loc ? new URL(loc, cur).toString() : url
      continue
    }

    const html = await res.text()

    if (res.status === 403 || res.status === 421) {
      throw new Error(
        '洛谷拦截了服务器请求（HTTP 403）。这通常不是 client_id 错误，而是洛谷 CDN 安全验证未通过——请稍后再试；若反复出现，请确认本机能在浏览器中正常打开洛谷后重试。',
      )
    }
    if (!res.ok) {
      throw new Error(`洛谷返回 HTTP ${res.status}`)
    }

    if (isJsChallengePage(html)) {
      if (attempt < 1) {
        await sleep(1600)
        return luoguPageFetch(url, clientId, uid, attempt + 1)
      }
      throw new Error(
        '洛谷返回了 JavaScript 安全验证页，服务器端无法自动通过该验证。请稍等几分钟后重试（该验证通常 5 分钟内自动解除）。',
      )
    }

    return { status: res.status, html, challengeHops }
  }

  throw new Error('洛谷服务器反复重定向（安全验证未通过），请稍后再试。')
}

interface LuoguContext {
  /** 页面模板名，如 user.show / record.list / login */
  template: string
  /** lentille-context 的 data 节点（旧版接口对应 currentData） */
  data: Record<string, unknown>
}

/** 从页面中提取 lentille-context（template 与 data 都在包装层） */
function extractContext(html: string): LuoguContext | null {
  const m = html.match(/<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/)
  if (m) {
    try {
      const wrapper = JSON.parse(m[1]) as {
        template?: string
        data?: Record<string, unknown>
        currentData?: Record<string, unknown>
      }
      return {
        template: String(wrapper.template ?? ''),
        data: wrapper.data ?? wrapper.currentData ?? {},
      }
    } catch {
      return null
    }
  }
  // 兼容旧版直接返回 JSON 的情况
  try {
    const j = JSON.parse(html) as { currentTemplate?: string; currentData?: Record<string, unknown> }
    return { template: String(j.currentTemplate ?? ''), data: j.currentData ?? {} }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 业务接口
// ---------------------------------------------------------------------------

function normalizeAvatar(avatar: unknown): string {
  if (typeof avatar !== 'string' || !avatar) return ''
  if (avatar.startsWith('//')) return `https:${avatar}`
  if (avatar.startsWith('http')) return avatar
  return `${BASE}${avatar.startsWith('/') ? '' : '/'}${avatar}`
}

/** 拉取用户信息 */
export async function fetchUser(uid: string, clientId: string): Promise<LuoguProfile> {
  const { html } = await luoguPageFetch(`${BASE}/user/${uid}?_contentOnly=1`, clientId, uid)
  const ctx = extractContext(html)
  const user = (ctx?.data?.user ?? null) as Record<string, unknown> | null

  if (!user || typeof user.uid !== 'number') {
    if (ctx?.template === 'login') {
      throw new Error('洛谷要求登录后才能查看该页面：client_id 可能不正确或已过期，请重新复制 Cookie 中的 __client_id')
    }
    if (html.includes('用户不存在') || html.includes('Not Found')) {
      throw new Error(`未找到 UID 为 ${uid} 的洛谷用户，请检查 UID 是否正确`)
    }
    throw new Error('未能从洛谷页面中解析出用户信息（页面结构可能已更新）')
  }

  return {
    uid: user.uid as number,
    name: String(user.name ?? `UID ${uid}`),
    avatar: normalizeAvatar(user.avatar),
    slogan: String(user.slogan ?? ''),
    color: String(user.color ?? 'Gray'),
    badge: (user.badge as string) ?? null,
  }
}

interface RawRecord {
  id?: number
  problem?: {
    pid?: string
    title?: string
    difficulty?: number
  }
  status?: number
  score?: number
  language?: number
  time?: number | null
  memory?: number | null
  submitTime?: number
}

interface RawRecordPage {
  result?: RawRecord[]
  count?: number
}

function mapRecord(raw: RawRecord): Submission | null {
  if (typeof raw.id !== 'number' || !raw.problem?.pid) return null
  return {
    platform: 'luogu',
    id: raw.id,
    pid: String(raw.problem.pid),
    title: String(raw.problem.title ?? '未知题目'),
    difficulty: typeof raw.problem.difficulty === 'number' ? raw.problem.difficulty : 0,
    status: typeof raw.status === 'number' ? raw.status : -1,
    score: typeof raw.score === 'number' ? raw.score : 0,
    language: typeof raw.language === 'number' ? raw.language : -1,
    time: typeof raw.time === 'number' ? raw.time : 0,
    memory: typeof raw.memory === 'number' ? raw.memory : 0,
    submitTime: typeof raw.submitTime === 'number' ? raw.submitTime : 0,
  }
}

export interface RecordPage {
  records: Submission[]
  total: number
}

/** 拉取一页提交记录（page 从 1 开始，按时间倒序） */
export async function fetchRecordPage(
  uid: string,
  clientId: string,
  page: number,
): Promise<RecordPage> {
  const { html } = await luoguPageFetch(
    `${BASE}/record/list?uid=${uid}&page=${page}&_contentOnly=1`,
    clientId,
    uid,
  )
  const ctx = extractContext(html)

  if (ctx && ctx.template === 'login') {
    throw new Error('提交记录页要求登录态：client_id 不正确或已过期，请重新复制 Cookie 中的 __client_id 后再试')
  }

  const recordsNode = (ctx?.data?.records ?? null) as RawRecordPage | null
  const result = Array.isArray(recordsNode?.result) ? recordsNode!.result : []
  const records = result.map(mapRecord).filter((r): r is Submission => r !== null)

  if (records.length === 0 && page === 1) {
    throw new Error('未从洛谷解析到任何提交记录（页面结构可能已更新或该用户无记录）')
  }

  return {
    records,
    total: typeof recordsNode?.count === 'number' ? recordsNode.count : records.length,
  }
}

// ---------------------------------------------------------------------------
// 题目详情页 enrich（解决 record list 难度粒度过粗的问题）
// ---------------------------------------------------------------------------

/** 从题目详情页 HTML 提取 problem list 难度编号（0-8）。
 * 优先级：<a href="/problem/list?difficulty=N"> → 嵌入 JSON 的 "difficulty":N
 */
export function parseProblemDifficulty(html: string): number | null {
  // 1) Vue 渲染后的链接
  const m1 = html.match(/href=["'][^"']*problem\/list\?difficulty=(\d+)[^"']*["']/i)
  if (m1) {
    const n = parseInt(m1[1], 10)
    if (n >= 0 && n <= 8) return n
  }
  // 2) 嵌入 JSON 数据："difficulty": 8  或  "difficulty":8
  //    排除 statusDifficulty / difficultyLevel / difficultyLabel 等带前缀的
  const m2 = html.match(/(?<![A-Za-z])"difficulty"\s*:\s*(\d+)/)
  if (m2) {
    const n = parseInt(m2[1], 10)
    if (n >= 0 && n <= 8) return n
  }
  return null
}

/**
 * 抓取一题详情页，返回 problem list 难度编号 + 中文标签。
 * 失败返回 null（不抛错，enrich 可静默跳过）。
 */
export async function fetchProblemDifficulty(
  pid: string,
  clientId: string,
  uid: string,
): Promise<{ difficultyIndex: number; label: string } | null> {
  try {
    const { html } = await luoguPageFetch(`${BASE}/problem/${pid}?_contentOnly=1`, clientId, uid)
    const idx = parseProblemDifficulty(html)
    if (idx === null) return null
    const meta = DIFFICULTY_META[idx]
    return { difficultyIndex: idx, label: meta?.name ?? `难度 ${idx}` }
  } catch (err) {
    console.warn(`[enrich] fetch ${pid} failed: ${err instanceof Error ? err.message : err}`)
    return null
  }
}
