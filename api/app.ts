/**
 * 洛谷 OI Dashboard —— 本地 API 服务
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import configRoutes from './routes/config.js'
import syncRoutes from './routes/sync.js'
import submissionsRoutes from './routes/submissions.js'
import statsRoutes from './routes/stats.js'
import { loadStore } from './store.js'

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

// load env
dotenv.config()

// 启动即载入本地数据
loadStore()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))

/**
 * API Routes
 */
app.use('/api/config', configRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/submissions', submissionsRoutes)
app.use('/api/stats', statsRoutes)

/**
 * health
 */
app.use('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, message: 'ok' })
})

/**
 * 生产环境：托管前端构建产物 dist/
 */
const distDir = path.join(__dirnameComputed, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

/**
 * error handler middleware
 */
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] 未处理错误:', error)
  res.status(500).json({ success: false, error: '服务器内部错误' })
})

/**
 * 404 handler
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'API not found' })
})

export default app
