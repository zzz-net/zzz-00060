import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

interface CheckResultItem {
  pass: boolean
  name: string
  message: string
  details?: string
}

interface CheckResult {
  status: 'pass' | 'fail'
  durationMs: number
  items: CheckResultItem[]
  failureSummary: string
  keyLogs: string[]
}

function checkConfig(): CheckResultItem {
  try {
    const dataDir = path.resolve(__dirname, '..', '..', 'data')
    const dbPath = path.join(dataDir, 'meter-review.db')
    const dbExists = fs.existsSync(dbPath)
    const rules = db.prepare('SELECT COUNT(*) as count FROM rules').get() as any
    const rulesOk = rules.count > 0
    return {
      pass: dbExists && rulesOk,
      name: '配置检查',
      message: dbExists && rulesOk ? '数据库配置正常，默认规则已加载' : '配置异常',
      details: !dbExists ? `数据库文件不存在: ${dbPath}` : !rulesOk ? '规则表为空' : `规则数: ${rules.count}`,
    }
  } catch (e: unknown) {
    return {
      pass: false,
      name: '配置检查',
      message: '配置检查异常',
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

function checkApi(): CheckResultItem {
  try {
    const rules = db.prepare('SELECT * FROM rules LIMIT 1').get()
    const batches = db.prepare('SELECT COUNT(*) as count FROM batches').get() as any
    return {
      pass: !!rules,
      name: '接口检查',
      message: !!rules ? 'API 数据接口正常' : '接口异常',
      details: `规则查询: ${!!rules ? 'OK' : 'FAIL'}, 批次统计: ${batches.count} 条`,
    }
  } catch (e: unknown) {
    return {
      pass: false,
      name: '接口检查',
      message: '接口检查异常',
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

function checkSampleFile(): CheckResultItem {
  try {
    const samplePath = path.resolve(__dirname, '..', '..', 'test-data.csv')
    const exists = fs.existsSync(samplePath)
    if (!exists) {
      return {
        pass: false,
        name: '样例文件检查',
        message: '样例文件缺失',
        details: `未找到: ${samplePath}`,
      }
    }
    const content = fs.readFileSync(samplePath, 'utf-8')
    const hasHeader = content.includes('meterNo')
    const lines = content.split('\n').filter(l => l.trim()).length
    return {
      pass: hasHeader && lines > 1,
      name: '样例文件检查',
      message: hasHeader && lines > 1 ? '样例文件正常' : '样例文件格式错误',
      details: `路径: ${samplePath}, 行数: ${lines}, 表头校验: ${hasHeader ? 'OK' : 'FAIL'}`,
    }
  } catch (e: unknown) {
    return {
      pass: false,
      name: '样例文件检查',
      message: '样例文件检查异常',
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

function checkExportDir(): CheckResultItem {
  try {
    const exportDir = path.resolve(__dirname, '..', '..')
    const writable = fs.accessSync ? (() => {
      try {
        fs.accessSync(exportDir, fs.constants.W_OK)
        return true
      } catch {
        return false
      }
    })() : true

    const testFile = path.join(exportDir, `.export_test_${Date.now()}.tmp`)
    try {
      fs.writeFileSync(testFile, 'test')
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile)
      }
    } catch {
      return {
        pass: false,
        name: '导出目录检查',
        message: '导出目录不可写',
        details: `无法写入: ${exportDir}`,
      }
    }

    const conflicts = ['anomalies_export.csv', 'report.csv', 'report.json']
      .map(f => path.join(exportDir, f))
      .filter(f => fs.existsSync(f))

    return {
      pass: writable,
      name: '导出目录检查',
      message: writable ? '导出目录正常' : '导出目录不可写',
      details: writable
        ? (conflicts.length > 0
            ? `可写，但存在重名文件: ${conflicts.map(c => path.basename(c)).join(', ')}`
            : '可写，无重名冲突')
        : `目录不可写: ${exportDir}`,
    }
  } catch (e: unknown) {
    return {
      pass: false,
      name: '导出目录检查',
      message: '导出目录检查异常',
      details: e instanceof Error ? e.message : String(e),
    }
  }
}

router.get('/latest', (_req: Request, res: Response): void => {
  const latest = db.prepare(`
    SELECT * FROM self_check_records
    ORDER BY checkedAt DESC
    LIMIT 1
  `).get() as any

  if (!latest) {
    res.json({ success: true, data: null })
    return
  }

  res.json({
    success: true,
    data: {
      ...latest,
      configCheck: JSON.parse(latest.configCheck),
      apiCheck: JSON.parse(latest.apiCheck),
      sampleFileCheck: JSON.parse(latest.sampleFileCheck),
      exportDirCheck: JSON.parse(latest.exportDirCheck),
      keyLogs: JSON.parse(latest.keyLogs || '[]'),
    },
  })
})

router.get('/history', (_req: Request, res: Response): void => {
  const records = db.prepare(`
    SELECT * FROM self_check_records
    ORDER BY checkedAt DESC
    LIMIT 20
  `).all() as any[]

  const data = records.map(r => ({
    ...r,
    configCheck: JSON.parse(r.configCheck),
    apiCheck: JSON.parse(r.apiCheck),
    sampleFileCheck: JSON.parse(r.sampleFileCheck),
    exportDirCheck: JSON.parse(r.exportDirCheck),
    keyLogs: JSON.parse(r.keyLogs || '[]'),
  }))

  res.json({ success: true, data })
})

router.post('/run', (_req: Request, res: Response): void => {
  const startTime = Date.now()
  const keyLogs: string[] = []

  keyLogs.push(`[${new Date().toISOString()}] 开始执行自检...`)

  const configCheck = checkConfig()
  keyLogs.push(`[${new Date().toISOString()}] 配置检查: ${configCheck.pass ? 'PASS' : 'FAIL'} - ${configCheck.message}`)

  const apiCheck = checkApi()
  keyLogs.push(`[${new Date().toISOString()}] 接口检查: ${apiCheck.pass ? 'PASS' : 'FAIL'} - ${apiCheck.message}`)

  const sampleFileCheck = checkSampleFile()
  keyLogs.push(`[${new Date().toISOString()}] 样例文件检查: ${sampleFileCheck.pass ? 'PASS' : 'FAIL'} - ${sampleFileCheck.message}`)

  const exportDirCheck = checkExportDir()
  keyLogs.push(`[${new Date().toISOString()}] 导出目录检查: ${exportDirCheck.pass ? 'PASS' : 'FAIL'} - ${exportDirCheck.message}`)

  const allItems = [configCheck, apiCheck, sampleFileCheck, exportDirCheck]
  const allPass = allItems.every(i => i.pass)
  const durationMs = Date.now() - startTime

  const failedItems = allItems.filter(i => !i.pass)
  const failureSummary = failedItems.length > 0
    ? failedItems.map(f => `${f.name}: ${f.message}${f.details ? ` - ${f.details}` : ''}`).join('; ')
    : ''

  keyLogs.push(`[${new Date().toISOString()}] 自检完成，耗时 ${durationMs}ms，结果: ${allPass ? 'ALL PASS' : `FAILED ${failedItems.length} 项`}`)

  db.transaction(() => {
    db.prepare(`
      INSERT INTO self_check_records (
        id, status, checkedAt, durationMs,
        configCheck, apiCheck, sampleFileCheck, exportDirCheck,
        failureSummary, keyLogs
      ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      allPass ? 'pass' : 'fail',
      durationMs,
      JSON.stringify(configCheck),
      JSON.stringify(apiCheck),
      JSON.stringify(sampleFileCheck),
      JSON.stringify(exportDirCheck),
      failureSummary,
      JSON.stringify(keyLogs),
    )
  })()

  const latest = db.prepare(`
    SELECT * FROM self_check_records
    ORDER BY checkedAt DESC
    LIMIT 1
  `).get() as any

  res.json({
    success: true,
    data: {
      ...latest,
      configCheck: JSON.parse(latest.configCheck),
      apiCheck: JSON.parse(latest.apiCheck),
      sampleFileCheck: JSON.parse(latest.sampleFileCheck),
      exportDirCheck: JSON.parse(latest.exportDirCheck),
      keyLogs: JSON.parse(latest.keyLogs || '[]'),
    },
  })
})

export default router
