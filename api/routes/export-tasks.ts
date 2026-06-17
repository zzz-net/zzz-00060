import { Router, type Request, type Response } from 'express'
import Papa from 'papaparse'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

function parseRow(row: any): any {
  return {
    ...row,
    conflictInfo: row.conflictInfo ? JSON.parse(row.conflictInfo) : null,
    keyLogs: row.keyLogs ? JSON.parse(row.keyLogs) : [],
    conflictResolved: !!row.conflictResolved,
    filterBatchId: row.filterBatchId || '',
    filterAnomalyStatus: row.filterAnomalyStatus || '',
    filterAnomalyType: row.filterAnomalyType || '',
  }
}

function appendLog(logs: string[], msg: string): string[] {
  const timestamp = new Date().toISOString()
  return [...logs, `[${timestamp}] ${msg}`]
}

function getExportData(filters?: { batchId?: string; anomalyStatus?: string; anomalyType?: string }) {
  let whereParts: string[] = []
  const params: any[] = []

  if (filters?.batchId) {
    whereParts.push('a.batchId = ?')
    params.push(filters.batchId)
  }
  if (filters?.anomalyStatus) {
    whereParts.push('a.status = ?')
    params.push(filters.anomalyStatus)
  }
  if (filters?.anomalyType) {
    whereParts.push('a.anomalyType = ?')
    params.push(filters.anomalyType)
  }

  const whereClause = whereParts.length > 0 ? 'WHERE ' + whereParts.join(' AND ') : ''

  const anomalies = db.prepare(`
    SELECT a.id, a.anomalyType, a.description, a.status, a.createdAt,
      r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage, r.readDate,
      ru.name as ruleName,
      b.batchNo, b.fileName as batchFileName
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    LEFT JOIN rules ru ON ru.id = a.ruleId
    LEFT JOIN batches b ON b.id = a.batchId
    ${whereClause}
    ORDER BY a.createdAt DESC
  `).all(...params) as any[]

  const anomalyIds = anomalies.map(a => a.id)
  const judgments = anomalyIds.length > 0
    ? db.prepare(`
        SELECT j.* FROM judgments j
        WHERE j.anomalyId IN (${anomalyIds.map(() => '?').join(',')})
        ORDER BY j.rowid
      `).all(...anomalyIds) as any[]
    : []

  const judgmentMap = new Map<string, any[]>()
  for (const j of judgments) {
    if (!judgmentMap.has(j.anomalyId)) {
      judgmentMap.set(j.anomalyId, [])
    }
    judgmentMap.get(j.anomalyId)!.push(j)
  }

  const data = anomalies.map(a => ({
    ...a,
    judgments: judgmentMap.get(a.id) || [],
  }))

  return data
}

function generateTaskNo(): string {
  const now = new Date()
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 9000 + 1000)
  return `EXP${ymd}${random}`
}

function validateAndPrepareDir(exportDir: string): { ok: boolean; error?: string; resolvedDir: string } {
  const resolvedDir = path.resolve(exportDir)
  try {
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true })
    }
  } catch (e: unknown) {
    return { ok: false, error: `导出目录不存在且无法创建: ${resolvedDir}`, resolvedDir }
  }

  try {
    fs.accessSync(resolvedDir, fs.constants.W_OK)
  } catch {
    return { ok: false, error: `导出目录不可写: ${resolvedDir}`, resolvedDir }
  }

  return { ok: true, resolvedDir }
}

function detectConflict(resolvedDir: string, fileName: string): { exists: boolean; suggestedName: string; filePath: string; fileSize?: number; modifiedAt?: string } {
  const filePath = path.join(resolvedDir, fileName)
  if (!fs.existsSync(filePath)) {
    return { exists: false, suggestedName: fileName, filePath }
  }

  const stat = fs.statSync(filePath)
  const ext = path.extname(fileName)
  const base = path.basename(fileName, ext)
  let counter = 1
  let suggested = `${base}_${counter}${ext}`
  while (fs.existsSync(path.join(resolvedDir, suggested))) {
    counter++
    suggested = `${base}_${counter}${ext}`
  }

  return {
    exists: true,
    suggestedName: suggested,
    filePath,
    fileSize: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  }
}

