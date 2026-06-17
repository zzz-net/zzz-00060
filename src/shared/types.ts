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
  result: 'confirm' | 'false_positive' | 'reopen' | 'close';
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

export interface ConflictFile {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
}

export interface CheckItem {
  pass: boolean;
  name: string;
  message: string;
  details?: string;
  conflictInfo?: {
    exists: boolean;
    files: ConflictFile[];
    suggestedAction?: string;
  };
}

export interface SelfCheckRecord {
  id: string;
  status: 'pass' | 'fail' | 'running';
  checkedAt: string;
  durationMs: number;
  configCheck: CheckItem;
  apiCheck: CheckItem;
  sampleFileCheck: CheckItem;
  exportDirCheck: CheckItem;
  failureSummary: string;
  keyLogs: string[];
  exportConflictInfo?: {
    exists: boolean;
    files: ConflictFile[];
    suggestedAction?: string;
  } | null;
  conflictResolution?: {
    action: 'rename' | 'overwrite' | 'cancel';
    fileName: string;
    exportDir: string;
    originalFilePath: string;
    resolvedAt: string;
    success: boolean;
    newFileName?: string;
    finalFilePath?: string;
    failureReason?: string;
    retrySuggestion?: string;
  } | null;
}

export interface DrillStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

export interface ExportConfig {
  id: string;
  exportDir: string;
  fileName: string;
  format: 'csv' | 'json';
  conflictAction: 'rename' | 'overwrite' | 'cancel' | null;
  newFileName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportConflict {
  exists: boolean;
  filePath: string;
  fileName: string;
  fileSize?: number;
  modifiedAt?: string;
  suggestedName?: string;
  exportDir?: string;
}

export interface ExportResult {
  fileName: string;
  filePath: string;
  exportDir: string;
  format: string;
  fileSize: number;
  recordCount: number;
  exportedAt: string;
  conflictAction: string;
  originalFileExists: boolean;
}

export interface ConflictResolution {
  action: 'rename' | 'overwrite' | 'cancel' | 'changeDir';
  fileName: string;
  exportDir: string;
  originalFilePath: string;
  originalFileExists: boolean;
  resolvedAt: string;
  success: boolean;
  newFileName?: string;
  finalFilePath?: string;
  failureReason?: string;
  retrySuggestion?: string;
  exportResult?: ExportResult;
  exportedAt?: string;
  fileSize?: number;
  recordCount?: number;
  exportError?: string;
}

export interface DrillCompletionValidation {
  allStepsCompleted: boolean;
  selfCheckPassed: boolean;
  noSkippedFailedSteps: boolean;
  allStepsExecuted: boolean;
  exportConflictResolved: boolean;
  completeValidationPassed: boolean;
  failureReason?: string;
  blockedStep?: string;
  retrySuggestion?: string;
}

export interface DrillSummary {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  steps: DrillStep[];
  importResult?: any;
  judgeResult?: any;
  closeReopenResult?: any;
  exportResult?: any;
  anomalyCount: number;
  exportedFile: string;
  operator: string;
  completionValidation?: DrillCompletionValidation;
  status?: 'completed' | 'incomplete' | 'failed';
}

export type ExportTaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

export type ExportConflictAction = 'rename' | 'overwrite' | 'cancel' | 'changeDir' | '';

export interface ExportTaskConflictInfo {
  exists: boolean;
  filePath: string;
  fileName: string;
  fileSize?: number;
  modifiedAt?: string;
  suggestedName?: string;
}

export interface ExportTask {
  id: string;
  taskNo: string;
  status: ExportTaskStatus;
  format: 'csv' | 'json';
  exportDir: string;
  fileName: string;
  finalFileName: string;
  finalFilePath: string;
  fileSize: number;
  recordCount: number;
  conflictAction: ExportConflictAction;
  conflictResolved: boolean;
  conflictInfo: ExportTaskConflictInfo | null;
  failureReason: string;
  keyLogs: string[];
  operator: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  filterBatchId: string;
  filterAnomalyStatus: string;
  filterAnomalyType: string;
}

export interface CreateExportTaskRequest {
  format: 'csv' | 'json';
  exportDir: string;
  fileName: string;
  conflictAction?: ExportConflictAction;
  newFileName?: string;
  operator?: string;
  filterBatchId?: string;
  filterAnomalyStatus?: string;
  filterAnomalyType?: string;
}

export interface ExportTaskFilterOptions {
  batches: Array<{ id: string; batchNo: string; fileName: string }>;
  anomalyStatuses: string[];
  anomalyTypes: string[];
}

export interface ExportTaskGeneratedFile {
  taskId: string;
  taskNo: string;
  format: string;
  exportDir: string;
  originalFileName: string;
  finalFileName: string;
  finalFilePath: string;
  fileSize: number;
  recordCount: number;
  conflictAction: string;
  operator: string;
  createdAt: string;
  completedAt: string;
  exists: boolean;
  filters: {
    batchId: string;
    anomalyStatus: string;
    anomalyType: string;
  };
}

export interface ExportTaskSummary {
  total: number;
  queued: number;
  running: number;
  success: number;
  failed: number;
  cancelled: number;
}

export interface ExportTaskVerifyResult {
  taskId: string;
  taskNo: string;
  status: string;
  finalFilePath: string;
  finalFileName: string;
  apiFileSize: number;
  apiRecordCount: number;
  diskExists: boolean;
  diskFileSize: number;
  sizeMatch: boolean;
  consistent: boolean;
  issues: string[];
}

export interface ExportAuditLogEntry {
  taskId: string;
  taskNo: string;
  status: string;
  format: string;
  exportDir: string;
  fileName: string;
  finalFileName: string;
  fileSize: number;
  recordCount: number;
  failureReason: string;
  operator: string;
  createdAt: string;
  completedAt: string;
  durationMs: number;
  conflictAction: string;
  diskConsistent: boolean | null;
  keyLogs: string[];
}

export interface ExportAuditLogResponse {
  data: ExportAuditLogEntry[];
  total: number;
  meta: {
    totalTasks: number;
    shown: number;
    inconsistentCount: number;
    allConsistent: boolean;
  };
}
