import { useCallback, useEffect, useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import type { Anomaly } from '@/shared/types';

const statusLabels: Record<string, string> = {
  pending: '待复核',
  confirmed: '已确认',
  false_positive: '误报',
  closed: '已关闭',
};

const statusTags: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  false_positive: 'bg-teal-100 text-teal-700',
  closed: 'bg-gray-100 text-gray-500',
};

const anomalyTypeLabels: Record<string, string> = {
  spike: '突增',
  negative: '负值',
  rollback: '回退',
  overlimit: '超限',
  null_value: '空值',
};

function JudgePanel({
  anomaly,
  rules,
  onClose,
  onJudge,
}: {
  anomaly: Anomaly;
  rules: Array<{ id: string; name: string; type: string; enabled?: boolean }>;
  onClose: () => void;
  onJudge: (id: string, data: { result: string; reason: string; note: string; newRuleId?: string }) => Promise<void>;
}) {
  const [result, setResult] = useState<'confirm' | 'false_positive'>('confirm');
  const [newRuleId, setNewRuleId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const payload: { result: string; reason: string; note: string; newRuleId?: string } = { result, reason, note };
      if (newRuleId && newRuleId !== anomaly.ruleId) {
        payload.newRuleId = newRuleId;
      }
      await onJudge(anomaly.id, payload);
      onClose();
    } catch {
    } finally {
      setSubmitting(false);
    }
  }, [anomaly.id, anomaly.ruleId, result, newRuleId, reason, note, onJudge, onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-96 bg-white shadow-xl h-full overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">改判</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
            <p><span className="text-slate-500">表号：</span>{anomaly.meterNo}</p>
            <p><span className="text-slate-500">户名：</span>{anomaly.meterName}</p>
            <p><span className="text-slate-500">异常类型：</span>{anomalyTypeLabels[anomaly.anomalyType] ?? anomaly.anomalyType}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">判定结果</label>
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as 'confirm' | 'false_positive')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="confirm">确认异常</option>
              <option value="false_positive">误报</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">变更异常类别（可选，不选则保持原类别）</label>
            <select
              value={newRuleId}
              onChange={(e) => setNewRuleId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">保持原类别</option>
              {rules.filter(r => r.enabled !== false).map((r) => (
                <option key={r.id} value={r.id}>{r.name}（{anomalyTypeLabels[r.type] ?? r.type}）</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">原因</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-amber-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {submitting ? '提交中...' : '提交改判'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AnomalyReview() {
  const {
    anomalies, anomaliesLoading, anomalyFilters, batches, rules,
    fetchAnomalies, fetchBatches, fetchRules, setAnomalyFilters,
    judgeAnomaly, closeAnomaly, reopenAnomaly,
  } = useAppStore();

  const [judgingAnomaly, setJudgingAnomaly] = useState<Anomaly | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    fetchBatches();
    fetchRules();
    fetchAnomalies();
  }, [fetchBatches, fetchRules, fetchAnomalies]);

  const handleSearch = useCallback(() => {
    setPage(1);
    fetchAnomalies();
  }, [fetchAnomalies]);

  const paginated = anomalies.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(anomalies.length / pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">异常复核</h2>
        <p className="text-sm text-slate-500 mt-1">审核异常记录，进行改判、关闭或重开操作</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={anomalyFilters.batchId}
              onChange={(e) => setAnomalyFilters({ batchId: e.target.value })}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">全部批次</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.batchNo}</option>
              ))}
            </select>
          </div>
          <select
            value={anomalyFilters.ruleId}
            onChange={(e) => setAnomalyFilters({ ruleId: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">全部规则</option>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select
            value={anomalyFilters.status}
            onChange={(e) => setAnomalyFilters({ status: e.target.value })}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">全部状态</option>
            <option value="pending">待复核</option>
            <option value="confirmed">已改判</option>
            <option value="false_positive">误报</option>
            <option value="closed">已关闭</option>
          </select>
          <div className="flex items-center gap-1.5">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={anomalyFilters.meterNo}
              onChange={(e) => setAnomalyFilters({ meterNo: e.target.value })}
              placeholder="表号搜索"
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-36"
            />
          </div>
          <button
            onClick={handleSearch}
            className="bg-amber-500 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            查询
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        {anomaliesLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">加载中...</div>
        ) : anomalies.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">暂无异常数据</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 text-left">
                    <th className="px-4 py-3 font-medium">表号</th>
                    <th className="px-4 py-3 font-medium">户名</th>
                    <th className="px-4 py-3 font-medium">上期读数</th>
                    <th className="px-4 py-3 font-medium">本期读数</th>
                    <th className="px-4 py-3 font-medium">用量</th>
                    <th className="px-4 py-3 font-medium">异常类型</th>
                    <th className="px-4 py-3 font-medium">规则名</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">改判信息</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((a) => (
                    <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono text-xs">{a.meterNo ?? '-'}</td>
                      <td className="px-4 py-3">{a.meterName ?? '-'}</td>
                      <td className="px-4 py-3">{a.prevReading ?? '-'}</td>
                      <td className="px-4 py-3">{a.currReading ?? '-'}</td>
                      <td className="px-4 py-3">{a.usage ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                          {anomalyTypeLabels[a.anomalyType] ?? a.anomalyType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{a.ruleName ?? '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusTags[a.status] ?? ''}`}>
                          {statusLabels[a.status] ?? a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-pre-line max-w-[240px]">
                        {a.latestJudgment
                          ? `${a.latestJudgment.result === 'confirm' ? '确认异常' : a.latestJudgment.result === 'false_positive' ? '误报' : a.latestJudgment.result === 'reopen' ? '重开' : a.latestJudgment.result}${a.latestJudgment.reason ? `\n原因：${a.latestJudgment.reason}` : ''}${a.latestJudgment.note ? `\n备注：${a.latestJudgment.note}` : ''}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {a.status === 'pending' && (
                          <button
                            onClick={() => setJudgingAnomaly(a)}
                            className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                          >
                            改判
                          </button>
                        )}
                        {(a.status === 'confirmed' || a.status === 'false_positive') && (
                          <button
                            onClick={() => closeAnomaly(a.id)}
                            className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                          >
                            关闭
                          </button>
                        )}
                        {a.status === 'closed' && (
                          <button
                            onClick={() => reopenAnomaly(a.id)}
                            className="text-xs text-amber-600 border border-amber-400 rounded px-2 py-0.5 hover:bg-amber-50 font-medium"
                          >
                            重开
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-3 border-t border-slate-100">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
                >
                  上一页
                </button>
                <span className="text-sm text-slate-500">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {judgingAnomaly && (
        <JudgePanel
          anomaly={judgingAnomaly}
          rules={rules}
          onClose={() => setJudgingAnomaly(null)}
          onJudge={judgeAnomaly}
        />
      )}
    </div>
  );
}
