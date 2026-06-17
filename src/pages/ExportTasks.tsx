import { useCallback, useEffect, useState } from 'react';
import {
  Download, Plus, RefreshCw, X, Clock, CheckCircle, XCircle, AlertCircle,
  Pause, FolderOpen, FileJson, FileSpreadsheet, RotateCcw, Eye, Trash2,
  ChevronDown, ChevronRight, FileWarning, Edit3, Filter, FileCheck
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import type { ExportTask, ExportTaskStatus, ExportConflictAction } from '@/shared/types';

const statusConfig: Record<ExportTaskStatus, { label: string; color: string; bg: string; icon: any }> = {
  queued: { label: '排队中', color: 'text-slate-600', bg: 'bg-slate-100', icon: Clock },
  running: { label: '执行中', color: 'text-blue-600', bg: 'bg-blue-50', icon: RefreshCw },
  success: { label: '成功', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle },
  failed: { label: '失败', color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
  cancelled: { label: '已取消', color: 'text-gray-500', bg: 'bg-gray-100', icon: Pause },
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export default function ExportTasks() {
  const {
    exportTasks,
    exportTasksLoading,
    exportTasksTotal,
    exportTaskSummary,
    exportFilterOptions,
    exportGeneratedFiles,
    fetchExportTaskSummary,
    fetchExportTasks,
    createExportTask,
    retryExportTask,
    cancelExportTask,
    resolveExportTaskConflict,
    changeDirRetryExportTask,
    preflightCheckConflict,
    fetchExportFilterOptions,
    fetchExportGeneratedFiles,
  } = useAppStore();

  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formFormat, setFormFormat] = useState<'csv' | 'json'>('csv');
  const [formExportDir, setFormExportDir] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [formConflictAction, setFormConflictAction] = useState<ExportConflictAction>('');
  const [formNewFileName, setFormNewFileName] = useState('');
  const [formOperator, setFormOperator] = useState('导出员');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formFilterBatchId, setFormFilterBatchId] = useState('');
  const [formFilterAnomalyStatus, setFormFilterAnomalyStatus] = useState('');
  const [formFilterAnomalyType, setFormFilterAnomalyType] = useState('');

  const [conflictTask, setConflictTask] = useState<ExportTask | null>(null);
  const [conflictAction, setConflictAction] = useState<'rename' | 'overwrite' | 'cancel' | 'changeDir' | null>(null);
  const [conflictNewName, setConflictNewName] = useState('');
  const [conflictNewDir, setConflictNewDir] = useState('');

  const [changeDirTask, setChangeDirTask] = useState<ExportTask | null>(null);
  const [changeDirValue, setChangeDirValue] = useState('');

  const [pollTimer, setPollTimer] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'tasks' | 'files'>('tasks');

  useEffect(() => {
    fetchExportTaskSummary();
    fetchExportTasks();
    fetchExportFilterOptions();
    fetchExportGeneratedFiles();

    const timer = window.setInterval(() => {
      fetchExportTaskSummary();
      fetchExportTasks(statusFilter ? { status: statusFilter } : undefined);
      if (activeTab === 'files') fetchExportGeneratedFiles();
    }, 3000);
    setPollTimer(timer);

    return () => {
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, []);

  useEffect(() => {
    fetchExportTasks(statusFilter ? { status: statusFilter } : undefined);
  }, [statusFilter, fetchExportTasks]);

  const handleCreateSubmit = useCallback(async () => {
    setFormError('');
    if (!formExportDir.trim()) {
      setFormError('请输入导出目录');
      return;
    }
    if (!formFileName.trim()) {
      setFormError('请输入文件名');
      return;
    }

    const fileName = formFileName.trim().endsWith(`.${formFormat}`)
      ? formFileName.trim()
      : `${formFileName.trim()}.${formFormat}`;

    try {
      setFormSubmitting(true);
      await createExportTask({
        format: formFormat,
        exportDir: formExportDir.trim(),
        fileName,
        conflictAction: formConflictAction,
        newFileName: formNewFileName.trim() || undefined,
        operator: formOperator.trim() || undefined,
        filterBatchId: formFilterBatchId || undefined,
        filterAnomalyStatus: formFilterAnomalyStatus || undefined,
        filterAnomalyType: formFilterAnomalyType || undefined,
      });
      setShowCreate(false);
      setFormFormat('csv');
      setFormExportDir('');
      setFormFileName('');
      setFormConflictAction('');
      setFormNewFileName('');
      setFormOperator('导出员');
      setFormFilterBatchId('');
      setFormFilterAnomalyStatus('');
      setFormFilterAnomalyType('');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : '创建任务失败');
    } finally {
      setFormSubmitting(false);
    }
  }, [formFormat, formExportDir, formFileName, formConflictAction, formNewFileName, formOperator, createExportTask]);

  const handleResolveConflict = useCallback(async () => {
    if (!conflictTask || !conflictAction) return;
    try {
      await resolveExportTaskConflict(conflictTask.id, {
        conflictAction,
        newFileName: conflictAction === 'rename' ? conflictNewName || undefined : undefined,
        exportDir: conflictAction === 'changeDir' ? conflictNewDir || undefined : undefined,
      });
      setConflictTask(null);
      setConflictAction(null);
      setConflictNewName('');
      setConflictNewDir('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '处理失败');
    }
  }, [conflictTask, conflictAction, conflictNewName, conflictNewDir, resolveExportTaskConflict]);

  const handleChangeDirRetry = useCallback(async () => {
    if (!changeDirTask || !changeDirValue.trim()) return;
    try {
      await changeDirRetryExportTask(changeDirTask.id, changeDirValue.trim());
      setChangeDirTask(null);
      setChangeDirValue('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '操作失败');
    }
  }, [changeDirTask, changeDirValue, changeDirRetryExportTask]);

  const needsConflictResolution = (task: ExportTask) => {
    return task.status === 'queued' && task.conflictInfo?.exists && !task.conflictAction;
  };

  const anomalyStatusLabel: Record<string, string> = {
    pending: '待复核',
    confirmed: '已确认',
    false_positive: '误报',
    closed: '已关闭',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">导出任务台</h2>
          <p className="text-sm text-slate-500 mt-1">管理所有报告导出任务，支持创建、重试、冲突处理和结果查看</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-amber-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          创建导出任务
        </button>
      </div>

      <div className="grid grid-cols-6 gap-3">
        {[
          { label: '全部', key: 'total', color: 'bg-slate-700' },
          { label: '排队中', key: 'queued', color: 'bg-slate-500' },
          { label: '执行中', key: 'running', color: 'bg-blue-500' },
          { label: '成功', key: 'success', color: 'bg-green-500' },
          { label: '失败', key: 'failed', color: 'bg-red-500' },
          { label: '已取消', key: 'cancelled', color: 'bg-gray-400' },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setStatusFilter(item.key === 'total' ? '' : item.key)}
            className={`bg-white rounded-lg shadow-sm border p-4 text-left transition-colors ${
              (item.key === 'total' ? !statusFilter : statusFilter === item.key)
                ? 'border-amber-400 ring-2 ring-amber-100'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${item.color} mb-2`} />
            <div className="text-2xl font-bold text-slate-800">
              {exportTaskSummary ? (exportTaskSummary as any)[item.key] ?? 0 : 0}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{item.label}</div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-base font-semibold text-slate-700">
              {activeTab === 'tasks' ? '任务列表' : '已生成文件'}
            </h3>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'tasks' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                任务列表
              </button>
              <button
                onClick={() => { setActiveTab('files'); fetchExportGeneratedFiles(); }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeTab === 'files' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileCheck className="w-3 h-3 inline mr-1" />
                已生成文件
              </button>
            </div>
          </div>
          {activeTab === 'tasks' && (
            <div className="flex items-center gap-2">
              <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">全部状态</option>
              <option value="queued">排队中</option>
              <option value="running">执行中</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
            </select>
            <button
              onClick={() => {
                fetchExportTaskSummary();
                fetchExportTasks(statusFilter ? { status: statusFilter } : undefined);
              }}
              className="flex items-center gap-1 text-slate-600 hover:text-slate-800 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
          </div>
          )}
          {activeTab === 'files' && (
            <button
              onClick={() => fetchExportGeneratedFiles()}
              className="flex items-center gap-1 text-slate-600 hover:text-slate-800 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
          )}
        </div>

        {activeTab === 'tasks' ? (
          <>
            {exportTasksLoading && !exportTasks.length ? (
              <div className="text-center py-12 text-sm text-slate-400">加载中...</div>
            ) : !exportTasks.length ? (
              <div className="text-center py-12 text-sm text-slate-400">暂无导出任务</div>
            ) : (
          <div className="divide-y divide-slate-100">
            {exportTasks.map((task) => {
              const cfg = statusConfig[task.status];
              const StatusIcon = cfg.icon;
              const isExpanded = expandedId === task.id;
              const needConflict = needsConflictResolution(task);

              return (
                <div key={task.id}>
                  <div
                    className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : task.id)}
                  >
                    <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                      <StatusIcon className={`w-4 h-4 ${cfg.color} ${task.status === 'running' ? 'animate-spin' : ''}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-slate-800">{task.taskNo}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {task.format === 'csv' ? (
                          <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <FileJson className="w-3.5 h-3.5 text-slate-400" />
                        )}
                        <span className="text-xs text-slate-500">{task.format.toUpperCase()}</span>
                        {needConflict && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                            <FileWarning className="w-3 h-3" />
                            待处理冲突
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {task.finalFileName || task.fileName} · {task.exportDir}
                        {task.fileSize > 0 && ` · ${formatFileSize(task.fileSize)}`}
                        {task.recordCount > 0 && ` · ${task.recordCount} 条记录`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                      <span>{task.operator}</span>
                      <span>·</span>
                      <span>{new Date(task.createdAt).toLocaleString()}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {needConflict && (
                        <button
                          onClick={() => {
                            setConflictTask(task);
                            setConflictAction(null);
                            setConflictNewName(task.conflictInfo?.suggestedName || '');
                            setConflictNewDir('');
                          }}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          title="处理冲突"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {['failed', 'cancelled'].includes(task.status) && (
                        <button
                          onClick={() => retryExportTask(task.id)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="重试"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {task.failureReason && (
                        <button
                          onClick={() => {
                            setChangeDirTask(task);
                            setChangeDirValue(task.exportDir);
                          }}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                          title="换目录重试"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                      )}
                      {['queued', 'running'].includes(task.status) && (
                        <button
                          onClick={() => cancelExportTask(task.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="取消"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-5 pb-4 pl-17 bg-slate-50/50">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-slate-500 text-xs mb-1">任务ID</div>
                          <div className="font-mono text-slate-700">{task.id}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-xs mb-1">任务编号</div>
                          <div className="font-mono text-slate-700">{task.taskNo}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-xs mb-1">创建时间</div>
                          <div className="text-slate-700">{new Date(task.createdAt).toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-xs mb-1">操作人</div>
                          <div className="text-slate-700">{task.operator}</div>
                        </div>
                        {task.startedAt && (
                          <div>
                            <div className="text-slate-500 text-xs mb-1">开始时间</div>
                            <div className="text-slate-700">{new Date(task.startedAt).toLocaleString()}</div>
                          </div>
                        )}
                        {task.completedAt && (
                          <div>
                            <div className="text-slate-500 text-xs mb-1">完成时间</div>
                            <div className="text-slate-700">{new Date(task.completedAt).toLocaleString()}</div>
                          </div>
                        )}
                        {task.durationMs > 0 && (
                          <div>
                            <div className="text-slate-500 text-xs mb-1">耗时</div>
                            <div className="text-slate-700">{task.durationMs} ms</div>
                          </div>
                        )}
                        <div>
                          <div className="text-slate-500 text-xs mb-1">文件格式</div>
                          <div className="text-slate-700">{task.format.toUpperCase()}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-xs mb-1">导出目录</div>
                          <div className="text-slate-700 break-all">{task.exportDir}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 text-xs mb-1">原始文件名</div>
                          <div className="text-slate-700">{task.fileName}</div>
                        </div>
                        {task.finalFileName && (
                          <div>
                            <div className="text-slate-500 text-xs mb-1">最终文件名</div>
                            <div className="text-slate-700 font-medium">{task.finalFileName}</div>
                          </div>
                        )}
                        {task.finalFilePath && (
                          <div className="col-span-2">
                            <div className="text-slate-500 text-xs mb-1">最终文件路径</div>
                            <div className="text-slate-700 font-mono text-xs break-all bg-slate-100 p-2 rounded">
                              {task.finalFilePath}
                            </div>
                          </div>
                        )}
                        {task.conflictAction && (
                          <div>
                            <div className="text-slate-500 text-xs mb-1">冲突处理方式</div>
                            <div className="text-slate-700">
                              {task.conflictAction === 'rename' && '自动重命名'}
                              {task.conflictAction === 'overwrite' && '覆盖原文件'}
                              {task.conflictAction === 'cancel' && '取消导出'}
                            </div>
                          </div>
                        )}
                        {(task.filterBatchId || task.filterAnomalyStatus || task.filterAnomalyType) && (
                          <div className="col-span-2">
                            <div className="text-slate-500 text-xs mb-1 flex items-center gap-1">
                              <Filter className="w-3 h-3" />
                              数据筛选条件
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {task.filterBatchId && (
                                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">批次: {task.filterBatchId.slice(0, 8)}...</span>
                              )}
                              {task.filterAnomalyStatus && (
                                <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded">状态: {anomalyStatusLabel[task.filterAnomalyStatus] || task.filterAnomalyStatus}</span>
                              )}
                              {task.filterAnomalyType && (
                                <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">类型: {task.filterAnomalyType}</span>
                              )}
                            </div>
                          </div>
                        )}
                        {task.conflictInfo && (
                          <div>
                            <div className="text-slate-500 text-xs mb-1">冲突文件信息</div>
                            <div className="text-slate-700 text-xs">
                              {task.conflictInfo.fileName} ({formatFileSize(task.conflictInfo.fileSize || 0)})
                            </div>
                          </div>
                        )}
                        {task.failureReason && (
                          <div className="col-span-2">
                            <div className="text-slate-500 text-xs mb-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-red-500" />
                              失败原因
                            </div>
                            <div className="text-red-700 bg-red-50 p-2 rounded text-sm">
                              {task.failureReason}
                            </div>
                          </div>
                        )}
                        {task.keyLogs.length > 0 && (
                          <div className="col-span-2">
                            <div className="text-slate-500 text-xs mb-1 flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              关键日志
                            </div>
                            <div className="bg-slate-900 text-slate-300 p-3 rounded font-mono text-xs space-y-1 max-h-48 overflow-y-auto">
                              {task.keyLogs.map((log, idx) => (
                                <div key={idx}>{log}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {exportTasksTotal > exportTasks.length && (
          <div className="px-5 py-3 text-center text-xs text-slate-400 border-t border-slate-100">
            显示 {exportTasks.length} / {exportTasksTotal} 条任务
          </div>
        )}
          </>
        ) : (
          <div>
            {exportGeneratedFiles.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-400">暂无已生成的导出文件</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {exportGeneratedFiles.map((file) => (
                  <div key={file.taskId} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50">
                    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                      {file.format === 'csv' ? (
                        <FileSpreadsheet className="w-4 h-4 text-green-600" />
                      ) : (
                        <FileJson className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-800">{file.finalFileName}</span>
                        <span className="text-xs text-slate-500">{file.format.toUpperCase()}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${file.exists ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {file.exists ? '文件存在' : '文件缺失'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {file.finalFilePath} · {formatFileSize(file.fileSize)} · {file.recordCount} 条记录 · {file.operator}
                      </div>
                      {(file.filters.batchId || file.filters.anomalyStatus || file.filters.anomalyType) && (
                        <div className="flex items-center gap-1 mt-1">
                          <Filter className="w-3 h-3 text-slate-400" />
                          <span className="text-xs text-slate-400">
                            {[file.filters.batchId && '指定批次', file.filters.anomalyStatus && `状态:${anomalyStatusLabel[file.filters.anomalyStatus] || file.filters.anomalyStatus}`, file.filters.anomalyType && `类型:${file.filters.anomalyType}`].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 shrink-0">
                      {file.completedAt ? new Date(file.completedAt).toLocaleString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-5 py-3 text-center text-xs text-slate-400 border-t border-slate-100">
              共 {exportGeneratedFiles.length} 个已生成文件
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-slate-800">创建导出任务</h3>
              </div>
              <button
                onClick={() => { setShowCreate(false); setFormError(''); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{formError}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">文件格式</label>
                  <select
                    value={formFormat}
                    onChange={(e) => setFormFormat(e.target.value as 'csv' | 'json')}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">操作人</label>
                  <input
                    type="text"
                    value={formOperator}
                    onChange={(e) => setFormOperator(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="导出员"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">数据筛选（可选）</span>
                  <span className="text-xs text-slate-400">不选则导出全部异常</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">指定批次</label>
                    <select
                      value={formFilterBatchId}
                      onChange={(e) => setFormFilterBatchId(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">全部批次</option>
                      {exportFilterOptions?.batches.map((b) => (
                        <option key={b.id} value={b.id}>{b.batchNo} ({b.fileName})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">异常状态</label>
                    <select
                      value={formFilterAnomalyStatus}
                      onChange={(e) => setFormFilterAnomalyStatus(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">全部状态</option>
                      {exportFilterOptions?.anomalyStatuses.map((s) => (
                        <option key={s} value={s}>{anomalyStatusLabel[s] || s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">异常类型</label>
                    <select
                      value={formFilterAnomalyType}
                      onChange={(e) => setFormFilterAnomalyType(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <option value="">全部类型</option>
                      {exportFilterOptions?.anomalyTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  <span className="flex items-center gap-1">
                    <FolderOpen className="w-4 h-4" />
                    导出目录
                  </span>
                </label>
                <input
                  type="text"
                  value={formExportDir}
                  onChange={(e) => setFormExportDir(e.target.value)}
                  placeholder="例如: D:/workSpace/exports 或 /home/user/exports"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-xs text-slate-500 mt-1">目录不存在将自动创建</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">文件名</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formFileName}
                    onChange={(e) => setFormFileName(e.target.value)}
                    placeholder="例如: report"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <span className="text-slate-500 text-sm">.{formFormat}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  文件名冲突处理策略
                </label>
                <div className="space-y-2">
                  {[
                    { value: '', label: '检测到冲突时暂停，手动选择处理方式', desc: '推荐，出现冲突时弹窗让用户决定' },
                    { value: 'rename', label: '自动重命名', desc: '在文件名后追加数字后缀' },
                    { value: 'overwrite', label: '覆盖原有文件', desc: '永久删除同名文件，此操作不可撤销' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        formConflictAction === opt.value
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="conflictAction"
                        checked={formConflictAction === opt.value}
                        onChange={() => setFormConflictAction(opt.value as ExportConflictAction)}
                        className="mt-1"
                      />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{opt.label}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formConflictAction === 'rename' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">自定义新文件名（可选）</label>
                  <input
                    type="text"
                    value={formNewFileName}
                    onChange={(e) => setFormNewFileName(e.target.value)}
                    placeholder="留空则自动生成不重复文件名"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => { setShowCreate(false); setFormError(''); }}
                className="flex-1 bg-slate-100 text-slate-700 rounded-lg py-2 text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateSubmit}
                disabled={formSubmitting}
                className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {formSubmitting ? '创建中...' : '创建任务'}
              </button>
            </div>
          </div>
        </div>
      )}

      {conflictTask && conflictTask.conflictInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FileWarning className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-slate-800">文件名冲突</h3>
              </div>
              <button
                onClick={() => { setConflictTask(null); setConflictAction(null); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-800">检测到同名文件已存在</p>
                <div className="mt-2 text-xs text-amber-700 space-y-1">
                  <p>任务编号: <code className="bg-amber-100 px-1.5 py-0.5 rounded">{conflictTask.taskNo}</code></p>
                  <p>文件名: <code className="bg-amber-100 px-1.5 py-0.5 rounded">{conflictTask.conflictInfo.fileName}</code></p>
                  <p>目录: <code className="bg-amber-100 px-1.5 py-0.5 rounded">{conflictTask.exportDir}</code></p>
                  {conflictTask.conflictInfo.fileSize && (
                    <p>文件大小: {formatFileSize(conflictTask.conflictInfo.fileSize)}</p>
                  )}
                  {conflictTask.conflictInfo.modifiedAt && (
                    <p>修改时间: {new Date(conflictTask.conflictInfo.modifiedAt).toLocaleString()}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">请选择处理方式:</p>

                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  conflictAction === 'rename' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    checked={conflictAction === 'rename'}
                    onChange={() => setConflictAction('rename')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-800">自动重命名</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">系统自动生成不重复的文件名</p>
                    {conflictAction === 'rename' && (
                      <div className="mt-2">
                        <input
                          type="text"
                          value={conflictNewName}
                          onChange={(e) => setConflictNewName(e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder="输入新文件名"
                        />
                        {conflictTask.conflictInfo.suggestedName && (
                          <p className="text-xs text-slate-500 mt-1">建议: {conflictTask.conflictInfo.suggestedName}</p>
                        )}
                      </div>
                    )}
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  conflictAction === 'overwrite' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    checked={conflictAction === 'overwrite'}
                    onChange={() => setConflictAction('overwrite')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium text-slate-800">覆盖原有文件</span>
                    </div>
                    <p className="text-xs text-red-500 mt-1">原有文件内容将被永久删除，此操作不可撤销</p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  conflictAction === 'changeDir' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <div className="mt-1">
                    <FolderOpen className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={conflictAction === 'changeDir'}
                        onChange={() => setConflictAction('changeDir')}
                        className="hidden"
                      />
                      <span className="text-sm font-medium text-slate-800">切换导出目录</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">指定一个新的目录路径保存文件</p>
                    {conflictAction === 'changeDir' && (
                      <input
                        type="text"
                        value={conflictNewDir}
                        onChange={(e) => setConflictNewDir(e.target.value)}
                        className="mt-2 w-full border border-slate-300 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                        placeholder="例如: C:/Users/Documents/Exports"
                      />
                    )}
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  conflictAction === 'cancel' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input
                    type="radio"
                    checked={conflictAction === 'cancel'}
                    onChange={() => setConflictAction('cancel')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-800">取消本次导出</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">任务将标记为已取消，不执行导出</p>
                  </div>
                </label>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => { setConflictTask(null); setConflictAction(null); }}
                className="flex-1 bg-slate-100 text-slate-700 rounded-lg py-2 text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleResolveConflict}
                disabled={!conflictAction}
                className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                确认处理
              </button>
            </div>
          </div>
        </div>
      )}

      {changeDirTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-slate-800">切换导出目录并重试</h3>
              </div>
              <button
                onClick={() => { setChangeDirTask(null); setChangeDirValue(''); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                <p className="text-slate-700">
                  任务 <span className="font-mono">{changeDirTask.taskNo}</span> 当前目录:
                </p>
                <p className="text-slate-500 font-mono text-xs mt-1 break-all">{changeDirTask.exportDir}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">新导出目录</label>
                <input
                  type="text"
                  value={changeDirValue}
                  onChange={(e) => setChangeDirValue(e.target.value)}
                  placeholder="请输入新的目录路径"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => { setChangeDirTask(null); setChangeDirValue(''); }}
                className="flex-1 bg-slate-100 text-slate-700 rounded-lg py-2 text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleChangeDirRetry}
                disabled={!changeDirValue.trim()}
                className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                确认并重试
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
