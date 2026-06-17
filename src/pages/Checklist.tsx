import { useCallback, useEffect, useState } from 'react';
import {
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  FileText,
  Shield,
  Upload,
  Download,
  History,
  ChevronRight,
  ChevronDown,
  Zap,
  RotateCcw,
  X,
} from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import type { SelfCheckRecord, DrillSummary, Anomaly } from '@/shared/types';
import { useNavigate } from 'react-router-dom';

const statusLabels: Record<string, string> = {
  pending: '等待开始',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  pass: '通过',
  fail: '未通过',
};

const statusColors: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-500',
  running: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pass: 'bg-green-100 text-green-700',
  fail: 'bg-red-100 text-red-700',
};

function CheckCard({ item }: { item: { pass: boolean; name: string; message: string; details?: string } }) {
  return (
    <div className={`p-4 rounded-lg border ${item.pass ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
      <div className="flex items-start gap-3">
        {item.pass ? (
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${item.pass ? 'text-green-800' : 'text-red-800'}`}>
              {item.name}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${item.pass ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
              {item.pass ? '通过' : '未通过'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">{item.message}</p>
          {item.details && (
            <p className="text-xs text-slate-500 mt-1 font-mono break-all">{item.details}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  onAction,
  actionLabel,
  disabled,
}: {
  step: { id: string; name: string; description: string; status: string };
  onAction?: () => void;
  actionLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border ${
      step.status === 'completed' ? 'border-green-200 bg-green-50/50' :
      step.status === 'running' ? 'border-amber-200 bg-amber-50/50' :
      step.status === 'failed' ? 'border-red-200 bg-red-50/50' :
      'border-slate-200 bg-white'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          step.status === 'completed' ? 'bg-green-500 text-white' :
          step.status === 'running' ? 'bg-amber-500 text-white' :
          step.status === 'failed' ? 'bg-red-500 text-white' :
          'bg-slate-200 text-slate-500'
        }`}>
          {step.status === 'completed' ? <CheckCircle className="w-4 h-4" /> :
           step.status === 'running' ? <RefreshCw className="w-4 h-4 animate-spin" /> :
           step.status === 'failed' ? <X className="w-4 h-4" /> :
           <span className="text-xs font-medium">{['import', 'judge', 'close-reopen', 'export'].indexOf(step.id) + 1}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm font-medium ${
              step.status === 'completed' ? 'text-green-800' :
              step.status === 'running' ? 'text-amber-800' :
              step.status === 'failed' ? 'text-red-800' :
              'text-slate-700'
            }`}>
              {step.name}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${statusColors[step.status] ?? statusColors.pending}`}>
              {statusLabels[step.status] ?? '等待'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">{step.description}</p>
          {onAction && (step.status === 'pending' || step.status === 'failed') && (
            <button
              onClick={onAction}
              disabled={disabled}
              className="mt-3 text-xs bg-amber-500 text-white px-3 py-1.5 rounded font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLabel ?? '开始执行'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryModal({ summary, onClose }: { summary: DrillSummary; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">演练摘要</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">开始时间</p>
              <p className="text-sm font-medium text-slate-800 mt-1">{new Date(summary.startedAt).toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">完成时间</p>
              <p className="text-sm font-medium text-slate-800 mt-1">{new Date(summary.completedAt).toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">耗时</p>
              <p className="text-sm font-medium text-slate-800 mt-1">{(summary.durationMs / 1000).toFixed(1)}s</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs text-slate-500">操作人</p>
              <p className="text-sm font-medium text-slate-800 mt-1">{summary.operator}</p>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3">执行步骤</h4>
            <div className="space-y-2">
              {summary.steps.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    step.status === 'completed' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {step.status === 'completed' ? <CheckCircle className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{idx + 1}. {step.name}</p>
                    {step.startedAt && (
                      <p className="text-xs text-slate-500">开始: {new Date(step.startedAt).toLocaleTimeString()}</p>
                    )}
                    {step.completedAt && (
                      <p className="text-xs text-slate-500">完成: {new Date(step.completedAt).toLocaleTimeString()}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {summary.anomalyCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-800">
                检出异常数: <strong>{summary.anomalyCount}</strong>
              </p>
            </div>
          )}

          {summary.exportedFile && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm font-medium text-green-800">
                导出文件: <strong>{summary.exportedFile}</strong>
              </p>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full bg-slate-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Checklist() {
  const {
    selfCheckLatest,
    selfCheckLoading,
    selfCheckHistory,
    drillSummaries,
    drillSummariesLoading,
    currentDrillSteps,
    drillStartedAt,
    anomalies,
    fetchSelfCheckLatest,
    fetchSelfCheckHistory,
    runSelfCheck,
    fetchDrillSummaries,
    startDrill,
    updateDrillStep,
    completeDrill,
    clearCurrentDrill,
    fetchAnomalies,
    importBatch,
    judgeAnomaly,
    closeAnomaly,
    reopenAnomaly,
  } = useAppStore();

  const navigate = useNavigate();
  const [showHistory, setShowHistory] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<DrillSummary | null>(null);
  const [drillError, setDrillError] = useState('');

  useEffect(() => {
    fetchSelfCheckLatest();
    fetchSelfCheckHistory();
    fetchDrillSummaries();
    fetchAnomalies();
  }, [fetchSelfCheckLatest, fetchSelfCheckHistory, fetchDrillSummaries, fetchAnomalies]);

  const handleRunCheck = useCallback(async () => {
    try {
      await runSelfCheck();
      await fetchSelfCheckHistory();
    } catch (err: unknown) {
      // error handled in UI
    }
  }, [runSelfCheck, fetchSelfCheckHistory]);

  const handleStartDrill = useCallback(() => {
    startDrill();
    setDrillError('');
  }, [startDrill]);

  const handleStepImport = useCallback(async () => {
    updateDrillStep('import', { status: 'running', startedAt: new Date().toISOString() });
    try {
      const response = await fetch('/test-data.csv');
      if (!response.ok) throw new Error('无法加载样例文件');
      const blob = await response.blob();
      const file = new File([blob], 'test-data.csv', { type: 'text/csv' });
      await importBatch(file);
      await fetchAnomalies();
      updateDrillStep('import', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: { success: true },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导入失败';
      updateDrillStep('import', { status: 'failed', completedAt: new Date().toISOString(), error: msg });
      setDrillError(`样例导入失败: ${msg}。请检查 test-data.csv 文件是否存在且格式正确。`);
    }
  }, [updateDrillStep, importBatch, fetchAnomalies]);

  const handleStepJudge = useCallback(async () => {
    updateDrillStep('judge', { status: 'running', startedAt: new Date().toISOString() });
    try {
      const pending = anomalies.filter((a: Anomaly) => a.status === 'pending');
      if (pending.length === 0) {
        throw new Error('没有待复核的异常记录');
      }
      const target = pending[0];
      await judgeAnomaly(target.id, {
        result: 'confirm',
        reason: 'DRILL:演练改判确认异常',
        note: 'DRILL:演练操作',
      });
      await fetchAnomalies();
      updateDrillStep('judge', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: { anomalyId: target.id, success: true },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '改判失败';
      updateDrillStep('judge', { status: 'failed', completedAt: new Date().toISOString(), error: msg });
      setDrillError(`人工改判失败: ${msg}`);
    }
  }, [updateDrillStep, anomalies, judgeAnomaly, fetchAnomalies]);

  const handleStepCloseReopen = useCallback(async () => {
    updateDrillStep('close-reopen', { status: 'running', startedAt: new Date().toISOString() });
    try {
      const confirmed = anomalies.filter((a: Anomaly) => a.status === 'confirmed' || a.status === 'false_positive');
      if (confirmed.length === 0) {
        throw new Error('没有可关闭的异常记录');
      }
      const target = confirmed[0];
      await closeAnomaly(target.id);
      await fetchAnomalies();
      await new Promise(resolve => setTimeout(resolve, 500));
      await reopenAnomaly(target.id);
      await fetchAnomalies();
      updateDrillStep('close-reopen', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: { anomalyId: target.id, success: true },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '关闭重开失败';
      updateDrillStep('close-reopen', { status: 'failed', completedAt: new Date().toISOString(), error: msg });
      setDrillError(`关闭重开失败: ${msg}`);
    }
  }, [updateDrillStep, anomalies, closeAnomaly, reopenAnomaly, fetchAnomalies]);

  const handleStepExport = useCallback(async () => {
    updateDrillStep('export', { status: 'running', startedAt: new Date().toISOString() });
    try {
      const res = await fetch('/api/report/export?format=csv');
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drill_report.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await new Promise(resolve => setTimeout(resolve, 500));

      const res2 = await fetch('/api/report/export?format=json');
      if (!res2.ok) throw new Error('JSON导出失败');
      const blob2 = await res2.blob();
      const url2 = URL.createObjectURL(blob2);
      const a2 = document.createElement('a');
      a2.href = url2;
      a2.download = 'drill_report.json';
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
      URL.revokeObjectURL(url2);

      updateDrillStep('export', {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: { files: ['drill_report.csv', 'drill_report.json'], success: true },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导出失败';
      updateDrillStep('export', { status: 'failed', completedAt: new Date().toISOString(), error: msg });
      setDrillError(`导出报告失败: ${msg}`);
    }
  }, [updateDrillStep]);

  const handleCompleteDrill = useCallback(async () => {
    try {
      const allCompleted = currentDrillSteps.every(s => s.status === 'completed');
      if (!allCompleted) {
        setDrillError('请先完成所有演练步骤');
        return;
      }
      const importStep = currentDrillSteps.find(s => s.id === 'import');
      const judgeStep = currentDrillSteps.find(s => s.id === 'judge');
      const closeStep = currentDrillSteps.find(s => s.id === 'close-reopen');
      const exportStep = currentDrillSteps.find(s => s.id === 'export');

      const summary = await completeDrill({
        importResult: importStep?.result,
        judgeResult: judgeStep?.result,
        closeReopenResult: closeStep?.result,
        exportResult: exportStep?.result,
        anomalyCount: anomalies.length,
        exportedFile: 'drill_report.csv, drill_report.json',
        operator: '演练员',
      });
      setSelectedSummary(summary);
      setShowSummary(true);
      clearCurrentDrill();
      setDrillError('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '保存演练摘要失败';
      setDrillError(msg);
    }
  }, [currentDrillSteps, completeDrill, anomalies.length, clearCurrentDrill]);

  const canStartDrill = selfCheckLatest?.status === 'pass';
  const allStepsCompleted = currentDrillSteps.length > 0 && currentDrillSteps.every(s => s.status === 'completed');

  const checkItems = selfCheckLatest
    ? [selfCheckLatest.configCheck, selfCheckLatest.apiCheck, selfCheckLatest.sampleFileCheck, selfCheckLatest.exportDirCheck]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">交付自检与演练</h2>
        <p className="text-sm text-slate-500 mt-1">系统交付前的环境自检和功能演练入口</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-slate-700">交付自检</h3>
            </div>
            <button
              onClick={handleRunCheck}
              disabled={selfCheckLoading}
              className="flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {selfCheckLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {selfCheckLoading ? '检查中...' : '运行自检'}
            </button>
          </div>

          {selfCheckLatest ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selfCheckLatest.status === 'pass' ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {selfCheckLatest.status === 'pass' ? (
                    <CheckCircle className="w-5 h-5 text-white" />
                  ) : (
                    <XCircle className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {selfCheckLatest.status === 'pass' ? '全部检查通过' : '存在未通过检查项'}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(selfCheckLatest.checkedAt).toLocaleString()}
                    </span>
                    <span>耗时 {selfCheckLatest.durationMs}ms</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {checkItems.map((item, idx) => (
                  <CheckCard key={idx} item={item} />
                ))}
              </div>

              {selfCheckLatest.failureSummary && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-red-800">失败摘要</p>
                      <p className="text-xs text-red-700 mt-1">{selfCheckLatest.failureSummary}</p>
                    </div>
                  </div>
                </div>
              )}

              {selfCheckLatest.keyLogs && selfCheckLatest.keyLogs.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                  >
                    {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    查看关键日志
                  </button>
                  {showHistory && (
                    <div className="mt-2 bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono max-h-40 overflow-y-auto">
                      {selfCheckLatest.keyLogs.map((log, idx) => (
                        <div key={idx} className="py-0.5">{log}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-slate-400">
              {selfCheckLoading ? '检查中...' : '点击「运行自检」开始检查'}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-slate-700">功能演练</h3>
            </div>
            {!drillStartedAt && (
              <button
                onClick={handleStartDrill}
                disabled={!canStartDrill}
                className="flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-4 h-4" />
                开始演练
              </button>
            )}
            {drillStartedAt && (
              <button
                onClick={clearCurrentDrill}
                className="flex items-center gap-1.5 text-slate-500 px-3 py-1.5 rounded-lg text-sm font-medium hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                重置
              </button>
            )}
          </div>

          {!canStartDrill && !drillStartedAt && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  请先完成交付自检并确保所有检查项通过后再开始演练
                </p>
              </div>
            </div>
          )}

          {drillError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">演练出错</p>
                  <p className="text-sm text-red-700 mt-1">{drillError}</p>
                  <button
                    onClick={() => setDrillError('')}
                    className="text-xs text-red-600 hover:text-red-700 mt-2"
                  >
                    重试该步骤
                  </button>
                </div>
              </div>
            </div>
          )}

          {drillStartedAt ? (
            <div className="space-y-3">
              {currentDrillSteps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  onAction={
                    step.id === 'import' ? handleStepImport :
                    step.id === 'judge' ? handleStepJudge :
                    step.id === 'close-reopen' ? handleStepCloseReopen :
                    step.id === 'export' ? handleStepExport :
                    undefined
                  }
                  actionLabel={
                    step.id === 'import' ? '导入样例' :
                    step.id === 'judge' ? '执行改判' :
                    step.id === 'close-reopen' ? '关闭重开' :
                    step.id === 'export' ? '导出报告' :
                    undefined
                  }
                  disabled={step.status === 'running'}
                />
              ))}

              {allStepsCompleted && (
                <button
                  onClick={handleCompleteDrill}
                  className="w-full bg-green-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-600 transition-colors"
                >
                  完成演练，生成摘要
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-slate-400">
              {canStartDrill ? '点击「开始演练」进入演练流程' : '请先完成交付自检'}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-700">演练历史</h3>
          </div>
          <span className="text-xs text-slate-500">最近 20 条</span>
        </div>

        {drillSummariesLoading && !drillSummaries.length ? (
          <div className="text-center py-8 text-sm text-slate-400">加载中...</div>
        ) : drillSummaries.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">暂无演练记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-left">
                  <th className="px-4 py-3 font-medium">开始时间</th>
                  <th className="px-4 py-3 font-medium">耗时</th>
                  <th className="px-4 py-3 font-medium">异常数</th>
                  <th className="px-4 py-3 font-medium">导出文件</th>
                  <th className="px-4 py-3 font-medium">操作人</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {drillSummaries.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-800">{new Date(s.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{(s.durationMs / 1000).toFixed(1)}s</td>
                    <td className="px-4 py-3">
                      <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">
                        {s.anomalyCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs font-mono">{s.exportedFile || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{s.operator}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setSelectedSummary(s); setShowSummary(true); }}
                        className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                      >
                        查看摘要
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-slate-500" />
          <h3 className="text-base font-semibold text-slate-700">真实启动步骤</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
            <div>
              <p className="text-sm font-medium text-slate-800">安装依赖</p>
              <code className="text-xs bg-slate-200 px-2 py-0.5 rounded mt-1 inline-block font-mono">npm install</code>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
            <div>
              <p className="text-sm font-medium text-slate-800">启动开发服务（同时启动前端和后端）</p>
              <code className="text-xs bg-slate-200 px-2 py-0.5 rounded mt-1 inline-block font-mono">npm run dev</code>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
            <div>
              <p className="text-sm font-medium text-slate-800">访问应用</p>
              <code className="text-xs bg-slate-200 px-2 py-0.5 rounded mt-1 inline-block font-mono">http://localhost:5173</code>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</div>
            <div>
              <p className="text-sm font-medium text-slate-800">或单独启动后端（CLI 模式）</p>
              <code className="text-xs bg-slate-200 px-2 py-0.5 rounded mt-1 inline-block font-mono">npm run server:dev</code>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <h3 className="text-base font-semibold text-slate-700">必跑检查项</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Shield className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">配置检查</p>
              <p className="text-xs text-slate-500">数据库文件存在、默认规则已加载</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Zap className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">接口检查</p>
              <p className="text-xs text-slate-500">API 服务可访问、数据查询正常</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Upload className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">样例文件检查</p>
              <p className="text-xs text-slate-500">test-data.csv 存在且格式正确</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <Download className="w-5 h-5 text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-800">导出目录检查</p>
              <p className="text-xs text-slate-500">目录可写、无重名冲突</p>
            </div>
          </div>
        </div>
      </div>

      {showSummary && selectedSummary && (
        <SummaryModal summary={selectedSummary} onClose={() => { setShowSummary(false); setSelectedSummary(null); }} />
      )}
    </div>
  );
}
