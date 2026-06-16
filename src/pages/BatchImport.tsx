import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';

function ImportResultModal() {
  const { importResult, clearImportResult } = useAppStore();
  if (!importResult) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800">导入结果</h3>
          <button onClick={clearImportResult} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span>有效行数：<strong>{importResult.validRows}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>错误行数：<strong>{importResult.errorRows}</strong></span>
          </div>
          {importResult.errorDetail && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700 max-h-32 overflow-y-auto">
              {importResult.errorDetail}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>检出异常：<strong>{importResult.anomaliesCreated}</strong></span>
          </div>
        </div>
        <button
          onClick={clearImportResult}
          className="mt-5 w-full bg-slate-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          确定
        </button>
      </div>
    </div>
  );
}

export default function BatchImport() {
  const { batches, batchesLoading, importBatch, fetchBatches } = useAppStore();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setErrorMsg('');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setErrorMsg('');
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!file) return;
    setImporting(true);
    setErrorMsg('');
    try {
      await importBatch(file);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '导入失败';
      setErrorMsg(msg);
    } finally {
      setImporting(false);
    }
  }, [file, importBatch]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">批次导入</h2>
        <p className="text-sm text-slate-500 mt-1">上传抄表数据 CSV 文件，系统将自动检测异常记录</p>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-white'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="text-sm text-slate-600 mb-2">拖拽文件到此处，或点击选择文件</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="inline-block text-sm text-amber-600 font-medium cursor-pointer hover:text-amber-700"
        >
          选择 CSV 文件
        </label>
        {file && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-700">
            <span className="bg-slate-100 px-3 py-1 rounded">{file.name}</span>
            <button onClick={() => { setFile(null); setErrorMsg(''); }} className="text-slate-400 hover:text-red-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{errorMsg}</div>
      )}

      <div>
        <button
          onClick={handleImport}
          disabled={!file || importing}
          className="bg-amber-500 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {importing ? '导入中...' : '开始导入'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-700">批次历史</h3>
        </div>
        {batchesLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">加载中...</div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">暂无批次数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-left">
                  <th className="px-5 py-3 font-medium">批次号</th>
                  <th className="px-5 py-3 font-medium">文件名</th>
                  <th className="px-5 py-3 font-medium">有效/错误</th>
                  <th className="px-5 py-3 font-medium">异常数</th>
                  <th className="px-5 py-3 font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-5 py-3 font-mono text-xs">{b.batchNo}</td>
                    <td className="px-5 py-3">{b.fileName}</td>
                    <td className="px-5 py-3">
                      <span className="text-green-600">{b.validRows}</span>
                      <span className="text-slate-400">/</span>
                      <span className="text-red-500">{b.errorRows}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">
                        {b.anomalyCount ?? 0}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{new Date(b.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ImportResultModal />
    </div>
  );
}