function resolveFinalFileName(
  resolvedDir: string,
  originalName: string,
  conflictAction: string,
  newFileName?: string,
): { finalName: string; finalPath: string; actionTaken: string } {
  const conflict = detectConflict(resolvedDir, originalName)
  if (!conflict.exists) {
    return { finalName: originalName, finalPath: path.join(resolvedDir, originalName), actionTaken: 'none' }
  }

  if (conflictAction === 'overwrite') {
    return { finalName: originalName, finalPath: path.join(resolvedDir, originalName), actionTaken: 'overwrite' }
  }

  if (conflictAction === 'rename') {
    const nameToUse = newFileName && newFileName.trim() ? newFileName.trim() : conflict.suggestedName
    const finalPath = path.join(resolvedDir, nameToUse)
    if (fs.existsSync(finalPath)) {
      const ext = path.extname(nameToUse)
      const base = path.basename(nameToUse, ext)
      let counter = 1
      let candidate = `${base}_${counter}${ext}`
      while (fs.existsSync(path.join(resolvedDir, candidate))) {
        counter++
        candidate = `${base}_${counter}${ext}`
      }
      return { finalName: candidate, finalPath: path.join(resolvedDir, candidate), actionTaken: 'rename' }
    }
    return { finalName: nameToUse, finalPath, actionTaken: 'rename' }
  }

  return { finalName: originalName, finalPath: path.join(resolvedDir, originalName), actionTaken: 'none' }
}

function writeExportFile(format: string, data: any[], finalPath: string): void {
  if (format === 'csv') {
    const flatData = data.map(d => {
      const latest = (d.judgments as any[]).length > 0
        ? (d.judgments as any[])[(d.judgments as any[]).length - 1]
        : null
      return {
        异常ID: d.id,
        批次号: d.batchNo,
        批次文件: d.batchFileName,
        表号: d.meterNo,
        表名: d.meterName,
        上期读数: d.prevReading,
        当期读数: d.currReading,
        用量: d.usage,
        抄表日期: d.readDate,
        异常类型: d.anomalyType,
        规则名称: d.ruleName,
        异常描述: d.description,
        状态: d.status,
        创建时间: d.createdAt,
        最新改判结果: latest?.result ?? '',
        改判原因: latest?.reason ?? '',
        改判备注: latest?.note ?? '',
        改判操作人: latest?.operator ?? '',
        改判时间: latest?.createdAt ?? '',
        判定历史: (d.judgments as any[]).map(j => {
          const parts = [
            `${j.result}(${j.prevStatus}→${j.newStatus})`,
            j.reason ? `原因:${j.reason}` : '',
            j.note ? `备注:${j.note}` : '',
            j.prevRuleId && j.newRuleId ? `类别变更:${j.prevRuleId}→${j.newRuleId}` : '',
          ].filter(Boolean)
          return parts.join(' ; ')
        }).join(' || '),
      }
    })
    const csv = Papa.unparse(flatData, { header: true })
    fs.writeFileSync(finalPath, '\uFEFF' + csv, 'utf-8')
  } else {
    fs.writeFileSync(finalPath, JSON.stringify(data, null, 2), 'utf-8')
  }
}

