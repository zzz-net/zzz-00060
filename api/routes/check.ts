import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

interface ConflictFile {
  name: string
  path: string
  size: number
  modifiedAt: string
}

interface CheckResultItem {
  pass: boolean
  name: string
  message: string
  details?: string
  conflictInfo?: {
    exists: boolean
    files: ConflictFile[]
    exportDir?: string
    suggestedAction?: string
  }
}

interface CheckResult {
  status: 'pass' | 'fail'
  durationMs: number
  items: CheckResultItem[]
  failureSummary: string
  keyLogs: string[]
  exportConflictInfo?: any
  conflictResolution?: any
}

function generateUniqueFileName(dir: string, fileName: string): string {
  const ext = path.extname(fileName)
  const baseName = path.basename(fileName, ext)
  let counter = 1
  let newName = fileName
  while (fs.existsSync(path.join(dir, newName))) {
    newName = `${baseName}_${counter}${ext}`
    counter++
  }
  return newName
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

function checkExportDir(resolvedConflicts?: string[], customExportDir?: string): CheckResultItem {
  try {
    const exportDir = customExportDir ? path.resolve(customExportDir) : path.resolve(__dirname, '..', '..')

    if (!fs.existsSync(exportDir)) {
      try {
        fs.mkdirSync(exportDir, { recursive: true })
      } catch (e: unknown) {
        return {
          pass: false,
          name: '导出目录检查',
          message: '导出目录不存在且无法创建',
          details: `目录不存在且无法创建: ${exportDir}。${e instanceof Error ? e.message : String(e)}。请检查目录路径或权限。`,
          conflictInfo: {
            exists: false,
            files: [],
            suggestedAction: '请指定一个有效的目录路径，或检查父目录权限。',
          },
        }
      }
    }

    let writable = true
    try {
      fs.accessSync(exportDir, fs.constants.W_OK)
    } catch {
      writable = false
    }

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
        details: `无法写入: ${exportDir}。请检查目录权限或更换导出目录。`,
        conflictInfo: {
          exists: false,
          files: [],
          suggestedAction: '请选择一个可写的目录，或修改当前目录的权限后重试。',
        },
      }
    }

    if (!writable) {
      return {
        pass: false,
        name: '导出目录检查',
        message: '导出目录不可写',
        details: `目录不可写: ${exportDir}。请检查目录权限。`,
        conflictInfo: {
          exists: false,
          files: [],
          suggestedAction: '请选择一个可写的目录，或修改当前目录的权限后重试。',
        },
      }
    }

    const conflictFiles = ['anomalies_export.csv', 'report.csv', 'report.json', 'drill_report.csv', 'drill_report.json']
      .map(f => ({ name: f, path: path.join(exportDir, f) }))
      .filter(f => fs.existsSync(f.path) && !(resolvedConflicts?.includes(f.name)))
      .map(f => {
        const stat = fs.statSync(f.path)
        return {
          name: f.name,
          path: f.path,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        }
      })

    const hasConflicts = conflictFiles.length > 0

    return {
      pass: writable && !hasConflicts,
      name: '导出目录检查',
      message: !writable
        ? '导出目录不可写'
        : hasConflicts
          ? '导出目录存在重名文件冲突'
          : '导出目录正常',
      details: !writable
        ? `目录不可写: ${exportDir}。请检查目录权限。`
        : hasConflicts
          ? `存在重名冲突文件: ${conflictFiles.map(c => c.name).join(', ')}。请处理冲突后重试：改名、覆盖或切换目录。`
          : `可写，无重名冲突。导出目录: ${exportDir}`,
      conflictInfo: {
        exists: hasConflicts,
        files: conflictFiles,
        exportDir,
        suggestedAction: hasConflicts ? '请选择冲突处理方式：rename（自动重命名）、overwrite（覆盖）、changeDir（切换导出目录）' : undefined,
      },
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
      exportConflictInfo: latest.exportConflictInfo ? JSON.parse(latest.exportConflictInfo) : null,
      conflictResolution: latest.conflictResolution ? JSON.parse(latest.conflictResolution) : null,
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
    exportConflictInfo: r.exportConflictInfo ? JSON.parse(r.exportConflictInfo) : null,
    conflictResolution: r.conflictResolution ? JSON.parse(r.conflictResolution) : null,
  }))

  res.json({ success: true, data })
})

