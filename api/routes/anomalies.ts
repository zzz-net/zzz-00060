import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  const { batchId, ruleId, status } = req.query

  let sql = `
    SELECT a.*, r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage, r.readDate,
      ru.name as ruleName, ru.type as ruleType,
      j.result as latestResult, j.reason as latestReason, j.note as latestNote, j.operator as latestOperator, j.createdAt as latestJudgmentAt,
      j.prevRuleId as latestPrevRuleId, j.newRuleId as latestNewRuleId
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    LEFT JOIN rules ru ON ru.id = a.ruleId
    LEFT JOIN judgments j ON j.id = (
      SELECT j2.id FROM judgments j2 WHERE j2.anomalyId = a.id ORDER BY j2.rowid DESC LIMIT 1
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
  const { result, reason, note, newRuleId } = req.body
  if (!result || !['confirm', 'false_positive'].includes(result)) {
    res.status(400).json({ success: false, error: '无效的判定结果，必须为 confirm 或 false_positive' })
    return
  }

  const anomaly = db.prepare('SELECT * FROM anomalies WHERE id = ?').get(req.params.id) as any
  if (!anomaly) {
    res.status(404).json({ success: false, error: '异常记录不存在' })
    return
  }

  let targetRuleId: string | null = null
  let targetRuleType: string | null = null
  let targetRuleVersion: number | null = null
  let targetDescription: string | null = null
  if (newRuleId && newRuleId !== anomaly.ruleId) {
    const rule = db.prepare('SELECT * FROM rules WHERE id = ? AND enabled = 1').get(newRuleId) as any
    if (!rule) {
      res.status(400).json({ success: false, error: '目标规则不存在或未启用' })
      return
    }
    targetRuleId = rule.id
    targetRuleType = rule.type
    targetRuleVersion = rule.version
    const reading = db.prepare('SELECT * FROM readings WHERE id = ?').get(anomaly.readingId) as any
    targetDescription = rule.type === 'spike'
      ? `人工改判：表号${reading?.meterNo}用量突增`
      : rule.type === 'negative'
        ? `人工改判：表号${reading?.meterNo}当前读数为负数`
        : rule.type === 'rollback'
          ? `人工改判：表号${reading?.meterNo}读数回退`
          : rule.type === 'overlimit'
            ? `人工改判：表号${reading?.meterNo}用量超限`
            : rule.type === 'null_value'
              ? `人工改判：表号${reading?.meterNo}读数空值`
              : `人工改判：表号${reading?.meterNo}`
  }

  const prevStatus = anomaly.status
  const prevRuleId = anomaly.ruleId
  const newStatus = result === 'confirm' ? 'confirmed' : 'false_positive'

  db.transaction(() => {
    db.prepare(`
      INSERT INTO judgments (id, anomalyId, prevStatus, newStatus, result, reason, note, prevRuleId, newRuleId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), anomaly.id, prevStatus, newStatus, result, reason || '', note || '',
      targetRuleId ? prevRuleId : '',
      targetRuleId || '',
    )

    if (targetRuleId) {
      db.prepare(
        'UPDATE anomalies SET status = ?, ruleId = ?, ruleVersion = ?, anomalyType = ?, description = ? WHERE id = ?'
      ).run(newStatus, targetRuleId, targetRuleVersion, targetRuleType, targetDescription, anomaly.id)
    } else {
      db.prepare('UPDATE anomalies SET status = ? WHERE id = ?').run(newStatus, anomaly.id)
    }
  })()

  const updated = db.prepare(`
    SELECT a.*, r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage,
      ru.name as ruleName
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    LEFT JOIN rules ru ON ru.id = a.ruleId
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
      INSERT INTO judgments (id, anomalyId, prevStatus, newStatus, result, reason, note, prevRuleId, newRuleId)
      VALUES (?, ?, ?, 'closed', 'close', ?, ?, '', '')
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
    'SELECT * FROM judgments WHERE anomalyId = ? ORDER BY rowid DESC LIMIT 1'
  ).get(anomaly.id) as any

  const targetStatus = lastJudgment ? lastJudgment.prevStatus : 'pending'

  db.transaction(() => {
    db.prepare(`
      INSERT INTO judgments (id, anomalyId, prevStatus, newStatus, result, reason, note, prevRuleId, newRuleId)
      VALUES (?, ?, 'closed', ?, 'reopen', ?, ?, '', '')
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
