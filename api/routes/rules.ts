import { Router, type Request, type Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db.js'

const router = Router()

router.get('/', (_req: Request, res: Response): void => {
  const rules = db.prepare('SELECT * FROM rules ORDER BY createdAt').all()
  res.json({ success: true, data: rules })
})

router.post('/', (req: Request, res: Response): void => {
  const { name, type, description, params } = req.body
  if (!name || !type) {
    res.status(400).json({ success: false, error: '规则名称和类型为必填' })
    return
  }

  const validTypes = ['spike', 'negative', 'rollback', 'overlimit', 'null_value']
  if (!validTypes.includes(type)) {
    res.status(400).json({ success: false, error: '无效的规则类型' })
    return
  }

  const id = uuidv4()
  const paramsStr = params ? (typeof params === 'string' ? params : JSON.stringify(params)) : '{}'

  db.transaction(() => {
    db.prepare(`
      INSERT INTO rules (id, name, type, description, params, version, enabled)
      VALUES (?, ?, ?, ?, ?, 1, 1)
    `).run(id, name, type, description || '', paramsStr)

    db.prepare(`
      INSERT INTO rule_versions (id, ruleId, version, params)
      VALUES (?, ?, 1, ?)
    `).run(uuidv4(), id, paramsStr)
  })()

  const rule = db.prepare('SELECT * FROM rules WHERE id = ?').get(id)
  res.status(201).json({ success: true, data: rule })
})

router.put('/:id', (req: Request, res: Response): void => {
  const { name, type, description, params, enabled } = req.body
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id) as any
  if (!existing) {
    res.status(404).json({ success: false, error: '规则不存在' })
    return
  }

  const validTypes = ['spike', 'negative', 'rollback', 'overlimit', 'null_value']
  if (type && !validTypes.includes(type)) {
    res.status(400).json({ success: false, error: '无效的规则类型' })
    return
  }

  const newVersion = existing.version + 1
  const paramsStr = params
    ? (typeof params === 'string' ? params : JSON.stringify(params))
    : existing.params

  db.transaction(() => {
    db.prepare(`
      UPDATE rules SET name = ?, type = ?, description = ?, params = ?, version = ?, enabled = ?, updatedAt = datetime('now')
      WHERE id = ?
    `).run(
      name || existing.name,
      type || existing.type,
      description !== undefined ? description : existing.description,
      paramsStr,
      newVersion,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      req.params.id,
    )

    db.prepare(`
      INSERT INTO rule_versions (id, ruleId, version, params)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), req.params.id, newVersion, paramsStr)
  })()

  const rule = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id)
  res.json({ success: true, data: rule })
})

router.patch('/:id/toggle', (req: Request, res: Response): void => {
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id) as any
  if (!existing) {
    res.status(404).json({ success: false, error: '规则不存在' })
    return
  }

  const newEnabled = existing.enabled ? 0 : 1
  db.prepare('UPDATE rules SET enabled = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(newEnabled, req.params.id)

  const rule = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id)
  res.json({ success: true, data: rule })
})

router.get('/:id/versions', (req: Request, res: Response): void => {
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(req.params.id)
  if (!existing) {
    res.status(404).json({ success: false, error: '规则不存在' })
    return
  }

  const versions = db.prepare('SELECT * FROM rule_versions WHERE ruleId = ? ORDER BY version DESC').all(req.params.id)
  res.json({ success: true, data: versions })
})

export default router
