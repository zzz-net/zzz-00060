import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw, Download } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAppStore } from '@/stores/app-store';

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
  const { summary, summaryLoading, fetchSummary } = useAppStore();
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch(`/api/report/export?format=${exportFormat}`);
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // error
    }
  }, [exportFormat]);

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
    </div>
  );
}
