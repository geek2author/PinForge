// ==========================================
// 快捷键帮助弹窗（? 呼出）
// ==========================================
import React from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Space', '拖拽'], desc: '平移画布（空格按住）' },
  { keys: ['Alt', '滚轮'], desc: '以鼠标为中心缩放（触摸板双指捏合亦可）' },
  { keys: ['Ctrl', 'Z'], desc: '撤销' },
  { keys: ['Ctrl', 'Y'], desc: '重做（或 Ctrl+Shift+Z）' },
  { keys: ['Ctrl', 'S'], desc: '导出配置 JSON' },
  { keys: ['F'], desc: '画布适应视图' },
  { keys: ['Delete'], desc: '清除选中引脚的分配与标签' },
  { keys: ['?'], desc: '打开本帮助' },
  { keys: ['Esc'], desc: '关闭面板/弹窗，取消选择' },
];

const Key = ({ children }) => (
  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 shadow-sm">
    {children}
  </kbd>
);

export default function ShortcutsModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[110] p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden pinforge-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
            <Keyboard size={18} className="text-blue-600 dark:text-blue-400" /> 键盘与鼠标快捷键
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-3">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600 dark:text-slate-300">{s.desc}</span>
              <span className="flex items-center gap-1 shrink-0">
                {s.keys.map((k, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <span className="text-[10px] text-slate-400">+</span>}
                    <Key>{k}</Key>
                  </React.Fragment>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
