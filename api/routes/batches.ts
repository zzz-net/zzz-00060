import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import db from '../db.js'
import { detectAnomalies } from '../rule-engine.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.post('/import', upload.single('file'), (req: Request, res: Response): void => {
  const file = req.file
  if (!file) {
    res.status(400).json({ success: false, error: '未上传文件' })
    return
  }

  const csvContent = file.buffer.toString('utf-8')
  const contentHash = crypto.createHash('sha256').update(csvContent).digest('hex').slice(0, 16)
  const fileName = file.originalname
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const batchNo = `${fileName.replace(/\.[^.]+$/, '')}_${timestamp}`

  const existing = db.prepare('SELECT id FROM batches WHERE contentHash = ?').get(contentHash) as any
  if (existing) {
    res.status(409).json({ success: false, error: '该文件内容已导入过，不能生成重复异常' })
    return
  }

  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const batchId = uuidv4()
  const errors: { line: number; reason: string }[] = []
  const validReadings: any[] = []

  parsed.data.forEach((row: any, index: number) => {
    const lineNo = index + 2
    const meterNo = (row.meterNo || '').trim()
    const meterName = (row.meterName || '').trim()
    const prevReadingStr = (row.prevReading || '').trim()
    const currReadingStr = (row.currReading || '').trim()
    const usageStr = (row.usage || '').trim()
    const readDate = (row.readDate || '').trim()

    if (!meterNo) {
      errors.push({ line: lineNo, reason: '表号为空' })
      return
    }

    const prevReading = prevReadingStr !== '' ? Number(prevReadingStr) : null
    const currReading = currReadingStr !== '' ? Number(currReadingStr) : null
    const usageVal = usageStr !== '' ? Number(usageStr) : null

    if (currReadingStr !== '' && isNaN(Number(currReadingStr))) {
      errors.push({ line: lineNo, reason: `当前读数无法解析: ${currReadingStr}` })
      return
    }

    if (prevReadingStr !== '' && isNaN(Number(prevReadingStr))) {
      errors.push({ line: lineNo, reason: `上期读数无法解析: ${prevReadingStr}` })
      return
    }

    const computedUsage = usageVal != null && !isNaN(usageVal) ? usageVal
      : currReading != null && prevReading != null ? currReading - prevReading
      : null

    validReadings.push({
      id: uuidv4(),
      batchId,
      lineNo,
      meterNo,
      meterName,
      prevReading: prevReading != null && !isNaN(prevReading) ? prevReading : null,
      currReading: currReading != null && !isNaN(currReading) ? currReading : null,
      usage: computedUsage,
      readDate: readDate || null,
    })
  })

  const insertBatch = db.prepare(`
    INSERT INTO batches (id, batchNo, fileName, contentHash, totalRows, validRows, errorRows, errorDetail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertBatch.run(batchId, batchNo, fileName, contentHash, parsed.data.length, validReadings.length, errors.length, JSON.stringify(errors))

  const insertReading = db.prepare(`
    INSERT INTO readings (id, batchId, lineNo, meterNo, meterName, prevReading, currReading, usage, readDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((readings: any[]) => {
    for (const r of readings) {
      insertReading.run(r.id, r.batchId, r.lineNo, r.meterNo, r.meterName, r.prevReading, r.currReading, r.usage, r.readDate)
    }
  })
  insertMany(validReadings)

  const rules = db.prepare('SELECT * FROM rules WHERE enabled = 1').all() as any[]
  const anomalies = detectAnomalies(validReadings, rules)

  const insertAnomaly = db.prepare(`
    INSERT INTO anomalies (id, readingId, batchId, ruleId, ruleVersion, anomalyType, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const insertAnomalies = db.transaction((anoms: any[]) => {
    for (const a of anoms) {
      insertAnomaly.run(uuidv4(), a.readingId, a.batchId, a.ruleId, a.ruleVersion, a.anomalyType, a.description)
    }
  })
  insertAnomalies(anomalies)

  res.status(200).json({
    success: true,
    data: {
      batchId,
      batchNo,
      validRows: validReadings.length,
      errors,
      anomaliesCreated: anomalies.length,
    },
  })
})

router.get('/', (_req: Request, res: Response): void => {
  const batches = db.prepare(`
    SELECT b.*, COUNT(a.id) as anomalyCount
    FROM batches b
    LEFT JOIN anomalies a ON a.batchId = b.id
    GROUP BY b.id
    ORDER BY b.createdAt DESC
  `).all()
  res.json({ success: true, data: batches })
})

router.get('/:id', (req: Request, res: Response): void => {
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id) as any
  if (!batch) {
    res.status(404).json({ success: false, error: '批次不存在' })
    return
  }

  const readings = db.prepare('SELECT * FROM readings WHERE batchId = ? ORDER BY lineNo').all(req.params.id)
  const anomalies = db.prepare(`
    SELECT a.*, r.meterNo, r.prevReading, r.currReading, r.usage, ru.name as ruleName
    FROM anomalies a
    LEFT JOIN readings r ON r.id = a.readingId
    LEFT JOIN rules ru ON ru.id = a.ruleId
    WHERE a.batchId = ?
    ORDER BY a.createdAt
  `).all(req.params.id)

  res.json({ success: true, data: { batch, readings, anomalies } })
})

export default router