function executeTask(taskId: string): void {
  const taskRow = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(taskId) as any
  if (!taskRow) return

  let logs = taskRow.keyLogs ? JSON.parse(taskRow.keyLogs) : []
  const startedAt = new Date().toISOString()
  logs = appendLog(logs, `任务开始执行`)

  db.prepare(`
    UPDATE export_tasks SET status = 'running', startedAt = ?, keyLogs = ? WHERE id = ?
  `).run(startedAt, JSON.stringify(logs), taskId)

  try {
    const format = taskRow.format
    const rawExportDir = taskRow.exportDir
    const fileName = taskRow.fileName
    const conflictAction = taskRow.conflictAction || ''

    logs = appendLog(logs, `验证导出目录: ${rawExportDir}`)
    const dirCheck = validateAndPrepareDir(rawExportDir)
    if (!dirCheck.ok) {
      throw new Error(dirCheck.error)
    }

    logs = appendLog(logs, `目录验证通过: ${dirCheck.resolvedDir}`)

    const conflict = detectConflict(dirCheck.resolvedDir, fileName)
    let conflictInfo = null
    if (conflict.exists) {
      conflictInfo = {
        exists: true,
        filePath: conflict.filePath,
        fileName: fileName,
        fileSize: conflict.fileSize,
        modifiedAt: conflict.modifiedAt,
        suggestedName: conflict.suggestedName,
      }
      logs = appendLog(logs, `检测到冲突文件: ${fileName} (${conflict.fileSize} bytes)`)

      if (!conflictAction) {
        logs = appendLog(logs, `任务暂停等待冲突处理`)
        db.prepare(`
          UPDATE export_tasks SET
            status = 'queued',
            conflictInfo = ?,
            keyLogs = ?,
            failureReason = '检测到同名文件，请选择冲突处理方式后重试'
          WHERE id = ?
        `).run(JSON.stringify(conflictInfo), JSON.stringify(logs), taskId)
        return
      }

      if (conflictAction === 'cancel') {
        logs = appendLog(logs, `用户取消导出任务`)
        const completedAt = new Date().toISOString()
        const duration = Date.now() - new Date(startedAt).getTime()
        db.prepare(`
          UPDATE export_tasks SET
            status = 'cancelled',
            conflictInfo = ?,
            conflictResolved = 1,
            keyLogs = ?,
            completedAt = ?,
            durationMs = ?
          WHERE id = ?
        `).run(JSON.stringify(conflictInfo), JSON.stringify(logs), completedAt, duration, taskId)
        return
      }
    }

    logs = appendLog(logs, `准备导出数据 (format=${format})`)
    const filters: { batchId?: string; anomalyStatus?: string; anomalyType?: string } = {}
    if (taskRow.filterBatchId) filters.batchId = taskRow.filterBatchId
    if (taskRow.filterAnomalyStatus) filters.anomalyStatus = taskRow.filterAnomalyStatus
    if (taskRow.filterAnomalyType) filters.anomalyType = taskRow.filterAnomalyType
    const data = getExportData(Object.keys(filters).length > 0 ? filters : undefined)
    logs = appendLog(logs, `获取 ${data.length} 条记录${Object.keys(filters).length > 0 ? ` (筛选: ${JSON.stringify(filters)})` : ''}`)

    let finalName = fileName
    let finalPath = path.join(dirCheck.resolvedDir, fileName)
    let actionTaken = 'none'

    if (conflict.exists && conflictAction) {
      const resolution = resolveFinalFileName(
        dirCheck.resolvedDir,
        fileName,
        conflictAction,
        taskRow.finalFileName || undefined,
      )
      finalName = resolution.finalName
      finalPath = resolution.finalPath
      actionTaken = resolution.actionTaken
      logs = appendLog(logs, `冲突处理: ${actionTaken}, 最终文件名: ${finalName}`)
    }

    logs = appendLog(logs, `写入文件: ${finalPath}`)
    writeExportFile(format, data, finalPath)

    const stat = fs.statSync(finalPath)
    logs = appendLog(logs, `文件写入成功, 大小=${stat.size} bytes`)

    const completedAt = new Date().toISOString()
    const duration = Date.now() - new Date(startedAt).getTime()

    db.prepare(`
      UPDATE export_tasks SET
        status = 'success',
        finalFileName = ?,
        finalFilePath = ?,
        fileSize = ?,
        recordCount = ?,
        conflictAction = ?,
        conflictResolved = ?,
        conflictInfo = ?,
        failureReason = '',
        keyLogs = ?,
        completedAt = ?,
        durationMs = ?
      WHERE id = ?
    `).run(
      finalName,
      finalPath,
      stat.size,
      data.length,
      actionTaken,
      conflict.exists ? 1 : 0,
      conflictInfo ? JSON.stringify(conflictInfo) : '',
      JSON.stringify(logs),
      completedAt,
      duration,
      taskId,
    )
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    logs = appendLog(logs, `任务失败: ${errorMsg}`)
    const completedAt = new Date().toISOString()
    const duration = Date.now() - new Date(startedAt).getTime()

    db.prepare(`
      UPDATE export_tasks SET
        status = 'failed',
        failureReason = ?,
        keyLogs = ?,
        completedAt = ?,
        durationMs = ?
      WHERE id = ?
    `).run(errorMsg, JSON.stringify(logs), completedAt, duration, taskId)
  }
}

