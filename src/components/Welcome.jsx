// ==========================================
// 欢迎页：未加载数据时的全屏引导（示例芯片 / 导入 / 从零创建）
// ==========================================
import React from 'react';
import { Cpu, Upload, FilePlus2, Zap, BookOpen, MousePointerClick, Keyboard } from 'lucide-react';
import { SAMPLE_CHIPS } from '../lib/samples.js';

const PACKAGES = ['QFP', 'QFN', 'BGA', 'TQFP', 'LQFP', 'SOIC', 'DIP', 'Custom'];

export default function Welcome({ onLoadSample, onPickFile, draftPackage, setDraftPackage, draftPinCount, setDraftPinCount, onCreateChip, dragging }) {
  return (
    <div className={`flex-1 overflow-y-auto transition-colors ${dragging ? 'bg-blue-50 dark:bg-blue-950/40' : ''}`}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25 mb-5">
            <Zap size={30} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">欢迎使用 PinForge</h1>
          <p className="mt-3 text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
            通用 MCU 图形化引脚配置器 —— 导入引脚数据或从零创建芯片，点选引脚完成外设映射，一键生成 C 头文件与配置报告。
          </p>
        </div>

        {/* 三张卡片 */}
        <div className="grid md:grid-cols-3 gap-5">

          {/* 示例芯片 */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 flex flex-col shadow-sm">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
                <Cpu size={18} />
              </div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100">加载示例芯片</h2>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">内置两款真实芯片数据，立即体验完整流程</p>
            <div className="flex flex-col gap-2.5">
              {SAMPLE_CHIPS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onLoadSample(s)}
                  className="group text-left rounded-xl border border-slate-200 dark:border-slate-600 hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 p-3 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-violet-700 dark:group-hover:text-violet-300">{s.name}</div>
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 leading-snug">{s.desc}</div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-violet-100 dark:group-hover:bg-violet-500/20 group-hover:text-violet-600 dark:group-hover:text-violet-300 shrink-0">
                      {s.package}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 导入数据 */}
          <button
            onClick={onPickFile}
            className={`rounded-2xl border-2 border-dashed p-5 flex flex-col items-center justify-center text-center transition-all group
              ${dragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 scale-[1.02]'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 bg-white dark:bg-slate-800/60 hover:shadow-md'}`}
          >
            <div className="p-3 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400 mb-3 group-hover:scale-110 transition-transform">
              <Upload size={22} />
            </div>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">导入引脚数据</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
              点击选择，或将 <span className="font-bold text-slate-500 dark:text-slate-400">CSV / XLSX</span> 文件拖到本窗口
            </p>
            <p className="text-[11px] text-slate-300 dark:text-slate-600 mt-3">自动识别中文表头与 GBK 编码</p>
          </button>

          {/* 从零创建 */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 flex flex-col shadow-sm">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <FilePlus2 size={18} />
              </div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100">从零创建芯片</h2>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">选择封装与引脚数，逐脚填写复用功能</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">封装类型</label>
                <select
                  value={draftPackage}
                  onChange={(e) => setDraftPackage(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  {PACKAGES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">引脚数量</label>
                <input
                  type="number"
                  min={1}
                  max={1024}
                  value={draftPinCount}
                  onChange={(e) => setDraftPinCount(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            </div>
            <button
              onClick={onCreateChip}
              className="mt-3 w-full px-3 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold text-sm shadow-sm shadow-blue-500/25"
            >
              生成芯片图
            </button>
            <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              生成后在画布点选引脚即可编辑名称、类型与复用功能，最后导出 CSV 作为可复用的引脚数据表。
            </p>
          </div>
        </div>

        {/* 底部提示 */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1.5"><MousePointerClick size={14} /> 点选引脚 → 右侧属性面板编辑</span>
          <span className="flex items-center gap-1.5"><Keyboard size={14} /> 按 <kbd className="px-1 rounded border border-slate-300 dark:border-slate-600 font-mono">?</kbd> 查看快捷键</span>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = window.location.pathname.replace(/index\.html.*$/, '') + 'landing.html';
            }}
            className="flex items-center gap-1.5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <BookOpen size={14} /> 功能介绍与使用指南
          </a>
        </div>
      </div>
    </div>
  );
}
