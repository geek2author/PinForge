// ==========================================
// PinForge 代码生成：C 头文件 / Markdown 报告
// ==========================================
import { isPowerPin } from './core.js';

const sanitizeMacro = (name) =>
  `PIN_${String(name).toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/^_+|_+$/g, '')}`;

// 生成 C 头文件：按外设类别分节的 #define + 汇总表
export function generateCHeader({ chipInfo, pinsData, mapping, customLabels, categoryOf }) {
  const entries = Object.keys(mapping)
    .map(pinId => parseInt(pinId, 10))
    .filter(pinId => !Number.isNaN(pinId) && mapping[pinId])
    .map(pinId => {
      const pin = pinsData.find(p => p.id === pinId);
      const signal = mapping[pinId];
      return {
        pinId,
        pinName: pin?.name || `Pin${pinId}`,
        pinType: pin?.type || '',
        signal,
        net: customLabels[pinId] || null,
        category: categoryOf(signal),
      };
    })
    .sort((a, b) => a.signal.localeCompare(b.signal));

  if (entries.length === 0) return null;

  // 宏名去重
  const used = new Set();
  for (const e of entries) {
    let base = sanitizeMacro(e.signal);
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    e.macro = name;
  }

  const now = new Date();
  const stamp = now.toISOString().replace('T', ' ').substring(0, 19);
  const guard = `PINFORGE_${String(chipInfo.name || 'CHIP').toUpperCase().replace(/[^A-Z0-9]/g, '_')}_PIN_CONFIG_H`;

  const lines = [];
  lines.push(`/*`);
  lines.push(` * PinForge 生成的引脚配置头文件`);
  lines.push(` * 芯片: ${chipInfo.name} (${chipInfo.manufacturer || '-'}) / ${chipInfo.package} ${chipInfo.pinCount} pins`);
  lines.push(` * 分配: ${entries.length} 个信号 / ${entries.length} 个引脚`);
  lines.push(` * 生成时间: ${stamp}`);
  lines.push(` *`);
  lines.push(` * 注意: pinId 为工具内部引脚序号，pinName 为管脚名，net 为自定义网络标签。`);
  lines.push(` */`);
  lines.push(`#ifndef ${guard}`);
  lines.push(`#define ${guard}`);
  lines.push(``);

  const usedCategories = [];
  for (const e of entries) {
    if (!usedCategories.includes(e.category)) usedCategories.push(e.category);
  }
  for (const cat of usedCategories) {
    lines.push(`/* ---- ${cat} ---- */`);
    for (const e of entries.filter(x => x.category === cat)) {
      const pad = Math.max(1, 28 - e.macro.length);
      const net = e.net ? `  /* net: ${e.net} */` : '';
      lines.push(`#define ${e.macro}${' '.repeat(pad)}${e.pinId}${net}`);
    }
    lines.push('');
  }

  lines.push(`/* 引脚配置汇总表（供初始化代码遍历使用） */`);
  lines.push(`static const struct {`);
  lines.push(`    const char *signal;`);
  lines.push(`    const char *pin;`);
  lines.push(`    int         pin_id;`);
  lines.push(`    const char *net;`);
  lines.push(`} pinforge_pin_config[] = {`);
  for (const e of entries) {
    const net = e.net ? `"${e.net.replace(/"/g, "'")}"` : '""';
    lines.push(`    { "${e.signal}", "${e.pinName}", ${e.pinId}, ${net} },`);
  }
  lines.push(`};`);
  lines.push(``);
  lines.push(`#define PINFORGE_PIN_CONFIG_COUNT (sizeof(pinforge_pin_config) / sizeof(pinforge_pin_config[0]))`);
  lines.push(``);
  lines.push(`#endif /* ${guard} */`);
  lines.push('');
  return lines.join('\n');
}

// 生成 Markdown 配置报告
export function generateMarkdownReport({ chipInfo, pinsData, mapping, customLabels, categoryOf }) {
  const assignedIds = Object.keys(mapping)
    .map(pinId => parseInt(pinId, 10))
    .filter(pinId => !Number.isNaN(pinId) && mapping[pinId])
    .sort((a, b) => a - b);

  if (assignedIds.length === 0) return null;

  const now = new Date();
  const stamp = now.toISOString().replace('T', ' ').substring(0, 19);

  const rows = assignedIds.map(pinId => {
    const pin = pinsData.find(p => p.id === pinId);
    const signal = mapping[pinId];
    const net = customLabels[pinId] || '—';
    return `| ${pinId} | ${pin?.name || '-'} | ${pin?.type || '-'} | ${signal} | ${categoryOf(signal)} | ${net} |`;
  });

  const unassignedSignals = [];
  const assignedSet = new Set(assignedIds.map(id => mapping[id]));
  // unassigned 引脚（非电源且无分配）
  const unassignedPins = pinsData.filter(p => !isPowerPin(p) && !mapping[p.id]);

  const md = [];
  md.push(`# ${chipInfo.name} 引脚配置报告`);
  md.push('');
  md.push(`- **芯片**: ${chipInfo.name}（${chipInfo.manufacturer || '-'}）`);
  md.push(`- **封装**: ${chipInfo.package} · ${chipInfo.pinCount} pins`);
  md.push(`- **生成时间**: ${stamp}（由 PinForge 生成）`);
  md.push('');
  md.push(`## 引脚分配（${assignedIds.length} 项）`);
  md.push('');
  md.push(`| 引脚 # | 管脚名 | 类型 | 分配信号 | 类别 | 网络标签 |`);
  md.push(`| --- | --- | --- | --- | --- | --- |`);
  md.push(...rows);
  md.push('');
  md.push(`## 未分配的 IO（${unassignedPins.length} 个）`);
  md.push('');
  if (unassignedPins.length > 0) {
    md.push(`| 引脚 # | 管脚名 | 类型 | 支持信号 |`);
    md.push(`| --- | --- | --- | --- |`);
    for (const p of unassignedPins) {
      const funcs = [p.f0, p.f1, p.f2, p.f3, p.f4, p.f5, p.f6, p.f7, p.lp_f0, p.lp_f1, p.ana_f0, p.ana_f1].filter(Boolean).join(', ') || '—';
      md.push(`| ${p.id} | ${p.name} | ${p.type} | ${funcs} |`);
    }
  } else {
    md.push(`所有 IO 均已分配。`);
  }
  md.push('');
  return md.join('\n');
}
