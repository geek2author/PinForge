// ==========================================
// PinForge 设计规则检查（DRC）：冲突之外的工程合理性检查
// ==========================================

const DEBUG_RE = /MTCK|MTDO|MTMS|MTDI|SWDIO|SWCLK|SWO\b|JTMS|JTCK|JTDI|JTDO|NJTRST/i;

function pairPartner(name) {
  if (/DATAP\d+$/i.test(name)) return name.replace(/DATAP(\d+)$/i, 'DATAN$1');
  if (/DATAN\d+$/i.test(name)) return name.replace(/DATAN(\d+)$/i, 'DATAP$1');
  if (/CLKP$/i.test(name)) return name.replace(/CLKP$/i, 'CLKN');
  if (/CLKN$/i.test(name)) return name.replace(/CLKN$/i, 'CLKP');
  if (/DP$/i.test(name)) return name.replace(/DP$/i, 'DM');
  if (/DM$/i.test(name)) return name.replace(/DM$/i, 'DP');
  if (/[ _]P$/i.test(name)) return name.replace(/[ _]P$/i, (m) => (m.startsWith(' ') ? ' N' : '_N'));
  if (/[ _]N$/i.test(name)) return name.replace(/[ _]N$/i, (m) => (m.startsWith(' ') ? ' P' : '_P'));
  return null;
}

const LEVEL_WEIGHT = { error: 0, warn: 1, info: 2 };

/**
 * @returns findings: [{ level: 'error'|'warn'|'info', code, title, detail, signalIds: [] }]
 */
export function runDRC({ pinsData, pinMapping, signals, conflictSignalIds, isPower }) {
  const findings = [];
  const assignedList = Object.values(pinMapping);
  const signalSet = new Set(signals);

  // 1. 映射冲突（每个冲突信号一条，可点击定位）
  for (const sig of conflictSignalIds) {
    findings.push({
      level: 'error',
      code: 'conflict',
      title: `信号 ${sig} 映射冲突`,
      detail: '该信号被分配到不支持它的引脚，或被分配到多个引脚。请点击定位后在芯片图上修正。',
      signalIds: [sig],
    });
  }

  // 2. 调试接口
  const debugAssigned = assignedList.filter(s => DEBUG_RE.test(s));
  const debugAll = signals.filter(s => DEBUG_RE.test(s));
  if (debugAssigned.length > 0) {
    findings.push({
      level: 'warn',
      code: 'debug',
      title: `调试接口信号被占用（${debugAssigned.length} 个）`,
      detail: `${debugAssigned.join('、')} 已被分配。烧录调试（JTAG/SWD）时可能需要这些引脚，请确认板上调试方案。`,
      signalIds: debugAssigned,
    });
  } else if (debugAll.length > 0) {
    findings.push({
      level: 'info',
      code: 'debug-free',
      title: '调试接口信号空闲',
      detail: `${debugAll.length} 个调试信号（${debugAll.join('、')}）未被占用，调试口可用。`,
      signalIds: [],
    });
  }

  // 3. 差分对完整性
  for (const s of assignedList) {
    const partner = pairPartner(s);
    if (partner && signalSet.has(partner) && !assignedList.includes(partner)) {
      findings.push({
        level: 'warn',
        code: 'pair',
        title: `差分对不完整：已分配 ${s}，缺少 ${partner}`,
        detail: '差分信号通常需要成对使用，单独分配一对中的另一半可能导致链路无法工作。',
        signalIds: [s, partner],
      });
    }
  }

  // 4. IO 利用率
  const ioPins = pinsData.filter(p => !isPower(p));
  const used = ioPins.filter(p => pinMapping[p.id]).length;
  findings.push({
    level: 'info',
    code: 'usage',
    title: `IO 利用率 ${used} / ${ioPins.length}`,
    detail: used < ioPins.length ? `还有 ${ioPins.length - used} 个 IO 空闲可用。` : '全部 IO 均已使用。',
    signalIds: [],
  });

  findings.sort((a, b) => LEVEL_WEIGHT[a.level] - LEVEL_WEIGHT[b.level]);
  return findings;
}
