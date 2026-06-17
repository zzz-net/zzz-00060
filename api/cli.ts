#!/usr/bin/env node
import http from 'http'

const BASE_URL = process.env.EXPORT_API_BASE || 'http://127.0.0.1:3001'

function httpRequest(method: string, path: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path)
    const data = body ? JSON.stringify(body) : null
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }

    const req = http.request(options, (res) => {
      let chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8')
        try {
          resolve({ status: res.statusCode, data: raw ? JSON.parse(raw) : null })
        } catch {
          resolve({ status: res.statusCode, data: raw })
        }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
}

function printHelp() {
  console.log(`
导出任务台 CLI

用法:
  node --import tsx/esm api/cli.ts <command> [options]

命令:
  list [status]              列出最近任务（可选按状态过滤: queued/running/success/failed/cancelled）
  summary                    查看任务统计摘要
  show <taskId>              查看单个任务详情（含完整日志）
  create <options>           创建新导出任务
  retry <taskId>             重试失败/取消的任务
  cancel <taskId>            取消排队/执行中的任务
  files [limit]              列出实际生成的导出文件
  help                       显示此帮助

创建任务选项:
  --format <csv|json>        文件格式（默认: csv）
  --dir <path>               导出目录（必填）
  --name <filename>          文件名，不含扩展名（必填）
  --conflict <action>        冲突处理: rename | overwrite | 留空表示手动处理
  --operator <name>          操作人名称（默认: 导出员）
  --batch <batchId>          按批次筛选数据（可选）
  --status <status>          按异常状态筛选: pending/confirmed/false_positive/closed（可选）
  --type <anomalyType>       按异常类型筛选（可选）

示例:
  node --import tsx/esm api/cli.ts list
  node --import tsx/esm api/cli.ts list success
  node --import tsx/esm api/cli.ts summary
  node --import tsx/esm api/cli.ts show <task-uuid>
  node --import tsx/esm api/cli.ts create --format json --dir D:/exports --name monthly_report --conflict rename
  node --import tsx/esm api/cli.ts create --format csv --dir D:/exports --name pending_only --status pending
  node --import tsx/esm api/cli.ts retry <task-uuid>
  node --import tsx/esm api/cli.ts cancel <task-uuid>
  node --import tsx/esm api/cli.ts files
  node --import tsx/esm api/cli.ts files 10
`)
}

async function cmdList(args: string[]) {
  const status = args[0] || ''
  const query = status ? `?status=${status}&limit=20` : '?limit=20'
  const { status: code, data } = await httpRequest('GET', `/api/export-tasks${query}`)
  if (code !== 200 || !data?.success) {
    console.error('查询失败:', data?.error || `HTTP ${code}`)
    process.exit(1)
  }
  const tasks: any[] = data.data || []
  if (tasks.length === 0) {
    console.log('暂无导出任务')
    return
  }
  console.log(`\n共 ${data.total} 个任务，显示最近 ${tasks.length} 个:\n`)
  console.log('任务编号          状态     格式  文件名                    操作人   创建时间')
  console.log('────────────────  ───────  ────  ────────────────────────  ───────  ───────────────────')
  for (const t of tasks) {
    const no = (t.taskNo || '').padEnd(16)
    const st = (STATUS_LABELS[t.status] || t.status).padEnd(6)
    const fmt = (t.format || '').toUpperCase().padEnd(4)
    const name = (t.finalFileName || t.fileName || '').padEnd(24).slice(0, 24)
    const op = (t.operator || '').padEnd(7)
    const time = new Date(t.createdAt).toLocaleString()
    console.log(`${no}  ${st}  ${fmt}  ${name}  ${op}  ${time}`)
  }
  console.log()
}

async function cmdSummary() {
  const { status: code, data } = await httpRequest('GET', '/api/export-tasks/summary')
  if (code !== 200 || !data?.success) {
    console.error('查询失败:', data?.error || `HTTP ${code}`)
    process.exit(1)
  }
  const s = data.data
  console.log(`
导出任务统计摘要
────────────────
  全部任务:   ${s.total}
  排队中:     ${s.queued}
  执行中:     ${s.running}
  成功:       ${s.success}
  失败:       ${s.failed}
  已取消:     ${s.cancelled}
`)
}

async function cmdShow(args: string[]) {
  const taskId = args[0]
  if (!taskId) {
    console.error('请提供任务 ID')
    process.exit(1)
  }
  const { status: code, data } = await httpRequest('GET', `/api/export-tasks/${taskId}`)
  if (code !== 200 || !data?.success) {
    console.error('查询失败:', data?.error || `HTTP ${code}`)
    process.exit(1)
  }
  const t = data.data
  console.log(`
任务详情
═══════════════════════════════════════════
  任务编号:     ${t.taskNo}
  任务ID:       ${t.id}
  状态:         ${STATUS_LABELS[t.status] || t.status}
  格式:         ${t.format?.toUpperCase()}
  操作人:       ${t.operator}
  创建时间:     ${new Date(t.createdAt).toLocaleString()}
  ${t.startedAt ? `开始时间:     ${new Date(t.startedAt).toLocaleString()}` : ''}
  ${t.completedAt ? `完成时间:     ${new Date(t.completedAt).toLocaleString()}` : ''}
  ${t.durationMs ? `耗时:         ${t.durationMs} ms` : ''}
───────────────────────────────────────────
  导出目录:     ${t.exportDir}
  原始文件名:   ${t.fileName}
  ${t.finalFileName ? `最终文件名:   ${t.finalFileName}` : ''}
  ${t.finalFilePath ? `最终路径:     ${t.finalFilePath}` : ''}
  ${t.fileSize ? `文件大小:     ${formatSize(t.fileSize)}` : ''}
  ${t.recordCount ? `记录条数:     ${t.recordCount}` : ''}
  ${t.conflictAction ? `冲突处理:     ${t.conflictAction === 'rename' ? '自动重命名' : t.conflictAction === 'overwrite' ? '覆盖原文件' : '取消导出'}` : ''}
  ${t.conflictResolved ? `冲突已解决:   是` : ''}
  ${t.conflictInfo ? `冲突文件:     ${t.conflictInfo.fileName} (${formatSize(t.conflictInfo.fileSize || 0)})` : ''}
  ${t.filterBatchId || t.filterAnomalyStatus || t.filterAnomalyType ? `\n  数据筛选:` : ''}
  ${t.filterBatchId ? `  批次ID:     ${t.filterBatchId}` : ''}
  ${t.filterAnomalyStatus ? `  异常状态:   ${t.filterAnomalyStatus}` : ''}
  ${t.filterAnomalyType ? `  异常类型:   ${t.filterAnomalyType}` : ''}
  ${t.failureReason ? `\n  失败原因:     ${t.failureReason}` : ''}
`)
  if (t.keyLogs && t.keyLogs.length > 0) {
    console.log('  关键日志:')
    for (const log of t.keyLogs) {
      console.log(`    ${log}`)
    }
  }
  console.log()
}

async function cmdCreate(args: string[]) {
  const opts: any = {}
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '')
    const val = args[i + 1]
    if (!val) continue
    if (key === 'format') opts.format = val
    if (key === 'dir') opts.exportDir = val
    if (key === 'name') opts.fileName = val
    if (key === 'conflict') opts.conflictAction = val
    if (key === 'operator') opts.operator = val
    if (key === 'batch') opts.filterBatchId = val
    if (key === 'status') opts.filterAnomalyStatus = val
    if (key === 'type') opts.filterAnomalyType = val
  }

  if (!opts.exportDir) {
    console.error('必须指定 --dir 参数')
    process.exit(1)
  }
  if (!opts.fileName) {
    console.error('必须指定 --name 参数')
    process.exit(1)
  }
  opts.format = opts.format || 'csv'
  if (!['csv', 'json'].includes(opts.format)) {
    console.error('--format 必须是 csv 或 json')
    process.exit(1)
  }
  if (!opts.fileName.endsWith(`.${opts.format}`)) {
    opts.fileName = `${opts.fileName}.${opts.format}`
  }

  const { status: code, data } = await httpRequest('POST', '/api/export-tasks', opts)
  if (code !== 200 || !data?.success) {
    console.error('创建失败:', data?.error || `HTTP ${code}`)
    process.exit(1)
  }
  const t = data.data
  console.log(`
任务创建成功 ✓
  任务编号: ${t.taskNo}
  任务ID:   ${t.id}
  格式:     ${t.format.toUpperCase()}
  目录:     ${t.exportDir}
  文件名:   ${t.fileName}
  状态:     ${STATUS_LABELS[t.status]}
`)
}

