import { useCallback, useEffect, useState } from 'react';
import { Plus, Edit, X, ToggleLeft, ToggleRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import type { Rule } from '@/shared/types';

const typeLabels: Record<string, string> = {
  spike: '突增',
  negative: '负值',
  rollback: '回退',
  overlimit: '超限',
  null_value: '空值',
};

const typeColors: Record<string, string> = {
  spike: 'bg-red-100 text-red-700',
  negative: 'bg-purple-100 text-purple-700',
  rollback: 'bg-blue-100 text-blue-700',
  overlimit: 'bg-orange-100 text-orange-700',
  null_value: 'bg-gray-100 text-gray-700',
};

const paramFields: Record<string, Array<{ key: string; label: string }>> = {
  spike: [{ key: 'multiplier', label: '倍率阈值' }],
  negative: [],
  rollback: [],
  overlimit: [{ key: 'limit', label: '用量上限' }],
  null_value: [],
};

function RuleSidePanel({
  rule,
  onClose,
  onSave,
}: {
  rule: Rule | null;
  onClose: () => void;
  onSave: (data: Partial<Rule>) => Promise<void>;
}) {
  const [name, setName] = useState(rule?.name ?? '');
  const [type, setType] = useState<Rule['type']>(rule?.type ?? 'spike');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [params, setParams] = useState<Record<string, number | string>>(rule?.params ?? {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setType(rule.type);
      setDescription(rule.description);
      setParams(rule.params);
    } else {
      setName('');
      setType('spike');
      setDescription('');
      setParams({});
    }
  }, [rule]);

  const fields = paramFields[type] ?? [];

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({
        name,
        type,
        description,
        params,
        enabled: rule?.enabled ?? true,
      });
      onClose();
    } catch {
      // error handled by store
    } finally {
      setSaving(false);
    }
  }, [name, type, description, params, rule, onSave, onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-96 bg-white shadow-xl h-full overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">
            {rule ? '编辑规则' : '新增规则'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">规则名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">规则类型</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value as Rule['type']); setParams({}); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {Object.entries(typeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
              <input
                type="number"
                value={(params[f.key] as number) ?? ''}
                onChange={(e) => setParams({ ...params, [f.key]: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          ))}
          <button
            onClick={handleSubmit}
            disabled={saving || !name}
            className="w-full bg-amber-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  onEdit,
  onToggle,
}: {
  rule: Rule;
  onEdit: (r: Rule) => void;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-800">{rule.name}</h4>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeColors[rule.type] ?? 'bg-slate-100 text-slate-600'}`}>
            {typeLabels[rule.type] ?? rule.type}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">
            v{rule.version}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onToggle(rule.id)} title={rule.enabled ? '禁用' : '启用'}>
            {rule.enabled ? (
              <ToggleRight className="w-6 h-6 text-green-500" />
            ) : (
              <ToggleLeft className="w-6 h-6 text-slate-400" />
            )}
          </button>
          <button onClick={() => onEdit(rule)} className="text-slate-400 hover:text-amber-500">
            <Edit className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">{rule.description}</p>
      {Object.keys(rule.params).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {Object.entries(rule.params).map(([k, v]) => (
            <span key={k} className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-0.5">
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        参数历史
      </button>
      {expanded && (
        <div className="mt-2 text-xs text-slate-500">
          <p>当前版本 v{rule.version}，参数: {JSON.stringify(rule.params)}</p>
        </div>
      )}
    </div>
  );
}

export default function RuleConfig() {
  const { rules, rulesLoading, fetchRules, createRule, updateRule, toggleRule } = useAppStore();
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleNew = () => {
    setEditingRule(null);
    setShowPanel(true);
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setShowPanel(true);
  };

  const handleSave = useCallback(async (data: Partial<Rule>) => {
    if (editingRule) {
      await updateRule(editingRule.id, data);
    } else {
      await createRule(data);
    }
  }, [editingRule, createRule, updateRule]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">规则配置</h2>
          <p className="text-sm text-slate-500 mt-1">管理异常检测规则，调整参数并查看版本历史</p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 bg-amber-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-amber-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增规则
        </button>
      </div>

      {rulesLoading ? (
        <div className="text-center py-12 text-sm text-slate-400">加载中...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">暂无规则，点击上方按钮新增</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} onEdit={handleEdit} onToggle={toggleRule} />
          ))}
        </div>
      )}

      {showPanel && (
        <RuleSidePanel
          rule={editingRule}
          onClose={() => setShowPanel(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