router.post('/run', (_req: Request, res: Response): void => {
  const startTime = Date.now()
  const keyLogs: string[] = []

  keyLogs.push(`[${new Date().toISOString()}] 开始执行自检...`)

  const latestConfig = db.prepare(`
    SELECT fileName FROM export_configs
    WHERE conflictAction IS NOT NULL
    ORDER BY updatedAt DESC
    LIMIT 10
  `).all() as any[]

  const resolvedConflicts = latestConfig.map(c => c.fileName)

  const configCheck = checkConfig()
  keyLogs.push(`[${new Date().toISOString()}] 配置检查: ${configCheck.pass ? 'PASS' : 'FAIL'} - ${configCheck.message}`)

  const apiCheck = checkApi()
  keyLogs.push(`[${new Date().toISOString()}] 接口检查: ${apiCheck.pass ? 'PASS' : 'FAIL'} - ${apiCheck.message}`)

  const sampleFileCheck = checkSampleFile()
  keyLogs.push(`[${new Date().toISOString()}] 样例文件检查: ${sampleFileCheck.pass ? 'PASS' : 'FAIL'} - ${sampleFileCheck.message}`)

  const exportDirCheck = checkExportDir(resolvedConflicts)
  keyLogs.push(`[${new Date().toISOString()}] 导出目录检查: ${exportDirCheck.pass ? 'PASS' : 'FAIL'} - ${exportDirCheck.message}`)

  const allItems = [configCheck, apiCheck, sampleFileCheck, exportDirCheck]
  const allPass = allItems.every(i => i.pass)
  const durationMs = Date.now() - startTime

  const failedItems = allItems.filter(i => !i.pass)
  const failureSummary = failedItems.length > 0
    ? failedItems.map(f => `${f.name}: ${f.message}${f.details ? ` - ${f.details}` : ''}`).join('; ')
    : ''

  const exportConflictInfo = exportDirCheck.conflictInfo || null

  keyLogs.push(`[${new Date().toISOString()}] 自检完成，耗时 ${durationMs}ms，结果: ${allPass ? 'ALL PASS' : `FAILED ${failedItems.length} 项`}`)
  if (exportConflictInfo?.exists) {
    keyLogs.push(`[${new Date().toISOString()}] 检测到导出文件名冲突: ${exportConflictInfo.files.map((f: any) => f.name).join(', ')}`)
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO self_check_records (
        id, status, checkedAt, durationMs,
        configCheck, apiCheck, sampleFileCheck, exportDirCheck,
        failureSummary, keyLogs, exportConflictInfo
      ) VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
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
      exportConflictInfo ? JSON.stringify(exportConflictInfo) : '',
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
      exportConflictInfo: latest.exportConflictInfo ? JSON.parse(latest.exportConflictInfo) : null,
      conflictResolution: latest.conflictResolution ? JSON.parse(latest.conflictResolution) : null,
    },
  })
})

router.get('/export/conflict', (req: Request, res: Response): void => {
  const fileName = (req.query.fileName as string) || 'report.csv'
  const exportDir = path.resolve(__dirname, '..', '..')

  const filePath = path.join(exportDir, fileName)
  const exists = fs.existsSync(filePath)

  let conflictInfo: any = {
    exists,
    filePath,
    fileName,
  }

  if (exists) {
    const stat = fs.statSync(filePath)
    conflictInfo = {
      ...conflictInfo,
      fileSize: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      suggestedName: generateUniqueFileName(exportDir, fileName),
    }
  }

  res.json({ success: true, data: conflictInfo })
})

