# PinForge

面向任意 MCU 的图形化引脚配置器（Pin Configurator）。支持导入/导出 CSV/XLSX，自动外设分组、引脚复用映射校验，并支持从零创建芯片与手工生成可复用的引脚数据表。

## 特性

- 通用 MCU：不绑定某一颗芯片，按导入数据或手动创建的 pin 数生成芯片图
- 多封装布局：QFP/QFN（四边环形）、DIP（长方形双排）、BGA（球阵矩阵 + 行列坐标）
- 导入数据：支持 CSV / XLSX（默认读取第一张工作表）
- 信号分组：根据复用信号名自动分类（UART/SPI/I2C/ADC/CAN/ETH…）
- 图形化映射：点选引脚进行功能分配，支持组模式/单信号精细模式
- 全局搜索/过滤：按关键字搜索信号；仅看未分配/已分配/冲突
- 手动建库：未导入 CSV 时也可创建封装与 pin 数，编辑每个 pin 的复用字段并导出 CSV 作为“芯片引脚数据表”
- 配置导入导出：导出/导入 JSON（包含 chipInfo、pinsData、mapping、customLabels）

## 快速开始

```bash
npm install
npm run dev
```

然后在浏览器打开 Vite 提示的本地地址。

## 使用方式

### 方式 A：导入已有引脚数据（推荐）

1. 点击右上角 “导入 CSV/XLSX”
2. 左侧会自动生成外设/信号列表
3. 开启“交互配置模式”后，选择信号并在芯片图上点击引脚完成映射
4. 需要保存时：
   - 导出配置（JSON）：保存当前映射 + 自定义标签 + pinsData
   - 导出 CSV：导出 pinsData（可再次导入作为芯片引脚数据表）

### 方式 B：从零创建芯片并生成 CSV

1. 未导入数据时，左侧选择封装类型与 pin 数，点击“生成芯片图”
2. 点击任意 pin，在右侧面板：
   - 编辑管脚名/类型/power
   - 填写复用字段（f0–f7、lp_f0/lp_f1、ana_f0/ana_f1），每格填写一个信号名（例如 UART0_TX）
3. 左侧会自动生成信号列表，可继续做映射验证/分配
4. 点击顶部“导出CSV”，得到可再次导入本工具的引脚数据表

## 数据格式

### pins CSV（可再次导入）

导出的 CSV 列为：

- id, name, type, power
- f0..f7
- lp_f0, lp_f1
- ana_f0, ana_f1

注意：
- f* / lp_* / ana_* 为空表示该 pin 不支持该复用项
- “导出 CSV”仅导出 pinsData（用于描述芯片引脚能力）；当前信号分配结果请用“导出配置（JSON）”

### config JSON（用于保存当前项目）

导出的 JSON 包含：
- chip：芯片信息（name/manufacturer/package/pinCount）
- pinsData：引脚数据（id/name/type/power/复用字段）
- mapping：当前信号分配（pinId -> signalId）
- customLabels：自定义网络标签（pinId -> label）

## 交互提示

- 平移：按住 Space 拖拽，或在空白处拖拽
- 缩放：按住 Alt 滚轮（或 Ctrl 滚轮）
- 属性面板：支持左右停靠（面板右上角按钮切换）

## 技术栈

- React 18 + Vite 5
- Tailwind CSS
- SheetJS (xlsx)（前端解析 Excel）

## 许可

见仓库内 LICENSE。
