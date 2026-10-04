// ==========================================
// 外设快速添加：识别出的外设实例，点击一次整组分配
// ==========================================
import React, { useMemo, useState } from 'react';
import { Plug, ChevronDown, ChevronRight, Check, Plus, Sparkles } from 'lucide-react';
import { detectPeripheralPresets } from '../lib/presets.js';

export default function PresetPanel({ signals, assignedSignalSet, onApply }) {
  const [open, setOpen] = useState(true);

  const presets = useMemo(() => detectPeripheralPresets(signals), [signals]);
  if (presets.length === 0) return null;

  const done = presets.filter(p => p.signals.every(s => assignedSignalSet.has(s))).length;
  const partial = presets.filter(p => {
    const any = p.signals.some(s => assignedSignalSet.has(s));
    const all = p.signals.every(s => assignedSignalSet.has(s));
    return any && !all;
  }).length;

  return (
    <div className="border-b border-gray-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Plug size={12} /> 外设快速添加
          {(done > 0 || partial > 0) && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 normal-case">
              {done}/{presets.length}
            </span>
          )}
        </span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {open && (
        <div className="px-2 pb-2 flex flex-col gap-1 max-h-56 overflow-y-auto">
          {presets.map(p => {
            const total = p.signals.length;
            const got = p.signals.filter(s => assignedSignalSet.has(s)).length;
            const isDone = got === total;
            const isPartial = got > 0 && got < total;
            return (
              <button
                key={p.id}
                onClick={() => onApply(p)}
                disabled={isDone}
                title={`一键分配 ${p.signals.join('、')}`}
                className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all
                  ${isDone
                    ? 'opacity-60 cursor-default bg-emerald-50 dark:bg-emerald-500/10'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm'}`}
              >
                {isDone
                  ? <Check size={13} className="text-emerald-500 shrink-0" />
                  : <Plus size={13} className="text-slate-400 group-hover:text-blue-500 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[11px] font-bold truncate ${isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    {p.name}
                  </span>
                  <span className="block text-[9px] text-slate-400 dark:text-slate-500 truncate font-mono">
                    {p.roles.join(' · ')}
                  </span>
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0
                  ${isDone ? 'text-emerald-500' : isPartial ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' : 'text-slate-400'}`}>
                  {isDone ? '已接入' : isPartial ? `${got}/${total}` : `${total} 信号`}
                </span>
              </button>
            );
          })}
          <div className="flex items-center gap-1 px-1 pt-1 text-[9px] text-slate-400 dark:text-slate-500">
            <Sparkles size={9} /> 也可在状态栏一键自动分配全部信号
          </div>
        </div>
      )}
    </div>
  );
}
