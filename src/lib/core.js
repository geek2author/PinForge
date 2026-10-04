// ==========================================
// PinForge 核心纯逻辑：CSV 解析 / 信号分类 / 分组构建
// ==========================================

export function parseCSVLine(text) {
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

export const cleanField = (val) => {
  if (!val || val === '--' || val === '-' || val === '') return null;
  return val;
};

// 智能分类器：根据信号名称自动归类
export const categorizeSignal = (sig) => {
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
export const COLOR_PALETTES = [
  { bg: 'bg-blue-500', text: 'text-blue-600', ring: 'ring-blue-300', border: 'border-blue-500', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-emerald-300', border: 'border-emerald-500', dot: 'bg-emerald-500' },
  { bg: 'bg-purple-500', text: 'text-purple-600', ring: 'ring-purple-300', border: 'border-purple-500', dot: 'bg-purple-500' },
  { bg: 'bg-orange-500', text: 'text-orange-600', ring: 'ring-orange-300', border: 'border-orange-500', dot: 'bg-orange-500' },
  { bg: 'bg-pink-500', text: 'text-pink-600', ring: 'ring-pink-300', border: 'border-pink-500', dot: 'bg-pink-500' },
  { bg: 'bg-teal-500', text: 'text-teal-600', ring: 'ring-teal-300', border: 'border-teal-500', dot: 'bg-teal-500' },
  { bg: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-300', border: 'border-amber-500', dot: 'bg-amber-500' },
  { bg: 'bg-cyan-500', text: 'text-cyan-600', ring: 'ring-cyan-300', border: 'border-cyan-500', dot: 'bg-cyan-500' },
  { bg: 'bg-indigo-500', text: 'text-indigo-600', ring: 'ring-indigo-300', border: 'border-indigo-500', dot: 'bg-indigo-500' },
];

export const isPowerPin = (pin) => {
  if (!pin) return false;
  return pin.type === '电源' || pin.type === 'Power' || pin.type === 'GND' ||
         pin.name?.includes('VDD') || pin.name?.includes('VCC') ||
         pin.name?.includes('GND') || pin.name?.includes('VSS') ||
         pin.name?.includes('EPAD');
};

// 汇总一个引脚的全部复用信号（f0..f7 / lp_* / ana_*）
export const pinFunctions = (pin) =>
  [pin.f0, pin.f1, pin.f2, pin.f3, pin.f4, pin.f5, pin.f6, pin.f7, pin.lp_f0, pin.lp_f1, pin.ana_f0, pin.ana_f1]
    .filter(Boolean);

// 把引脚数据构建为信号分组 + 复用映射（纯函数）
export function buildPinGroups(data) {
  const muxMap = {}; // { signalName: [pinId1, pinId2] }

  data.forEach(pin => {
    if (isPowerPin(pin) || pin.type === '未知' || pin.type === 'Unknown') return;
    pinFunctions(pin).forEach(f => {
      if (!muxMap[f]) muxMap[f] = [];
      if (!muxMap[f].includes(pin.id)) muxMap[f].push(pin.id);
    });
  });

  const groupsObj = {};
  Object.keys(muxMap).forEach(sig => {
    if (sig.match(/^GPIO\d+$/) || sig.match(/^LP_GPIO\d+$/)) return;
    const category = categorizeSignal(sig);
    if (!groupsObj[category]) groupsObj[category] = [];
    groupsObj[category].push({ id: sig, name: sig, desc: `Available on ${muxMap[sig].length} pins` });
  });

  const groups = Object.keys(groupsObj)
    .sort()
    .map((key, index) => ({
      id: key,
      title: key,
      ...COLOR_PALETTES[index % COLOR_PALETTES.length],
      signals: groupsObj[key].sort((a, b) => a.name.localeCompare(b.name))
    }));

  return { groups, muxMap };
}