router.get('/filter-options', (_req: Request, res: Response): void => {
  const batches = db.prepare('SELECT id, batchNo, fileName FROM batches ORDER BY createdAt DESC').all() as any[]
  const statuses = db.prepare('SELECT DISTINCT status FROM anomalies ORDER BY status').all() as any[]
  const types = db.prepare('SELECT DISTINCT anomalyType FROM anomalies ORDER BY anomalyType').all() as any[]

  res.json({
    success: true,
    data: {
      batches: batches.map(b => ({ id: b.id, batchNo: b.batchNo, fileName: b.fileName })),
      anomalyStatuses: statuses.map(s => s.status),
      anomalyTypes: types.map(t => t.anomalyType),
    },
  })
})

router.get('/generated-files', (req: Request, res: Response): void => {
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200)

  const rows = db.prepare(`
    SELECT id, taskNo, format, exportDir, fileName, finalFileName, finalFilePath,
      fileSize, recordCount, status, conflictAction, operator, createdAt, completedAt,
      filterBatchId, filterAnomalyStatus, filterAnomalyType
    FROM export_tasks
    WHERE status = 'success' AND finalFilePath != ''
    ORDER BY completedAt DESC
    LIMIT ?
  `).all(limit) as any[]

  const files = rows.map(r => ({
    taskId: r.id,
    taskNo: r.taskNo,
    format: r.format,
    exportDir: r.exportDir,
    originalFileName: r.fileName,
    finalFileName: r.finalFileName,
    finalFilePath: r.finalFilePath,
    fileSize: r.fileSize,
    recordCount: r.recordCount,
    conflictAction: r.conflictAction,
    operator: r.operator,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    exists: fs.existsSync(r.finalFilePath),
    filters: {
      batchId: r.filterBatchId || '',
      anomalyStatus: r.filterAnomalyStatus || '',
      anomalyType: r.filterAnomalyType || '',
    },
  }))

  res.json({ success: true, data: files, total: files.length })
})

router.get('/summary', (_req: Request, res: Response): void => {
  const total = (db.prepare('SELECT COUNT(*) as count FROM export_tasks').get() as any).count
  const queued = (db.prepare("SELECT COUNT(*) as count FROM export_tasks WHERE status = 'queued'").get() as any).count
  const running = (db.prepare("SELECT COUNT(*) as count FROM export_tasks WHERE status = 'running'").get() as any).count
  const success = (db.prepare("SELECT COUNT(*) as count FROM export_tasks WHERE status = 'success'").get() as any).count
  const failed = (db.prepare("SELECT COUNT(*) as count FROM export_tasks WHERE status = 'failed'").get() as any).count
  const cancelled = (db.prepare("SELECT COUNT(*) as count FROM export_tasks WHERE status = 'cancelled'").get() as any).count

  res.json({
    success: true,
    data: { total, queued, running, success, failed, cancelled },
  })
})

