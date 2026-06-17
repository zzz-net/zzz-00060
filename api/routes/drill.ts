import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'

const router = Router()

interface DrillStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  result?: any
  error?: string
}

interface DrillSummary {
  id: string
  startedAt: string
  completedAt: string
  durationMs: number
  steps: string
  importResult: string
  judgeResult: string
  closeReopenResult: string
  exportResult: string
  anomalyCount: number
  exportedFile: string
  operator: string
}

router.get('/summaries', (_req: Request, res: Response): void => {
  const summaries = db.prepare(`
    SELECT * FROM drill_summaries
    ORDER BY completedAt DESC
    LIMIT 20
  `).all() as any[]

  const data = summaries.map(s => ({
    ...s,
    steps: JSON.parse(s.steps),
    importResult: s.importResult ? JSON.parse(s.importResult) : null,
    judgeResult: s.judgeResult ? JSON.parse(s.judgeResult) : null,
    closeReopenResult: s.closeReopenResult ? JSON.parse(s.closeReopenResult) : null,
    exportResult: s.exportResult ? JSON.parse(s.exportResult) : null,
  }))

  res.json({ success: true, data })
})

router.get('/summaries/:id', (req: Request, res: Response): void => {
  const summary = db.prepare(`
    SELECT * FROM drill_summaries WHERE id = ?
  `).get(req.params.id) as any

  if (!summary) {
    res.status(404).json({ success: false, error: '演练摘要不存在' })
    return
  }

  res.json({
    success: true,
    data: {
      ...summary,
      steps: JSON.parse(summary.steps),
      importResult: summary.importResult ? JSON.parse(summary.importResult) : null,
      judgeResult: summary.judgeResult ? JSON.parse(summary.judgeResult) : null,
      closeReopenResult: summary.closeReopenResult ? JSON.parse(summary.closeReopenResult) : null,
      exportResult: summary.exportResult ? JSON.parse(summary.exportResult) : null,
    },
  })
})

router.post('/complete', (req: Request, res: Response): void => {
  const {
    startedAt,
    durationMs,
    steps,
    importResult,
    judgeResult,
    closeReopenResult,
    exportResult,
    anomalyCount,
    exportedFile,
    operator,
  } = req.body

  if (!startedAt || !steps) {
    res.status(400).json({ success: false, error: '缺少必要参数' })
    return
  }

  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO drill_summaries (
      id, startedAt, completedAt, durationMs, steps,
      importResult, judgeResult, closeReopenResult, exportResult,
      anomalyCount, exportedFile, operator
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    startedAt,
    now,
    durationMs || 0,
    JSON.stringify(steps),
    importResult ? JSON.stringify(importResult) : '',
    judgeResult ? JSON.stringify(judgeResult) : '',
    closeReopenResult ? JSON.stringify(closeReopenResult) : '',
    exportResult ? JSON.stringify(exportResult) : '',
    anomalyCount || 0,
    exportedFile || '',
    operator || '演练员',
  )

  const saved = db.prepare(`
    SELECT * FROM drill_summaries WHERE id = ?
  `).get(id) as any

  res.json({
    success: true,
    data: {
      ...saved,
      steps: JSON.parse(saved.steps),
      importResult: saved.importResult ? JSON.parse(saved.importResult) : null,
      judgeResult: saved.judgeResult ? JSON.parse(saved.judgeResult) : null,
      closeReopenResult: saved.closeReopenResult ? JSON.parse(saved.closeReopenResult) : null,
      exportResult: saved.exportResult ? JSON.parse(saved.exportResult) : null,
    },
  })
})

export default router
