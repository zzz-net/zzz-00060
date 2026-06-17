import { Router, type Request, type Response } from 'express'
import Papa from 'papaparse'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

router.get('/summary', (_req: Request, res: Response): void => {
  const totalAnomalies = (db.prepare('SELECT COUNT(*) as count FROM anomalies').get() as any).count
  const pendingCount = (db.prepare("SELECT COUNT(*) as count FROM anomalies WHERE status = 'pending'").get() as any).count
  const confirmedCount = (db.prepare("SELECT COUNT(*) as count FROM anomalies WHERE status = 'confirmed'").get() as any).count
  const falsePositiveCount = (db.prepare("SELECT COUNT(*) as count FROM anomalies WHERE status = 'false_positive'").get() as any).count
  const closedCount = (db.prepare("SELECT COUNT(*) as count FROM anomalies WHERE status = 'closed'").get() as any).count

  const byType = db.prepare('SELECT anomalyType, COUNT(*) as count FROM anomalies GROUP BY anomalyType').all()
  const byBatch = db.prepare(`
    SELECT a.batchId, b.batchNo, b.fileName, COUNT(*) as count
    FROM anomalies a
    LEFT JOIN batches b ON b.id = a.batchId
    GROUP BY a.batchId
  `).all()

  res.json({
    success: true,
    data: {
      totalAnomalies,
      pendingCount,
      confirmedCount,
      falsePositiveCount,
      closedCount,
      byType,
      byBatch,
    },
  })
})

router.get('/export', (req: Request, res: Response): void => {
  const format = (req.query.format as string) || 'json'

  const anomalies = db.prepare(`
    SELECT a.id, a.anomalyType, a.description, a.status, a.createdAt,
      r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage, r.readDate,
      ru.name as ruleName,
      b.batchNo, b.fileName as batchFileName
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    LEFT JOIN rules ru ON ru.id = a.ruleId
    LEFT JOIN batches b ON b.id = a.batchId
    ORDER BY a.createdAt DESC
  `).all() as any[]

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
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=anomalies_export.csv')
    res.send('\uFEFF' + csv)
  } else {
    res.json({ success: true, data })
  }
})

function getExportData() {
  const anomalies = db.prepare(`
    SELECT a.id, a.anomalyType, a.description, a.status, a.createdAt,
      r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage, r.readDate,
      ru.name as ruleName,
      b.batchNo, b.fileName as batchFileName
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    LEFT JOIN rules ru ON ru.id = a.ruleId
    LEFT JOIN batches b ON b.id = a.batchId
    ORDER BY a.createdAt DESC
  `).all() as any[]

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

router.post('/export-to-file', (req: Request, res: Response): void => {
  const {
    format = 'json',
    fileName,
    exportDir,
    conflictAction = 'rename',
    customFileName,
  } = req.body

  if (!format || !['csv', 'json'].includes(format)) {
    res.status(400).json({ success: false, error: '缺少或无效的 format 参数，必须是 csv 或 json' })
    return
  }

  const baseName = fileName || `report.${format}`
  const resolvedExportDir = exportDir ? path.resolve(exportDir) : path.resolve(__dirname, '..', '..')

  try {
    if (!fs.existsSync(resolvedExportDir)) {
      fs.mkdirSync(resolvedExportDir, { recursive: true })
    }
  } catch (e: unknown) {
    res.status(400).json({
      success: false,
      error: `导出目录不存在且无法创建: ${resolvedExportDir}`,
      blockedStep: '导出报告',
      retrySuggestion: '请选择一个有效的目录路径，或检查目录权限。',
    })
    return
  }

  try {
    fs.accessSync(resolvedExportDir, fs.constants.W_OK)
  } catch {
    res.status(400).json({
      success: false,
      error: `导出目录不可写: ${resolvedExportDir}`,
      blockedStep: '导出报告',
      retrySuggestion: '请选择一个可写的目录，或修改当前目录的权限后重试。',
    })
    return
  }

  const data = getExportData()

  let finalFileName = customFileName || baseName
  let finalFilePath = path.join(resolvedExportDir, finalFileName)
  const fileExists = fs.existsSync(finalFilePath)

  if (fileExists) {
    if (conflictAction === 'rename') {
      const ext = path.extname(finalFileName)
      const baseNameWithoutExt = path.basename(finalFileName, ext)
      let counter = 1
      while (fs.existsSync(path.join(resolvedExportDir, `${baseNameWithoutExt}_${counter}${ext}`))) {
        counter++
      }
      finalFileName = `${baseNameWithoutExt}_${counter}${ext}`
      finalFilePath = path.join(resolvedExportDir, finalFileName)
    } else if (conflictAction === 'overwrite') {
      // proceed to overwrite
    } else if (conflictAction === 'cancel') {
      res.json({
        success: false,
        data: {
          action: 'cancel',
          fileName: baseName,
          exportDir: resolvedExportDir,
          cancelled: true,
        },
      })
      return
    } else {
      res.status(400).json({
        success: false,
        error: `无效的 conflictAction: ${conflictAction}`,
        blockedStep: '导出报告',
        retrySuggestion: '请选择有效的冲突处理方式：rename、overwrite 或 cancel。',
      })
      return
    }
  }

  try {
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
      fs.writeFileSync(finalFilePath, '\uFEFF' + csv, 'utf-8')
    } else {
      fs.writeFileSync(finalFilePath, JSON.stringify(data, null, 2), 'utf-8')
    }

    const stat = fs.statSync(finalFilePath)

    res.json({
      success: true,
      data: {
        fileName: finalFileName,
        filePath: finalFilePath,
        exportDir: resolvedExportDir,
        format,
        fileSize: stat.size,
        recordCount: data.length,
        exportedAt: new Date().toISOString(),
        conflictAction: fileExists ? conflictAction : 'none',
        originalFileExists: fileExists,
      },
    })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: `导出文件失败: ${e instanceof Error ? e.message : String(e)}`,
      blockedStep: '导出报告',
      retrySuggestion: '请检查磁盘空间和目录权限，然后重试。',
    })
  }
})

export default router
