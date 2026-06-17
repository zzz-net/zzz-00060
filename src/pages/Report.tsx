import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Download, FileWarning, Edit3, Trash2, FolderOpen, X } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAppStore } from '@/stores/app-store';
import type { ExportConflict } from '@/shared/types';

const PIE_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#6b7280'];

const anomalyTypeLabels: Record<string, string> = {
  spike: '突增',
  negative: '负值',
  rollback: '回退',
  overlimit: '超限',
  null_value: '空值',
};

function StatCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-800">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function Report() {
  const {
    summary,
    summaryLoading,
    fetchSummary,
    exportConflict,
    checkExportConflict,
    resolveExportConflict,
  } = useAppStore();
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [showConflict, setShowConflict] = useState(false);
  const [conflictFileName, setConflictFileName] = useState('');
  const [selectedAction, setSelectedAction] = useState<'rename' | 'overwrite' | 'cancel' | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [customDir, setCustomDir] = useState('');
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '未知';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const performExport = async (format: 'csv' | 'json', fileName: string) => {
    const res = await fetch(`/api/report/export?format=${format}`);
    if (!res.ok) throw new Error('导出失败');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleResolveConflict = async () => {
    if (!selectedAction) return;

    try {
      const resolution = await resolveExportConflict({
        fileName: conflictFileName,
        action: selectedAction,
        newFileName: selectedAction === 'rename' ? newFileName : undefined,
        exportDir: customDir || undefined,
      });

      if (selectedAction === 'cancel') {
        setExportError('导出已取消。');
        setShowConflict(false);
        return;
      }

      const finalFileName = resolution.newFileName || conflictFileName;
      await performExport(exportFormat, finalFileName);

      setShowConflict(false);
      setSelectedAction(null);
      setNewFileName('');
      setCustomDir('');
      setExportError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导出失败';
      setExportError(msg);
      setShowConflict(false);
    }
  };

  const handleExport = useCallback(async () => {
    try {
      setExportError('');
      const fileName = `report.${exportFormat}`;
      const conflict = await checkExportConflict(fileName);

      if (conflict.exists) {
        setConflictFileName(fileName);
        setNewFileName(conflict.suggestedName || '');
        setShowConflict(true);
        return;
      }

      await performExport(exportFormat, fileName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导出失败';
      setExportError(msg);
    }
  }, [exportFormat, checkExportConflict]);

  if (summaryLoading && !summary) {
    return <div className="text-center py-12 text-sm text-slate-400">加载中...</div>;
  }

  const pieData = (summary?.byType ?? []).map((item) => ({
    name: anomalyTypeLabels[item.anomalyType] ?? item.anomalyType,
    value: item.count,
  }));

  const barData = (summary?.byBatch ?? []).map((item) => ({
    name: item.batchNo,
    count: item.count,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">复核报告</h2>
        <p className="text-sm text-slate-500 mt-1">异常检测统计数据总览与导出</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={AlertTriangle} label="总异常数" value={summary?.totalAnomalies ?? 0} color="bg-slate-700" />
        <StatCard icon={RefreshCw} label="待复核" value={summary?.pendingCount ?? 0} color="bg-amber-500" />
        <StatCard icon={CheckCircle} label="已改判" value={(summary?.confirmedCount ?? 0) + (summary?.falsePositiveCount ?? 0)} color="bg-green-500" />
        <StatCard icon={XCircle} label="已关闭" value={summary?.closedCount ?? 0} color="bg-gray-400" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
          <h3 className="text-base font-semibold text-slate-700 mb-4">异常类型分布</h3>
          {pieData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
          <h3 className="text-base font-semibold text-slate-700 mb-4">批次异常分布</h3>
          {barData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="异常数" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
        <h3 className="text-base font-semibold text-slate-700 mb-4">导出报告</h3>
        {exportError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{exportError}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-4">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'csv' | 'json')}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 bg-amber-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            <Download className="w-4 h-4" />
            导出报告
          </button>
        </div>
      </div>

      {showConflict && exportConflict && (
        <ExportConflictModal
          conflict={exportConflict}
          fileName={conflictFileName}
          selectedAction={selectedAction}
          setSelectedAction={setSelectedAction}
          newFileName={newFileName}
          setNewFileName={setNewFileName}
          customDir={customDir}
          setCustomDir={setCustomDir}
          onConfirm={handleResolveConflict}
          onCancel={() => {
            setShowConflict(false);
            setSelectedAction(null);
            setNewFileName('');
            setCustomDir('');
          }}
        />
      )}
    </div>
  );
}

function ExportConflictModal({
  conflict,
  fileName,
  selectedAction,
  setSelectedAction,
  newFileName,
  setNewFileName,
  customDir,
  setCustomDir,
  onConfirm,
  onCancel,
}: {
  conflict: ExportConflict;
  fileName: string;
  selectedAction: 'rename' | 'overwrite' | 'cancel' | null;
  setSelectedAction: (action: 'rename' | 'overwrite' | 'cancel' | null) => void;
  newFileName: string;
  setNewFileName: (name: string) => void;
  customDir: string;
  setCustomDir: (dir: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '未知';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <FileWarning className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-semibold text-slate-800">文件名冲突</h3>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm font-medium text-amber-800">检测到同名文件已存在</p>
            <div className="mt-2 text-xs text-amber-700 space-y-1">
              <p>文件名: <code className="bg-amber-100 px-1.5 py-0.5 rounded">{conflict.fileName}</code></p>
              <p>文件大小: {formatFileSize(conflict.fileSize)}</p>
              {conflict.modifiedAt && (
                <p>修改时间: {new Date(conflict.modifiedAt).toLocaleString()}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">请选择处理方式:</p>

            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedAction === 'rename'
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}>
              <input
                type="radio"
                name="conflictAction"
                checked={selectedAction === 'rename'}
                onChange={() => setSelectedAction('rename')}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-800">自动重命名</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">系统自动生成不重复的文件名</p>
                {selectedAction === 'rename' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      placeholder="输入新文件名"
                    />
                    <p className="text-xs text-slate-500 mt-1">建议: {conflict.suggestedName}</p>
                  </div>
                )}
              </div>
            </label>

            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              selectedAction === 'overwrite'
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}>
              <input
                type="radio"
                name="conflictAction"
                checked={selectedAction === 'overwrite'}
                onChange={() => setSelectedAction('overwrite')}
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
              customDir
                ? 'border-amber-400 bg-amber-50'
                : 'border-slate-200 hover:border-slate-300'
            }`}>
              <div className="mt-1">
                <FolderOpen className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">切换导出目录</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">指定一个新的目录路径保存文件</p>
                <input
                  type="text"
                  value={customDir}
                  onChange={(e) => {
                    setCustomDir(e.target.value);
                    if (e.target.value) setSelectedAction('rename');
                  }}
                  className="mt-2 w-full border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="例如: C:/Users/Documents/Exports"
                />
              </div>
            </label>
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-slate-100 text-slate-700 rounded-lg py-2 text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!selectedAction}
            className="flex-1 bg-amber-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            确认并导出
          </button>
        </div>
      </div>
    </div>
  );
}
