// ==========================================
// PinForge 数据导入：文件解码 / 行解析 / 引脚构建
// ==========================================
import { parseCSVLine, cleanField } from './core.js';

// 读取文件文本：优先 UTF-8，失败时回退 GBK（中文 Excel 导出的 CSV 常见）
export async function decodeFileText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return new TextDecoder().decode(buf);
    }
  }
}

// 解析 XLSX 工作表为行数组
export async function parseSpreadsheet(arrayBuffer) {
  const mod = await import('xlsx');
  const XLSX = mod.default ?? mod;
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
}

export function parseTextRows(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(parseCSVLine);
}

// 把行数组转换为引脚数据。自动跳过表头（定位第一行为数字序号的行）。
// 兼容两种列布局：
//  - ESP32-P4 风格（≥20 列）：固定位置读取 F0..F3 / LP F0..F1 / 模拟 F0..F1
//  - 通用风格（<20 列）：第 5 列起为功能列表，支持 "A/B/C" 斜杠复合信号拆分
export function buildPinsFromRows(rows) {
  const newPinsData = [];
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
      id,
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
      const funcs = row.slice(4)
        .flatMap(v => String(v).split('/'))
        .map(s => s.trim())
        .map(cleanField)
        .filter(Boolean)
        .filter(f => !/^GPIO$/i.test(f)) // 纯 "GPIO" 主功能无映射意义
        .filter(f => !/[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(f)); // 中文描述列不是信号名
      funcs.slice(0, 8).forEach((f, idx) => { pin[`f${idx}`] = f; });
    }

    newPinsData.push(pin);
  }

  newPinsData.sort((a, b) => a.id - b.id);
  return newPinsData;
}
