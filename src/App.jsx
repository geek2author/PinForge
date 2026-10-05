// ==========================================
// PinForge — 通用 MCU 图形化引脚配置器
// ==========================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, RefreshCw, Cpu, CheckCircle, Info, Ban, Edit3, MousePointer, Eye, Upload,
  AlertCircle, X, Tag, FileJson, Settings, ArrowLeftRight, Search, AlertTriangle,
  Undo2, Redo2, Sun, Moon, Keyboard, BookOpen, ChevronDown, ChevronRight,
  LayoutPanelTop, Table2, Eraser, RotateCcw, FileText, FileSpreadsheet, FileCode2,
  BookMarked, Zap, ChevronsLeftRight, Wand2, ShieldCheck, Droplets, Link2, FileCode,
} from 'lucide-react';

import { isPowerPin, buildPinGroups, COLOR_PALETTES } from './lib/core.js';
import { decodeFileText, parseSpreadsheet, parseTextRows, buildPinsFromRows } from './lib/importer.js';
import { generateCHeader, generateMarkdownReport, generateIdfGpioInit, generateStm32HalInit } from './lib/codegen.js';
import { saveSession, loadSession, clearSession, loadTheme, saveTheme } from './lib/storage.js';
import { SAMPLE_CHIPS } from './lib/samples.js';
import { runDRC } from './lib/drc.js';
import { buildShareUrl, decodeShareConfig } from './lib/share.js';
import { toast, Toaster } from './lib/notify.jsx';
import { confirmDialog, ConfirmHost } from './lib/confirm.jsx';
import Welcome from './components/Welcome.jsx';
import PinTable from './components/PinTable.jsx';
import ZoomBar from './components/ZoomBar.jsx';
import ShortcutsModal from './components/ShortcutsModal.jsx';
import PresetPanel from './components/PresetPanel.jsx';
import DrcDrawer from './components/DrcDrawer.jsx';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const PACKAGES = ['QFP', 'QFN', 'BGA', 'TQFP', 'LQFP', 'SOIC', 'DIP', 'Custom'];

