import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, Cpu, CheckCircle, Info, Ban, Edit3, MousePointer, Eye, Upload, AlertCircle, X, Tag, FileJson, Settings, ArrowLeftRight, Search, AlertTriangle } from 'lucide-react';

// ==========================================
// 1. CSV 解析与分类核心工具
// ==========================================
function parseCSVLine(text) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const cleanField = (val) => {
  if (!val || val === '--' || val === '-' || val === '') return null;
  return val;
};

// 智能分类器：根据信号名称自动归类
const categorizeSignal = (sig) => {
  if (!sig) return 'Unknown';
  if (sig.includes('GMAC') || sig.includes('ETH') || sig.includes('MAC')) return 'Ethernet';
  if (sig.includes('ADC')) return 'Analog-to-Digital (ADC)';
  if (sig.includes('DAC')) return 'Digital-to-Analog (DAC)';
  if (sig.includes('TOUCH')) return 'Touch Sensor';
  if (sig.includes('JTAG') || sig.includes('SWD') || sig.match(/^MT[A-Z]+$/)) return 'Debug Interface';
  if (sig.includes('LP_') || sig.includes('RTC')) return 'Low Power (RTC)';
  if (sig.includes('CAM') || sig.includes('CSI') || sig.includes('DCMI')) return 'Camera Interface';
  if (sig.includes('LCD') || sig.includes('DSI') || sig.includes('HDMI')) return 'Display Interface';
  if (sig.includes('UART') || sig.includes('USART') || sig.includes('LPUART')) return 'UART Serial';
  if (sig.includes('I2C') || sig.includes('IIC')) return 'I2C Bus';
  if (sig.includes('SPI') || sig.includes('FSP') || sig.includes('QSPI')) return 'SPI / Flash';
  if (sig.includes('USB')) return 'USB Interface';
  if (sig.includes('I2S') || sig.includes('SAI') || sig.includes('PCM')) return 'Audio Interface';
  if (sig.includes('PWM') || sig.includes('TIM')) return 'PWM / Timer';
  if (sig.includes('CAN')) return 'CAN Bus';
  if (sig.match(/^GPIO\d+$/i)) return 'Basic GPIO';
  return 'Other Peripherals';
};

