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
  completionValidation?: string
  status?: 'completed' | 'incomplete' | 'failed'
}

interface CompletionValidation {
  allStepsCompleted: boolean
  selfCheckPassed: boolean
  noSkippedFailedSteps: boolean
  allStepsExecuted: boolean
  exportConflictResolved: boolean
  completeValidationPassed: boolean
  failureReason?: string
  blockedStep?: string
  retrySuggestion?: string
}

function validateDrillCompletion(
  steps: DrillStep[],
  selfCheckStatus: string | null,
  hasConflictResolution: boolean
): CompletionValidation {
  const REQUIRED_STEPS = ['import', 'judge', 'close-reopen', 'export']

  const allStepsCompleted = steps.every(s => s.status === 'completed')
  const selfCheckPassed = selfCheckStatus === 'pass'
  const noSkippedFailedSteps = !steps.some(s => s.status === 'failed' && !s.completedAt)
  const allStepsExecuted = REQUIRED_STEPS.every(stepId =>
    steps.some(s => s.id === stepId && s.startedAt && s.completedAt)
  )
  const exportConflictResolved = hasConflictResolution

  const validation: CompletionValidation = {
    allStepsCompleted,
    selfCheckPassed,
    noSkippedFailedSteps,
    allStepsExecuted,
    exportConflictResolved,
    completeValidationPassed: false,
  }

  if (!selfCheckPassed) {
    validation.failureReason = '交付自检未通过，存在检查项失败。请先完成交付自检并确保所有检查项通过。'
    validation.blockedStep = '交付自检'
    validation.retrySuggestion = '请返回首页重新运行交付自检，修复失败项后再尝试完成演练。'
    return validation
  }

  if (!allStepsExecuted) {
    const missingSteps = REQUIRED_STEPS.filter(stepId =>
      !steps.some(s => s.id === stepId && s.startedAt && s.completedAt)
    )
    const stepNames: Record<string, string> = {
      'import': '样例导入',
      'judge': '人工改判',
      'close-reopen': '关闭再重开',
      'export': '导出报告',
    }
    validation.failureReason = `缺少关键演练步骤：${missingSteps.map(s => stepNames[s] || s).join('、')}。必须完整执行所有演练步骤，不能只跑局部命令。`
    validation.blockedStep = missingSteps.map(s => stepNames[s] || s).join('、')
    validation.retrySuggestion = '请按顺序完成所有演练步骤，确保每一步都执行成功后再完成演练。'
    return validation
  }

  if (!allStepsCompleted) {
    const failedSteps = steps.filter(s => s.status !== 'completed')
    validation.failureReason = `存在未完成或失败的演练步骤：${failedSteps.map(s => s.name).join('、')}。请确保所有步骤都成功完成。`
    validation.blockedStep = failedSteps.map(s => s.name).join('、')
    validation.retrySuggestion = '请点击失败步骤的「重试」按钮，或重置演练后重新执行。'
    return validation
  }

  if (!noSkippedFailedSteps) {
    validation.failureReason = '检测到跳过失败链路复跑。失败的步骤必须重新执行并成功，不能直接宣告完成。'
    validation.blockedStep = '失败链路复跑验证'
    validation.retrySuggestion = '请找到失败的步骤，点击重试按钮确保该步骤成功执行后再完成演练。'
    return validation
  }

  if (!exportConflictResolved) {
    validation.failureReason = '导出文件名冲突未解决。导出目录存在同名文件，必须先处理冲突才能完成演练。'
    validation.blockedStep = '导出报告'
    validation.retrySuggestion = '请在导出报告步骤中处理文件名冲突：选择自动重命名、确认覆盖或切换导出目录。'
    return validation
  }

  validation.completeValidationPassed = true
  return validation
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
    completionValidation: s.completionValidation ? JSON.parse(s.completionValidation) : null,
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
      completionValidation: summary.completionValidation ? JSON.parse(summary.completionValidation) : null,
    },
  })
})

router.post('/validate-completion', (req: Request, res: Response): void => {
  const { steps } = req.body

  if (!steps || !Array.isArray(steps)) {
    res.status(400).json({ success: false, error: '缺少必要参数: steps' })
    return
  }

  const latestCheck = db.prepare(`
    SELECT status, conflictResolution FROM self_check_records
    ORDER BY checkedAt DESC
    LIMIT 1
  `).get() as any

  const selfCheckStatus = latestCheck?.status || null
  const hasConflictResolution = !!(latestCheck?.conflictResolution && latestCheck.conflictResolution !== '')

  const validation = validateDrillCompletion(steps, selfCheckStatus, hasConflictResolution)

  res.json({ success: true, data: validation })
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

  const latestCheck = db.prepare(`
    SELECT status, conflictResolution FROM self_check_records
    ORDER BY checkedAt DESC
    LIMIT 1
  `).get() as any

  const selfCheckStatus = latestCheck?.status || null
  const hasConflictResolution = !!(latestCheck?.conflictResolution && latestCheck.conflictResolution !== '')

  const validation = validateDrillCompletion(steps, selfCheckStatus, hasConflictResolution)

  const id = uuidv4()
  const now = new Date().toISOString()
  const drillStatus = validation.completeValidationPassed ? 'completed' : 'incomplete'

  if (!validation.completeValidationPassed) {
    db.prepare(`
      INSERT INTO drill_summaries (
        id, startedAt, completedAt, durationMs, steps,
        importResult, judgeResult, closeReopenResult, exportResult,
        anomalyCount, exportedFile, operator, completionValidation, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      JSON.stringify(validation),
      drillStatus,
    )

    res.status(400).json({
      success: false,
      error: validation.failureReason || '演练完成验证未通过',
      blockedStep: validation.blockedStep,
      retrySuggestion: validation.retrySuggestion,
      data: {
        id,
        validation,
        status: drillStatus,
      },
    })
    return
  }

  db.prepare(`
    INSERT INTO drill_summaries (
      id, startedAt, completedAt, durationMs, steps,
      importResult, judgeResult, closeReopenResult, exportResult,
      anomalyCount, exportedFile, operator, completionValidation, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    JSON.stringify(validation),
    drillStatus,
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
      completionValidation: saved.completionValidation ? JSON.parse(saved.completionValidation) : null,
    },
  })
})

export default router
