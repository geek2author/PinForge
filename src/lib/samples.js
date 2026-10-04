// ==========================================
// PinForge 内置示例芯片（public/samples/ 下的 UTF-8 CSV）
// ==========================================
const base = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');

export const SAMPLE_CHIPS = [
  {
    id: 'esp32p4',
    name: 'ESP32-P4',
    manufacturer: 'Espressif',
    package: 'QFN',
    desc: '双核 RISC-V · LP GPIO · MIPI · 模拟功能齐全',
    url: `${base}samples/esp32p4_pins.csv`,
    badge: 'Espressif',
  },
  {
    id: 'stm32g474',
    name: 'STM32G474',
    manufacturer: 'ST',
    package: 'LQFP',
    desc: 'Cortex-M4 · 丰富定时器 · 运放/比较器 · CAN-FD',
    url: `${base}samples/stm32g474_pins.csv`,
    badge: 'ST',
  },
];
