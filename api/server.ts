import app from './app.js';
import db from './db.js';
import { executeTask } from './routes/export-tasks.js';

const PORT = process.env.PORT || 3001;

function recoverInterruptedTasks(): void {
  const interrupted = db.prepare(`
    SELECT id FROM export_tasks
    WHERE status IN ('queued', 'running')
  `).all() as any[]

  if (interrupted.length === 0) return

  console.log(`[导出审计中心] 发现 ${interrupted.length} 个中断任务，正在恢复...`)

  for (const row of interrupted) {
    let logs: string[] = []
    const taskRow = db.prepare('SELECT keyLogs FROM export_tasks WHERE id = ?').get(row.id) as any
    if (taskRow?.keyLogs) {
      try { logs = JSON.parse(taskRow.keyLogs) } catch { logs = [] }
    }
    logs = [...logs, `[${new Date().toISOString()}] 服务重启恢复: 任务重置为排队状态`]

    db.prepare(`
      UPDATE export_tasks SET
        status = 'queued',
        startedAt = '',
        keyLogs = ?
      WHERE id = ?
    `).run(JSON.stringify(logs), row.id)
  }

  for (const row of interrupted) {
    setImmediate(() => executeTask(row.id))
  }

  console.log(`[导出审计中心] ${interrupted.length} 个中断任务已恢复为排队状态`)
}

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  recoverInterruptedTasks()
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    throw err;
  }
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
