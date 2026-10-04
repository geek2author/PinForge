// ==========================================
// 画布缩放工具条：- / 百分比 / + / 适应视图 / 1:1
// ==========================================
import React from 'react';
import { Minus, Plus, Maximize2, Square } from 'lucide-react';

export default function ZoomBar({ scale, onZoomIn, onZoomOut, onFit, onReset }) {
  const pct = Math.round(scale * 100);
  return (
    <div className="absolute bottom-4 left-4 z-40 flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden select-none">
      <button
        onClick={onZoomOut}
        title="缩小"
        className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <Minus size={15} />
      </button>
      <div className="px-2 text-xs font-bold font-mono text-slate-600 dark:text-slate-300 min-w-[48px] text-center tabular-nums">
        {pct}%
      </div>
      <button
        onClick={onZoomIn}
        title="放大"
        className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <Plus size={15} />
      </button>
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-600" />
      <button
        onClick={onFit}
        title="适应视图（F）"
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <Maximize2 size={13} /> 适应
      </button>
      <button
        onClick={onReset}
        title="重置为 100%"
        className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <Square size={13} />
      </button>
    </div>
  );
}
