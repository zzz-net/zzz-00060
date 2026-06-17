import { create } from 'zustand';
import type { Batch, Rule, Anomaly, ReportSummary, SelfCheckRecord, DrillSummary, DrillStep } from '@/shared/types';

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

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '保存演练摘要失败');
    }

    const json = await res.json();
    set({
      drillStartedAt: null,
    });
    await get().fetchDrillSummaries();
    return json.data;
  },

  clearCurrentDrill: () => {
    set({
      currentDrillSteps: [],
      drillStartedAt: null,
    });
  },
}));