router.get('/', (req: Request, res: Response): void => {
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200)
  const status = req.query.status as string
  const offset = parseInt((req.query.offset as string) || '0', 10)

  let where = ''
  const params: any[] = []
  if (status) {
    where = 'WHERE status = ?'
    params.push(status)
  }

  const rows = db.prepare(`
    SELECT * FROM export_tasks ${where}
    ORDER BY createdAt DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[]

  const total = (db.prepare(`SELECT COUNT(*) as count FROM export_tasks ${where}`).get(...params) as any).count

  res.json({
    success: true,
    data: rows.map(parseRow),
    total,
  })
})

router.get('/:id', (req: Request, res: Response): void => {
  const row = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  if (!row) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }
  res.json({ success: true, data: parseRow(row) })
})

router.get('/check-conflict/preflight', (req: Request, res: Response): void => {
  const exportDir = (req.query.exportDir as string) || path.resolve(__dirname, '..', '..')
  const fileName = (req.query.fileName as string) || 'report.json'

  const dirCheck = validateAndPrepareDir(exportDir)
  if (!dirCheck.ok) {
    res.status(400).json({
      success: false,
      error: dirCheck.error,
      errorType: 'directory',
    })
    return
  }

  const conflict = detectConflict(dirCheck.resolvedDir, fileName)
  res.json({
    success: true,
    data: {
      exportDir: dirCheck.resolvedDir,
      fileName,
      exists: conflict.exists,
      filePath: conflict.filePath,
      suggestedName: conflict.suggestedName,
      fileSize: conflict.fileSize,
      modifiedAt: conflict.modifiedAt,
    },
  })
})

router.post('/', (req: Request, res: Response): void => {
  const {
    format,
    exportDir,
    fileName,
    conflictAction = '',
    newFileName,
    operator = '导出员',
    filterBatchId = '',
    filterAnomalyStatus = '',
    filterAnomalyType = '',
  } = req.body

  if (!format || !['csv', 'json'].includes(format)) {
    res.status(400).json({ success: false, error: '缺少或无效的 format 参数' })
    return
  }
  if (!exportDir || typeof exportDir !== 'string') {
    res.status(400).json({ success: false, error: '缺少 exportDir 参数' })
    return
  }
  if (!fileName || typeof fileName !== 'string') {
    res.status(400).json({ success: false, error: '缺少 fileName 参数' })
    return
  }

  const id = uuidv4()
  const taskNo = generateTaskNo()
  const createdAt = new Date().toISOString()
  let logs: string[] = []
  logs = appendLog(logs, `任务创建: ${taskNo}`)
  const filterDesc: string[] = []
  if (filterBatchId) filterDesc.push(`批次=${filterBatchId}`)
  if (filterAnomalyStatus) filterDesc.push(`状态=${filterAnomalyStatus}`)
  if (filterAnomalyType) filterDesc.push(`类型=${filterAnomalyType}`)
  logs = appendLog(logs, `参数: format=${format}, dir=${exportDir}, file=${fileName}${filterDesc.length > 0 ? `, 筛选: ${filterDesc.join(', ')}` : ''}`)

  db.prepare(`
    INSERT INTO export_tasks (
      id, taskNo, status, format, exportDir, fileName,
      finalFileName, conflictAction, keyLogs, operator, createdAt,
      filterBatchId, filterAnomalyStatus, filterAnomalyType
    ) VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, taskNo, format, exportDir, fileName,
    newFileName || '', conflictAction || '', JSON.stringify(logs), operator, createdAt,
    filterBatchId, filterAnomalyStatus, filterAnomalyType,
  )

  setImmediate(() => executeTask(id))

  const row = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(id) as any
  res.json({ success: true, data: parseRow(row) })
})

