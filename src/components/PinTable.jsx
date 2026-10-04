// ==========================================
// 表格视图：批量浏览/编辑引脚（名称/类型/属性/标签/分配）
// ==========================================
import React, { useMemo, useState } from 'react';
import { Search, X, Eraser, Ban } from 'lucide-react';
import { pinFunctions } from '../lib/core.js';

const INPUT_CLS =
  'w-full px-2 py-1 rounded-md border border-transparent hover:border-slate-300 dark:hover:border-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-transparent dark:text-slate-200 text-slate-700 text-xs font-mono transition-colors';

export default function PinTable({
  pinsData,
  pinMapping,
  customLabels,
  selectedPinId,
  onSelectPin,
  onUpdatePin,
  onUpdateLabel,
  onClearAssignment,
  isPower,
  getSignalName,
  conflictPinIds,
}) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pinsData;
    return pinsData.filter((p) => {
      const hay = [
        p.id, p.name, p.type, p.power, customLabels[p.id],
        pinMapping[p.id], pinFunctions(p).join(' '),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [pinsData, query, customLabels, pinMapping]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900">
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 shrink-0">
        <div className="relative w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索引脚 / 信号 / 标签..."
            className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X size={13} />
            </button>
          )}
        </div>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          共 {rows.length} 个引脚 · 可直接编辑名称/类型/标签，分配请在芯片图中完成
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700 w-14">#</th>
              <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700 w-36">管脚名</th>
              <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700 w-24">类型</th>
              <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700 w-28">电源/属性</th>
              <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700 w-48">分配信号</th>
              <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700 w-40">网络标签</th>
              <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700">支持复用信号</th>
              <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700 w-16 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const power = isPower(p);
              const assigned = pinMapping[p.id];
              const signalName = assigned ? (getSignalName(assigned) || assigned) : null;
              const isSelected = selectedPinId === p.id;
              const funcs = pinFunctions(p);
              const hasConflict = conflictPinIds?.has(p.id);
              return (
                <tr
                  key={p.id}
                  onClick={() => onSelectPin(p.id)}
                  className={`cursor-pointer border-b border-slate-100 dark:border-slate-800 transition-colors
                    ${isSelected
                      ? 'bg-blue-50 dark:bg-blue-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                >
                  <td className={`px-3 py-1.5 font-mono font-bold ${power ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'}`}>{p.id}</td>
                  <td className="px-2 py-1">
                    <input
                      value={p.name || ''}
                      onChange={(e) => onUpdatePin(p.id, { name: e.target.value })}
                      className={INPUT_CLS}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={p.type || ''}
                      onChange={(e) => onUpdatePin(p.id, { type: e.target.value })}
                      className={`${INPUT_CLS} ${power ? 'text-rose-500 font-bold' : ''}`}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={p.power || ''}
                      onChange={(e) => onUpdatePin(p.id, { power: e.target.value })}
                      className={INPUT_CLS}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {signalName ? (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono font-bold text-[11px] text-white ${hasConflict ? 'bg-rose-500' : 'bg-blue-500'}`} title={signalName}>
                        {signalName}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 px-2">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={customLabels[p.id] || ''}
                      onChange={(e) => onUpdateLabel(p.id, e.target.value)}
                      placeholder="自定义标签"
                      className={`${INPUT_CLS} !font-sans`}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1 max-w-[420px] overflow-hidden" style={{ maxHeight: '3.2rem' }}>
                      {funcs.length === 0 && <span className="text-slate-300 dark:text-slate-600">—</span>}
                      {funcs.map((f) => (
                        <span key={f} title={f} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 font-mono text-[10px] max-w-[130px] truncate">
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {assigned && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onClearAssignment(p.id); }}
                        title="清除该引脚的分配"
                        className="p-1 rounded-md text-slate-300 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                      >
                        <Eraser size={14} />
                      </button>
                    )}
                    {power && <Ban size={13} className="inline text-rose-300 dark:text-rose-500/60" title="电源引脚，不可分配" />}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-400 dark:text-slate-500">无匹配引脚</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
