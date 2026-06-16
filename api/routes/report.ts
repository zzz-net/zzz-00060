import { Router, type Request, type Response } from 'express'
import Papa from 'papaparse'
import db from '../db.js'

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
        ORDER BY j.createdAt
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
    const flatData = data.map(d => ({
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
      判定记录: (d.judgments as any[]).map(j => `${j.result}(${j.prevStatus}->${j.newStatus})`).join('; '),
    }))

    const csv = Papa.unparse(flatData, { header: true })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=anomalies_export.csv')
    res.send('\uFEFF' + csv)
  } else {
    res.json({ success: true, data })
  }
})

export default router
