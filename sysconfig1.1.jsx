import React, { useState, useRef, useMemo } from 'react';
import { Download, RefreshCw, Cpu, CheckCircle, Info, Ban, Edit3, MousePointer, Eye, Upload, AlertCircle, X, Tag, FileJson } from 'lucide-react';

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
  if (sig.includes('GMAC')) return 'Ethernet MAC (GMAC)';
  if (sig.includes('ADC')) return 'Analog-to-Digital (ADC)';
  if (sig.includes('TOUCH')) return 'Touch Sensor';
  if (sig.match(/^MT[A-Z]+$/) || sig.includes('JTAG')) return 'JTAG Debug';
  if (sig.includes('LP_')) return 'Low Power IO (RTC)';
  if (sig.includes('CAM') || sig.includes('CSI')) return 'Camera Interface';
  if (sig.includes('LCD') || sig.includes('DSI')) return 'Display Interface';
  if (sig.includes('UART')) return 'UART Serial';
  if (sig.includes('I2C')) return 'I2C Bus';
  if (sig.includes('SPI') || sig.includes('FSP')) return 'SPI / Flash';
  if (sig.includes('USB')) return 'USB Interface';
  if (sig.includes('I2S')) return 'I2S Audio';
  if (sig.includes('PWM')) return 'PWM Generator';
  if (sig.match(/^GPIO\d+$/)) return 'Basic GPIO';
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
  return pin.type === '电源' || pin.type === 'GND' || pin.name.includes('VDD') || pin.name.includes('GND');
};