// 预设的 Tailwind 颜色池，用于动态分组
const COLOR_PALETTES = [
  { bg: 'bg-blue-500', text: 'text-blue-600', ring: 'ring-blue-300', border: 'border-blue-500' },
  { bg: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-emerald-300', border: 'border-emerald-500' },
  { bg: 'bg-purple-500', text: 'text-purple-600', ring: 'ring-purple-300', border: 'border-purple-500' },
  { bg: 'bg-orange-500', text: 'text-orange-600', ring: 'ring-orange-300', border: 'border-orange-500' },
  { bg: 'bg-pink-500', text: 'text-pink-600', ring: 'ring-pink-300', border: 'border-pink-500' },
  { bg: 'bg-teal-500', text: 'text-teal-600', ring: 'ring-teal-300', border: 'border-teal-500' },
  { bg: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-300', border: 'border-amber-500' },
  { bg: 'bg-cyan-500', text: 'text-cyan-600', ring: 'ring-cyan-300', border: 'border-cyan-500' },
  { bg: 'bg-indigo-500', text: 'text-indigo-600', ring: 'ring-indigo-300', border: 'border-indigo-500' },
];

const isPowerPin = (pin) => {
  if (!pin) return false;
  return pin.type === '电源' || pin.type === 'Power' || pin.type === 'GND' || 
         pin.name?.includes('VDD') || pin.name?.includes('VCC') || 
         pin.name?.includes('GND') || pin.name?.includes('VSS') ||
         pin.name?.includes('EPAD');
};

// ==========================================
// 2. 主组件 App
// ==========================================
export default function App() {
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
  const [selectedPinId, setSelectedPinId] = useState(null); // 当前选中的引脚 (用于右侧属性面板)
  const [hoveredPin, setHoveredPin] = useState(null);
  const [inspectorSide, setInspectorSide] = useState('right');
  const [signalSearch, setSignalSearch] = useState('');
  const [signalFilter, setSignalFilter] = useState('all');
  const [draftPinCount, setDraftPinCount] = useState(64);
  const [draftPackage, setDraftPackage] = useState('QFP');
  
  const [isConfigMode, setIsConfigMode] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [showChipSettings, setShowChipSettings] = useState(false);
  
  const fileInputRef = useRef(null); // 用于导入 CSV
  const configInputRef = useRef(null); // 用于导入 JSON 配置

  // 初始化空引脚数组
  const [pinsData, setPinsData] = useState([]);

  // 动态生成的信号组和验证映射表
  const [signalGroups, setSignalGroups] = useState([]);
  const [validMuxMap, setValidMuxMap] = useState({});

  // ------------------------------------------
  // 数据处理：将 CSV 数据转化为动态分组
  // ------------------------------------------
  const processPinDataToGroups = (data) => {
    const muxMap = {}; // { signalName: [pinId1, pinId2] }
    
    // 1. 提取所有复用关系
    data.forEach(pin => {
      if (isPowerPin(pin) || pin.type === '未知' || pin.type === 'Unknown') return;
      const funcs = [pin.f0, pin.f1, pin.f2, pin.f3, pin.f4, pin.f5, pin.f6, pin.f7, pin.lp_f0, pin.lp_f1, pin.ana_f0, pin.ana_f1].filter(Boolean);
      
      funcs.forEach(f => {
        if (!muxMap[f]) muxMap[f] = [];
        if (!muxMap[f].includes(pin.id)) muxMap[f].push(pin.id);
      });
    });

    // 2. 将信号分组
    const groupsObj = {};
    Object.keys(muxMap).forEach(sig => {
      if (sig.match(/^GPIO\d+$/) || sig.match(/^LP_GPIO\d+$/)) return; 
      
      const category = categorizeSignal(sig);
      if (!groupsObj[category]) groupsObj[category] = [];
      groupsObj[category].push({ id: sig, name: sig, desc: `Available on ${muxMap[sig].length} pins` });
    });

    // 3. 转换为数组并分配颜色
    const sortedGroups = Object.keys(groupsObj)
      .sort()
      .map((key, index) => ({
        id: key,
        title: key,
        ...COLOR_PALETTES[index % COLOR_PALETTES.length],
        signals: groupsObj[key].sort((a, b) => a.name.localeCompare(b.name))
      }));

    setValidMuxMap(muxMap);
    setSignalGroups(sortedGroups);
    setIsDataLoaded(true);
    
    // 更新芯片信息
    setChipInfo(prev => ({
      ...prev,
      pinCount: data.length
    }));
  };

  // ------------------------------------------
  // 文件上传处理 (CSV / XLSX 数据)
  // ------------------------------------------
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const buildPinsFromRows = (rows) => {
      const newPinsData = [];
      let loadedCount = 0;

      const safeRows = Array.isArray(rows) ? rows : [];
      let startRow = 0;
      for (let i = 0; i < safeRows.length; i++) {
        const r = safeRows[i] || [];
        const id = parseInt(String(r[0] ?? '').trim(), 10);
        if (!Number.isNaN(id) && id >= 1) { startRow = i; break; }
      }

      for (let i = startRow; i < safeRows.length; i++) {
        const rawRow = safeRows[i] || [];
        const row = rawRow.map(v => (v === undefined || v === null) ? '' : String(v).trim());
        if (row.length < 3) continue;

        const id = parseInt(row[0], 10);
        if (Number.isNaN(id) || id < 1) continue;

        const pin = {
          id: id,
          name: row[1] || `Pin ${id}`,
          type: row[2] || 'Unknown',
          power: cleanField(row[3]) || '--'
        };

        if (row.length >= 20) {
          pin.f0 = cleanField(row[6]);
          pin.f1 = cleanField(row[8]);
          pin.f2 = cleanField(row[10]);
          pin.f3 = cleanField(row[12]);
          pin.lp_f0 = cleanField(row[14]);
          pin.lp_f1 = cleanField(row[16]);
          pin.ana_f0 = cleanField(row[18]);
          pin.ana_f1 = cleanField(row[19]);
        } else {
          const funcs = row.slice(4).map(cleanField).filter(Boolean);
          funcs.slice(0, 8).forEach((f, idx) => { pin[`f${idx}`] = f; });
        }

        newPinsData.push(pin);
        loadedCount++;
      }

      if (loadedCount > 0) {
        newPinsData.sort((a, b) => a.id - b.id);
        setPinsData(newPinsData);
        processPinDataToGroups(newPinsData);
        setSelectedGroupId(null);
        setSelectedSignalId(null);
        setSelectedPinId(null);
        didUserTransformRef.current = false;
        setChipTransform({ x: 0, y: 0, scale: 1 });
      } else {
        alert('未能识别到有效的引脚行（第一列需要是数字序号）。');
      }
    };

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        if (ext === 'xlsx' || ext === 'xls') {
          const mod = await import('xlsx');
          const XLSX = mod.default ?? mod;
          const data = event.target.result;
          const wb = XLSX.read(data, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
          buildPinsFromRows(rows);
        } else {
          const text = String(event.target.result || '');
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const rows = lines.map(parseCSVLine);
          buildPinsFromRows(rows);
        }
      } catch (err) {
        alert('导入失败：文件解析出错。请确认文件格式为 CSV 或 XLSX。');
      }
    };

    if (ext === 'xlsx' || ext === 'xls') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    e.target.value = null;
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
          // 恢复引脚分配和标签
          setPinMapping(data.mapping);
          setCustomLabels(data.customLabels || {});
          if (data.pinsData && Array.isArray(data.pinsData) && data.pinsData.length > 0) {
            setPinsData(data.pinsData);
            processPinDataToGroups(data.pinsData);
            didUserTransformRef.current = false;
            setChipTransform({ x: 0, y: 0, scale: 1 });
          }
          // 恢复芯片信息
          if (data.chip) {
            setChipInfo(prev => ({ ...prev, ...data.chip }));
          }
          alert("配置已成功导入恢复！");
        } else {
          alert("导入失败：无法识别该配置文件的结构 (缺少 mapping 数据)。");
        }
      } catch (err) {
        alert("导入失败：文件格式不正确，必须为本工具导出的 JSON 格式。");
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

  const signalCounts = useMemo(() => {
    const total = allSignalsFlat.length;
    const assigned = assignedSignalSet.size;
    const conflict = conflictSignalSet.size;
    const unassigned = Math.max(0, total - assigned);
    return { total, assigned, unassigned, conflict };
  }, [allSignalsFlat.length, assignedSignalSet, conflictSignalSet]);

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

  const handleSignalClick = (signalId) => {
    setIsConfigMode(true);
    setSelectedSignalId(signalId);
    const group = getGroupForSignal(signalId);
    if (group) setSelectedGroupId(group.id);
  };

  const handlePinClick = (pinId) => {
    if (Date.now() - lastPanAtRef.current < 200) return;
    setSelectedPinId(pinId); // 始终触发右侧面板检查器

    if (!isConfigMode) return;
    const pinData = pinsData.find(p => p.id === pinId);
    if (!pinData) return;
    if (isPowerPin(pinData)) return;

    // 模式1：组选择模式下自动分配
    if (selectedGroupId && !selectedSignalId) {
      const currentAssignedSignalId = pinMapping[pinId];
      if (currentAssignedSignalId) {
        const group = getGroupForSignal(currentAssignedSignalId);
        if (group && group.id === selectedGroupId) {
           const newMapping = { ...pinMapping };
           delete newMapping[pinId];
           setPinMapping(newMapping);
           return;
        }
      }
      const highlightInfo = groupHighlightBalls.find(h => h.pinId === pinId);
      if (highlightInfo) {
        const sigId = highlightInfo.signalId;
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
        alert(`芯片架构限制: 信号 ${selectedSignalId} 无法映射到引脚 Pin ${pinId} (${pinData.name})。`);
        return;
      }
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

  const handleExport = () => {
    const exportData = {
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
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${chipInfo.name.toLowerCase().replace(/\s+/g, '_')}_pin_config.json`;
    a.click();
  };

  const handleExportCsv = () => {
    const header = ['id', 'name', 'type', 'power', 'f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'lp_f0', 'lp_f1', 'ana_f0', 'ana_f1'];
    const toCell = (v) => `"${String(v ?? '').replace(/"/g, '')}"`;
    const rows = [
      header,
      ...[...pinsData].sort((a, b) => a.id - b.id).map((p) => ([
        p.id,
        p.name || '',
        p.type || '',
        p.power || '',
        p.f0 || '',
        p.f1 || '',
        p.f2 || '',
        p.f3 || '',
        p.f4 || '',
        p.f5 || '',
        p.f6 || '',
        p.f7 || '',
        p.lp_f0 || '',
        p.lp_f1 || '',
        p.ana_f0 || '',
        p.ana_f1 || '',
      ]))
    ];
    const csv = '\ufeff' + rows.map((r) => r.map(toCell).join(',')).join('\n');
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${chipInfo.name.toLowerCase().replace(/\s+/g, '_')}_pins.csv`;
    a.click();
  };

  const handleClearAll = () => {
    if (confirm("确定要清空所有管脚分配和自定义标签吗？")) {
      setPinMapping({});
      setCustomLabels({});
      setSelectedPinId(null);
    }
  };

  const handleCreateChipFromScratch = () => {
    const n = Math.max(1, Math.min(1024, parseInt(draftPinCount, 10) || 0));
    const nextPins = Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      name: `Pin ${i + 1}`,
      type: 'IO',
      power: '--',
      f0: null, f1: null, f2: null, f3: null, f4: null, f5: null, f6: null, f7: null,
      lp_f0: null, lp_f1: null, ana_f0: null, ana_f1: null,
    }));

    setChipInfo((prev) => ({ ...prev, package: draftPackage, pinCount: n }));
    setPinsData(nextPins);
    processPinDataToGroups(nextPins);
    setIsConfigMode(true);
    setSelectedGroupId(null);
    setSelectedSignalId(null);
    setSelectedPinId(null);
    didUserTransformRef.current = false;
    setChipTransform({ x: 0, y: 0, scale: 1 });
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
      const cols = Math.max(1, Math.ceil(Math.sqrt(totalPins)));
      const rows = Math.max(1, Math.ceil(totalPins / cols));

      const gutter = Math.max(22, Math.floor(base * 0.035));
      const gutterTop = gutter;
      const gutterLeft = gutter;

      const availableW = maxW - pad * 2 - gutterLeft;
      const availableH = maxH - pad * 2 - gutterTop;

      let gap = totalPins > 400 ? 2 : totalPins > 200 ? 3 : 6;
      const fitBallW = Math.floor((availableW - gap * Math.max(cols - 1, 1)) / cols);
      const fitBallH = Math.floor((availableH - gap * Math.max(rows - 1, 1)) / rows);
      let ball = Math.max(8, Math.min(fitBallW, fitBallH));

      gap = Math.max(2, Math.min(gap, Math.floor(ball * 0.55)));

      const gridW = cols * ball + gap * Math.max(cols - 1, 1);
      const gridH = rows * ball + gap * Math.max(rows - 1, 1);
      const width = pad * 2 + gutterLeft + gridW;
      const height = pad * 2 + gutterTop + gridH;
      const pinsOrigin = { x: pad + gutterLeft, y: pad + gutterTop };
      return { kind, pad, gap, cell: ball, width, height, cols, rows, ball, gutterTop, gutterLeft, pinsOrigin };
    }

    const maxSize = Math.min(maxW, maxH);
    const cellsPerSide = Math.max(2, Math.ceil((totalPins + 4) / 4));
    let gap = totalPins > 120 ? 3 : totalPins > 80 ? 4 : 6;
    let cell = totalPins > 120 ? 14 : totalPins > 80 ? 16 : 20;

    const fitCell = (c, g) => {
      const usable = maxSize - pad * 2 - g * (cellsPerSide - 1);
      return Math.floor(usable / cellsPerSide);
    };

    cell = Math.min(cell, fitCell(cell, gap));
    if (cell < 10) {
      gap = Math.max(2, Math.floor((maxSize - pad * 2 - cellsPerSide * 10) / Math.max(cellsPerSide - 1, 1)));
      cell = fitCell(10, gap);
    }

    cell = Math.max(10, cell);
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
    if (idx < topLen + rightLen + bottomLen) return { row: n - 1, col: (n - 1) - (idx - (topLen + rightLen)), side: 'bottom' };
    if (idx < topLen + rightLen + bottomLen + leftLen) return { row: (n - 2) - (idx - (topLen + rightLen + bottomLen)), col: 0, side: 'left' };
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

  const updatePin = (pinId, patch) => {
    setPinsData(prev => prev.map(p => (p.id === pinId ? { ...p, ...patch } : p)));
  };

  useEffect(() => {
    if (!isDataLoaded) return;
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDataLoaded]);

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
  }, []);

  useEffect(() => {
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

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
    const el = viewportRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const layoutW = packageLayout.width;
    const layoutH = packageLayout.height;
    if (!layoutW || !layoutH || rect.width <= 0 || rect.height <= 0) return;

    setChipTransform((prev) => {
      if (didUserTransformRef.current) return prev;
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const fitScale = clamp(Math.min((rect.width - 24) / layoutW, (rect.height - 24) / layoutH), 0.25, 4);
      return {
        x: (rect.width - layoutW * fitScale) / 2,
        y: (rect.height - layoutH * fitScale) / 2,
        scale: fitScale,
      };
    });
  }, [isDataLoaded, packageLayout.width, packageLayout.height, viewportSize.width, viewportSize.height]);

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
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
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
  // 3. UI 渲染
  // ==========================================
  const inspectorPanel = selectedPinId && pinsData.find(p => p.id === selectedPinId) ? (
    <div className={`w-80 bg-white ${inspectorSide === 'right' ? 'border-l' : 'border-r'} border-slate-200 flex flex-col shadow-2xl z-40 transform transition-transform`}>
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
        <h2 className="font-bold text-slate-700 flex items-center gap-2">
          <Edit3 size={16} className="text-blue-600" /> 引脚属性
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInspectorSide(prev => prev === 'right' ? 'left' : 'right')}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded-md hover:bg-slate-200"
            title={inspectorSide === 'right' ? '移动到左侧' : '移动到右侧'}
          >
            <ArrowLeftRight size={16} />
          </button>
          <button onClick={() => setSelectedPinId(null)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-slate-200">
            <X size={16} />
          </button>
        </div>
      </div>
      
      <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto">
        
        <div className="relative">
          <div className="text-4xl font-black text-slate-800 tracking-tight">Pin {selectedPinId}</div>
          <div className="text-xl font-bold text-blue-600 mt-1">{pinsData.find(p => p.id === selectedPinId)?.name}</div>
          
          <div className="flex gap-2 mt-3">
            <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${isPowerPin(pinsData.find(p => p.id === selectedPinId)) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {pinsData.find(p => p.id === selectedPinId)?.type}
            </span>
            <span className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-600 font-mono">
              PWR: {pinsData.find(p => p.id === selectedPinId)?.power}
            </span>
          </div>
        </div>

        <hr className="border-slate-100" />
        
        <div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase mb-2">
            <Tag size={14} className="text-amber-500" /> 
            自定义标签
          </label>
          <input 
            type="text" 
            value={customLabels[selectedPinId] || ''} 
            onChange={(e) => setCustomLabels({...customLabels, [selectedPinId]: e.target.value})}
            placeholder="输入自定义标签..."
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow shadow-sm font-medium text-slate-700"
          />
        </div>

        <hr className="border-slate-100" />

        <div className="flex flex-col gap-3">
          <label className="block text-xs font-bold text-slate-600 uppercase">管脚自定义</label>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">管脚名</label>
            <input
              type="text"
              value={pinsData.find(p => p.id === selectedPinId)?.name || ''}
              onChange={(e) => updatePin(selectedPinId, { name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">类型</label>
            <input
              type="text"
              value={pinsData.find(p => p.id === selectedPinId)?.type || ''}
              onChange={(e) => updatePin(selectedPinId, { type: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">电源/属性</label>
            <input
              type="text"
              value={pinsData.find(p => p.id === selectedPinId)?.power || ''}
              onChange={(e) => updatePin(selectedPinId, { power: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
            />
          </div>
        </div>

        <hr className="border-slate-100" />

        <div className="flex flex-col gap-3">
          <label className="block text-xs font-bold text-slate-600 uppercase">复用功能 (MUX)</label>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={`f${i}`}>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">{`f${i}`}</label>
                <input
                  type="text"
                  value={pinsData.find(p => p.id === selectedPinId)?.[`f${i}`] || ''}
                  onChange={(e) => updatePin(selectedPinId, { [`f${i}`]: e.target.value || null })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
                  placeholder="例如: UART0_TX"
                />
              </div>
            ))}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">lp_f0</label>
              <input
                type="text"
                value={pinsData.find(p => p.id === selectedPinId)?.lp_f0 || ''}
                onChange={(e) => updatePin(selectedPinId, { lp_f0: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">lp_f1</label>
              <input
                type="text"
                value={pinsData.find(p => p.id === selectedPinId)?.lp_f1 || ''}
                onChange={(e) => updatePin(selectedPinId, { lp_f1: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">ana_f0</label>
              <input
                type="text"
                value={pinsData.find(p => p.id === selectedPinId)?.ana_f0 || ''}
                onChange={(e) => updatePin(selectedPinId, { ana_f0: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">ana_f1</label>
              <input
                type="text"
                value={pinsData.find(p => p.id === selectedPinId)?.ana_f1 || ''}
                onChange={(e) => updatePin(selectedPinId, { ana_f1: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono"
              />
            </div>
          </div>
          <div className="text-[11px] text-slate-500 leading-relaxed">
            手动创建芯片时，在这里填每个管脚支持的信号名称；左侧会自动生成外设/信号列表，导出CSV后可再次导入。
          </div>
        </div>

        <hr className="border-slate-100" />

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase mb-2">功能分配</label>
          {pinMapping[selectedPinId] ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-[10px] text-blue-500 uppercase font-bold mb-1">当前已分配</div>
              <div className="font-bold text-blue-900 text-base break-words">
                {getSignalById(pinMapping[selectedPinId])?.name || pinMapping[selectedPinId]}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <span className="text-slate-400 text-sm">暂无分配</span>
              {isConfigMode && (
                <p className="text-xs text-slate-400 mt-2">请在左侧列表选择信号后点击分配</p>
              )}
            </div>
          )}
        </div>

        {isPowerPin(pinsData.find(p => p.id === selectedPinId)) && (
          <div className="bg-red-50 border border-red-200 p-3 rounded-lg flex items-start gap-2">
            <Ban size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div className="text-xs text-red-700 leading-relaxed">
              这是电源/接地引脚，不可分配复用功能
            </div>
          </div>
        )}

      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      
      {!isDataLoaded && (
        <div className="bg-amber-100 text-amber-800 px-4 py-2 text-sm text-center font-medium shadow-sm flex justify-center items-center gap-2">
          <AlertCircle size={16} /> 请点击右上角「导入 CSV」加载芯片引脚数据。
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="text-slate-700" />
            {chipInfo.name}
            {isDataLoaded && (
              <span className="text-xs font-normal text-gray-500 ml-2 bg-gray-100 px-2 py-1 rounded border border-gray-200">
                {chipInfo.package} {chipInfo.pinCount} pins
              </span>
            )}
            <button 
              onClick={() => setShowChipSettings(true)}
              className="text-xs flex items-center gap-1 px-2 py-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition">
              <Settings size={14} />
            </button>
          </h1>
          
          <div className="flex items-center gap-3">
            {/* 导入 CSV */}
            <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <button onClick={() => fileInputRef.current.click()} className="text-xs flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow-sm transition font-medium">
              <Upload size={14} /> 导入 CSV/XLSX
            </button>

            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {/* 交互模式开关 */}
            <button 
              onClick={() => isDataLoaded && setIsConfigMode(!isConfigMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold transition-all ${!isDataLoaded ? 'opacity-50 cursor-not-allowed bg-gray-100' : isConfigMode ? 'bg-blue-600 border-blue-600 text-white shadow-md ring-2 ring-blue-200' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            >
              {isConfigMode ? <Edit3 size={14} /> : <MousePointer size={14} />}
              {isConfigMode ? "交互配置模式 (ON)" : "浏览模式 (View Only)"}
            </button>

            <div className="h-6 w-px bg-gray-300 mx-1"></div>

            {/* 配置文件的导入导出与清空 */}
            <input type="file" accept=".json" ref={configInputRef} onChange={handleConfigImport} className="hidden" />
            <div className="flex bg-slate-100 rounded-md p-1 border border-slate-200">
              <button onClick={() => configInputRef.current.click()} className="text-xs flex items-center gap-1 px-3 py-1.5 hover:bg-white text-slate-700 rounded transition font-medium">
                <FileJson size={14} /> 导入配置
              </button>
              <button onClick={handleExport} className="text-xs flex items-center gap-1 px-3 py-1.5 hover:bg-white text-slate-700 rounded transition font-medium">
                <Download size={14} /> 导出配置
              </button>
              <button onClick={handleExportCsv} className="text-xs flex items-center gap-1 px-3 py-1.5 hover:bg-white text-slate-700 rounded transition font-medium">
                <Download size={14} /> 导出CSV
              </button>
            </div>

            <button onClick={handleClearAll} className="text-xs flex items-center gap-1 px-3 py-2 border rounded hover:bg-red-50 text-red-600 border-red-200 transition">
              <RefreshCw size={14} /> 清空
            </button>
          </div>
        </div>

        {/* 状态栏 */}
        <div className="flex items-center gap-6 text-xs text-gray-600 bg-gray-50 px-4 py-2 rounded-md border border-gray-100">
          <div className="flex items-center gap-2">
            <span className="font-bold">已分配引脚:</span>
            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min((assignedCount / Math.max(chipInfo.pinCount, 1)) * 100, 100)}%` }}></div>
            </div>
            <span>{assignedCount} / {chipInfo.pinCount}</span>
          </div>

          {isConfigMode && (
            <div className="flex items-center gap-2 text-blue-700 font-medium ml-auto animate-pulse">
              <Info size={14} />
              {selectedGroupId && !selectedSignalId 
                ? `组模式: 点击 QFN 引脚图上高亮的焊盘，自动绑定到组内空闲信号。`
                : selectedSignalId 
                  ? `精细映射: 正在为 [${selectedSignalId}] 选择引脚...` 
                  : "请在左侧菜单选择要分配的外设或信号。"}
            </div>
          )}
        </div>
      </header>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* 左侧：智能分类列表 */}
        <div className="w-[340px] bg-white border-r border-gray-200 flex flex-col overflow-y-auto z-10 shadow-sm">
          {!isDataLoaded ? (
            <div className="p-6 flex flex-col gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="font-bold text-slate-800 mb-2">手动创建芯片</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-600 mb-1">封装</div>
                    <select
                      value={draftPackage}
                      onChange={(e) => setDraftPackage(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      <option value="QFP">QFP</option>
                      <option value="QFN">QFN</option>
                      <option value="BGA">BGA</option>
                      <option value="TQFP">TQFP</option>
                      <option value="LQFP">LQFP</option>
                      <option value="SOIC">SOIC</option>
                      <option value="DIP">DIP</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-slate-600 mb-1">Pin 数</div>
                    <input
                      type="number"
                      min={1}
                      max={1024}
                      value={draftPinCount}
                      onChange={(e) => setDraftPinCount(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={handleCreateChipFromScratch}
                  className="mt-3 w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold text-sm"
                >
                  生成芯片图
                </button>
                <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                  生成后可在右侧面板编辑管脚名/类型/复用功能，最后点击顶部“导出CSV”生成可再次导入的配置文件。
                </div>
              </div>

              <div className="p-6 text-center text-gray-400 text-sm rounded-lg border border-dashed border-slate-200">
                <Upload size={28} className="mx-auto mb-3 opacity-30" />
                也可以直接导入 CSV/XLSX，让系统自动生成外设列表
              </div>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 p-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={signalSearch}
                    onChange={(e) => setSignalSearch(e.target.value)}
                    placeholder="搜索信号（名称/关键字）"
                    className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                  {signalSearch && (
                    <button
                      onClick={() => setSignalSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 rounded"
                      title="清空"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="flex bg-slate-100 rounded-md p-1 border border-slate-200">
                    <button
                      onClick={() => setSignalFilter('all')}
                      className={`text-[11px] font-bold px-2 py-1 rounded ${signalFilter === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      全部
                    </button>
                    <button
                      onClick={() => setSignalFilter('unassigned')}
                      className={`text-[11px] font-bold px-2 py-1 rounded ${signalFilter === 'unassigned' ? 'bg-white shadow text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      未分配
                    </button>
                    <button
                      onClick={() => setSignalFilter('assigned')}
                      className={`text-[11px] font-bold px-2 py-1 rounded ${signalFilter === 'assigned' ? 'bg-white shadow text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      已分配
                    </button>
                    <button
                      onClick={() => setSignalFilter('conflict')}
                      className={`text-[11px] font-bold px-2 py-1 rounded ${signalFilter === 'conflict' ? 'bg-white shadow text-slate-800' : 'text-slate-600 hover:text-slate-800'}`}
                    >
                      冲突
                    </button>
                  </div>
                  <div className="ml-auto text-[10px] text-slate-500 whitespace-nowrap">
                    总{signalCounts.total} 未{signalCounts.unassigned} 已{signalCounts.assigned} 冲{signalCounts.conflict}
                  </div>
                </div>
              </div>

              {signalGroups.length === 0 ? (
                <div className="p-8 text-center text-gray-400">未能从 CSV 中提取到有效信号</div>
              ) : filteredSignalGroups.length === 0 ? (
                <div className="p-8 text-center text-gray-400">无匹配信号</div>
              ) : (
                filteredSignalGroups.map(group => {
                  const isGroupSelected = selectedGroupId === group.id;
                  return (
                    <div key={group.id} className="border-b border-gray-100 last:border-0">
                      <div 
                        onClick={() => handleGroupClick(group.id)}
                        className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all duration-200 flex justify-between items-center sticky top-[92px] z-10
                          ${isGroupSelected ? `bg-white text-slate-800 border-l-4 ${group.border} shadow-sm` : `${group.text} bg-slate-50 hover:bg-slate-100 border-l-4 border-transparent`}`}
                      >
                        {group.title}
                        <div className="flex items-center gap-2">
                          <span className="bg-black/5 px-2 py-0.5 rounded-full text-[9px]" title={`${group.signals.length} / ${group.totalCount}`}>
                            {group.signals.length}/{group.totalCount}
                          </span>
                          {isGroupSelected && <Eye size={14} className={group.text} />}
                        </div>
                      </div>
                      
                      <div className={`${isGroupSelected ? 'bg-slate-50' : 'bg-white'}`}>
                        {group.signals.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-slate-400">无匹配信号</div>
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
                                  ${isSelected ? `bg-blue-100 !border-blue-600` : 'hover:bg-slate-100'}
                                  ${isGroupSelected && !isSelected ? 'opacity-100' : ''}`}
                              >
                                <div className="flex flex-col w-full pr-2 overflow-hidden">
                                  <span className={`text-xs font-medium truncate ${isSelected ? 'text-blue-900' : 'text-slate-700'}`} title={signal.name}>{signal.name}</span>
                                  {(isSelected || isGroupSelected) && isConfigMode && (
                                    <span className="text-[9px] text-slate-400 mt-0.5 truncate block" title={validMuxMap[signal.id]?.map(id => pinsData.find(p => p.id === id)?.name).filter(Boolean).join(', ')}>
                                      候选引脚: {validMuxMap[signal.id]?.length || 0} 个
                                    </span>
                                  )}
                                </div>
                                
                                <div className="flex items-center justify-end flex-shrink-0 gap-2">
                                  {isConflict && (
                                    <AlertTriangle size={14} className="text-rose-500" title="冲突" />
                                  )}
                                  {isAssigned ? (
                                     <div className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-200 text-blue-800' : `${group.bg} text-white`}`}>
                                       {pinBadge}
                                     </div>
                                  ) : (
                                    <div className={`w-2 h-2 rounded-full ${isGroupSelected ? 'bg-slate-300' : 'bg-slate-200'}`}></div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {inspectorSide === 'left' && inspectorPanel}

        {/* 中间：芯片可视化区 */}
        <div className="flex-1 bg-slate-100 overflow-hidden relative">
          {!isDataLoaded ? (
            <div className="text-center text-gray-400">
              <Cpu size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">请导入CSV数据以开始</p>
            </div>
          ) : (
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
                  className="relative bg-white rounded-xl shadow-md border border-slate-300 flex-shrink-0"
                  style={{ width: packageLayout.width, height: packageLayout.height }}
                >
                  {packageLayout.kind === 'perimeter' && (
                    <div
                      className="absolute bg-slate-800 rounded-lg shadow-inner flex flex-col items-center justify-center pointer-events-none"
                      style={{ left: packageLayout.bodyInset, top: packageLayout.bodyInset, right: packageLayout.bodyInset, bottom: packageLayout.bodyInset }}
                    >
                      <div className="text-slate-400 text-2xl font-bold tracking-widest opacity-80">{chipInfo.manufacturer}</div>
                      <div className="text-slate-500 text-lg font-bold mt-2 opacity-80">{chipInfo.name}</div>
                      <div className="text-slate-600 text-sm mt-1">{chipInfo.package} {chipInfo.pinCount} pins</div>
                    </div>
                  )}
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
          )}

          {/* 悬浮 Tooltip 面板 (仅当没有选中该引脚在右侧面板时显示) */}
          {hoveredPin && hoveredPin !== selectedPinId && pinsData.find(p => p.id === hoveredPin) && (
            <div className="absolute bottom-8 right-8 pointer-events-none z-50">
              <div className="bg-slate-900 text-white text-sm rounded-xl shadow-2xl p-4 w-72 border border-slate-700 backdrop-blur-md bg-opacity-95">
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
                    <div className={`font-bold text-sm ${getSignalById(pinMapping[hoveredPin])?.groupTextColor.replace('text-','text-white ') || 'text-white'}`}>
                      {getSignalById(pinMapping[hoveredPin])?.name || pinMapping[hoveredPin]}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 italic text-xs bg-slate-800/50 p-2 rounded-lg text-center mb-2">当前引脚未分配复用功能</div>
                )}

                <div className="text-[10px] text-slate-400 text-center mt-2 pt-2 border-t border-slate-700">
                  👆 点击引脚在右侧打开属性面板以编辑
                </div>
              </div>
            </div>
          )}
        </div>
        {inspectorSide === 'right' && inspectorPanel}

      </div>

      {/* 芯片设置对话框 */}
      {showChipSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Settings size={20} />
                芯片信息设置
              </h2>
              <button onClick={() => setShowChipSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">芯片名称</label>
                <input 
                  type="text" 
                  value={chipInfo.name}
                  onChange={(e) => setChipInfo({...chipInfo, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">制造商</label>
                <input 
                  type="text" 
                  value={chipInfo.manufacturer}
                  onChange={(e) => setChipInfo({...chipInfo, manufacturer: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">封装类型</label>
                <select 
                  value={chipInfo.package}
                  onChange={(e) => setChipInfo({...chipInfo, package: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="QFP">QFP</option>
                  <option value="QFN">QFN</option>
                  <option value="BGA">BGA</option>
                  <option value="TQFP">TQFP</option>
                  <option value="LQFP">LQFP</option>
                  <option value="SOIC">SOIC</option>
                  <option value="DIP">DIP</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
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
