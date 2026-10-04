// ==========================================
// 全局确认对话框：await confirmDialog({...}) => boolean
// ==========================================
import React, { useEffect, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

let resolver = null;
let openListener = null;

export function confirmDialog({ title = '确认操作', message = '', confirmText = '确定', cancelText = '取消', danger = false } = {}) {
  return new Promise((resolve) => {
    if (openListener) openListener({ title, message, confirmText, cancelText, danger });
    resolver = resolve;
  });
}

export function ConfirmHost() {
  const [opts, setOpts] = useState(null);

  useEffect(() => {
    openListener = (o) => setOpts(o);
    return () => { openListener = null; };
  }, []);

  if (!opts) return null;

  const close = (val) => {
    setOpts(null);
    if (resolver) { resolver(val); resolver = null; }
  };

  const Icon = opts.danger ? AlertTriangle : HelpCircle;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[110] p-4" onClick={() => close(false)}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-200 dark:border-slate-700 pinforge-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${opts.danger ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'}`}>
            <Icon size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{opts.title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 whitespace-pre-wrap leading-relaxed">{opts.message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={() => close(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {opts.cancelText}
          </button>
          <button
            onClick={() => close(true)}
            autoFocus
            className={`px-4 py-2 text-sm font-bold rounded-lg text-white transition-colors shadow-sm ${opts.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {opts.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
