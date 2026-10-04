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

// ==========================================
// GPIO 初始化代码生成（方向为启发式推测，注释中已提示核对）
// ==========================================
const DIR_OUT_RE = /TXD|SCK|MOSI|NSS|_CS$|RTS|CLK$|CLKP|_EN$|_OUT$/i;
const DIR_IN_RE = /RXD|MISO|CTS|DM$|DP$|_IN$/i;
const DIR_ANALOG_RE = /ADC|DAC|COMP|OPAMP|TOUCH/i;

function signalDirection(signal) {
  if (DIR_ANALOG_RE.test(signal)) return 'analog';
  if (DIR_OUT_RE.test(signal)) return 'out';
  if (DIR_IN_RE.test(signal)) return 'in';
  return 'unknown';
}

function gatherAssignments({ pinsData, mapping, customLabels }) {
  return Object.keys(mapping)
    .map(pinId => parseInt(pinId, 10))
    .filter(pinId => !Number.isNaN(pinId) && mapping[pinId])
    .map(pinId => {
      const pin = pinsData.find(p => p.id === pinId);
      const signal = mapping[pinId];
      return {
        pinId,
        pinName: pin?.name || `Pin${pinId}`,
        signal,
        net: customLabels[pinId] || null,
        dir: signalDirection(signal),
      };
    })
    .sort((a, b) => a.signal.localeCompare(b.signal));
}

// ESP-IDF 风格 gpio_config 初始化
export function generateIdfGpioInit({ chipInfo, pinsData, mapping, customLabels }) {
  const entries = gatherAssignments({ pinsData, mapping, customLabels });
  if (entries.length === 0) return null;

  const gpioNum = (pinName, pinId) => {
    const m = String(pinName).match(/GPIO\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : pinId;
  };

  const stamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const lines = [];
  lines.push(`/*`);
  lines.push(` * PinForge 生成的 ESP-IDF GPIO 初始化代码`);
  lines.push(` * 芯片: ${chipInfo.name} · 引脚方向为按信号名推测（OUT/IN/未知），请核对后使用！`);
  lines.push(` * 生成时间: ${stamp}`);
  lines.push(` */`);
  lines.push(`#include "driver/gpio.h"`);
  lines.push(``);
  lines.push(`static void pinforge_gpio_init(void)`);
  lines.push(`{`);
  lines.push(`    gpio_config_t io_conf;`);

  for (const dir of ['out', 'in', 'unknown']) {
    const group = entries.filter(e => (dir === 'unknown' ? (e.dir !== 'out' && e.dir !== 'in') : e.dir === dir));
    if (group.length === 0) continue;
    const mode = dir === 'in' ? 'GPIO_MODE_INPUT' : 'GPIO_MODE_OUTPUT';
    const label = dir === 'out' ? '输出' : dir === 'in' ? '输入' : '方向未知（默认输入输出，请核对）';
    lines.push('');
    lines.push(`    /* ---- ${label} ---- */`);
    lines.push(`    io_conf = (gpio_config_t) {`);
    lines.push(`        .pin_bit_mask = ${group.map(e => `(1ULL << ${gpioNum(e.pinName, e.pinId)})`).join(' | ')},`);
    lines.push(`        .mode = ${dir === 'unknown' ? 'GPIO_MODE_INPUT_OUTPUT' : mode},`);
    lines.push(`        .pull_up_en = GPIO_PULLUP_DISABLE,`);
    lines.push(`        .pull_down_en = GPIO_PULLDOWN_DISABLE,`);
    lines.push(`        .intr_type = GPIO_INTR_DISABLE,`);
    lines.push(`    };`);
    lines.push(`    gpio_config(&io_conf);`);
    for (const e of group) {
      const net = e.net ? ` [net: ${e.net}]` : '';
      lines.push(`    /* GPIO${gpioNum(e.pinName, e.pinId)}: ${e.signal}${net} */`);
    }
  }

  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}

// STM32 HAL 风格 MX_GPIO_Init
export function generateStm32HalInit({ chipInfo, pinsData, mapping, customLabels }) {
  const entries = gatherAssignments({ pinsData, mapping, customLabels });
  if (entries.length === 0) return null;

  const parsePin = (pinName) => {
    const m = String(pinName).trim().match(/^P([A-K])(\d{1,2})$/i);
    return m ? { port: m[1].toUpperCase(), num: parseInt(m[2], 10) } : null;
  };

  const stamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const parsed = entries.map(e => ({ ...e, p: parsePin(e.pinName) }));
  const unparsed = parsed.filter(e => !e.p);
  const ports = [...new Set(parsed.filter(e => e.p).map(e => e.p.port))].sort();

  const lines = [];
  lines.push(`/*`);
  lines.push(` * PinForge 生成的 STM32 HAL GPIO 初始化代码`);
  lines.push(` * 芯片: ${chipInfo.name} · 引脚方向为按信号名推测，模拟外设设为 ANALOG，请核对后使用！`);
  lines.push(` * 生成时间: ${stamp}`);
  lines.push(` */`);
  lines.push(`static void MX_PINFORGE_GPIO_Init(void)`);
  lines.push(`{`);
  lines.push(`  GPIO_InitTypeDef GPIO_InitStruct = {0};`);

  if (ports.length > 0) {
    lines.push('');
    lines.push(`  /* GPIO 时钟使能 */`);
    for (const port of ports) {
      lines.push(`  __HAL_RCC_GPIO${port}_CLK_ENABLE();`);
    }
  }

  for (const e of parsed) {
    if (!e.p) continue;
    const net = e.net ? ` [net: ${e.net}]` : '';
    lines.push('');
    lines.push(`  /* ${e.p.port}${e.p.num} -> ${e.signal}${net} */`);
    if (e.dir === 'analog') {
      lines.push(`  GPIO_InitStruct.Pin = GPIO_PIN_${e.p.num};`);
      lines.push(`  GPIO_InitStruct.Mode = GPIO_MODE_ANALOG;`);
      lines.push(`  GPIO_InitStruct.Pull = GPIO_NOPULL;`);
    } else {
      if (e.dir === 'out') {
        lines.push(`  HAL_GPIO_WritePin(GPIO${e.p.port}, GPIO_PIN_${e.p.num}, GPIO_PIN_RESET);`);
        lines.push(`  GPIO_InitStruct.Pin = GPIO_PIN_${e.p.num};`);
        lines.push(`  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;`);
      } else {
        // 输入 / 方向未知：统一输入 + 上拉（未知方向请核对）
        lines.push(`  GPIO_InitStruct.Pin = GPIO_PIN_${e.p.num};`);
        lines.push(`  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;`);
      }
      lines.push(`  GPIO_InitStruct.Pull = GPIO_PULLUP;`);
      lines.push(`  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;`);
    }
    lines.push(`  HAL_GPIO_Init(GPIO${e.p.port}, &GPIO_InitStruct);`);
  }

  for (const e of unparsed) {
    lines.push('');
    lines.push(`  /* 未解析管脚名 "${e.pinName}"（pinId ${e.pinId}，信号 ${e.signal}），请手动配置 */`);
  }

  lines.push(`}`);
  lines.push('');
  return lines.join('\n');
}
