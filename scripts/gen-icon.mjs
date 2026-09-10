/**
 * 本地生成 256x256 PNG 应用图标（完全不依赖外部服务）。
 * 设计：深色 (#0B0E0C) 圆角方底 + 居中 phosphor (#C8F542) terminal 窗口 + 内部几条光标短线。
 *
 * 用法：node scripts/gen-icon.mjs
 * 输出：build-res/icon.png（electron-builder 自动转 .ico；BrowserWindow.icon 直接引用）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'build-res')
const OUT_FILE = join(OUT_DIR, 'icon.png')

const W = 256
const H = 256

// 颜色
const BG = [0x0b, 0x0e, 0x0c]         // 深色底
const PANEL = [0x14, 0x18, 0x16]       // terminal 内部
const BORDER = [0xc8, 0xf5, 0x42]      // phosphor #C8F542
const CURSOR = [0xc8, 0xf5, 0x42]      // 同 phosphor
const INNER = [0x30, 0x38, 0x30]       // terminal titlebar 暗分隔

// Terminal 窗口区域（居中）
const WIN_X1 = 28, WIN_X2 = 228        // 窗口左右
const WIN_Y1 = 58, WIN_Y2 = 198        // 窗口上下
const BORDER_W = 6                     // 边框宽
const R = 24                           // 圆角半径

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/** 圆角矩形内外判定 */
function roundedRect(x, y, x1, y1, x2, y2, r) {
  // 先裁到正方形
  if (x < x1 + r && y < y1 + r) {
    const dx = x1 + r - x, dy = y1 + r - y
    return dx * dx + dy * dy <= r * r
  }
  if (x > x2 - r && y < y1 + r) {
    const dx = x - (x2 - r), dy = y1 + r - y
    return dx * dx + dy * dy <= r * r
  }
  if (x < x1 + r && y > y2 - r) {
    const dx = x1 + r - x, dy = y - (y2 - r)
    return dx * dx + dy * dy <= r * r
  }
  if (x > x2 - r && y > y2 - r) {
    const dx = x - (x2 - r), dy = y - (y2 - r)
    return dx * dx + dy * dy <= r * r
  }
  return x >= x1 && x <= x2 && y >= y1 && y <= y2
}

/** 画像素 buffer（RGBA） */
function buildPixels() {
  const pixels = Buffer.alloc(W * H * 4)
  let o = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let color = BG
      const inWin = roundedRect(x, y, WIN_X1, WIN_Y1, WIN_X2, WIN_Y2, R)
      if (inWin) {
        const inInner = roundedRect(
          x, y,
          WIN_X1 + BORDER_W, WIN_Y1 + BORDER_W,
          WIN_X2 - BORDER_W, WIN_Y2 - BORDER_W,
          Math.max(0, R - BORDER_W),
        )
        if (!inInner) {
          // 边框带 —— 内部区域外、窗口内
          color = BORDER
        } else {
          color = PANEL
          // titlebar 分隔线
          const barY1 = WIN_Y1 + BORDER_W + 22
          const barY2 = WIN_Y1 + BORDER_W + 26
          if (y >= barY1 && y <= barY2) color = INNER
          // titlebar 小圆点（模拟 macOS traffic light，用 border 色更协调）
          const dotCy = WIN_Y1 + BORDER_W + 11
          const dotRx = WIN_X1 + BORDER_W + 14
          const dotGx = WIN_X1 + BORDER_W + 28
          const dotBx = WIN_X1 + BORDER_W + 42
          for (const [dx, col] of [[dotRx, [0xFF, 0x5F, 0x57]], [dotGx, [0xFE, 0xBC, 0x2E]], [dotBx, [0x28, 0xC8, 0x40]]]) {
            const dd = (x - dx) * (x - dx) + (y - dotCy) * (y - dotCy)
            if (dd <= 25) color = col
          }
          // terminal 文本行（三条短线 + 一个光标）
          const lineY0 = WIN_Y1 + BORDER_W + 50
          const lh = 18
          const lineX = WIN_X1 + BORDER_W + 18
          // 第一行：常规短横
          if (y >= lineY0 && y <= lineY0 + 4 && x >= lineX && x <= lineX + 90) color = INNER
          // 第二行：长一点
          if (y >= lineY0 + lh && y <= lineY0 + lh + 4 && x >= lineX && x <= lineX + 130) color = INNER
          // 第三行：更短
          if (y >= lineY0 + lh * 2 && y <= lineY0 + lh * 2 + 4 && x >= lineX && x <= lineX + 70) color = INNER
          // 最后一行：phosphor 光标
          if (y >= lineY0 + lh * 3 && y <= lineY0 + lh * 3 + 5 && x >= lineX && x <= lineX + 36) color = CURSOR
        }
      }
      // 轻微的径向光晕（中心窗口区域周围）
      const cx = 128, cy = 128
      const dist = Math.hypot(x - cx, y - cy) / 180
      if (dist < 1 && !inWin) {
        const glow = Math.max(0, 0.06 * (1 - dist))
        color = mix(color, BORDER, glow)
      }
      pixels[o++] = color[0]
      pixels[o++] = color[1]
      pixels[o++] = color[2]
      pixels[o++] = 0xff
    }
  }
  return pixels
}

/** PNG chunk helper */
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function encodePng(pixels, w, h) {
  // raw scanlines: each line prefixed with 1 filter byte (0=None)
  const raw = Buffer.alloc(h * (1 + w * 4))
  let p = 0
  for (let y = 0; y < h; y++) {
    raw[p++] = 0
    pixels.copy(raw, p, y * w * 4, (y + 1) * w * 4)
    p += w * 4
  }
  const compressed = deflateSync(raw)

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type: RGBA
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter (0 = None, our scanlines use filter byte 0)
  ihdr[12] = 0  // interlace

  const iend = Buffer.alloc(0)
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend),
  ])
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const pixels = buildPixels()
  const png = encodePng(pixels, W, H)
  writeFileSync(OUT_FILE, png)
  console.log(`[gen-icon] ✓ ${OUT_FILE} (${png.length.toLocaleString()} bytes, ${W}x${H} PNG)`)
}

main()