function downloadFile(filename, content, mime = 'application/octet-stream') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  // ---------- 芯片与映射状态 ----------
  const [chipInfo, setChipInfo] = useState({
    name: 'Custom MCU',
    manufacturer: 'Generic',
    package: 'QFP',
    pinCount: 0
  });

  const [pinMapping, setPinMapping] = useState({}); // { pinId: signalId }
  const [customLabels, setCustomLabels] = useState({}); // { pinId: string (Custom Label) }

  const [selectedSignalId, setSelectedSignalId] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedPinId, setSelectedPinId] = useState(null); // 当前选中的引脚 (用于属性面板)
  const [hoveredPin, setHoveredPin] = useState(null);
  const [inspectorSide, setInspectorSide] = useState('right');
  const [signalSearch, setSignalSearch] = useState('');
  const [signalFilter, setSignalFilter] = useState('all');
  const [draftPinCount, setDraftPinCount] = useState(64);
  const [draftPackage, setDraftPackage] = useState('QFP');

  const [isConfigMode, setIsConfigMode] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showChipSettings, setShowChipSettings] = useState(false);

  const fileInputRef = useRef(null); // 用于导入 CSV/XLSX
  const configInputRef = useRef(null); // 用于导入 JSON 配置

  const [pinsData, setPinsData] = useState([]);
  const [signalGroups, setSignalGroups] = useState([]);
  const [validMuxMap, setValidMuxMap] = useState({});

  // ---------- 新增：视图 / 主题 / 折叠 / 弹窗 ----------
  const [theme, setTheme] = useState(() => loadTheme() || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [view, setView] = useState('diagram'); // diagram | table
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [fitTick, setFitTick] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [dragging, setDragging] = useState(false);
  const exportMenuRef = useRef(null);
  const [showDrc, setShowDrc] = useState(false);
  const [powerView, setPowerView] = useState(false);
  const [powerFocusRail, setPowerFocusRail] = useState(null);

  // ---------- 撤销 / 重做 ----------
  const historyRef = useRef({ past: [], future: [] });
  const lastTagRef = useRef({ tag: null, at: 0 });
  const [histInfo, setHistInfo] = useState({ canUndo: false, canRedo: false });

  const snapshot = () => ({ pinsData, pinMapping, customLabels });

  const applySnapshot = (s) => {
    setPinsData(s.pinsData);
    setPinMapping(s.pinMapping);
    setCustomLabels(s.customLabels);
  };

  const pushHistory = (tag = 'edit') => {
    const now = Date.now();
    const h = historyRef.current;
    // 同类快速编辑（如连续打字）合并为一条历史
    if (lastTagRef.current.tag === tag && now - lastTagRef.current.at < 600) {
      lastTagRef.current.at = now;
      return;
    }
    lastTagRef.current = { tag, at: now };
    if (h.past.length >= 100) h.past.shift();
    h.past.push(snapshot());
    h.future = [];
    setHistInfo({ canUndo: true, canRedo: false });
  };

  const undo = () => {
    const h = historyRef.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(snapshot());
    applySnapshot(prev);
    lastTagRef.current = { tag: null, at: 0 };
    setHistInfo({ canUndo: h.past.length > 0, canRedo: true });
    toast.info('已撤销');
  };

  const redo = () => {
    const h = historyRef.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(snapshot());
    applySnapshot(next);
    lastTagRef.current = { tag: null, at: 0 };
    setHistInfo({ canUndo: true, canRedo: h.future.length > 0 });
    toast.info('已重做');
  };

  // ------------------------------------------
  // 数据处理：将引脚数据转化为动态分组
  // ------------------------------------------
  const processPinDataToGroups = (data) => {
    const { groups, muxMap } = buildPinGroups(data);
    setValidMuxMap(muxMap);
    setSignalGroups(groups);
    setIsDataLoaded(true);
    setChipInfo(prev => ({ ...prev, pinCount: data.length }));
  };

  // ------------------------------------------
  // 会话自动保存 / 恢复
  // ------------------------------------------
  const didRestoreRef = useRef(false);
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;

    const restore = async () => {
      // 优先：分享链接（#d=...）
      if (window.location.hash.startsWith('#d=')) {
        const cfg = await decodeShareConfig(window.location.hash.slice(3));
        if (cfg && Array.isArray(cfg.pinsData) && cfg.pinsData.length > 0) {
          setChipInfo(prev => ({ ...prev, ...(cfg.chip || {}) }));
          setPinMapping(cfg.mapping || {});
          setCustomLabels(cfg.customLabels || {});
          setPinsData(cfg.pinsData);
          processPinDataToGroups(cfg.pinsData);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          toast.success('已从分享链接恢复完整配置');
          return;
        }
        toast.error('分享链接无效或已损坏');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      // 其次：本地会话
      const saved = loadSession();
      if (!saved) return;
      setChipInfo(prev => ({ ...prev, ...(saved.chipInfo || {}) }));
      setPinMapping(saved.mapping || {});
      setCustomLabels(saved.customLabels || {});
      setPinsData(saved.pinsData);
      processPinDataToGroups(saved.pinsData);
      toast.success(`已自动恢复上次会话（${saved.pinsData.length} 个引脚）`);
    };

    restore();
  }, []);

  useEffect(() => {
    if (!isDataLoaded) return;
    const t = window.setTimeout(() => {
      saveSession({ chipInfo, pinsData, mapping: pinMapping, customLabels });
    }, 600);
    return () => window.clearTimeout(t);
  }, [isDataLoaded, chipInfo, pinsData, pinMapping, customLabels]);

  // ---------- 主题 ----------
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveTheme(theme);
  }, [theme]);

  // 开发调试探针
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__pinforge = { pinMapping, isConfigMode, selectedSignalId, selectedGroupId, selectedPinId, pinsDataLen: pinsData.length, muxLen: Object.keys(validMuxMap).length, chipTransform, viewportSize };
    }
  });

  // ------------------------------------------
  // 文件导入处理 (CSV / XLSX 数据)
  // ------------------------------------------
  const ingestPinsRows = (rows, sourceName) => {
    const newPinsData = buildPinsFromRows(rows);
    if (newPinsData.length === 0) {
      toast.error('未能识别到有效的引脚行（第一列需要是数字序号）。');
      return;
    }
    pushHistory('import');
    setPinsData(newPinsData);
    processPinDataToGroups(newPinsData);
    setSelectedGroupId(null);
    setSelectedSignalId(null);
    setSelectedPinId(null);
    didUserTransformRef.current = false;
    setChipTransform({ x: 0, y: 0, scale: 1 });
    // 从默认名导入时，用文件名作为芯片名
    setChipInfo(prev => {
      if (prev.name && prev.name !== 'Custom MCU') return prev;
      const base = (sourceName || '').replace(/\.[^.]+$/, '').replace(/[_-]*pins?$/i, '').trim();
      return base ? { ...prev, name: base } : prev;
    });
    toast.success(`已导入 ${newPinsData.length} 个引脚${sourceName ? `（${sourceName}）` : ''}`);
  };

  const handleFiles = async (file) => {
    if (!file) return;
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer();
        const rows = await parseSpreadsheet(buf);
        ingestPinsRows(rows, file.name);
      } else {
        const text = await decodeFileText(file);
        ingestPinsRows(parseTextRows(text), file.name);
      }
    } catch (err) {
      console.error(err);
      toast.error('导入失败：文件解析出错。请确认文件格式为 CSV 或 XLSX。');
    }
  };

  const handleFileUpload = (e) => {
    handleFiles(e.target.files[0]);
    e.target.value = null;
  };

  const loadSample = async (sample) => {
    try {
      const res = await fetch(sample.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rows = parseTextRows(text);
      const pins = buildPinsFromRows(rows);
      if (pins.length === 0) throw new Error('empty');
      pushHistory('sample');
      setPinsData(pins);
      setSelectedGroupId(null);
      setSelectedSignalId(null);
      setSelectedPinId(null);
      didUserTransformRef.current = false;
      setChipTransform({ x: 0, y: 0, scale: 1 });
      setChipInfo({ name: sample.name, manufacturer: sample.manufacturer, package: sample.package, pinCount: pins.length });
      processPinDataToGroups(pins);
      toast.success(`已加载示例芯片 ${sample.name}（${pins.length} 引脚）`);
    } catch (err) {
      console.error(err);
      toast.error(`加载示例失败：${sample.name}`);
    }
  };

  // ------------------------------------------
  // 配置文件导入处理 (JSON 恢复)
  // ------------------------------------------
  const handleConfigImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.mapping !== undefined) {
          pushHistory('import-config');
          setPinMapping(data.mapping);
          setCustomLabels(data.customLabels || {});
          if (data.pinsData && Array.isArray(data.pinsData) && data.pinsData.length > 0) {
            setPinsData(data.pinsData);
            processPinDataToGroups(data.pinsData);
            setSelectedGroupId(null);
            setSelectedSignalId(null);
            setSelectedPinId(null);
            didUserTransformRef.current = false;
            setChipTransform({ x: 0, y: 0, scale: 1 });
          }
          if (data.chip) {
            setChipInfo(prev => ({ ...prev, ...data.chip }));
          }
          toast.success('配置已成功导入恢复！');
        } else {
          toast.error('导入失败：无法识别该配置文件的结构 (缺少 mapping 数据)。');
        }
      } catch (err) {
        toast.error('导入失败：文件格式不正确，必须为本工具导出的 JSON 格式。');
      }
    };
    reader.readAsText(file);
    e.target.value = null; // 重置 input，允许重复上传同名文件
  };

  // ------------------------------------------
  // 核心交互逻辑
  // ------------------------------------------
  const allSignalsFlat = useMemo(() => signalGroups.flatMap(g => g.signals.map(s => ({ ...s, groupColor: g.bg, groupTextColor: g.text }))), [signalGroups]);
  const getSignalById = (id) => allSignalsFlat.find(s => s.id === id);
  const getGroupForSignal = (sigId) => signalGroups.find(g => g.signals.some(s => s.id === sigId));
  const categoryOf = (sigId) => getGroupForSignal(sigId)?.title || 'Other Peripherals';

  const pinById = useMemo(() => {
    const m = new Map();
    pinsData.forEach(p => m.set(p.id, p));
    return m;
  }, [pinsData]);

  const signalToPins = useMemo(() => {
    const m = new Map();
    Object.entries(pinMapping).forEach(([pinIdStr, sigId]) => {
      if (!sigId) return;
      const pinId = parseInt(pinIdStr, 10);
      if (Number.isNaN(pinId)) return;
      const arr = m.get(sigId) || [];
      arr.push(pinId);
      m.set(sigId, arr);
    });
    return m;
  }, [pinMapping]);

  const assignedSignalSet = useMemo(() => new Set(Array.from(signalToPins.keys())), [signalToPins]);

  const conflictSignalSet = useMemo(() => {
    const s = new Set();
    if (!isDataLoaded) return s;
    for (const [sigId, pins] of signalToPins.entries()) {
      if (pins.length > 1) s.add(sigId);
      for (const pinId of pins) {
        const pin = pinById.get(pinId);
        if (!pin || isPowerPin(pin)) {
          s.add(sigId);
          continue;
        }
        const candidates = validMuxMap[sigId];
        if (!Array.isArray(candidates)) {
          s.add(sigId);
          continue;
        }
        if (candidates.length > 0 && !candidates.includes(pinId)) s.add(sigId);
      }
    }
    return s;
  }, [isDataLoaded, signalToPins, pinById, validMuxMap]);

  const conflictPinIds = useMemo(() => {
    const s = new Set();
    if (!isDataLoaded) return s;
    for (const [pinIdStr, sigId] of Object.entries(pinMapping)) {
      const pinId = parseInt(pinIdStr, 10);
      if (Number.isNaN(pinId) || !sigId) continue;
      const pin = pinById.get(pinId);
      if (!pin || isPowerPin(pin)) { s.add(pinId); continue; }
      const candidates = validMuxMap[sigId];
      if (!Array.isArray(candidates) || (candidates.length > 0 && !candidates.includes(pinId))) s.add(pinId);
    }
    return s;
  }, [isDataLoaded, pinMapping, pinById, validMuxMap]);

  const signalCounts = useMemo(() => {
    const total = allSignalsFlat.length;
    const assigned = assignedSignalSet.size;
    const conflict = conflictSignalSet.size;
    const unassigned = Math.max(0, total - assigned);
    return { total, assigned, unassigned, conflict };
  }, [allSignalsFlat.length, assignedSignalSet, conflictSignalSet]);

  // ---------- 设计审查（DRC） ----------
  const drcFindings = useMemo(() => {
    if (!isDataLoaded) return [];
    return runDRC({
      pinsData,
      pinMapping,
      signals: allSignalsFlat.map(s => s.id),
      conflictSignalIds: conflictSignalSet,
      isPower: isPowerPin,
    });
  }, [isDataLoaded, pinsData, pinMapping, allSignalsFlat, conflictSignalSet]);
  const drcErrorCount = drcFindings.filter(f => f.level === 'error').length;
  const drcWarnCount = drcFindings.filter(f => f.level === 'warn').length;

  // ---------- 电源域 ----------
  const railInfo = useMemo(() => {
    if (!isDataLoaded) return { railMap: new Map(), railList: [], railColorMap: {} };
    const railMap = new Map(); // pinId -> rail name
    const counts = new Map(); // rail -> { total, assigned }
    for (const p of pinsData) {
      if (isPowerPin(p)) continue;
      const rail = String(p.power || '').split('/')[0].trim();
      if (!rail || rail === '--' || rail === '-') continue;
      railMap.set(p.id, rail);
      const c = counts.get(rail) || { total: 0, assigned: 0 };
      c.total += 1;
      if (pinMapping[p.id]) c.assigned += 1;
      counts.set(rail, c);
    }
    const railList = [...counts.keys()].sort().map((name, i) => ({
      name,
      ...counts.get(name),
      bg: COLOR_PALETTES[i % COLOR_PALETTES.length].bg,
      dot: COLOR_PALETTES[i % COLOR_PALETTES.length].dot,
    }));
    const railColorMap = {};
    railList.forEach(r => { railColorMap[r.name] = r.bg; });
    return { railMap, railList, railColorMap };
  }, [isDataLoaded, pinsData, pinMapping]);

  const filteredSignalGroups = useMemo(() => {
    const q = signalSearch.trim().toLowerCase();
    const filter = signalFilter;
    return signalGroups
      .map((group) => {
        const totalCount = group.signals.length;
        const signals = group.signals.filter((signal) => {
          const hay = `${signal.name || ''} ${signal.id || ''}`.toLowerCase();
          if (q && !hay.includes(q)) return false;
          const isAssigned = assignedSignalSet.has(signal.id);
          const isConflict = conflictSignalSet.has(signal.id);
          if (filter === 'assigned') return isAssigned;
          if (filter === 'unassigned') return !isAssigned;
          if (filter === 'conflict') return isConflict;
          return true;
        });
        return { ...group, signals, totalCount };
      })
      .filter((g) => g.signals.length > 0 || g.id === selectedGroupId);
  }, [signalGroups, signalSearch, signalFilter, assignedSignalSet, conflictSignalSet, selectedGroupId]);

  // 组预览的高亮引脚
  const groupHighlightBalls = useMemo(() => {
    if (!selectedGroupId) return [];
    const group = signalGroups.find(g => g.id === selectedGroupId);
    if (!group) return [];
    const pins = [];
    group.signals.forEach(sig => {
      const isAssigned = Object.values(pinMapping).includes(sig.id);
      if (!isAssigned) {
        const validPins = validMuxMap[sig.id] || [];
        validPins.forEach(pinId => pins.push({ pinId, signalId: sig.id }));
      }
    });
    return pins;
  }, [selectedGroupId, pinMapping, signalGroups, validMuxMap]);

  // 单信号预览的高亮引脚
  const validBallsForSelectedSignal = useMemo(() => {
    if (!selectedSignalId || !isConfigMode) return [];
    return validMuxMap[selectedSignalId] || [];
  }, [selectedSignalId, isConfigMode, validMuxMap]);

  const handleGroupClick = (groupId) => {
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
    } else {
      setSelectedGroupId(groupId);
      setSelectedSignalId(null);
      setIsConfigMode(true);
    }
  };

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const collapseAllGroups = () => setCollapsedGroups(new Set(signalGroups.map(g => g.id)));
  const expandAllGroups = () => setCollapsedGroups(new Set());

  const handleSignalClick = (signalId) => {
    setIsConfigMode(true);
    setSelectedSignalId(signalId === selectedSignalId ? null : signalId);
    const group = getGroupForSignal(signalId);
    if (group) setSelectedGroupId(group.id);
  };

  const handlePinClick = (pinId) => {
    if (Date.now() - lastPanAtRef.current < 200) return;
    setSelectedPinId(pinId); // 始终触发属性面板检查器

    if (!isConfigMode) return;
    const pinData = pinsData.find(p => p.id === pinId);
    if (!pinData) return;
    if (isPowerPin(pinData)) {
      toast.info('这是电源/接地引脚，不可分配复用功能。');
      return;
    }

    // 模式1：组选择模式下自动分配
    if (selectedGroupId && !selectedSignalId) {
      const currentAssignedSignalId = pinMapping[pinId];
      if (currentAssignedSignalId) {
        const group = getGroupForSignal(currentAssignedSignalId);
        if (group && group.id === selectedGroupId) {
           pushHistory('assign');
           const newMapping = { ...pinMapping };
           delete newMapping[pinId];
           setPinMapping(newMapping);
           return;
        }
      }
      const highlightInfo = groupHighlightBalls.find(h => h.pinId === pinId);
      if (highlightInfo) {
        const sigId = highlightInfo.signalId;
        pushHistory('assign');
        const newMapping = { ...pinMapping };
        const prevPin = Object.keys(newMapping).find(key => newMapping[key] === sigId);
        if (prevPin) delete newMapping[prevPin];
        newMapping[pinId] = sigId;
        setPinMapping(newMapping);
        return;
      }
    }

    // 模式2：单信号精确分配
    if (selectedSignalId) {
      const validPins = validMuxMap[selectedSignalId] || [];
      if (!validPins.includes(pinId)) {
        toast.error(`芯片架构限制: 信号 ${selectedSignalId} 无法映射到引脚 Pin ${pinId} (${pinData.name})。`);
        return;
      }
      pushHistory('assign');
      const newMapping = { ...pinMapping };
      if (newMapping[pinId] === selectedSignalId) {
        delete newMapping[pinId];
      } else {
        const prevPin = Object.keys(newMapping).find(key => newMapping[key] === selectedSignalId);
        if (prevPin) delete newMapping[prevPin];
        newMapping[pinId] = selectedSignalId;
      }
      setPinMapping(newMapping);
    }
  };

  const clearPinAssignment = (pinId, { silent } = {}) => {
    if (!pinMapping[pinId] && !customLabels[pinId]) return;
    pushHistory('assign');
    const newMapping = { ...pinMapping };
    delete newMapping[pinId];
    setPinMapping(newMapping);
    if (!silent) toast.info(`已清除 Pin ${pinId} 的分配`);
  };

  const setPinLabel = (pinId, value) => {
    pushHistory(`label:${pinId}`);
    setCustomLabels(prev => {
      const next = { ...prev };
      if (value) next[pinId] = value; else delete next[pinId];
      return next;
    });
  };

  // ------------------------------------------
  // 导出：JSON / CSV / XLSX / C 头文件 / Markdown
  // ------------------------------------------
  const handleExport = () => {
    const exportData = {
      app: 'PinForge',
      version: 1,
      savedAt: new Date().toISOString(),
      chip: chipInfo,
      pinsData,
      mapping: pinMapping,
      customLabels: customLabels,
      details: Object.keys(pinMapping).map(pinId => ({
        pinId: parseInt(pinId),
        pinName: pinsData.find(p => p.id === parseInt(pinId))?.name || 'Unknown',
        signal: pinMapping[pinId],
        customLabel: customLabels[pinId] || null
      }))
    };
    downloadFile(
      `${chipInfo.name.toLowerCase().replace(/\s+/g, '_')}_pin_config.json`,
      JSON.stringify(exportData, null, 2),
      'application/json'
    );
    toast.success('配置 JSON 已导出');
  };

  const pinsTableRows = () => [
    ['id', 'name', 'type', 'power', 'f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'lp_f0', 'lp_f1', 'ana_f0', 'ana_f1'],
    ...[...pinsData].sort((a, b) => a.id - b.id).map((p) => ([
      p.id, p.name || '', p.type || '', p.power || '',
      p.f0 || '', p.f1 || '', p.f2 || '', p.f3 || '',
      p.f4 || '', p.f5 || '', p.f6 || '', p.f7 || '',
      p.lp_f0 || '', p.lp_f1 || '', p.ana_f0 || '', p.ana_f1 || '',
    ]))
  ];

  const baseName = () => chipInfo.name.toLowerCase().replace(/\s+/g, '_') || 'chip';

  const handleExportCsv = () => {
    const rows = pinsTableRows();
    const toCell = (v) => `"${String(v ?? '').replace(/"/g, '')}"`;
    const csv = '\ufeff' + rows.map((r) => r.map(toCell).join(',')).join('\n');
    downloadFile(`${baseName()}_pins.csv`, csv, 'text/csv;charset=utf-8');
    toast.success('引脚表 CSV 已导出');
  };

  const handleExportXlsx = async () => {
    try {
      const mod = await import('xlsx');
      const XLSX = mod.default ?? mod;
      const ws = XLSX.utils.aoa_to_sheet(pinsTableRows());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pins');
      XLSX.writeFile(wb, `${baseName()}_pins.xlsx`);
      toast.success('引脚表 XLSX 已导出');
    } catch (err) {
      console.error(err);
      toast.error('导出 XLSX 失败');
    }
  };

  const handleExportCHeader = () => {
    const content = generateCHeader({
      chipInfo, pinsData, mapping: pinMapping, customLabels, categoryOf,
    });
    if (!content) {
      toast.error('当前没有任何引脚分配，请先完成映射后再生成代码。');
      return;
    }
    downloadFile(`${baseName()}_pin_config.h`, content, 'text/x-c;charset=utf-8');
    toast.success('C 头文件已生成');
  };

  const handleExportMarkdown = () => {
    const content = generateMarkdownReport({
      chipInfo, pinsData, mapping: pinMapping, customLabels, categoryOf,
    });
    if (!content) {
      toast.error('当前没有任何引脚分配，无法生成报告。');
      return;
    }
    downloadFile(`${baseName()}_pin_report.md`, content, 'text/markdown;charset=utf-8');
    toast.success('Markdown 报告已生成');
  };

  const handleClearAll = async () => {
    const ok = await confirmDialog({
      title: '清空所有分配？',
      message: '将清除全部引脚的信号分配与自定义标签（引脚数据保留，可通过撤销恢复）。',
      confirmText: '清空',
      danger: true,
    });
    if (!ok) return;
    pushHistory('clear');
    setPinMapping({});
    setCustomLabels({});
    setSelectedPinId(null);
    toast.success('已清空全部分配');
  };

  const handleResetProject = async () => {
    const ok = await confirmDialog({
      title: '重置整个项目？',
      message: '将清除芯片数据、引脚分配、自定义标签与本地自动保存的会话，恢复到初始欢迎页。此操作不可撤销。',
      confirmText: '重置项目',
      danger: true,
    });
    if (!ok) return;
    clearSession();
    historyRef.current = { past: [], future: [] };
    setHistInfo({ canUndo: false, canRedo: false });
    setPinMapping({});
    setCustomLabels({});
    setPinsData([]);
    setSignalGroups([]);
    setValidMuxMap({});
    setChipInfo({ name: 'Custom MCU', manufacturer: 'Generic', package: 'QFP', pinCount: 0 });
    setIsDataLoaded(false);
    setIsConfigMode(false);
    setSelectedGroupId(null);
    setSelectedSignalId(null);
    setSelectedPinId(null);
    setView('diagram');
    toast.info('项目已重置');
  };

  const handleCreateChipFromScratch = () => {
    const n = Math.max(1, Math.min(1024, parseInt(draftPinCount, 10) || 0));
    if (!n) {
      toast.error('请输入有效的引脚数量（1-1024）');
      return;
    }
    const nextPins = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: `Pin ${i + 1}`,
      type: 'IO',
      power: '--',
      f0: null, f1: null, f2: null, f3: null, f4: null, f5: null, f6: null, f7: null,
      lp_f0: null, lp_f1: null, ana_f0: null, ana_f1: null,
    }));

    pushHistory('create');
    setChipInfo((prev) => ({ ...prev, package: draftPackage, pinCount: n }));
    setPinsData(nextPins);
    processPinDataToGroups(nextPins);
    setIsConfigMode(true);
    setSelectedGroupId(null);
    setSelectedSignalId(null);
    setSelectedPinId(null);
    didUserTransformRef.current = false;
    setChipTransform({ x: 0, y: 0, scale: 1 });
    toast.success(`已创建 ${draftPackage} 封装 / ${n} 引脚的芯片`);
  };

  const updatePin = (pinId, patch) => {
    pushHistory(`pin:${pinId}:${Object.keys(patch).join(',')}`);
    setPinsData(prev => prev.map(p => (p.id === pinId ? { ...p, ...patch } : p)));
  };

  // ------------------------------------------
  // 一键自动排布：约束最强的信号优先，贪心占用空闲合法引脚
  // ------------------------------------------
  const handleAutoAssign = () => {
    const freePins = new Set(pinsData.filter(p => !isPowerPin(p) && !pinMapping[p.id]).map(p => p.id));
    const unassigned = allSignalsFlat.filter(s => !assignedSignalSet.has(s.id));
    if (unassigned.length === 0) {
      toast.info('所有信号都已分配。');
      return;
    }
    const order = unassigned
      .map(s => ({ sig: s.id, cands: (validMuxMap[s.id] || []).filter(id => freePins.has(id)) }))
      .sort((a, b) => a.cands.length - b.cands.length);

    const next = { ...pinMapping };
    let ok = 0;
    let fail = 0;
    for (const { sig, cands } of order) {
      if (cands.length === 0) { fail++; continue; }
      next[cands[0]] = sig;
      freePins.delete(cands[0]);
      ok++;
    }
    if (ok === 0) {
      toast.error('没有找到任何可自动分配的信号（合法引脚均被占用或不存在）。');
      return;
    }
    pushHistory('auto');
    setPinMapping(next);
    setIsConfigMode(true);
    setSelectedSignalId(null);
    setSelectedGroupId(null);
    toast.success(`自动排布完成：${ok} 个信号已接入${fail > 0 ? `，${fail} 个无可用引脚已跳过` : ''}（Ctrl+Z 可撤销）`);
  };

  // 外设整组添加
  const handleApplyPreset = (preset) => {
    const freePins = new Set(pinsData.filter(p => !isPowerPin(p) && !pinMapping[p.id]).map(p => p.id));
    const order = preset.signals
      .map(sig => ({ sig, cands: (validMuxMap[sig] || []).filter(id => freePins.has(id)) }))
      .sort((a, b) => a.cands.length - b.cands.length);

    const next = { ...pinMapping };
    const done = [];
    const skipped = [];
    for (const { sig, cands } of order) {
      if (cands.length === 0) { skipped.push(sig); continue; }
      next[cands[0]] = sig;
      freePins.delete(cands[0]);
      done.push(sig);
    }
    if (done.length === 0) {
      toast.error(`${preset.name} 的信号都没有可用引脚。`);
      return;
    }
    pushHistory('preset');
    setPinMapping(next);
    setIsConfigMode(true);
    setSelectedSignalId(null);
    toast.success(`${preset.name} 已接入 ${done.length} 个信号${skipped.length ? `（跳过 ${skipped.length} 个）` : ''}`);
  };

  // 分享链接
  const handleShareLink = async () => {
    try {
      const url = await buildShareUrl({ chip: chipInfo, pinsData, mapping: pinMapping, customLabels });
      if (url.length > 30000) toast.info('提示：链接较长，部分聊天工具可能会截断。');
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        try {
          const ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          copied = document.execCommand('copy');
          ta.remove();
        } catch { copied = false; }
      }
      if (copied) toast.success(`分享链接已复制（${(url.length / 1024).toFixed(1)} KB），打开即恢复配置`);
      else toast.error('复制失败，请手动复制：' + url.slice(0, 80) + '…');
    } catch (err) {
      console.error(err);
      toast.error('生成分享链接失败');
    }
  };

  const handleExportIdf = () => {
    const content = generateIdfGpioInit({ chipInfo, pinsData, mapping: pinMapping, customLabels });
    if (!content) { toast.error('当前没有任何引脚分配，无法生成代码。'); return; }
    downloadFile(`${baseName()}_gpio_idf.c`, content, 'text/x-c;charset=utf-8');
    toast.success('ESP-IDF GPIO 初始化代码已生成（方向为推测，请核对）');
  };

  const handleExportHal = () => {
    const content = generateStm32HalInit({ chipInfo, pinsData, mapping: pinMapping, customLabels });
    if (!content) { toast.error('当前没有任何引脚分配，无法生成代码。'); return; }
    downloadFile(`${baseName()}_gpio_hal.c`, content, 'text/x-c;charset=utf-8');
    toast.success('STM32 HAL GPIO 初始化代码已生成（方向为推测，请核对）');
  };

  // ------------------------------------------
  // 引脚布局计算函数（矩阵环形布局）
  // ------------------------------------------
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const packageLayout = useMemo(() => {
    const totalPins = pinsData.length;
    const pkg = String(chipInfo.package || '').toUpperCase();
    const kind = pkg.includes('DIP') ? 'dip' : (pkg.includes('BGA') ? 'bga' : 'perimeter');

    const maxW = Math.max(520, Math.min(1400, (viewportSize.width || 0) > 0 ? (viewportSize.width - 24) : 900));
    const maxH = Math.max(420, Math.min(1200, (viewportSize.height || 0) > 0 ? (viewportSize.height - 24) : 760));
    const base = Math.min(maxW, maxH);
    const pad = Math.max(10, Math.floor(base * 0.02));

    if (kind === 'dip') {
      const pinsPerSide = Math.max(1, Math.ceil(totalPins / 2));
      let gap = pinsPerSide > 40 ? 3 : 5;
      const usableH = maxH - pad * 2 - gap * Math.max(pinsPerSide - 1, 1);
      let pinH = Math.max(10, Math.min(24, Math.floor(usableH / pinsPerSide)));
      let pinW = pinH;
      let bodyW = Math.max(140, Math.min(360, Math.floor(maxW - pad * 2 - pinW * 2 - gap * 2)));
      let width = pad * 2 + pinW * 2 + bodyW + gap * 2;
      let height = pad * 2 + pinsPerSide * pinH + gap * Math.max(pinsPerSide - 1, 1);

      if (width > maxW) {
        bodyW = Math.max(120, bodyW - (width - maxW));
        width = pad * 2 + pinW * 2 + bodyW + gap * 2;
      }
      if (width > maxW) {
        pinW = Math.max(10, pinW - (width - maxW) / 2);
        width = pad * 2 + pinW * 2 + bodyW + gap * 2;
      }

      const bodyRect = { left: pad + pinW + gap, top: pad, width: bodyW, height: height - pad * 2 };
      return { kind, pad, gap, cell: Math.min(pinW, pinH), width, height, pinsPerSide, pinW, pinH, bodyRect };
    }

    if (kind === 'bga') {
      // BGA 球阵：接近正方形（与真实封装一致），球径按可用空间最优计算
      const gutter = Math.max(22, Math.floor(base * 0.035));
      const gutterTop = gutter;
      const gutterLeft = gutter;

      const availableW = maxW - pad * 2 - gutterLeft;
      const availableH = maxH - pad * 2 - gutterTop;
      const maxSize = Math.min(availableW, availableH);

      const cols = Math.max(1, Math.ceil(Math.sqrt(totalPins)));
      const rows = Math.max(1, Math.ceil(totalPins / cols));

      let gap = totalPins > 400 ? 2 : totalPins > 200 ? 3 : 6;
      const fitBall = Math.floor((maxSize - gap * Math.max(Math.max(cols, rows) - 1, 1)) / Math.max(cols, rows));
      let ball = Math.max(8, Math.min(fitBall, 44));

      gap = Math.max(2, Math.min(gap, Math.floor(ball * 0.55)));

      const gridW = cols * ball + gap * Math.max(cols - 1, 1);
      const gridH = rows * ball + gap * Math.max(rows - 1, 1);
      const width = pad * 2 + gutterLeft + gridW;
      const height = pad * 2 + gutterTop + gridH;
      const pinsOrigin = { x: pad + gutterLeft, y: pad + gutterTop };
      return { kind, pad, gap, cell: ball, width, height, cols, rows, ball, gutterTop, gutterLeft, pinsOrigin };
    }

    // 周长布局（QFP/QFN 等）：与芯片真实物理结构一致的正方形，
    // 引脚四边均匀分布，尺寸按可用空间最优计算
    const availW = maxW - pad * 2;
    const availH = maxH - pad * 2;
    const maxSize = Math.min(availW, availH);
    const cellsPerSide = Math.max(3, Math.ceil((totalPins + 4) / 4));
    let gap = totalPins > 120 ? 3 : totalPins > 80 ? 4 : 5;
    let cell = Math.floor((maxSize - pad * 2 - gap * (cellsPerSide - 1)) / cellsPerSide);
    if (cell < 10) {
      gap = Math.max(2, Math.floor((maxSize - pad * 2 - cellsPerSide * 10) / Math.max(cellsPerSide - 1, 1)));
      cell = Math.floor((maxSize - pad * 2 - gap * (cellsPerSide - 1)) / cellsPerSide);
    }
    cell = Math.max(10, Math.min(cell, 44));
    gap = Math.max(2, Math.min(gap, Math.floor(cell * 0.5)));

    const size = pad * 2 + cellsPerSide * cell + (cellsPerSide - 1) * gap;
    const bodyInset = pad + cell + gap;
    return { kind, pad, gap, cell, width: size, height: size, cellsPerSide, bodyInset };
  }, [pinsData.length, viewportSize.width, viewportSize.height, chipInfo.package]);

  const getPinGridPos = (pinIndex) => {
    const n = packageLayout.cellsPerSide;
    const perimeter = 4 * n - 4;
    const idx = Math.max(0, Math.min(pinIndex, perimeter - 1));
    const topLen = n;
    const rightLen = n - 2;
    const bottomLen = n;
    const leftLen = n - 2;

    if (idx < topLen) return { row: 0, col: idx, side: 'top' };
    if (idx < topLen + rightLen) return { row: 1 + (idx - topLen), col: n - 1, side: 'right' };
    if (idx < topLen + rightLen + bottomLen) return { row: m - 1, col: (n - 1) - (idx - (topLen + rightLen)), side: 'bottom' };
    if (idx < topLen + rightLen + bottomLen + leftLen) return { row: (m - 2) - (idx - (topLen + rightLen + bottomLen)), col: 0, side: 'left' };
    return { row: 0, col: 0, side: 'top' };
  };

  const getPinBoxStyleByIndex = (pinIndex) => {
    if (packageLayout.kind === 'dip') {
      const sideIdx = pinIndex < packageLayout.pinsPerSide ? pinIndex : (pinIndex - packageLayout.pinsPerSide);
      const isRight = pinIndex >= packageLayout.pinsPerSide;
      const x = isRight
        ? (packageLayout.pad + packageLayout.pinW + packageLayout.gap + packageLayout.bodyRect.width + packageLayout.gap)
        : packageLayout.pad;
      const y = packageLayout.pad + sideIdx * (packageLayout.pinH + packageLayout.gap);
      return { left: x, top: y, width: packageLayout.pinW, height: packageLayout.pinH };
    }

    if (packageLayout.kind === 'bga') {
      const col = pinIndex % packageLayout.cols;
      const row = Math.floor(pinIndex / packageLayout.cols);
      return {
        left: packageLayout.pinsOrigin.x + col * (packageLayout.ball + packageLayout.gap),
        top: packageLayout.pinsOrigin.y + row * (packageLayout.ball + packageLayout.gap),
        width: packageLayout.ball,
        height: packageLayout.ball
      };
    }

    const { row, col } = getPinGridPos(pinIndex);
    const { pad, cell, gap } = packageLayout;
    return {
      left: pad + col * (cell + gap),
      top: pad + row * (cell + gap),
      width: cell,
      height: cell
    };
  };

  const getPinTextRotationByIndex = (pinIndex) => {
    if (packageLayout.kind !== 'perimeter') return 'none';
    const { side } = getPinGridPos(pinIndex);
    if (side === 'right') return 'rotate(90deg)';
    if (side === 'left') return 'rotate(-90deg)';
    return 'none';
  };

  const getBgaRowLabel = (i) => {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    if (i < letters.length) return letters[i];
    const a = letters[Math.floor(i / letters.length) - 1] || 'A';
    const b = letters[i % letters.length] || 'A';
    return `${a}${b}`;
  };

  const assignedCount = Object.keys(pinMapping).length;
  const hoverScaleClass = pinsData.length > 80 ? 'scale-125' : 'scale-150';

  const viewportRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const didUserTransformRef = useRef(false);
  const rebuildRef = useRef(0);
  const gestureRef = useRef({
    mode: null,
    pointerId: null,
    startClient: null,
    startTransform: null,
    startDist: 0,
    worldCenter: null,
  });
  const didPanRef = useRef(false);
  const lastPanAtRef = useRef(0);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isAltDown, setIsAltDown] = useState(false);
  const [isGesturing, setIsGesturing] = useState(false);
  const [chipTransform, setChipTransform] = useState({ x: 0, y: 0, scale: 1 });

  const pinLabelTier = useMemo(() => {
    const px = packageLayout.cell * chipTransform.scale;
    if (px < 11) return 'none';
    if (px < 16) return 'id';
    if (px < 26) return 'short';
    return 'full';
  }, [packageLayout.cell, chipTransform.scale]);

  const pinLabelFontSize = useMemo(() => {
    return Math.max(6, Math.min(10, Math.floor(packageLayout.cell * 0.62)));
  }, [packageLayout.cell]);

  const getPinLabelText = ({ id, isHovered, isSelected, isAssigned, assignmentObj, hasCustomLabel }) => {
    const isFocused = isHovered || isSelected;
    let tier = isFocused ? 'full' : pinLabelTier;
    if (tier === 'none' && (hasCustomLabel || isAssigned)) tier = 'short';
    if (tier === 'none') return '';

    if (tier === 'id') return id.toString();

    const maxChars = tier === 'full' ? 10 : 4;
    if (hasCustomLabel) return (customLabels[id] || '').substring(0, maxChars);
    if (isAssigned && assignmentObj) return assignmentObj.name.substring(0, maxChars);
    return id.toString();
  };

  // ------------------------------------------
  // 悬浮属性卡：跟随被悬停引脚，智能避让不遮挡
  // ------------------------------------------
  const TOOLTIP_W = 288;
  const TOOLTIP_EST_H = 250;
  const tooltip = useMemo(() => {
    if (hoveredPin == null || isGesturing) return null;
    if (hoveredPin === selectedPinId) return null;
    const idx = pinsData.findIndex(p => p.id === hoveredPin);
    if (idx < 0) return null;

    // 世界坐标 → 屏幕坐标（画布内）
    const box = getPinBoxStyleByIndex(idx);
    const { x: tx, y: ty, scale } = chipTransform;
    const screen = {
      left: tx + box.left * scale,
      top: ty + box.top * scale,
      width: box.width * scale,
      height: box.height * scale,
    };

    const vw = viewportSize.width || 0;
    const vh = viewportSize.height || 0;
    if (!vw || !vh) return null;
    // 引脚完全位于画布外时不显示
    if (screen.left > vw || screen.top > vh || screen.left + screen.width < 0 || screen.top + screen.height < 0) return null;

    const margin = 10;
    const pinCenterY = screen.top + screen.height / 2;
    // 默认放引脚右侧，空间不足换左侧
    const side = screen.left + screen.width + margin + TOOLTIP_W <= vw ? 'right' : 'left';
    const left = side === 'right'
      ? screen.left + screen.width + margin
      : Math.max(6, screen.left - margin - TOOLTIP_W);
    const top = clamp(pinCenterY - TOOLTIP_EST_H / 2, 6, Math.max(6, vh - TOOLTIP_EST_H - 6));
    const arrowTop = clamp(pinCenterY - top, 18, TOOLTIP_EST_H - 18);
    return { left, top, side, arrowTop };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredPin, selectedPinId, isGesturing, pinsData, chipTransform, viewportSize, packageLayout]);

  useEffect(() => {
    if (!isDataLoaded) return;
    const update = () => {
      // 每次现取元素：画布节点可能在会话恢复/样式注入过程中被替换
      const el2 = viewportRef.current;
      if (!el2) return;
      const rect = el2.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setViewportSize(prev => (prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }));
    };

    update();

    // 样式表注入可能晚于首次渲染（冷加载/HMR），RO 之外补充多时机兜底测量
    const timers = [80, 250, 600, 1200, 2500, 4000].map(d => window.setTimeout(update, d));
    window.addEventListener('load', update);
    window.addEventListener('resize', update);

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      if (viewportRef.current) ro.observe(viewportRef.current);
    }

    // 自愈循环：环境 RO 失效/样式晚注入时，周期性校验画布尺寸偏差并纠正
    const iv = window.setInterval(update, 800);

    return () => {
      timers.forEach(t => window.clearTimeout(t));
      window.removeEventListener('load', update);
      window.removeEventListener('resize', update);
      window.clearInterval(iv);
      if (ro) ro.disconnect();
    };
  }, [isDataLoaded, view]);

  // 面板开合/视图切换会改变画布尺寸，主动重测（RO 不可用环境的兜底）
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    setViewportSize(prev => (prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }));
  }, [isDataLoaded, view, inspectorSide, selectedPinId == null]);

  useEffect(() => {
    if (!isDataLoaded) return;
    if (!pinsData || pinsData.length === 0) return;
    if (rebuildRef.current) window.clearTimeout(rebuildRef.current);
    rebuildRef.current = window.setTimeout(() => {
      processPinDataToGroups(pinsData);
    }, 250);
    return () => {
      if (rebuildRef.current) window.clearTimeout(rebuildRef.current);
    };
  }, [pinsData, isDataLoaded]);

  // ---------- 全局键盘 ----------
  useEffect(() => {
    const isEditableTarget = (target) => {
      const el = target;
      if (!el) return false;
      const tag = el.tagName;
      return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        setIsSpaceDown(true);
      }
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        setIsAltDown(true);
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ' && !e.repeat) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && e.code === 'KeyY' && !e.repeat) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.code === 'KeyS' && !e.repeat) {
        e.preventDefault();
        handleExport();
        return;
      }
      if (isEditableTarget(e.target)) return;

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcuts(v => !v);
        return;
      }
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setShowExportMenu(false);
        setShowChipSettings(false);
        setShowDrc(false);
        setSelectedSignalId(null);
        setSelectedGroupId(null);
        setSelectedPinId(null);
        return;
      }
      if ((e.key === 'f' || e.key === 'F') && isDataLoaded && view === 'diagram') {
        fitView();
        return;
      }
      if (isDataLoaded && view === 'diagram' && selectedPinId != null &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const idx = pinsData.findIndex(p => p.id === selectedPinId);
        if (idx >= 0) {
          const delta = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
          const next = pinsData[clamp(idx + delta, 0, pinsData.length - 1)];
          if (next) setSelectedPinId(next.id);
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPinId != null) {
        e.preventDefault();
        clearPinAssignment(selectedPinId);
        setCustomLabels(prev => {
          const next = { ...prev };
          delete next[selectedPinId];
          return next;
        });
      }
    };

    const onKeyUp = (e) => {
      if (e.code === 'Space') setIsSpaceDown(false);
      if (e.code === 'AltLeft' || e.code === 'AltRight') setIsAltDown(false);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  });

  useEffect(() => {
    const onWheel = (e) => {
      const el = viewportRef.current;
      if (!el) return;
      const target = e.target instanceof Node ? e.target : null;
      if (!target || !el.contains(target)) return;

      const allowZoom = e.altKey || isAltDown || e.ctrlKey;
      if (!allowZoom) return;

      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      e.preventDefault();
      setChipTransform((prev) => {
        const nextScale = clamp(prev.scale * Math.exp(-e.deltaY * 0.0012), 0.25, 4);
        if (nextScale === prev.scale) return prev;
        didUserTransformRef.current = true;

        const worldX = (px - prev.x) / prev.scale;
        const worldY = (py - prev.y) / prev.scale;
        const nextX = px - worldX * nextScale;
        const nextY = py - worldY * nextScale;

        return { x: nextX, y: nextY, scale: nextScale };
      });
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, [isAltDown]);

  useEffect(() => {
    if (!isDataLoaded) return;
    if (view !== 'diagram') return;
    const el = viewportRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const layoutW = packageLayout.width;
    const layoutH = packageLayout.height;
    if (!layoutW || !layoutH || rect.width <= 0 || rect.height <= 0) return;

    setChipTransform((prev) => {
      if (didUserTransformRef.current) return prev;
      // 底部为缩放工具条预留空间，避免遮挡引脚
      const fitScale = clamp(Math.min((rect.width - 48) / layoutW, (rect.height - 84) / layoutH), 0.25, 4);
      return {
        x: (rect.width - layoutW * fitScale) / 2,
        y: Math.max(12, (rect.height - 36 - layoutH * fitScale) / 2),
        scale: fitScale,
      };
    });
  }, [isDataLoaded, view, fitTick, packageLayout.width, packageLayout.height, viewportSize.width, viewportSize.height]);

  // ---------- 缩放工具条 ----------
  const fitView = () => {
    didUserTransformRef.current = false;
    setFitTick(t => t + 1);
  };

  const zoomBy = (factor) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setChipTransform(prev => {
      const nextScale = clamp(prev.scale * factor, 0.25, 4);
      const wx = (cx - prev.x) / prev.scale;
      const wy = (cy - prev.y) / prev.scale;
      didUserTransformRef.current = true;
      return { x: cx - wx * nextScale, y: cy - wy * nextScale, scale: nextScale };
    });
  };

  const resetZoom = () => {
    didUserTransformRef.current = true;
    setChipTransform({ x: 0, y: 0, scale: 1 });
  };

  // ---------- 导出菜单点击外部关闭 ----------
  useEffect(() => {
    if (!showExportMenu) return;
    const onDoc = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [showExportMenu]);

  // ---------- 拖拽导入 ----------
  const onDragOver = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (e) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    setDragging(false);
  };
  const onDrop = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFiles(file);
  };

  // ---------- 画布手势 ----------
  const beginPan = (e) => {
    const el = viewportRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    setIsGesturing(true);
    didPanRef.current = false;
    gestureRef.current = {
      mode: 'pan',
      pointerId: e.pointerId,
      startClient: { x: e.clientX, y: e.clientY },
      startTransform: chipTransform,
      startDist: 0,
      worldCenter: null,
    };
  };

  const updatePan = (e) => {
    const g = gestureRef.current;
    if (g.mode !== 'pan' || g.pointerId !== e.pointerId || !g.startClient || !g.startTransform) return;
    const dx = e.clientX - g.startClient.x;
    const dy = e.clientY - g.startClient.y;
    if (!didPanRef.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) didPanRef.current = true;
    if (didPanRef.current) didUserTransformRef.current = true;
    setChipTransform({ x: g.startTransform.x + dx, y: g.startTransform.y + dy, scale: g.startTransform.scale });
  };

  const beginPinch = () => {
    const el = viewportRef.current;
    if (!el) return;
    const points = Array.from(activePointersRef.current.values());
    if (points.length < 2) return;
    setIsGesturing(true);
    const rect = el.getBoundingClientRect();
    const p0 = { x: points[0].clientX - rect.left, y: points[0].clientY - rect.top };
    const p1 = { x: points[1].clientX - rect.left, y: points[1].clientY - rect.top };
    const center = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const worldCenter = {
      x: (center.x - chipTransform.x) / chipTransform.scale,
      y: (center.y - chipTransform.y) / chipTransform.scale,
    };
    gestureRef.current = {
      mode: 'pinch',
      pointerId: null,
      startClient: null,
      startTransform: chipTransform,
      startDist: dist,
      worldCenter,
    };
  };

  const updatePinch = () => {
    const el = viewportRef.current;
    if (!el) return;
    const g = gestureRef.current;
    if (g.mode !== 'pinch' || !g.startTransform || !g.worldCenter || g.startDist <= 0) return;
    const points = Array.from(activePointersRef.current.values());
    if (points.length < 2) return;
    const rect = el.getBoundingClientRect();
    const p0 = { x: points[0].clientX - rect.left, y: points[0].clientY - rect.top };
    const p1 = { x: points[1].clientX - rect.left, y: points[1].clientY - rect.top };
    const center = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const nextScale = clamp(g.startTransform.scale * (dist / g.startDist), 0.25, 4);
    const nextX = center.x - g.worldCenter.x * nextScale;
    const nextY = center.y - g.worldCenter.y * nextScale;
    setChipTransform({ x: nextX, y: nextY, scale: nextScale });
  };

  const endGesture = () => {
    if (didPanRef.current) lastPanAtRef.current = Date.now();
    gestureRef.current = { mode: null, pointerId: null, startClient: null, startTransform: null, startDist: 0, worldCenter: null };
    didPanRef.current = false;
    setIsGesturing(false);
  };

  const handleViewportPointerDown = (e) => {
    if (!isDataLoaded) return;
    if (e.button !== 0) return;

    activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    const isOnPin = !!(e.target instanceof Element && e.target.closest('[data-pin="true"]'));
    const allowPan = isSpaceDown || e.altKey || isAltDown || !isOnPin;
    if (allowPan) beginPan(e);

    if (activePointersRef.current.size === 2) {
      const el = viewportRef.current;
      if (el) {
        try { el.setPointerCapture(e.pointerId); } catch {}
      }
      beginPinch();
    }
  };

  const handleViewportPointerMove = (e) => {
    if (!isDataLoaded) return;
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }

    if (gestureRef.current.mode === 'pan') {
      updatePan(e);
      return;
    }
    if (gestureRef.current.mode === 'pinch') {
      updatePinch();
    }
  };

  const handleViewportPointerUpOrCancel = (e) => {
    if (activePointersRef.current.has(e.pointerId)) activePointersRef.current.delete(e.pointerId);
    const el = viewportRef.current;
    if (el) {
      try { el.releasePointerCapture(e.pointerId); } catch {}
    }
    if (gestureRef.current.mode === 'pan' && gestureRef.current.pointerId === e.pointerId) {
      endGesture();
    } else if (gestureRef.current.mode === 'pinch' && activePointersRef.current.size < 2) {
      endGesture();
    }
  };

  // ==========================================
  // UI 渲染
  // ==========================================
  const selectedPin = selectedPinId != null ? pinsData.find(p => p.id === selectedPinId) : null;

  const inspectorPanel = selectedPin ? (
    <div className={`w-80 shrink-0 bg-white dark:bg-slate-900 ${inspectorSide === 'right' ? 'border-l' : 'border-r'} border-slate-200 dark:border-slate-700 flex flex-col shadow-2xl z-40`}>
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
        <h2 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <Edit3 size={16} className="text-blue-600 dark:text-blue-400" /> 引脚属性
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setInspectorSide(prev => prev === 'right' ? 'left' : 'right')}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700"
            title={inspectorSide === 'right' ? '移动到左侧' : '移动到右侧'}
          >
            <ChevronsLeftRight size={16} />
          </button>
          <button onClick={() => setSelectedPinId(null)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-5 flex-1 overflow-y-auto">

        <div className="relative">
          <div className="text-4xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Pin {selectedPin.id}</div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{selectedPin.name}</div>

          <div className="flex gap-2 mt-3">
            <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${isPowerPin(selectedPin) ? 'bg-red-100 text-red-700 dark:bg-rose-500/15 dark:text-rose-400' : 'bg-green-100 text-green-700 dark:bg-emerald-500/15 dark:text-emerald-400'}`}>
              {selectedPin.type}
            </span>
            <span className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">
              PWR: {selectedPin.power}
            </span>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-700" />

        <div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
            <Tag size={14} className="text-amber-500" />
            自定义标签
          </label>
          <div className="relative">
            <input
              type="text"
              value={customLabels[selectedPin.id] || ''}
              onChange={(e) => setPinLabel(selectedPin.id, e.target.value)}
              placeholder="输入自定义标签..."
              className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow shadow-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800"
            />
            {customLabels[selectedPin.id] && (
              <button
                onClick={() => setPinLabel(selectedPin.id, '')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 p-1 rounded"
                title="清除标签"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-700" />

        <div className="flex flex-col gap-3">
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">管脚自定义</label>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">管脚名</label>
            <input
              type="text"
              value={selectedPin.name || ''}
              onChange={(e) => updatePin(selectedPin.id, { name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">类型</label>
            <input
              type="text"
              value={selectedPin.type || ''}
              onChange={(e) => updatePin(selectedPin.id, { type: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">电源/属性</label>
            <input
              type="text"
              value={selectedPin.power || ''}
              onChange={(e) => updatePin(selectedPin.id, { power: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            />
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-700" />

        <div className="flex flex-col gap-3">
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">复用功能 (MUX)</label>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={`f${i}`}>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{`f${i}`}</label>
                <input
                  type="text"
                  value={selectedPin[`f${i}`] || ''}
                  onChange={(e) => updatePin(selectedPin.id, { [`f${i}`]: e.target.value || null })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  placeholder="例如: UART0_TX"
                />
              </div>
            ))}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">lp_f0</label>
              <input
                type="text"
                value={selectedPin.lp_f0 || ''}
                onChange={(e) => updatePin(selectedPin.id, { lp_f0: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">lp_f1</label>
              <input
                type="text"
                value={selectedPin.lp_f1 || ''}
                onChange={(e) => updatePin(selectedPin.id, { lp_f1: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">ana_f0</label>
              <input
                type="text"
                value={selectedPin.ana_f0 || ''}
                onChange={(e) => updatePin(selectedPin.id, { ana_f0: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">ana_f1</label>
              <input
                type="text"
                value={selectedPin.ana_f1 || ''}
                onChange={(e) => updatePin(selectedPin.id, { ana_f1: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              />
            </div>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            手动创建芯片时，在这里填每个管脚支持的信号名称；左侧会自动生成外设/信号列表，导出CSV后可再次导入。
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-700" />

        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">功能分配</label>
          {pinMapping[selectedPin.id] ? (
            <div className={`rounded-lg p-3 border ${conflictPinIds.has(selectedPin.id) ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30' : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className={`text-[10px] uppercase font-bold ${conflictPinIds.has(selectedPin.id) ? 'text-rose-500' : 'text-blue-500 dark:text-blue-400'}`}>
                  {conflictPinIds.has(selectedPin.id) ? '⚠ 该引脚不支持此信号（冲突）' : '当前已分配'}
                </div>
                <button
                  onClick={() => clearPinAssignment(selectedPin.id)}
                  className="text-[10px] font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors"
                >
                  <Eraser size={11} /> 清除
                </button>
              </div>
              <div className={`font-bold text-base break-words ${conflictPinIds.has(selectedPin.id) ? 'text-rose-700 dark:text-rose-300' : 'text-blue-900 dark:text-blue-300'}`}>
                {getSignalById(pinMapping[selectedPin.id])?.name || pinMapping[selectedPin.id]}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-center">
              <span className="text-slate-400 dark:text-slate-500 text-sm">暂无分配</span>
              {isConfigMode && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">请在左侧列表选择信号后点击分配</p>
              )}
            </div>
          )}
        </div>

        {isPowerPin(selectedPin) && (
          <div className="bg-red-50 dark:bg-rose-500/10 border border-red-200 dark:border-rose-500/30 p-3 rounded-lg flex items-start gap-2">
            <Ban size={16} className="text-red-500 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700 dark:text-rose-300 leading-relaxed">
              这是电源/接地引脚，不可分配复用功能
            </div>
          </div>
        )}

      </div>
    </div>
  ) : null;

  const exportMenuItems = [
    { icon: FileJson, label: '配置 JSON', desc: '映射 + 标签 + 引脚数据', onClick: () => { setShowExportMenu(false); handleExport(); } },
    { icon: FileText, label: '引脚表 CSV', desc: '可再次导入的引脚数据表', onClick: () => { setShowExportMenu(false); handleExportCsv(); } },
    { icon: FileSpreadsheet, label: '引脚表 XLSX', desc: 'Excel 工作簿', onClick: () => { setShowExportMenu(false); handleExportXlsx(); } },
    { icon: Link2, label: '复制分享链接', desc: '配置压缩进 URL，打开即恢复', onClick: () => { setShowExportMenu(false); handleShareLink(); } },
    { icon: FileCode2, label: 'C 头文件', desc: '#define 引脚宏 + 配置表', onClick: () => { setShowExportMenu(false); handleExportCHeader(); } },
    { icon: FileCode, label: 'ESP-IDF GPIO 初始化', desc: 'gpio_config 代码（方向为推测）', onClick: () => { setShowExportMenu(false); handleExportIdf(); } },
    { icon: FileCode, label: 'STM32 HAL GPIO 初始化', desc: 'MX_GPIO_Init 代码（方向为推测）', onClick: () => { setShowExportMenu(false); handleExportHal(); } },
    { icon: BookMarked, label: 'Markdown 报告', desc: '分配明细 + 未分配清单', onClick: () => { setShowExportMenu(false); handleExportMarkdown(); } },
  ];

  const iconBtn = 'p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div
      className="flex flex-col h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans overflow-hidden"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Toaster />
      <ConfirmHost />
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <DrcDrawer
        open={showDrc}
        findings={drcFindings}
        onClose={() => setShowDrc(false)}
        onFocusSignal={(sigId) => {
          setIsConfigMode(true);
          setSelectedSignalId(sigId);
          setSelectedGroupId(getGroupForSignal(sigId)?.id || null);
        }}
      />

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 lg:px-6 py-3 shadow-sm z-20 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/30">
                <Zap size={17} />
              </div>
              <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white hidden sm:block">PinForge</span>
            </div>

            <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 hidden sm:block" />

            <div className="flex items-center gap-1.5 min-w-0">
              <Cpu size={16} className="text-slate-400 shrink-0" />
              <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{chipInfo.name}</span>
              {isDataLoaded && (
                <span className="text-[11px] font-medium text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-gray-200 dark:border-slate-700 whitespace-nowrap">
                  {chipInfo.package} · {chipInfo.pinCount} pins
                </span>
              )}
              <button
                onClick={() => setShowChipSettings(true)}
                className="text-xs flex items-center gap-1 px-1.5 py-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded transition"
                title="芯片信息设置"
              >
                <Settings size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 导入 CSV/XLSX */}
            <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <button onClick={() => fileInputRef.current.click()} className="text-xs flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm shadow-emerald-500/20 transition font-bold">
              <Upload size={14} /> 导入数据
            </button>

            {/* 导入配置 */}
            <input type="file" accept=".json" ref={configInputRef} onChange={handleConfigImport} className="hidden" />
            <button onClick={() => configInputRef.current.click()} className="text-xs flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 text-slate-600 dark:text-slate-300 rounded-lg transition font-medium bg-white dark:bg-slate-800">
              <FileJson size={14} /> 导入配置
            </button>

            {/* 导出菜单 */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu(v => !v)}
                className={`text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg border transition font-medium bg-white dark:bg-slate-800 ${showExportMenu ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400'}`}
              >
                <Download size={14} /> 导出 <ChevronDown size={12} className={showExportMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 py-1.5 pinforge-pop-in">
                  {exportMenuItems.map((item, i) => (
                    <React.Fragment key={item.label}>
                      {i === 4 && <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-700" />}
                      {i === 7 && <div className="my-1.5 h-px bg-slate-100 dark:bg-slate-700" />}
                      <button
                        onClick={item.onClick}
                        className="w-full flex items-start gap-3 px-3.5 py-2 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors text-left"
                      >
                        <item.icon size={16} className="mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>
                          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{item.label}</span>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500">{item.desc}</span>
                        </span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 hidden lg:block" />

            {/* 撤销/重做 */}
            <div className="hidden lg:flex items-center gap-0.5">
              <button onClick={undo} disabled={!histInfo.canUndo} className={iconBtn} title="撤销 (Ctrl+Z)">
                <Undo2 size={16} />
              </button>
              <button onClick={redo} disabled={!histInfo.canRedo} className={iconBtn} title="重做 (Ctrl+Y)">
                <Redo2 size={16} />
              </button>
            </div>

            <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 hidden lg:block" />

            {/* 视图切换 */}
            {isDataLoaded && (
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setView('diagram')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold transition ${view === 'diagram' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  title="芯片图视图"
                >
                  <LayoutPanelTop size={13} /> <span className="hidden xl:inline">芯片图</span>
                </button>
                <button
                  onClick={() => setView('table')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold transition ${view === 'table' ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                  title="表格视图"
                >
                  <Table2 size={13} /> <span className="hidden xl:inline">表格</span>
                </button>
              </div>
            )}

            {/* 交互配置模式 */}
            <button
              onClick={() => isDataLoaded && setIsConfigMode(!isConfigMode)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${!isDataLoaded ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-gray-400' : isConfigMode ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/25' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
              title="开启后可点选芯片图上的引脚进行分配"
            >
              {isConfigMode ? <Edit3 size={14} /> : <MousePointer size={14} />}
              {isConfigMode ? '配置模式' : '浏览模式'}
            </button>

            <div className="h-5 w-px bg-gray-200 dark:bg-slate-700 hidden md:block" />

            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                className={iconBtn}
                title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button onClick={() => setShowShortcuts(true)} className={iconBtn} title="快捷键帮助 (?)">
                <Keyboard size={16} />
              </button>
              <button
                onClick={() => { window.location.href = window.location.pathname.replace(/index\.html.*$/, '') + 'landing.html'; }}
                className={`${iconBtn} hidden md:block`}
                title="功能介绍页"
              >
                <BookOpen size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 状态栏 */}
        {isDataLoaded && (
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-slate-700 overflow-x-auto">
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-bold text-slate-600 dark:text-slate-300">已分配</span>
              <div className="w-28 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min((assignedCount / Math.max(chipInfo.pinCount, 1)) * 100, 100)}%` }}></div>
              </div>
              <span className="font-mono tabular-nums">{assignedCount} / {chipInfo.pinCount}</span>
            </div>

            <div className="h-4 w-px bg-gray-200 dark:bg-slate-700 shrink-0" />

            <div className="flex items-center gap-3 shrink-0 font-medium">
              <span title="信号总数">信号 <b className="text-slate-700 dark:text-slate-200">{signalCounts.total}</b></span>
              <span title="未分配信号" className="text-slate-400 dark:text-slate-500">未分配 <b>{signalCounts.unassigned}</b></span>
              <span title="已分配信号" className="text-emerald-600 dark:text-emerald-400">已分配 <b>{signalCounts.assigned}</b></span>
              <span title="冲突信号" className={signalCounts.conflict > 0 ? 'text-rose-500 font-bold' : 'text-slate-400 dark:text-slate-500'}>
                冲突 <b>{signalCounts.conflict}</b>
              </span>
            </div>

            {isConfigMode && (
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium shrink-0">
                <Info size={13} />
                {selectedGroupId && !selectedSignalId
                  ? '组模式: 点击芯片图上高亮的引脚，自动绑定到组内空闲信号。'
                  : selectedSignalId
                    ? `精细映射: 正在为 [${selectedSignalId}] 选择引脚...`
                    : '请在左侧列表选择要分配的外设或信号。'}
              </div>
            )}

            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleAutoAssign}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors font-bold"
                title="按约束强度把所有未分配信号自动接入空闲合法引脚（可撤销）"
              >
                <Wand2 size={12} /> 自动排布
              </button>
              <button
                onClick={() => setShowDrc(true)}
                className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors font-medium
                  ${drcErrorCount > 0 ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10' : drcWarnCount > 0 ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                title="设计审查：冲突 / 调试口 / 差分对 / IO 利用率"
              >
                <ShieldCheck size={12} /> 审查
                {(drcErrorCount + drcWarnCount) > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${drcErrorCount > 0 ? 'bg-rose-500 text-white' : 'bg-amber-400 text-white'}`}>
                    {drcErrorCount + drcWarnCount}
                  </span>
                )}
              </button>
              <div className="h-4 w-px bg-gray-200 dark:bg-slate-700" />
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors font-medium"
                title="清空所有分配与标签"
              >
                <Eraser size={12} /> 清空分配
              </button>
              <button
                onClick={handleResetProject}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors font-medium"
                title="重置项目（清除全部数据）"
              >
                <RotateCcw size={12} /> 重置
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative">

        {!isDataLoaded ? (
          <Welcome
            onLoadSample={loadSample}
            onPickFile={() => fileInputRef.current.click()}
            draftPackage={draftPackage}
            setDraftPackage={setDraftPackage}
            draftPinCount={draftPinCount}
            setDraftPinCount={setDraftPinCount}
            onCreateChip={handleCreateChipFromScratch}
            dragging={dragging}
          />
        ) : (
          <>
            {/* 左侧：智能分类列表 */}
            {view === 'diagram' && (
            <div className="w-[330px] shrink-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col overflow-y-auto z-10 shadow-sm">
              {isDataLoaded && (
                <PresetPanel
                  signals={allSignalsFlat.map(s => s.id)}
                  assignedSignalSet={assignedSignalSet}
                  onApply={handleApplyPreset}
                />
              )}
              <div className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 p-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={signalSearch}
                    onChange={(e) => setSignalSearch(e.target.value)}
                    placeholder="搜索信号（名称/关键字）"
                    className="w-full pl-9 pr-8 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  />
                  {signalSearch && (
                    <button
                      onClick={() => setSignalSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded"
                      title="清空"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="flex bg-slate-100 dark:bg-slate-800 rounded-md p-1 border border-slate-200 dark:border-slate-700">
                    {[
                      ['all', '全部'],
                      ['unassigned', '未分配'],
                      ['assigned', '已分配'],
                      ['conflict', '冲突'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSignalFilter(key)}
                        className={`text-[11px] font-bold px-2 py-1 rounded transition ${signalFilter === key ? 'bg-white dark:bg-slate-600 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={collapseAllGroups}
                      className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="折叠全部分组"
                    >
                      折叠
                    </button>
                    <button
                      onClick={expandAllGroups}
                      className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="展开全部分组"
                    >
                      展开
                    </button>
                  </div>
                </div>
              </div>

              {signalGroups.length === 0 ? (
                <div className="p-8 text-center text-gray-400 dark:text-slate-500">未能从数据中提取到有效信号</div>
              ) : filteredSignalGroups.length === 0 ? (
                <div className="p-8 text-center text-gray-400 dark:text-slate-500">无匹配信号</div>
              ) : (
                filteredSignalGroups.map(group => {
                  const isGroupSelected = selectedGroupId === group.id;
                  const isCollapsed = collapsedGroups.has(group.id);
                  return (
                    <div key={group.id} className="border-b border-gray-100 dark:border-slate-800 last:border-0">
                      <div
                        onClick={() => handleGroupClick(group.id)}
                        className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all duration-200 flex justify-between items-center sticky top-[92px] z-10
                          ${isGroupSelected ? `bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border-l-4 ${group.border} shadow-sm` : `${group.text} dark:brightness-125 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border-l-4 border-transparent`}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${group.dot}`} />
                          <span className="truncate">{group.title}</span>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full text-[9px]" title={`${group.signals.length} / ${group.totalCount}`}>
                            {group.signals.length}/{group.totalCount}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleGroupCollapse(group.id); }}
                            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-slate-400"
                            title={isCollapsed ? '展开' : '折叠'}
                          >
                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </button>
                          {isGroupSelected && <Eye size={14} className={group.text} />}
                        </div>
                      </div>

                      {!isCollapsed && (
                      <div className={`${isGroupSelected ? 'bg-slate-50 dark:bg-slate-800/40' : 'bg-white dark:bg-slate-900'}`}>
                        {group.signals.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">无匹配信号</div>
                        ) : (
                          group.signals.map(signal => {
                            const isAssigned = assignedSignalSet.has(signal.id);
                            const isConflict = conflictSignalSet.has(signal.id);
                            const isSelected = selectedSignalId === signal.id;
                            const pinsForSignal = signalToPins.get(signal.id) || [];
                            const currentPinId = pinsForSignal[0];
                            const pinBadge = isAssigned ? `Pin ${currentPinId}${pinsForSignal.length > 1 ? '+' : ''}` : null;

                            return (
                              <div
                                key={signal.id}
                                onClick={(e) => { e.stopPropagation(); handleSignalClick(signal.id); }}
                                className={`group flex items-center justify-between px-4 py-2 cursor-pointer border-l-4 transition-colors border-transparent
                                  ${isSelected ? 'bg-blue-100 dark:bg-blue-500/15 !border-blue-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                              >
                                <div className="flex flex-col w-full pr-2 overflow-hidden">
                                  <span className={`text-xs font-medium truncate ${isSelected ? 'text-blue-900 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`} title={signal.name}>{signal.name}</span>
                                  {(isSelected || isGroupSelected) && isConfigMode && (
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate block" title={validMuxMap[signal.id]?.map(id => pinsData.find(p => p.id === id)?.name).filter(Boolean).join(', ')}>
                                      候选引脚: {validMuxMap[signal.id]?.length || 0} 个
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center justify-end flex-shrink-0 gap-2">
                                  {isConflict && (
                                    <AlertTriangle size={14} className="text-rose-500" title="冲突" />
                                  )}
                                  {isAssigned ? (
                                     <div className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-200 text-blue-800 dark:bg-blue-500/25 dark:text-blue-200' : `${group.bg} text-white`}`}>
                                       {pinBadge}
                                     </div>
                                  ) : (
                                    <div className={`w-2 h-2 rounded-full ${isGroupSelected ? 'bg-slate-300 dark:bg-slate-600' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            )}

            {inspectorSide === 'left' && inspectorPanel}

            {/* 中间：芯片可视化 / 表格视图 */}
            {view === 'table' ? (
              <PinTable
                pinsData={pinsData}
                pinMapping={pinMapping}
                customLabels={customLabels}
                selectedPinId={selectedPinId}
                onSelectPin={(id) => setSelectedPinId(id)}
                onUpdatePin={updatePin}
                onUpdateLabel={setPinLabel}
                onClearAssignment={(id) => clearPinAssignment(id)}
                isPower={isPowerPin}
                getSignalName={(sigId) => getSignalById(sigId)?.name || sigId}
                conflictPinIds={conflictPinIds}
              />
            ) : (
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 overflow-hidden relative">
                <div
                  ref={viewportRef}
                  className="absolute inset-0 select-none"
                  style={{
                    touchAction: 'none',
                    overscrollBehavior: 'contain',
                    cursor: isSpaceDown ? (isGesturing ? 'grabbing' : 'grab') : (isGesturing ? 'grabbing' : 'default'),
                  }}
                  onPointerDown={handleViewportPointerDown}
                  onPointerMove={handleViewportPointerMove}
                  onPointerUp={handleViewportPointerUpOrCancel}
                  onPointerCancel={handleViewportPointerUpOrCancel}
                >
                  <div
                    className="absolute"
                    style={{
                      transform: `translate3d(${chipTransform.x}px, ${chipTransform.y}px, 0) scale(${chipTransform.scale})`,
                      transformOrigin: '0 0',
                      willChange: 'transform',
                    }}
                  >
                    <div
                      className="relative bg-white dark:bg-slate-900 rounded-xl shadow-md border border-slate-300 dark:border-slate-700 flex-shrink-0"
                      style={{ width: packageLayout.width, height: packageLayout.height }}
                    >
                      {packageLayout.kind === 'perimeter' && (() => {
                        const bodyW = packageLayout.width - packageLayout.bodyInset * 2;
                        const bodyH = packageLayout.height - packageLayout.bodyInset * 2;
                        const showStats = bodyW >= 320 && bodyH >= 200;
                        const pct = Math.min(100, Math.round((assignedCount / Math.max(chipInfo.pinCount, 1)) * 100));
                        return (
                          <div
                            className="absolute bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg shadow-inner flex flex-col items-center justify-center pointer-events-none overflow-hidden"
                            style={{ left: packageLayout.bodyInset, top: packageLayout.bodyInset, right: packageLayout.bodyInset, bottom: packageLayout.bodyInset }}
                          >
                            <div className="text-slate-500 text-[10px] font-bold tracking-[0.35em] uppercase opacity-90">{chipInfo.manufacturer}</div>
                            <div className="text-slate-200 text-2xl font-black tracking-tight mt-1.5 opacity-90 px-4 text-center truncate max-w-full">{chipInfo.name}</div>
                            <div className="text-slate-500 text-xs font-mono mt-1">{chipInfo.package} · {chipInfo.pinCount} pins</div>

                            {showStats && (
                              <div className="mt-6 w-[72%] max-w-[460px] flex flex-col gap-3">
                                <div>
                                  <div className="flex justify-between items-baseline mb-1.5">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">IO 利用率</span>
                                    <span className="text-[12px] font-mono font-bold text-slate-400">{assignedCount}<span className="text-slate-600"> / {chipInfo.pinCount}</span></span>
                                  </div>
                                  <div className="h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                                    {assignedSignalSet.size} 信号已接入
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-slate-700/70 text-slate-400 text-[10px] font-bold">
                                    {Math.max(0, chipInfo.pinCount - assignedCount)} IO 空闲
                                  </span>
                                  {signalCounts.conflict > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold">
                                      {signalCounts.conflict} 冲突
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {packageLayout.kind === 'dip' && (
                        <div
                          className="absolute bg-slate-800 rounded-lg shadow-inner flex flex-col items-center justify-center pointer-events-none"
                          style={{
                            left: packageLayout.bodyRect.left,
                            top: packageLayout.bodyRect.top,
                            width: packageLayout.bodyRect.width,
                            height: packageLayout.bodyRect.height,
                          }}
                        >
                          <div className="text-slate-400 text-xl font-bold tracking-widest opacity-80">{chipInfo.manufacturer}</div>
                          <div className="text-slate-500 text-base font-bold mt-2 opacity-80">{chipInfo.name}</div>
                          <div className="text-slate-600 text-xs mt-1">{chipInfo.package} {chipInfo.pinCount} pins</div>
                        </div>
                      )}
                      {packageLayout.kind === 'bga' && (
                        <div className="absolute left-3 top-3 text-xs text-slate-500 pointer-events-none">
                          {chipInfo.name} · {chipInfo.package}
                        </div>
                      )}

                      {packageLayout.kind === 'bga' && (
                        <>
                          <div className="absolute pointer-events-none" style={{ left: packageLayout.pinsOrigin.x, top: packageLayout.pad }}>
                            {Array.from({ length: packageLayout.cols }, (_, i) => (
                              <div
                                key={`bga-col-${i}`}
                                className="absolute text-[10px] font-bold text-slate-500 text-center"
                                style={{
                                  width: packageLayout.ball,
                                  left: i * (packageLayout.ball + packageLayout.gap),
                                  top: 0,
                                }}
                              >
                                {i + 1}
                              </div>
                            ))}
                          </div>
                          <div className="absolute pointer-events-none" style={{ left: packageLayout.pad, top: packageLayout.pinsOrigin.y }}>
                            {Array.from({ length: packageLayout.rows }, (_, i) => (
                              <div
                                key={`bga-row-${i}`}
                                className="absolute text-[10px] font-bold text-slate-500 text-center"
                                style={{
                                  width: packageLayout.gutterLeft,
                                  left: 0,
                                  top: i * (packageLayout.ball + packageLayout.gap) + Math.floor(packageLayout.ball * 0.18),
                                }}
                              >
                                {getBgaRowLabel(i)}
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {(packageLayout.kind === 'bga'
                        ? Array.from({ length: packageLayout.cols * packageLayout.rows }, (_, i) => pinsData[i] || null)
                        : pinsData
                      ).map((pin, pinIndex) => {
                        if (!pin) {
                          const style = getPinBoxStyleByIndex(pinIndex);
                          return (
                            <div
                              key={`empty-${pinIndex}`}
                              style={style}
                              className={`absolute ${packageLayout.kind === 'bga' ? 'rounded-full' : 'rounded-sm'} bg-slate-200/40 border border-slate-200`}
                            />
                          );
                        }
                        const id = pin.id;
                        const isPower = isPowerPin(pin);

                        const assignedSignalId = pinMapping[id];
                        const isAssigned = !!assignedSignalId;
                        const assignmentObj = isAssigned && getSignalById(assignedSignalId) ? getSignalById(assignedSignalId) : null;

                        const isHovered = hoveredPin === id;
                        const isValidCandidate = isConfigMode && selectedSignalId && validBallsForSelectedSignal.includes(id);
                        const groupHighlightInfo = isConfigMode && selectedGroupId && !selectedSignalId && groupHighlightBalls.find(h => h.pinId === id);
                        const isAssignedToCurrentGroup = isAssigned && assignmentObj && selectedGroupId === getGroupForSignal(assignedSignalId)?.id;

                        const hasCustomLabel = !!customLabels[id];

                        let bgClass = "bg-slate-200";
                        let borderClass = "border-slate-300";
                        let textClass = "text-slate-500";
                        let opacityClass = "opacity-100";
                        let scaleClass = "";
                        let ringClass = "";

                        if (isPower) {
                          bgClass = "bg-[#f87171] bg-opacity-20";
                          borderClass = "border-red-200";
                          textClass = "text-red-500 font-bold";
                        }

                        if (isConfigMode && (selectedSignalId || selectedGroupId)) {
                          opacityClass = "opacity-25";
                        }

                        if (isValidCandidate) {
                          bgClass = "bg-green-100"; borderClass = "border-green-500"; textClass = "text-green-700 font-bold";
                          ringClass = "ring-2 ring-green-400 ring-offset-2 animate-pulse"; scaleClass = "scale-125 z-20"; opacityClass = "opacity-100";
                        } else if (groupHighlightInfo) {
                          const groupConfig = COLOR_PALETTES.find(c => c.text === signalGroups.find(g => g.id === selectedGroupId)?.text) || COLOR_PALETTES[0];
                          if (isAssignedToCurrentGroup) {
                            bgClass = groupConfig.bg; textClass = "text-white"; borderClass = "border-transparent"; opacityClass = "opacity-100";
                          } else {
                            bgClass = groupConfig.bg; borderClass = groupConfig.border; textClass = "text-white"; opacityClass = "opacity-50";
                            if (isHovered) { opacityClass = "opacity-100"; scaleClass = "scale-125 z-20"; ringClass = `ring-2 ${groupConfig.ring} ring-offset-2`; }
                          }
                        }

                        if (isAssigned && assignmentObj) {
                          if (!selectedGroupId || (selectedGroupId && !isAssignedToCurrentGroup)) {
                            bgClass = assignmentObj.groupColor; borderClass = "border-transparent"; textClass = "text-white font-bold"; opacityClass = "opacity-100";
                            if (isConfigMode && selectedGroupId && !isAssignedToCurrentGroup) opacityClass = "opacity-25";
                          }
                        }

                        // 电源域视图：覆盖信号配色，按供电轨着色
                        if (powerView && !isPower) {
                          const rail = railInfo.railMap.get(id);
                          bgClass = rail ? railInfo.railColorMap[rail] : 'bg-slate-300 dark:bg-slate-600';
                          borderClass = 'border-transparent';
                          textClass = rail ? 'text-white font-bold' : 'text-slate-500 dark:text-slate-300 font-bold';
                          opacityClass = powerFocusRail && rail !== powerFocusRail ? 'opacity-25' : 'opacity-100';
                          scaleClass = '';
                          ringClass = '';
                        }

                        if (hasCustomLabel && !isValidCandidate) {
                          ringClass = "ring-1 ring-amber-400 ring-offset-1";
                          if (!isAssigned && !isPower) {
                            bgClass = "bg-amber-50"; borderClass = "border-amber-300"; textClass = "text-amber-700 font-bold";
                          }
                        }

                        if (id === selectedPinId) {
                          ringClass = "ring-2 ring-blue-500 ring-offset-2"; scaleClass = "scale-125 z-20"; opacityClass = "opacity-100";
                        } else if (isAssigned && pinMapping[id] === selectedSignalId) {
                          ringClass = "ring-2 ring-blue-500 ring-offset-2"; scaleClass = "scale-125 z-20";
                        }

                        const displayLabel = getPinLabelText({
                          id,
                          isHovered,
                          isSelected: id === selectedPinId,
                          isAssigned,
                          assignmentObj,
                          hasCustomLabel,
                        });

                        return (
                          <div
                            key={id}
                            data-pin="true"
                            onClick={() => handlePinClick(id)}
                            onMouseEnter={() => setHoveredPin(id)}
                            onMouseLeave={() => setHoveredPin(null)}
                            style={getPinBoxStyleByIndex(pinIndex)}
                            className={`absolute ${packageLayout.kind === 'bga' ? 'rounded-full' : 'rounded-sm'} flex items-center justify-center overflow-hidden transition-all duration-200
                              border ${borderClass} ${bgClass} ${opacityClass} ${scaleClass} ${ringClass}
                              ${isHovered && !isPower ? `${hoverScaleClass} z-30 shadow-lg cursor-pointer` : isPower ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ padding: 1 }}>
                              {displayLabel && (
                                <span
                                  className={`block max-w-full overflow-hidden whitespace-nowrap tracking-tighter ${textClass} pointer-events-none`}
                                  style={{
                                    fontSize: pinLabelFontSize,
                                    lineHeight: 1,
                                    transformOrigin: 'center',
                                    transform: getPinTextRotationByIndex(pinIndex),
                                  }}
                                >
                                  {displayLabel}
                                </span>
                              )}
                            </div>
                            {hasCustomLabel && <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-amber-500 rounded-full border border-white"></div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 缩放工具条 */}
                <ZoomBar
                  scale={chipTransform.scale}
                  onZoomIn={() => zoomBy(1.25)}
                  onZoomOut={() => zoomBy(0.8)}
                  onFit={fitView}
                  onReset={resetZoom}
                />

                {/* 电源域视图开关 / 图例 */}
                {powerView ? (
                  <div className="absolute top-3 right-3 z-40 w-52 bg-white/95 dark:bg-slate-800/95 backdrop-blur border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                        <Droplets size={13} className="text-blue-500" /> 电源域视图
                      </span>
                      <button
                        onClick={() => { setPowerView(false); setPowerFocusRail(null); }}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded"
                        title="退出电源域视图"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="p-1.5 flex flex-col max-h-64 overflow-y-auto">
                      {railInfo.railList.map(r => (
                        <button
                          key={r.name}
                          onClick={() => setPowerFocusRail(prev => (prev === r.name ? null : r.name))}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors
                            ${powerFocusRail === r.name ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-700/60'}`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${r.dot}`} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 truncate">{r.name}</span>
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0" title="已分配/引脚数">
                            {r.assigned}/{r.total}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-700 text-[9px] text-slate-400 dark:text-slate-500">
                      点击轨道可隔离查看；灰点为未标注供电的引脚
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setPowerView(true)}
                    className="absolute top-3 right-3 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 dark:bg-slate-800/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-md text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                    title="按供电轨给引脚着色"
                  >
                    <Droplets size={13} /> 电源域
                  </button>
                )}

                {/* 悬浮属性卡：跟随引脚，智能避让 */}
                {tooltip && hoveredPin != null && pinsData.find(p => p.id === hoveredPin) && (
                  <div className="absolute pointer-events-none z-50" style={{ left: tooltip.left, top: tooltip.top, width: TOOLTIP_W }}>
                    <div className="relative bg-slate-900 text-white text-sm rounded-xl shadow-2xl p-4 w-full border border-slate-700 backdrop-blur-md bg-opacity-95">
                      <span
                        className="absolute w-3 h-3 bg-slate-900 rotate-45 -translate-y-1/2"
                        style={{ top: tooltip.arrowTop, ...(tooltip.side === 'right' ? { left: -6 } : { right: -6 }) }}
                      />
                      <div className="flex justify-between items-start mb-3 border-b border-slate-700 pb-2">
                        <div>
                          <div className="font-black text-lg text-slate-100">Pin {hoveredPin}</div>
                          <div className="text-blue-400 font-bold">{pinsData.find(p => p.id === hoveredPin)?.name}</div>
                        </div>
                        <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${isPowerPin(pinsData.find(p => p.id === hoveredPin)) ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                          {pinsData.find(p => p.id === hoveredPin)?.type}
                        </span>
                      </div>

                      {customLabels[hoveredPin] && (
                        <div className="mb-3 bg-amber-500/20 border border-amber-500/40 p-2 rounded-lg text-amber-300">
                          <span className="text-amber-500/70 text-[10px] block mb-0.5 flex items-center gap-1"><Tag size={10} /> 自定义标签</span>
                          <div className="font-bold text-sm truncate">{customLabels[hoveredPin]}</div>
                        </div>
                      )}

                      {pinMapping[hoveredPin] ? (
                        <div className="bg-slate-800 p-2 rounded-lg border border-slate-600 mb-2">
                          <span className="text-slate-400 text-[10px] block mb-1">已分配 MUX 功能</span>
                          <div className="font-bold text-sm text-white">
                            {getSignalById(pinMapping[hoveredPin])?.name || pinMapping[hoveredPin]}
                          </div>
                        </div>
                      ) : (
                        <div className="text-slate-500 italic text-xs bg-slate-800/50 p-2 rounded-lg text-center mb-2">当前引脚未分配复用功能</div>
                      )}

                      <div className="text-[10px] text-slate-400 text-center mt-2 pt-2 border-t border-slate-700">
                        点击引脚打开属性面板进行编辑
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {inspectorSide === 'right' && inspectorPanel}
          </>
        )}

      </div>

      {/* 拖拽导入遮罩 */}
      {dragging && (
        <div className="fixed inset-0 z-[105] bg-blue-600/20 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-slate-800 border-2 border-dashed border-blue-500 rounded-2xl px-10 py-8 text-center shadow-2xl">
            <Upload size={36} className="mx-auto text-blue-500 mb-3" />
            <div className="font-bold text-lg text-slate-800 dark:text-slate-100">松开鼠标导入引脚数据</div>
            <div className="text-xs text-slate-400 mt-1">支持 CSV / XLSX，自动识别中文表头与编码</div>
          </div>
        </div>
      )}

      {/* 芯片设置对话框 */}
      {showChipSettings && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[110] p-4" onClick={() => setShowChipSettings(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 pinforge-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Settings size={20} className="text-blue-600 dark:text-blue-400" />
                芯片信息设置
              </h2>
              <button onClick={() => setShowChipSettings(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">芯片名称</label>
                <input
                  type="text"
                  value={chipInfo.name}
                  onChange={(e) => setChipInfo({...chipInfo, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">制造商</label>
                <input
                  type="text"
                  value={chipInfo.manufacturer}
                  onChange={(e) => setChipInfo({...chipInfo, manufacturer: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">封装类型</label>
                <select
                  value={chipInfo.package}
                  onChange={(e) => setChipInfo({...chipInfo, package: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                >
                  {PACKAGES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setInspectorSide(prev => prev === 'right' ? 'left' : 'right'); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition"
              >
                属性面板: {inspectorSide === 'right' ? '右侧' : '左侧'}
              </button>
              <button
                onClick={() => setShowChipSettings(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
