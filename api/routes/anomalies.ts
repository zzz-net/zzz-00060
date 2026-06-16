import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  const { batchId, ruleId, status } = req.query

  let sql = `
    SELECT a.*, r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage, r.readDate,
      ru.name as ruleName, ru.type as ruleType,
      j.result as latestResult, j.reason as latestReason, j.note as latestNote, j.operator as latestOperator, j.createdAt as latestJudgmentAt
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    LEFT JOIN rules ru ON ru.id = a.ruleId
    LEFT JOIN judgments j ON j.id = (
      SELECT j2.id FROM judgments j2 WHERE j2.anomalyId = a.id ORDER BY j2.createdAt DESC LIMIT 1
    )
    WHERE 1=1
  `
  const params: any[] = []

  if (batchId) {
    sql += ' AND a.batchId = ?'
    params.push(batchId)
  }
  if (ruleId) {
    sql += ' AND a.ruleId = ?'
    params.push(ruleId)
  }
  if (status) {
    sql += ' AND a.status = ?'
    params.push(status)
  }

  sql += ' ORDER BY a.createdAt DESC'

  const anomalies = db.prepare(sql).all(...params)
  res.json({ success: true, data: anomalies })
})

router.post('/:id/judge', (req: Request, res: Response): void => {
  const { result, reason, note } = req.body
  if (!result || !['confirm', 'false_positive'].includes(result)) {
    res.status(400).json({ success: false, error: '无效的判定结果，必须为 confirm 或 false_positive' })
    return
  }

  const anomaly = db.prepare('SELECT * FROM anomalies WHERE id = ?').get(req.params.id) as any
  if (!anomaly) {
    res.status(404).json({ success: false, error: '异常记录不存在' })
    return
  }

  const prevStatus = anomaly.status
  const newStatus = result === 'confirm' ? 'confirmed' : 'false_positive'

  db.transaction(() => {
    db.prepare(`
      INSERT INTO judgments (id, anomalyId, prevStatus, newStatus, result, reason, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), anomaly.id, prevStatus, newStatus, result, reason || '', note || '')

    db.prepare('UPDATE anomalies SET status = ? WHERE id = ?').run(newStatus, anomaly.id)
  })()

  const updated = db.prepare(`
    SELECT a.*, r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    WHERE a.id = ?
  `).get(req.params.id)

  res.json({ success: true, data: updated })
})

router.post('/:id/close', (req: Request, res: Response): void => {
  const anomaly = db.prepare('SELECT * FROM anomalies WHERE id = ?').get(req.params.id) as any
  if (!anomaly) {
    res.status(404).json({ success: false, error: '异常记录不存在' })
    return
  }

  const prevStatus = anomaly.status

  db.transaction(() => {
    db.prepare(`
      INSERT INTO judgments (id, anomalyId, prevStatus, newStatus, result, reason, note)
      VALUES (?, ?, ?, 'closed', 'confirm', ?, ?)
    `).run(uuidv4(), anomaly.id, prevStatus, '关闭异常', '')

    db.prepare('UPDATE anomalies SET status = ? WHERE id = ?').run('closed', anomaly.id)
  })()

  const updated = db.prepare(`
    SELECT a.*, r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    WHERE a.id = ?
  `).get(req.params.id)

  res.json({ success: true, data: updated })
})

router.post('/:id/reopen', (req: Request, res: Response): void => {
  const anomaly = db.prepare('SELECT * FROM anomalies WHERE id = ?').get(req.params.id) as any
  if (!anomaly) {
    res.status(404).json({ success: false, error: '异常记录不存在' })
    return
  }

  if (anomaly.status !== 'closed') {
    res.status(400).json({ success: false, error: '只能重新打开已关闭的异常' })
    return
  }

  const lastJudgment = db.prepare(
    'SELECT * FROM judgments WHERE anomalyId = ? ORDER BY createdAt DESC LIMIT 1'
  ).get(anomaly.id) as any

  const targetStatus = lastJudgment ? lastJudgment.prevStatus : 'pending'

  db.transaction(() => {
    db.prepare(`
      INSERT INTO judgments (id, anomalyId, prevStatus, newStatus, result, reason, note)
      VALUES (?, ?, 'closed', ?, 'reopen', ?, ?)
    `).run(uuidv4(), anomaly.id, targetStatus, '重新打开异常', '')

    db.prepare('UPDATE anomalies SET status = ? WHERE id = ?').run(targetStatus, anomaly.id)
  })()

  const updated = db.prepare(`
    SELECT a.*, r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    WHERE a.id = ?
  `).get(req.params.id)

  res.json({ success: true, data: updated })
})

export default router
