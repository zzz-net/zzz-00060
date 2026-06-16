interface Reading {
  id: string
  batchId: string
  lineNo: number
  meterNo: string
  meterName: string
  prevReading: number | null
  currReading: number | null
  usage: number | null
  readDate: string | null
}

interface Rule {
  id: string
  name: string
  type: string
  params: string
  version: number
  enabled?: number
}

interface Anomaly {
  readingId: string
  batchId: string
  ruleId: string
  ruleVersion: number
  anomalyType: string
  description: string
}

export function detectAnomalies(readings: Reading[], rules: Rule[]): Anomaly[] {
  const anomalies: Anomaly[] = []

  const prevUsageMap = new Map<string, number>()
  const sortedReadings = [...readings].sort((a, b) => {
    if (a.meterNo !== b.meterNo) return a.meterNo.localeCompare(b.meterNo)
    return a.lineNo - b.lineNo
  })

  for (const reading of sortedReadings) {
    if (reading.prevReading != null && reading.currReading != null && reading.prevReading >= 0) {
      prevUsageMap.set(reading.meterNo, reading.currReading - reading.prevReading)
    }
  }

  for (const rule of rules) {
    if (!rule.enabled) continue

    const params = JSON.parse(rule.params || '{}')

    for (const reading of readings) {
      const anomaly = checkRule(reading, rule, params, prevUsageMap)
      if (anomaly) {
        anomalies.push(anomaly)
      }
    }
  }

  return anomalies
}

function checkRule(
  reading: Reading,
  rule: Rule,
  params: Record<string, any>,
  prevUsageMap: Map<string, number>
): Anomaly | null {
  switch (rule.type) {
    case 'spike':
      return checkSpike(reading, rule, params, prevUsageMap)
    case 'negative':
      return checkNegative(reading, rule)
    case 'rollback':
      return checkRollback(reading, rule)
    case 'overlimit':
      return checkOverlimit(reading, rule, params)
    case 'null_value':
      return checkNullValue(reading, rule)
    default:
      return null
  }
}

function checkSpike(
  reading: Reading,
  rule: Rule,
  params: Record<string, any>,
  prevUsageMap: Map<string, number>
): Anomaly | null {
  const multiplier = params.multiplier ?? 3
  if (reading.usage == null || reading.usage <= 0) return null

  const prevUsage = prevUsageMap.get(reading.meterNo)
  if (prevUsage == null || prevUsage <= 0) return null

  if (reading.usage > prevUsage * multiplier) {
    return {
      readingId: reading.id,
      batchId: reading.batchId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      anomalyType: 'spike',
      description: `表号${reading.meterNo}当期用量${reading.usage}超过上期用量${prevUsage}的${multiplier}倍`,
    }
  }
  return null
}

function checkNegative(reading: Reading, rule: Rule): Anomaly | null {
  if (reading.currReading != null && reading.currReading < 0) {
    return {
      readingId: reading.id,
      batchId: reading.batchId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      anomalyType: 'negative',
      description: `表号${reading.meterNo}当前读数为负数: ${reading.currReading}`,
    }
  }
  return null
}

function checkRollback(reading: Reading, rule: Rule): Anomaly | null {
  if (reading.currReading != null && reading.prevReading != null && reading.currReading < reading.prevReading) {
    return {
      readingId: reading.id,
      batchId: reading.batchId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      anomalyType: 'rollback',
      description: `表号${reading.meterNo}当前读数${reading.currReading}小于上期读数${reading.prevReading}`,
    }
  }
  return null
}

function checkOverlimit(reading: Reading, rule: Rule, params: Record<string, any>): Anomaly | null {
  const limit = params.limit ?? 9999
  if (reading.usage != null && reading.usage > limit) {
    return {
      readingId: reading.id,
      batchId: reading.batchId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      anomalyType: 'overlimit',
      description: `表号${reading.meterNo}当期用量${reading.usage}超过阈值${limit}`,
    }
  }
  return null
}

function checkNullValue(reading: Reading, rule: Rule): Anomaly | null {
  if (reading.currReading == null || isNaN(reading.currReading)) {
    return {
      readingId: reading.id,
      batchId: reading.batchId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      anomalyType: 'null_value',
      description: `表号${reading.meterNo}当前读数为空或无法解析`,
    }
  }
  return null
}