// ==========================================
// 2. 主组件 App
// ==========================================
export default function App() {
  const [pinMapping, setPinMapping] = useState({}); // { pinId: signalId }
  const [customLabels, setCustomLabels] = useState({}); // { pinId: string (Custom Label) }
  
  const [selectedSignalId, setSelectedSignalId] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedPinId, setSelectedPinId] = useState(null); // 当前选中的引脚 (用于右侧属性面板)
  const [hoveredPin, setHoveredPin] = useState(null);
  
  const [isConfigMode, setIsConfigMode] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  
  const fileInputRef = useRef(null); // 用于导入 CSV
  const configInputRef = useRef(null); // 用于导入 JSON 配置

  // 初始化 105 个引脚的基础数据
  const [pinsData, setPinsData] = useState(() => Array.from({ length: 105 }, (_, i) => ({
    id: i + 1, name: i === 104 ? 'EPAD (GND)' : `Pin ${i + 1}`, type: i === 104 ? 'GND' : '未知', power: '--'
  })));

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
      if (isPowerPin(pin) || pin.type === '未知') return;
      const funcs = [pin.f0, pin.f1, pin.f2, pin.f3, pin.lp_f0, pin.lp_f1, pin.ana_f0, pin.ana_f1].filter(Boolean);
      
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
  };

  // ------------------------------------------
  // 文件上传处理 (CSV 数据)
  // ------------------------------------------
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const newPinsData = [...pinsData]; 
      let loadedCount = 0;

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const row = parseCSVLine(line);
        if (row.length < 3) continue; 
        const id = parseInt(row[0]);
        if (isNaN(id) || id < 1 || id > 105) continue;

        newPinsData[id - 1] = {
          id: id,
          name: row[1] || `Pin ${id}`,
          type: row[2] || '未知',
          power: cleanField(row[3]) || '--',
          f0: cleanField(row[6]), f1: cleanField(row[8]), f2: cleanField(row[10]), f3: cleanField(row[12]),
          lp_f0: cleanField(row[14]), lp_f1: cleanField(row[16]), ana_f0: cleanField(row[18]), ana_f1: cleanField(row[19])
        };
        loadedCount++;
      }

      if (loadedCount > 0) {
        setPinsData(newPinsData);
        processPinDataToGroups(newPinsData);
        // 注意：导入 CSV 时不再清空现有的配置，允许用户自由安排导入顺序
        setSelectedGroupId(null);
        setSelectedSignalId(null);
        setSelectedPinId(null);
      }
    };
    reader.readAsText(file);
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
    setSelectedPinId(pinId); // 始终触发右侧面板检查器

    if (!isConfigMode) return;
    const pinData = pinsData[pinId - 1];
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
      chip: 'ESP32-P4 (QFN104)',
      mapping: pinMapping,
      customLabels: customLabels,
      details: Object.keys(pinMapping).map(pinId => ({
        pinId: parseInt(pinId),
        pinName: pinsData[parseInt(pinId)-1]?.name || 'Unknown',
        signal: pinMapping[pinId],
        customLabel: customLabels[pinId] || null
      }))
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "esp32p4_pin_config.json";
    a.click();
  };

  const handleClearAll = () => {
    if (confirm("确定要清空所有管脚分配和自定义标签吗？")) {
      setPinMapping({});
      setCustomLabels({});
      setSelectedPinId(null);
    }
  };

  // ------------------------------------------
  // QFN 布局计算函数
  // ------------------------------------------
  const getQfnPinStyle = (id) => {
    if (id === 105) return { left: '25%', top: '25%', width: '50%', height: '50%' };

    const SIZE = 660;   
    const MARGIN = 40;  
    const PITCH = (SIZE - MARGIN * 2) / 27; 
    const PIN_SIZE = 20; 

    let cx, cy;
    if (id <= 26) { cx = MARGIN; cy = MARGIN + id * PITCH; } 
    else if (id <= 52) { cy = SIZE - MARGIN; cx = MARGIN + (id - 26) * PITCH; } 
    else if (id <= 78) { cx = SIZE - MARGIN; cy = SIZE - MARGIN - (id - 52) * PITCH; } 
    else { cy = MARGIN; cx = SIZE - MARGIN - (id - 78) * PITCH; }
    
    return { left: `${cx - PIN_SIZE/2}px`, top: `${cy - PIN_SIZE/2}px`, width: `${PIN_SIZE}px`, height: `${PIN_SIZE}px` };
  };

  const assignedCount = Object.keys(pinMapping).length;

  // ==========================================
  // 3. UI 渲染
  // ==========================================
  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">
      
      {!isDataLoaded && (
        <div className="bg-amber-100 text-amber-800 px-4 py-2 text-sm text-center font-medium shadow-sm flex justify-center items-center gap-2">
          <AlertCircle size={16} /> 请先点击右上角「导入 CSV」加载 ESP32-P4 管脚总览表，以激活智能分组和架构校验。
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Cpu className="text-slate-700" />
            ESP32-P4 Pin Configurator
            <span className="text-xs font-normal text-gray-500 ml-2 bg-gray-100 px-2 py-1 rounded border border-gray-200">QFN104</span>
          </h1>
          
          <div className="flex items-center gap-3">
            {/* 导入 CSV */}
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <button onClick={() => fileInputRef.current.click()} className="text-xs flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded shadow-sm transition font-medium">
              <Upload size={14} /> 导入 CSV
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
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min((assignedCount / 55) * 100, 100)}%` }}></div>
            </div>
            <span>{assignedCount} / 55 (可用GPIO)</span>
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
            <div className="p-8 text-center text-gray-400 text-sm">
              <Upload size={32} className="mx-auto mb-3 opacity-30" />
              导入数据后，系统将自动扫描并生成外设列表 (如 GMAC, ADC, SPI 等)
            </div>
          ) : signalGroups.length === 0 ? (
            <div className="p-8 text-center text-gray-400">未能从 CSV 中提取到有效信号</div>
          ) : (
            signalGroups.map(group => {
              const isGroupSelected = selectedGroupId === group.id;
              return (
                <div key={group.id} className="border-b border-gray-100 last:border-0">
                  <div 
                    onClick={() => handleGroupClick(group.id)}
                    className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-all duration-200 flex justify-between items-center sticky top-0 z-10
                      ${isGroupSelected ? `bg-white text-slate-800 border-l-4 ${group.border} shadow-sm` : `${group.text} bg-slate-50 hover:bg-slate-100 border-l-4 border-transparent`}`}
                  >
                    {group.title}
                    <div className="flex items-center gap-2">
                      <span className="bg-black/5 px-2 py-0.5 rounded-full text-[9px]">{group.signals.length}</span>
                      {isGroupSelected && <Eye size={14} className={group.text} />}
                    </div>
                  </div>
                  
                  <div className={`${isGroupSelected ? 'bg-slate-50' : 'bg-white'}`}>
                    {group.signals.map(signal => {
                      const isAssigned = Object.values(pinMapping).includes(signal.id);
                      const isSelected = selectedSignalId === signal.id;
                      const currentPinId = Object.keys(pinMapping).find(key => pinMapping[key] === signal.id);
                      
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
                              <span className="text-[9px] text-slate-400 mt-0.5 truncate block" title={validMuxMap[signal.id]?.map(id => pinsData[id-1]?.name).join(', ')}>
                                候选引脚: {validMuxMap[signal.id]?.length || 0} 个
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-end flex-shrink-0">
                            {isAssigned ? (
                               <div className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-200 text-blue-800' : `${group.bg} text-white`}`}>
                                 Pin {currentPinId}
                               </div>
                            ) : (
                              <div className={`w-2 h-2 rounded-full ${isGroupSelected ? 'bg-slate-300' : 'bg-slate-200'}`}></div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 中间：QFN104 可视化区 */}
        <div className="flex-1 bg-slate-100 overflow-auto flex justify-center items-center relative">
          
          <div className="relative bg-white w-[660px] h-[660px] rounded-xl shadow-md border border-slate-300 m-8 flex-shrink-0">
            {/* 芯片本体背景与丝印 */}
            <div className="absolute inset-10 bg-slate-800 rounded-lg shadow-inner flex flex-col items-center justify-center pointer-events-none">
              <div className="w-4 h-4 bg-slate-600 rounded-full absolute top-4 left-4"></div>
              <div className="text-slate-400 text-3xl font-black tracking-widest opacity-80">ESPRESSIF</div>
              <div className="text-slate-500 text-lg font-bold mt-2 opacity-80">ESP32-P4</div>
              <div className="text-slate-600 text-sm mt-1">QFN104 (10x10)</div>
            </div>

            {/* 渲染 105 个焊盘 */}
            {pinsData.map(pin => {
              const id = pin.id;
              const isPower = isPowerPin(pin);
              const isEpad = id === 105;
              
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

              // 基础状态
              if (isPower) {
                bgClass = "bg-[#f87171] bg-opacity-20"; 
                borderClass = "border-red-200";
                textClass = "text-red-500 font-bold";
              }

              // Dimming 逻辑
              if (isConfigMode && (selectedSignalId || selectedGroupId)) {
                 opacityClass = "opacity-25";
              }

              // 候选/高亮逻辑
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

              // 已分配状态 (覆盖预览)
              if (isAssigned && assignmentObj) {
                if (!selectedGroupId || (selectedGroupId && !isAssignedToCurrentGroup)) {
                   bgClass = assignmentObj.groupColor; borderClass = "border-transparent"; textClass = "text-white font-bold"; opacityClass = "opacity-100";
                   if (isConfigMode && selectedGroupId && !isAssignedToCurrentGroup) opacityClass = "opacity-25";
                }
              }

              // 如果有自定义标签，赋予特殊的高亮边框 (优先视觉提示)
              if (hasCustomLabel && !isValidCandidate) {
                 ringClass = "ring-1 ring-amber-400 ring-offset-1";
                 if (!isAssigned && !isPower) {
                    bgClass = "bg-amber-50"; borderClass = "border-amber-300"; textClass = "text-amber-700 font-bold";
                 }
              }

              // 激活选中环
              if (id === selectedPinId) {
                ringClass = "ring-2 ring-blue-500 ring-offset-2"; scaleClass = "scale-125 z-20"; opacityClass = "opacity-100";
              } else if (isAssigned && pinMapping[id] === selectedSignalId) {
                ringClass = "ring-2 ring-blue-500 ring-offset-2"; scaleClass = "scale-125 z-20";
              }

              // 显示文本逻辑：自定义标签 > MUX功能 > 引脚号
              let displayLabel = id.toString();
              if (hasCustomLabel) {
                 displayLabel = customLabels[id].substring(0, 6);
              } else if (isAssigned && assignmentObj) {
                 displayLabel = assignmentObj.name.substring(0, 6);
              } else if (isAssigned) {
                 displayLabel = assignedSignalId.substring(0, 6); // 备选：当只导入配置尚未导入CSV时
              }

              return (
                <div
                  key={id}
                  onClick={() => handlePinClick(id)}
                  onMouseEnter={() => setHoveredPin(id)}
                  onMouseLeave={() => setHoveredPin(null)}
                  style={getQfnPinStyle(id)}
                  className={`absolute rounded-sm flex items-center justify-center transition-all duration-200 
                    border ${borderClass} ${bgClass} ${opacityClass} ${scaleClass} ${ringClass}
                    ${isEpad ? '!rounded-xl border-dashed border-slate-500 bg-slate-700/50 hover:bg-slate-600/50' : ''}
                    ${isHovered && !isPower && !isEpad ? 'scale-150 z-30 shadow-lg cursor-pointer' : isPower ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {!isEpad && (
                    <span className={`text-[8px] tracking-tighter ${textClass} pointer-events-none ${isAssigned || hasCustomLabel ? 'rotate-0' : ''}`}
                          style={{ transform: id>26 && id<=78 ? (id<=52 || id>78 ? 'rotate(90deg)' : 'rotate(-90deg)') : 'none' }}>
                      {displayLabel}
                    </span>
                  )}
                  {/* 自定义标签的小红点提示 */}
                  {hasCustomLabel && !isEpad && <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-amber-500 rounded-full border border-white"></div>}
                </div>
              );
            })}
          </div>

          {/* 悬浮 Tooltip 面板 (仅当没有选中该引脚在右侧面板时显示) */}
          {hoveredPin && hoveredPin !== selectedPinId && pinsData[hoveredPin-1] && (
            <div className="absolute bottom-8 right-8 pointer-events-none z-50">
              <div className="bg-slate-900 text-white text-sm rounded-xl shadow-2xl p-4 w-72 border border-slate-700 backdrop-blur-md bg-opacity-95">
                <div className="flex justify-between items-start mb-3 border-b border-slate-700 pb-2">
                  <div>
                    <div className="font-black text-lg text-slate-100">Pin {hoveredPin}</div>
                    <div className="text-blue-400 font-bold">{pinsData[hoveredPin-1].name}</div>
                  </div>
                  <span className={`px-2 py-1 text-[10px] font-bold rounded-md ${isPowerPin(pinsData[hoveredPin-1]) ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    {pinsData[hoveredPin-1].type}
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

        {/* 右侧：引脚属性侧边栏 (Pin Inspector) */}
        {selectedPinId && pinsData[selectedPinId - 1] && (
          <div className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-2xl z-40 transform transition-transform">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h2 className="font-bold text-slate-700 flex items-center gap-2">
                <Edit3 size={16} className="text-blue-600" /> 引脚属性面板
              </h2>
              <button onClick={() => setSelectedPinId(null)} className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded-md hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto">
              
              {/* 基础信息 */}
              <div className="relative">
                <div className="text-4xl font-black text-slate-800 tracking-tight">Pin {selectedPinId}</div>
                <div className="text-xl font-bold text-blue-600 mt-1">{pinsData[selectedPinId-1].name}</div>
                
                <div className="flex gap-2 mt-3">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${isPowerPin(pinsData[selectedPinId-1]) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {pinsData[selectedPinId-1].type}
                  </span>
                  <span className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 text-slate-600 font-mono">
                    PWR: {pinsData[selectedPinId-1].power}
                  </span>
                </div>
              </div>

              <hr className="border-slate-100" />
              
              {/* 自定义标签编辑区 */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase mb-2">
                  <Tag size={14} className="text-amber-500" /> 
                  自定义网络标签 (Net Label)
                </label>
                <input 
                  type="text" 
                  value={customLabels[selectedPinId] || ''} 
                  onChange={(e) => setCustomLabels({...customLabels, [selectedPinId]: e.target.value})}
                  placeholder="例如: MOTOR_PWM_A, ETH_RX0"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow shadow-sm font-medium text-slate-700"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">此标签将优先显示在 QFN 芯片图上，并随配置一并导出。</p>
              </div>

              <hr className="border-slate-100" />

              {/* MUX 分配状态 */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-2">硬件复用功能 (MUX)</label>
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

              {/* 电源/特殊状态警告 */}
              {isPowerPin(pinsData[selectedPinId-1]) && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg flex items-start gap-2">
                  <Ban size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-700 leading-relaxed">
                    这是硬件电源或接地引脚，不可参与数字或模拟的复用分配。
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}