router.post('/export/resolve-conflict', async (req: Request, res: Response): Promise<void> => {
  const { fileName, action, newFileName, exportDir: customExportDir, performExport = true } = req.body

  if (!fileName || !action) {
    res.status(400).json({ success: false, error: '缺少必要参数: fileName 和 action' })
    return
  }

  if (!['rename', 'overwrite', 'cancel', 'changeDir'].includes(action)) {
    res.status(400).json({ success: false, error: '无效的 action，必须是 rename、overwrite、changeDir 或 cancel' })
    return
  }

  const exportDir = customExportDir ? path.resolve(customExportDir) : path.resolve(__dirname, '..', '..')

  if (action === 'changeDir' && !customExportDir) {
    res.status(400).json({
      success: false,
      error: '切换目录时必须提供 exportDir 参数',
      blockedStep: '导出报告',
      retrySuggestion: '请指定一个有效的导出目录路径。',
    })
    return
  }

  if (action !== 'cancel') {
    try {
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true })
      }
    } catch (e: unknown) {
      res.status(400).json({
        success: false,
        error: `导出目录不存在且无法创建: ${exportDir}。${e instanceof Error ? e.message : String(e)}`,
        blockedStep: '导出报告',
        retrySuggestion: '请选择一个有效的目录路径，或检查目录权限。',
      })
      return
    }

    try {
      fs.accessSync(exportDir, fs.constants.W_OK)
    } catch {
      res.status(400).json({
        success: false,
        error: `导出目录不可写: ${exportDir}。请检查目录权限或更换目录。`,
        blockedStep: '导出报告',
        retrySuggestion: '请选择一个可写的目录，或修改当前目录的权限后重试。',
      })
      return
    }

    const testFile = path.join(exportDir, `.write_test_${Date.now()}.tmp`)
    try {
      fs.writeFileSync(testFile, 'test')
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile)
      }
    } catch {
      res.status(400).json({
        success: false,
        error: `导出目录写入测试失败: ${exportDir}。目录可能不可写。`,
        blockedStep: '导出报告',
        retrySuggestion: '请选择一个可写的目录，或检查目录权限后重试。',
      })
      return
    }
  }

  const filePath = path.join(exportDir, fileName)
  const exists = fs.existsSync(filePath)
  const format = fileName.endsWith('.json') ? 'json' : 'csv'

  let resolution: any = {
    action,
    fileName,
    exportDir,
    originalFilePath: filePath,
    originalFileExists: exists,
    resolvedAt: new Date().toISOString(),
    success: true,
  }

  if (action === 'cancel') {
    resolution.success = false
    resolution.failureReason = '用户取消导出'
    resolution.retrySuggestion = '如需继续导出，请重新选择导出方式。'
  } else {
    let finalName = fileName
    if (action === 'rename' || action === 'changeDir') {
      finalName = newFileName || generateUniqueFileName(action === 'changeDir' ? exportDir : path.resolve(__dirname, '..', '..'), fileName)
    }
    resolution.newFileName = finalName
    resolution.finalFilePath = path.join(exportDir, finalName)

    if (action === 'rename') {
      resolution.failureReason = exists ? `原文件 ${fileName} 已存在，将自动重命名为 ${finalName}` : `使用指定文件名 ${finalName}`
    } else if (action === 'overwrite') {
      resolution.failureReason = exists ? `将覆盖已存在的文件 ${fileName}` : `文件 ${fileName} 不存在，将新建`
    } else if (action === 'changeDir') {
      resolution.failureReason = `切换到新目录: ${exportDir}，文件名为 ${finalName}`
    }

    if (performExport) {
      try {
        const exportRes = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/report/export-to-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format,
            fileName: finalName,
            exportDir,
            conflictAction: action === 'changeDir' ? 'rename' : action,
            customFileName: finalName,
          }),
        })

        const exportData = await exportRes.json()

        if (!exportRes.ok || !exportData.success) {
          resolution.success = false
          resolution.failureReason = exportData.error || '导出执行失败'
          resolution.retrySuggestion = '请检查导出配置后重试。'
          resolution.exportError = exportData.error
        } else {
          resolution.exportResult = exportData.data
          resolution.finalFilePath = exportData.data.filePath
          resolution.newFileName = exportData.data.fileName
          resolution.exportedAt = exportData.data.exportedAt
          resolution.fileSize = exportData.data.fileSize
          resolution.recordCount = exportData.data.recordCount
        }
      } catch (e: unknown) {
        resolution.success = false
        resolution.failureReason = `导出执行异常: ${e instanceof Error ? e.message : String(e)}`
        resolution.retrySuggestion = '请检查服务是否正常运行后重试。'
      }
    }
  }

  const latest = db.prepare(`
    SELECT id FROM self_check_records
    ORDER BY checkedAt DESC
    LIMIT 1
  `).get() as any

  if (latest) {
    db.prepare(`
      UPDATE self_check_records
      SET conflictResolution = ?
      WHERE id = ?
    `).run(JSON.stringify(resolution), latest.id)
  }

  const configId = uuidv4()
  db.prepare(`
    INSERT INTO export_configs (
      id, exportDir, fileName, format, conflictAction, newFileName, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    configId,
    exportDir,
    resolution.newFileName || fileName,
    format,
    action,
    resolution.newFileName || '',
  )

  res.json({
    success: resolution.success,
    data: resolution,
  })
})

router.get('/export/config', (_req: Request, res: Response): void => {
  const configs = db.prepare(`
    SELECT * FROM export_configs
    ORDER BY updatedAt DESC
    LIMIT 10
  `).all() as any[]

  res.json({ success: true, data: configs })
})

router.post('/export/config', (req: Request, res: Response): void => {
  const { exportDir, fileName, format } = req.body

  if (!exportDir || !fileName || !format) {
    res.status(400).json({ success: false, error: '缺少必要参数: exportDir、fileName、format' })
    return
  }

  const id = uuidv4()
  db.prepare(`
    INSERT INTO export_configs (
      id, exportDir, fileName, format, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, exportDir, fileName, format)

  const saved = db.prepare('SELECT * FROM export_configs WHERE id = ?').get(id)
  res.json({ success: true, data: saved })
})

export default router