router.post('/:id/resolve-conflict', (req: Request, res: Response): void => {
  const taskRow = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  if (!taskRow) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  const {
    conflictAction,
    newFileName,
    exportDir,
  } = req.body

  if (!conflictAction || !['rename', 'overwrite', 'cancel', 'changeDir'].includes(conflictAction)) {
    res.status(400).json({ success: false, error: '缺少或无效的 conflictAction 参数' })
    return
  }

  let logs = taskRow.keyLogs ? JSON.parse(taskRow.keyLogs) : []
  logs = appendLog(logs, `冲突处理决策: ${conflictAction}`)

  let actualDir = taskRow.exportDir
  if (conflictAction === 'changeDir' && exportDir) {
    actualDir = exportDir
    logs = appendLog(logs, `切换导出目录: ${actualDir}`)
  }

  let actualFinalName = taskRow.finalFileName
  if (conflictAction === 'rename' && newFileName) {
    actualFinalName = newFileName
    logs = appendLog(logs, `指定新文件名: ${newFileName}`)
  }

  db.prepare(`
    UPDATE export_tasks SET
      conflictAction = ?,
      finalFileName = ?,
      exportDir = ?,
      keyLogs = ?,
      failureReason = ''
    WHERE id = ?
  `).run(
    conflictAction === 'changeDir' ? 'rename' : conflictAction,
    actualFinalName,
    actualDir,
    JSON.stringify(logs),
    req.params.id,
  )

  if (conflictAction !== 'cancel') {
    setImmediate(() => executeTask(req.params.id))
  } else {
    const completedAt = new Date().toISOString()
    db.prepare(`
      UPDATE export_tasks SET
        status = 'cancelled',
        conflictResolved = 1,
        keyLogs = ?,
        completedAt = ?,
        durationMs = ?
      WHERE id = ?
    `).run(JSON.stringify(appendLog(logs, `用户取消任务`)), completedAt, 0, req.params.id)
  }

  const row = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  res.json({ success: true, data: parseRow(row) })
})

router.post('/:id/retry', (req: Request, res: Response): void => {
  const taskRow = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  if (!taskRow) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  if (!['failed', 'queued', 'cancelled', 'success'].includes(taskRow.status)) {
    res.status(400).json({ success: false, error: `当前状态 ${taskRow.status} 不支持重试` })
    return
  }

  let logs = taskRow.keyLogs ? JSON.parse(taskRow.keyLogs) : []
  logs = appendLog(logs, `用户触发重试`)

  db.prepare(`
    UPDATE export_tasks SET
      status = 'queued',
      startedAt = '',
      completedAt = '',
      durationMs = 0,
      failureReason = '',
      finalFileName = '',
      finalFilePath = '',
      fileSize = 0,
      recordCount = 0,
      keyLogs = ?
    WHERE id = ?
  `).run(JSON.stringify(logs), req.params.id)

  setImmediate(() => executeTask(req.params.id))

  const row = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  res.json({ success: true, data: parseRow(row) })
})

router.post('/:id/cancel', (req: Request, res: Response): void => {
  const taskRow = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  if (!taskRow) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  if (!['queued', 'running'].includes(taskRow.status)) {
    res.status(400).json({ success: false, error: `当前状态 ${taskRow.status} 不支持取消` })
    return
  }

  let logs = taskRow.keyLogs ? JSON.parse(taskRow.keyLogs) : []
  logs = appendLog(logs, `用户取消任务`)
  const completedAt = new Date().toISOString()

  db.prepare(`
    UPDATE export_tasks SET
      status = 'cancelled',
      keyLogs = ?,
      completedAt = ?,
      failureReason = '用户主动取消'
    WHERE id = ?
  `).run(JSON.stringify(logs), completedAt, req.params.id)

  const row = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  res.json({ success: true, data: parseRow(row) })
})

router.post('/:id/change-dir-retry', (req: Request, res: Response): void => {
  const taskRow = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  if (!taskRow) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  const { exportDir } = req.body
  if (!exportDir) {
    res.status(400).json({ success: false, error: '缺少 exportDir 参数' })
    return
  }

  let logs = taskRow.keyLogs ? JSON.parse(taskRow.keyLogs) : []
  logs = appendLog(logs, `切换导出目录并重试: ${exportDir}`)

  db.prepare(`
    UPDATE export_tasks SET
      status = 'queued',
      exportDir = ?,
      conflictAction = 'rename',
      conflictResolved = 0,
      startedAt = '',
      completedAt = '',
      durationMs = 0,
      failureReason = '',
      finalFileName = '',
      finalFilePath = '',
      fileSize = 0,
      recordCount = 0,
      keyLogs = ?
    WHERE id = ?
  `).run(exportDir, JSON.stringify(logs), req.params.id)

  setImmediate(() => executeTask(req.params.id))

  const row = db.prepare('SELECT * FROM export_tasks WHERE id = ?').get(req.params.id) as any
  res.json({ success: true, data: parseRow(row) })
})

export default router
