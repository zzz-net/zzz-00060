import { create } from 'zustand';
import type {
  Batch, Rule, Anomaly, ReportSummary, SelfCheckRecord,
  DrillSummary, DrillStep, ExportConflict, ExportConfig,
  DrillCompletionValidation
} from '@/shared/types';

interface AnomalyFilters {
  batchId: string;
  ruleId: string;
  status: string;
  meterNo: string;
}

interface AppState {
  batches: Batch[];
  batchesLoading: boolean;

  rules: Rule[];
  rulesLoading: boolean;

  anomalies: Anomaly[];
  anomaliesLoading: boolean;
  anomalyFilters: AnomalyFilters;

  summary: ReportSummary | null;
  summaryLoading: boolean;

  importResult: {
    validRows: number;
    errorRows: number;
    errorDetail: string;
    anomaliesCreated: number;
  } | null;

  selfCheckLatest: SelfCheckRecord | null;
  selfCheckLoading: boolean;
  selfCheckHistory: SelfCheckRecord[];

  drillSummaries: DrillSummary[];
  drillSummariesLoading: boolean;
  currentDrillSteps: DrillStep[];
  drillStartedAt: string | null;
  drillCompletionValidation: DrillCompletionValidation | null;

  exportConflict: ExportConflict | null;
  exportConflictLoading: boolean;
  exportConfigs: ExportConfig[];
  currentExportConfig: ExportConfig | null;

  fetchBatches: () => Promise<void>;
  importBatch: (file: File) => Promise<void>;
  clearImportResult: () => void;

  fetchRules: () => Promise<void>;
  createRule: (data: Partial<Rule>) => Promise<void>;
  updateRule: (id: string, data: Partial<Rule>) => Promise<void>;
  toggleRule: (id: string) => Promise<void>;

  fetchAnomalies: () => Promise<void>;
  setAnomalyFilters: (filters: Partial<AnomalyFilters>) => void;
  judgeAnomaly: (id: string, data: { result: string; reason: string; note: string; newRuleId?: string }) => Promise<void>;
  closeAnomaly: (id: string) => Promise<void>;
  reopenAnomaly: (id: string) => Promise<void>;

  fetchSummary: () => Promise<void>;

  fetchSelfCheckLatest: () => Promise<void>;
  fetchSelfCheckHistory: () => Promise<void>;
  runSelfCheck: () => Promise<SelfCheckRecord>;

  fetchDrillSummaries: () => Promise<void>;
  startDrill: () => void;
  updateDrillStep: (stepId: string, updates: Partial<DrillStep>) => void;
  validateDrillCompletion: () => Promise<DrillCompletionValidation>;
  completeDrill: (data: {
    importResult?: any;
    judgeResult?: any;
    closeReopenResult?: any;
    exportResult?: any;
    anomalyCount: number;
    exportedFile: string;
    operator?: string;
  }) => Promise<DrillSummary>;
  clearCurrentDrill: () => void;

  checkExportConflict: (fileName: string) => Promise<ExportConflict>;
  resolveExportConflict: (data: {
    fileName: string;
    action: 'rename' | 'overwrite' | 'cancel' | 'changeDir';
    newFileName?: string;
    exportDir?: string;
    performExport?: boolean;
  }) => Promise<any>;
  fetchExportConfigs: () => Promise<void>;
  saveExportConfig: (data: {
    exportDir: string;
    fileName: string;
    format: 'csv' | 'json';
  }) => Promise<ExportConfig>;
  exportReportToFile: (data: {
    format: 'csv' | 'json';
    fileName?: string;
    exportDir?: string;
    conflictAction?: 'rename' | 'overwrite' | 'cancel';
    customFileName?: string;
  }) => Promise<any>;
}

