export interface Batch {
  id: string;
  batchNo: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errorDetail: string;
  anomalyCount?: number;
  createdAt: string;
}

export interface Reading {
  id: string;
  batchId: string;
  lineNo: number;
  meterNo: string;
  meterName: string;
  prevReading: number | null;
  currReading: number | null;
  usage: number | null;
  readDate: string | null;
}

export interface Rule {
  id: string;
  name: string;
  type: 'spike' | 'negative' | 'rollback' | 'overlimit' | 'null_value';
  description: string;
  params: Record<string, number | string>;
  version: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleVersion {
  id: string;
  ruleId: string;
  version: number;
  params: Record<string, number | string>;
  createdAt: string;
}

export interface Anomaly {
  id: string;
  readingId: string;
  batchId: string;
  ruleId: string;
  ruleVersion: number;
  anomalyType: string;
  description: string;
  status: 'pending' | 'confirmed' | 'false_positive' | 'closed';
  createdAt: string;
  meterNo?: string;
  meterName?: string;
  prevReading?: number | null;
  currReading?: number | null;
  usage?: number | null;
  ruleName?: string;
  batchNo?: string;
  latestJudgment?: Judgment;
  latestResult?: string;
  latestReason?: string;
  latestNote?: string;
  latestOperator?: string;
  latestJudgmentAt?: string;
  latestPrevRuleId?: string;
  latestNewRuleId?: string;
}

export interface Judgment {
  id: string;
  anomalyId: string;
  prevStatus: string;
  newStatus: string;
  result: 'confirm' | 'false_positive' | 'reopen';
  reason: string;
  note: string;
  operator: string;
  createdAt: string;
  prevRuleId?: string;
  newRuleId?: string;
}

export interface ReportSummary {
  totalAnomalies: number;
  pendingCount: number;
  confirmedCount: number;
  falsePositiveCount: number;
  closedCount: number;
  byType: Array<{ anomalyType: string; count: number }>;
  byBatch: Array<{ batchId: string; batchNo: string; count: number }>;
}