async function cmdRetry(args: string[]) {
  const taskId = args[0]
  if (!taskId) {
    console.error('请提供任务 ID')
    process.exit(1)
  }
  const { status: code, data } = await httpRequest('POST', `/api/export-tasks/${taskId}/retry`)
  if (code !== 200 || !data?.success) {
    console.error('重试失败:', data?.error || `HTTP ${code}`)
    process.exit(1)
  }
  console.log(`任务已重试，当前状态: ${STATUS_LABELS[data.data.status]}`)
}

async function cmdCancel(args: string[]) {
  const taskId = args[0]
  if (!taskId) {
    console.error('请提供任务 ID')
    process.exit(1)
  }
  const { status: code, data } = await httpRequest('POST', `/api/export-tasks/${taskId}/cancel`)
  if (code !== 200 || !data?.success) {
    console.error('取消失败:', data?.error || `HTTP ${code}`)
    process.exit(1)
  }
  console.log(`任务已取消`)
}

async function cmdFiles(args: string[]) {
  const limit = args[0] || '20'
  const { status: code, data } = await httpRequest('GET', `/api/export-tasks/generated-files?limit=${limit}`)
  if (code !== 200 || !data?.success) {
    console.error('查询失败:', data?.error || `HTTP ${code}`)
    process.exit(1)
  }
  const files: any[] = data.data || []
  if (files.length === 0) {
    console.log('暂无已生成的导出文件')
    return
  }
  console.log(`\n共 ${data.total} 个已生成文件:\n`)
  console.log('文件名                          格式  大小       记录数  存在  任务编号          完成时间')
  console.log('──────────────────────────────  ────  ─────────  ──────  ────  ────────────────  ───────────────────')
  for (const f of files) {
    const name = (f.finalFileName || '').padEnd(30).slice(0, 30)
    const fmt = (f.format || '').toUpperCase().padEnd(4)
    const size = formatSize(f.fileSize || 0).padEnd(10)
    const count = String(f.recordCount || 0).padEnd(6)
    const exists = f.exists ? '✓' : '✗'
    const no = (f.taskNo || '').padEnd(16)
    const time = f.completedAt ? new Date(f.completedAt).toLocaleString() : ''
    const filters: string[] = []
    if (f.filters?.batchId) filters.push(`批次=${f.filters.batchId.slice(0, 8)}`)
    if (f.filters?.anomalyStatus) filters.push(`状态=${f.filters.anomalyStatus}`)
    if (f.filters?.anomalyType) filters.push(`类型=${f.filters.anomalyType}`)
    const filterStr = filters.length > 0 ? ` [${filters.join(', ')}]` : ''
    console.log(`${name}  ${fmt}  ${size}  ${count}  ${exists}    ${no}  ${time}${filterStr}`)
  }
  console.log()
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'help'
  const rest = args.slice(1)

  try {
    switch (command) {
      case 'list':
        await cmdList(rest)
        break
      case 'summary':
        await cmdSummary()
        break
      case 'show':
        await cmdShow(rest)
        break
      case 'create':
        await cmdCreate(rest)
        break
      case 'retry':
        await cmdRetry(rest)
        break
      case 'cancel':
        await cmdCancel(rest)
        break
      case 'files':
        await cmdFiles(rest)
        break
      case 'help':
      case '--help':
      case '-h':
      default:
        printHelp()
    }
  } catch (err: unknown) {
    console.error('\n错误: 无法连接到 API 服务。请确保后端服务已启动 (npm run server:dev)')
    console.error('       默认服务地址: http://127.0.0.1:3001')
    console.error('       可通过 EXPORT_API_BASE 环境变量自定义地址\n')
    process.exit(1)
  }
}

main()
