// ==========================================
// 全局 Toast 通知：模块级发布订阅，任意位置 toast.push() 即可
// ==========================================
import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

let nextId = 1;
const listeners = new Set();

export const toast = {
  push(msg, type = 'info', duration = 2800) {
    const t = { id: nextId++, msg, type, duration };
    listeners.forEach((l) => l('push', t));
    return t.id;
  },
  success(msg, duration) { return this.push(msg, 'success', duration); },
  error(msg, duration) { return this.push(msg, 'error', duration || 4200); },
  info(msg, duration) { return this.push(msg, 'info', duration); },
  dismiss(id) { listeners.forEach((l) => l('dismiss', { id })); },
};

const STYLES = {
  success: { icon: CheckCircle2, cls: 'bg-emerald-600 text-white', bar: 'bg-emerald-400' },
  error: { icon: AlertCircle, cls: 'bg-rose-600 text-white', bar: 'bg-rose-400' },
  info: { icon: Info, cls: 'bg-slate-800 text-white dark:bg-slate-700', bar: 'bg-blue-400' },
};

export function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onMsg = (kind, payload) => {
      if (kind === 'push') {
        const t = payload;
        setItems((prev) => [...prev.slice(-4), t]);
        window.setTimeout(() => {
          setItems((prev) => prev.filter((x) => x.id !== t.id));
        }, t.duration);
      } else if (kind === 'dismiss') {
        setItems((prev) => prev.filter((x) => x.id !== payload.id));
      }
    };
    listeners.add(onMsg);
    return () => listeners.delete(onMsg);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[120] flex flex-col items-center gap-2 pointer-events-none">
      {items.map((t) => {
        const s = STYLES[t.type] || STYLES.info;
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-xl shadow-2xl border border-white/10 ${s.cls} pinforge-toast-in max-w-[90vw]`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="text-sm font-medium whitespace-pre-wrap">{t.msg}</span>
            <button
              onClick={() => toast.dismiss(t.id)}
              className="ml-1 p-1 rounded-md hover:bg-white/15 transition-colors"
              aria-label="关闭"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
