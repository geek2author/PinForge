// ==========================================
// PinForge 外设实例识别：从信号名推断可整组添加的外设
// 例如 UART0_TXD_PAD + UART0_RXD_PAD → "UART0"（TXD/RXD）
// ==========================================

const ROLE_RE = /^(TXD\d*|RXD\d*|RXDV|RXER|TXEN|TXER|CTS|RTS|CK\d*|SCK|MOSI|MISO|NSS|CS\d*|SCL|SDA|SMBA|DP|DM|TX|RX|CLKP|CLKN|CLK\d*|MCK|BCK|WS|DQS|WP|HOLD|Q|CMD|D\d*|IO\d+|DATAP\d*|DATAN\d*|DATA\d+|CH\d+N?|BKIN\d*|ETR|P|N)$/i;

export function detectPeripheralPresets(signalNames) {
  const instances = new Map();

  for (const raw of signalNames) {
    const name = String(raw).replace(/_PAD$/i, '').trim();
    if (!name) continue;
    if (/^(LP_)?GPIO\d+$/i.test(name)) continue;
    if (/CHANNEL\d+$/i.test(name)) continue;

    const tokens = name.split(/[\s_]+/);
    if (tokens.length < 2) continue;
    const role = tokens[tokens.length - 1];
    if (!ROLE_RE.test(role)) continue;

    const inst = tokens.slice(0, -1).join(' ');
    if (!inst || /^GPIO$/i.test(inst)) continue;
    if (!instances.has(inst)) instances.set(inst, []);
    const arr = instances.get(inst);
    if (!arr.includes(raw)) arr.push(raw);
  }

  const presets = [];
  for (const [name, signals] of instances) {
    if (signals.length < 2) continue;
    const roles = signals.map(s => s.replace(/_PAD$/i, '').split(/[\s_]+/).pop());
    presets.push({ id: name, name, signals: [...signals].sort(), roles });
  }
  presets.sort((a, b) => a.name.localeCompare(b.name));
  return presets;
}

// 差分对配对：DP↔DM / CLKP↔CLKN / DATAPn↔DATANn / 后缀 P↔N
export function pairPartner(name) {
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
