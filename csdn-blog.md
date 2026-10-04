# PinForge：一款通用的 MCU 图形化引脚配置器

## 前言

在嵌入式开发中，引脚配置是一个既重要又繁琐的工作。每个 MCU 都有几十甚至上百个引脚，每个引脚又可能有多个复用功能（MUX）。传统的做法是对着数据手册一张一张看引脚图，记录下每个引脚的分配，不仅效率低，还容易出错。

最近我开发了一个名为 **PinForge** 的工具，旨在解决这个痛点。它是一个完全在浏览器中运行的通用 MCU 引脚配置器，支持多种芯片封装、CSV/XLSX 导入导出、自动信号分组、图形化映射等功能。

## 项目特点

### 1. 通用 MCU 支持

PinForge 不绑定任何特定芯片，你可以：
- 导入现成的引脚数据表（CSV/XLSX）
- 从零开始创建芯片和引脚配置
- 支持 QFP/QFN、DIP、BGA 等多种封装布局

### 2. 智能信号分组

工具会根据信号名称自动进行分类，比如：
- UART/USART 自动归类到「UART Serial」
- SPI/QSPI 归类到「SPI / Flash」
- CAN 信号归类到「CAN Bus」
- ADC/DAC 分别归类

这让你在配置时可以按功能分组快速查找所需信号。

### 3. 图形化配置

- 可视化芯片引脚图，支持缩放和平移
- 点选引脚进行功能分配
- 实时检测引脚冲突
- 支持单信号和组模式配置

### 4. 数据导入导出

- 导入引脚数据表：CSV 或 XLSX（Excel）
- 导出配置：JSON 格式，保存完整的项目状态
- 导出引脚数据表：CSV 格式，可重复使用

## 技术栈

- React 18 + Vite 5
- Tailwind CSS
- SheetJS (xlsx)：前端解析 Excel
- Lucide React：图标库

## 快速上手

### 方式一：导入现有引脚数据

1. 点击右上角「导入 CSV/XLSX」
2. 左侧会自动生成外设/信号列表
3. 开启「交互配置模式」后，选择信号并在芯片图上点击引脚完成映射
4. 保存时可以选择「导出配置（JSON）」或「导出 CSV」

### 方式二：从零创建芯片

1. 未导入数据时，在左侧选择封装类型与引脚数
2. 点击「生成芯片图」
3. 点击任意引脚，在右侧面板编辑管脚名、类型、电源以及复用字段
4. 点击「导出 CSV」，得到可再次导入的引脚数据表

## 核心功能实现

### CSV 解析器

为了正确处理带引号的 CSV 字段，我实现了一个简单的解析器：

```javascript
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
```

### 智能信号分类

通过正则表达式和关键词匹配实现自动分类：

```javascript
const categorizeSignal = (sig) => {
  if (!sig) return 'Unknown';
  if (sig.includes('GMAC') || sig.includes('ETH') || sig.includes('MAC')) return 'Ethernet';
  if (sig.includes('ADC')) return 'Analog-to-Digital (ADC)';
  if (sig.includes('DAC')) return 'Digital-to-Analog (DAC)';
  if (sig.includes('UART') || sig.includes('USART') || sig.includes('LPUART')) return 'UART Serial';
  if (sig.includes('I2C') || sig.includes('IIC')) return 'I2C Bus';
  if (sig.includes('SPI') || sig.includes('FSP') || sig.includes('QSPI')) return 'SPI / Flash';
  // ... 更多分类
  return 'Other Peripherals';
};
```

### 封装布局渲染

支持三种主要封装类型的布局算法：
- **QFP/QFN**：四边环形排列
- **DIP**：双排直插排列
- **BGA**：矩阵排列，带行列坐标

## 使用技巧

- 平移：按住 Space 拖拽，或在空白处拖拽
- 缩放：按住 Alt 滚轮（或 Ctrl 滚轮）
- 属性面板：支持左右停靠（面板右上角按钮切换）
- 搜索过滤：按关键字搜索信号，或按「未分配/已分配/冲突」筛选

## 总结

PinForge 是一个轻量级但功能强大的工具，特别适合：
- 需要快速评估多个芯片方案的场景
- 没有官方配置工具的小众芯片
- 需要创建自定义引脚数据表的情况

所有功能都在浏览器端完成，无需安装任何软件，数据也完全保存在本地。

希望这个工具能帮到同样在嵌入式开发中挣扎的朋友们！如果觉得有用，欢迎 Star 和 Fork。
