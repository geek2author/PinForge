// ==========================================
// 设计审查（DRC）抽屉：冲突 / 调试口 / 差分对 / IO 利用率
// ==========================================
import React from 'react';
import { X, ShieldCheck, AlertOctagon, AlertTriangle, Info, Crosshair } from 'lucide-react';

const LEVEL_META = {
  error: { icon: AlertOctagon, label: '错误', cls: 'text-rose-500', chip: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' },
  warn: { icon: AlertTriangle, label: '警告', cls: 'text-amber-500', chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  info: { icon: Info, label: '提示', cls: 'text-blue-500', chip: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400' },
};

export default function DrcDrawer({ open, findings, onClose, onFocusSignal }) {
  if (!open) return null;

  const errors = findings.filter(f => f.level === 'error').length;
  const warns = findings.filter(f => f.level === 'warn').length;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />
      <div className="relative w-[380px] max-w-[92vw] h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col pinforge-slide-in">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <h2 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
            <ShieldCheck size={18} className="text-blue-600 dark:text-blue-400" />
            设计审查
            <span className="flex items-center gap-1.5 text-[10px] font-bold">
              {errors > 0 && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">{errors} 错误</span>}
              {warns > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">{warns} 警告</span>}
              {errors === 0 && warns === 0 && <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">通过</span>}
            </span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {findings.map((f, i) => {
            const meta = LEVEL_META[f.level];
            const Icon = meta.icon;
            const focusable = f.signalIds && f.signalIds.length > 0;
            return (
              <button
                key={`${f.code}-${i}`}
                onClick={() => { if (focusable && onFocusSignal) { onFocusSignal(f.signalIds[0]); onClose(); } }}
                className={`text-left rounded-xl border p-3 transition-all
                  ${f.level === 'error' ? 'border-rose-200 bg-rose-50/60 dark:border-rose-500/25 dark:bg-rose-500/5'
                    : f.level === 'warn' ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/5'
                    : 'border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40'}
                  ${focusable ? 'cursor-pointer hover:shadow-md hover:-translate-y-px' : 'cursor-default'}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon size={16} className={`${meta.cls} shrink-0 mt-0.5`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug">{f.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{f.detail}</div>
                    {focusable && (
                      <div className="mt-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        <Crosshair size={10} /> 点击定位信号
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
          审查基于导入的引脚复用表与当前分配实时计算，仅供设计参考。
        </div>
      </div>
    </div>
  );
}