export const useAppStore = create<AppState>((set, get) => ({
  batches: [],
  batchesLoading: false,

  rules: [],
  rulesLoading: false,

  anomalies: [],
  anomaliesLoading: false,
  anomalyFilters: {
    batchId: '',
    ruleId: '',
    status: '',
    meterNo: '',
  },

  summary: null,
  summaryLoading: false,

  importResult: null,

  selfCheckLatest: null,
  selfCheckLoading: false,
  selfCheckHistory: [],

  drillSummaries: [],
  drillSummariesLoading: false,
  currentDrillSteps: [],
  drillStartedAt: null,
  drillCompletionValidation: null,

  exportConflict: null,
  exportConflictLoading: false,
  exportConfigs: [],
  currentExportConfig: null,

  fetchBatches: async () => {
    set({ batchesLoading: true });
    try {
      const res = await fetch('/api/batches');
      const json = await res.json();
      set({ batches: json.data ?? [], batchesLoading: false });
    } catch {
      set({ batchesLoading: false });
    }
  },

  importBatch: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/batches/import', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '导入失败');
      }
      const json = await res.json();
      const d = json.data;
      set({
        importResult: {
          validRows: d?.validRows ?? 0,
          errorRows: d?.errors?.length ?? 0,
          errorDetail: (d?.errors ?? []).map((e: { line: number; reason: string }) => `第${e.line}行: ${e.reason}`).join('\n'),
          anomaliesCreated: d?.anomaliesCreated ?? 0,
        },
      });
      get().fetchBatches();
    } catch (err: unknown) {
      throw new Error(err instanceof Error ? err.message : '导入失败');
    }
  },

  clearImportResult: () => set({ importResult: null }),

  fetchRules: async () => {
    set({ rulesLoading: true });
    try {
      const res = await fetch('/api/rules');
      const json = await res.json();
      const rules = (json.data ?? []).map((r: any) => ({
        ...r,
        params: typeof r.params === 'string' ? JSON.parse(r.params) : (r.params ?? {}),
        enabled: !!r.enabled,
      }));
      set({ rules, rulesLoading: false });
    } catch {
      set({ rulesLoading: false });
    }
  },

  createRule: async (data: Partial<Rule>) => {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '创建规则失败');
    }
    await get().fetchRules();
  },

  updateRule: async (id: string, data: Partial<Rule>) => {
    const res = await fetch(`/api/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '更新规则失败');
    }
    await get().fetchRules();
  },

  toggleRule: async (id: string) => {
    const res = await fetch(`/api/rules/${id}/toggle`, {
      method: 'PATCH',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '切换规则状态失败');
    }
    await get().fetchRules();
  },

  fetchAnomalies: async () => {
    set({ anomaliesLoading: true });
    const { anomalyFilters } = get();
    const params = new URLSearchParams();
    if (anomalyFilters.batchId) params.set('batchId', anomalyFilters.batchId);
    if (anomalyFilters.ruleId) params.set('ruleId', anomalyFilters.ruleId);
    if (anomalyFilters.status) params.set('status', anomalyFilters.status);
    try {
      const res = await fetch(`/api/anomalies?${params.toString()}`);
      const json = await res.json();
      const anomalies = (json.data ?? []).map((a: any) => ({
        ...a,
        latestJudgment: a.latestResult ? {
          result: a.latestResult,
          reason: a.latestReason ?? '',
          note: a.latestNote ?? '',
        } : undefined,
      }));
      let filtered = anomalies;
      if (anomalyFilters.meterNo) {
        const q = anomalyFilters.meterNo.toLowerCase();
        filtered = anomalies.filter((a: Anomaly) => a.meterNo?.toLowerCase().includes(q));
      }
      set({ anomalies: filtered, anomaliesLoading: false });
    } catch {
      set({ anomaliesLoading: false });
    }
  },

  setAnomalyFilters: (filters: Partial<AnomalyFilters>) => {
    set((state) => ({
      anomalyFilters: { ...state.anomalyFilters, ...filters },
    }));
  },

  judgeAnomaly: async (id: string, data: { result: string; reason: string; note: string }) => {
    const res = await fetch(`/api/anomalies/${id}/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '改判失败');
    }
    await get().fetchAnomalies();
  },

  closeAnomaly: async (id: string) => {
    const res = await fetch(`/api/anomalies/${id}/close`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '关闭失败');
    }
    await get().fetchAnomalies();
  },

  reopenAnomaly: async (id: string) => {
    const res = await fetch(`/api/anomalies/${id}/reopen`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '重开失败');
    }
    await get().fetchAnomalies();
  },

  fetchSummary: async () => {
    set({ summaryLoading: true });
    try {
      const res = await fetch('/api/report/summary');
      const json = await res.json();
      set({ summary: json.data ?? null, summaryLoading: false });
    } catch {
      set({ summaryLoading: false });
    }
  },

  fetchSelfCheckLatest: async () => {
    set({ selfCheckLoading: true });
    try {
      const res = await fetch('/api/check/latest');
      const json = await res.json();
      set({ selfCheckLatest: json.data ?? null, selfCheckLoading: false });
    } catch {
      set({ selfCheckLoading: false });
    }
  },

  fetchSelfCheckHistory: async () => {
    try {
      const res = await fetch('/api/check/history');
      const json = await res.json();
      set({ selfCheckHistory: json.data ?? [] });
    } catch {
      // ignore
    }
  },

  runSelfCheck: async () => {
    set({ selfCheckLoading: true });
    const res = await fetch('/api/check/run', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      set({ selfCheckLoading: false });
      throw new Error(err.error || '自检失败');
    }
    const json = await res.json();
    set({ selfCheckLatest: json.data, selfCheckLoading: false });
    return json.data;
  },

  fetchDrillSummaries: async () => {
    set({ drillSummariesLoading: true });
    try {
      const res = await fetch('/api/drill/summaries');
      const json = await res.json();
      set({ drillSummaries: json.data ?? [], drillSummariesLoading: false });
    } catch {
      set({ drillSummariesLoading: false });
    }
  },

  startDrill: () => {
    const steps: DrillStep[] = [
      {
        id: 'import',
        name: '样例导入',
        description: '导入 test-data.csv 样例文件，验证异常检测',
        status: 'pending',
      },
      {
        id: 'judge',
        name: '人工改判',
        description: '对一个待复核异常进行改判操作',
        status: 'pending',
      },
      {
        id: 'close-reopen',
        name: '关闭再重开',
        description: '关闭已改判异常后重新打开，验证状态回滚',
        status: 'pending',
      },
      {
        id: 'export',
        name: '导出报告',
        description: '导出 CSV 和 JSON 格式的复核报告',
        status: 'pending',
      },
    ];
    set({
      currentDrillSteps: steps,
      drillStartedAt: new Date().toISOString(),
    });
  },

  updateDrillStep: (stepId: string, updates: Partial<DrillStep>) => {
    set((state) => ({
      currentDrillSteps: state.currentDrillSteps.map((s) =>
        s.id === stepId ? { ...s, ...updates } : s
      ),
    }));
  },

  validateDrillCompletion: async () => {
    const { currentDrillSteps } = get();
    const res = await fetch('/api/drill/validate-completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: currentDrillSteps }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '验证失败');
    }

    const json = await res.json();
    set({ drillCompletionValidation: json.data });
    return json.data;
  },

  completeDrill: async (data) => {
    const { currentDrillSteps, drillStartedAt } = get();
    const durationMs = drillStartedAt
      ? Date.now() - new Date(drillStartedAt).getTime()
      : 0;

    const res = await fetch('/api/drill/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startedAt: drillStartedAt,
        durationMs,
        steps: currentDrillSteps,
        ...data,
      }),
    });

    const json = await res.json();

    if (!res.ok) {
      set({
        drillCompletionValidation: json.data?.validation || null,
      });
      await get().fetchDrillSummaries();
      const error = new Error(json.error || '保存演练摘要失败');
      (error as any).blockedStep = json.blockedStep;
      (error as any).retrySuggestion = json.retrySuggestion;
      (error as any).validation = json.data?.validation;
      (error as any).drillId = json.data?.id;
      throw error;
    }

    set({
      drillStartedAt: null,
      drillCompletionValidation: json.data?.completionValidation || null,
    });
    await get().fetchDrillSummaries();
    return json.data;
  },

  clearCurrentDrill: () => {
    set({
      currentDrillSteps: [],
      drillStartedAt: null,
      drillCompletionValidation: null,
      exportConflict: null,
    });
  },

  checkExportConflict: async (fileName: string) => {
    set({ exportConflictLoading: true });
    try {
      const res = await fetch(`/api/check/export/conflict?fileName=${encodeURIComponent(fileName)}`);
      const json = await res.json();
      set({
        exportConflict: json.data,
        exportConflictLoading: false,
      });
      return json.data;
    } catch (err) {
      set({ exportConflictLoading: false });
      throw err;
    }
  },

  resolveExportConflict: async (data) => {
    const res = await fetch('/api/check/export/resolve-conflict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const json = await res.json();

    if (!res.ok) {
      const error = new Error(json.error || '冲突处理失败');
      (error as any).blockedStep = json.blockedStep;
      (error as any).retrySuggestion = json.retrySuggestion;
      throw error;
    }

    await get().fetchSelfCheckLatest();
    await get().fetchExportConfigs();

    return json.data;
  },

  fetchExportConfigs: async () => {
    try {
      const res = await fetch('/api/check/export/config');
      const json = await res.json();
      set({ exportConfigs: json.data ?? [] });
    } catch {
      // ignore
    }
  },

  saveExportConfig: async (data) => {
    const res = await fetch('/api/check/export/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '保存导出配置失败');
    }

    const json = await res.json();
    set({ currentExportConfig: json.data });
    await get().fetchExportConfigs();
    return json.data;
  },

  exportReportToFile: async (data) => {
    const res = await fetch('/api/report/export-to-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      const error = new Error(json.error || '导出失败');
      (error as any).blockedStep = json.blockedStep;
      (error as any).retrySuggestion = json.retrySuggestion;
      throw error;
    }

    return json.data;
  },
}));
