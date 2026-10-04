# PinForge

面向任意 MCU 的图形化引脚配置器（Pin Configurator）。支持导入/导出 CSV/XLSX/JSON，自动外设分组、引脚复用映射校验、一键自动排布、设计审查（DRC）、电源域分析、链接分享与代码生成（C 头文件 / GPIO 初始化代码 / Markdown 报告），并支持从零创建芯片与手工生成可复用的引脚数据表。

在线体验：<https://geek2author.github.io/PinForge/> · [功能介绍页](https://geek2author.github.io/PinForge/landing.html)

## 特性

- **通用 MCU**：不绑定某颗芯片，按导入数据或手动创建的 pin 数生成芯片图
- **多封装布局**：QFP/QFN（四边环形）、DIP（双排直插）、BGA（球阵矩阵 + 行列坐标）
- **数据导入**：CSV / XLSX，自动识别中文表头与 GBK 编码，支持拖拽文件到窗口导入；内置 ESP32-P4 / STM32G474 示例一键加载
- **信号分组**：根据复用信号名自动分类（UART/SPI/I2C/ADC/CAN/ETH…），支持搜索、过滤（未分配/已分配/冲突）、分组折叠
- **外设快速添加**：自动从信号表识别外设实例（UART0 = TXD+RXD、SPI2 全家、USB DP/DM、MIPI 差分对、XTAL P/N…），点击一次整组接入
- **一键自动排布**：按"约束最强优先"把全部未分配信号贪心接入空闲合法引脚，随时可撤销
- **设计审查（DRC）**：映射冲突、调试口（JTAG/SWD）占用、差分对完整性、IO 利用率实时检查，发现项一键定位
- **电源域视图**：按供电轨（VDD_LP / VDD_IO_x / VDD_FLASHIO…）给引脚着色，图例可按轨道隔离查看，显示每轨分配进度
- **图形化映射**：点选引脚进行功能分配，支持组模式 / 单信号精细模式；基于复用表的合法性校验，冲突实时标红
- **撤销/重做**：Ctrl+Z / Ctrl+Y，映射、标签、引脚编辑均可回退
- **自动保存**：工作会话自动存入浏览器本地存储，刷新不丢失；支持一键重置项目
- **分享链接**：整个配置 deflate 压缩进 URL（无需服务器），发给同事打开即恢复
- **代码生成**：一键导出 C 头文件（`#define` 引脚宏 + 配置汇总表）、ESP-IDF GPIO 初始化代码、STM32 HAL `MX_GPIO_Init`、Markdown 配置报告
- **多格式导出**：配置 JSON、引脚表 CSV / XLSX、C 头文件、GPIO 初始化代码、Markdown 报告、分享链接
- **表格视图**：芯片图 / 表格双视图切换，表格支持行内批量编辑名称、类型、标签
- **亮暗主题**：完整的暗色模式，跟随系统偏好，手动切换持久化
- **键盘友好**：方向键在画布上逐脚导航，`?` 查看全部快捷键
- **手动建库**：未导入 CSV 时也可创建封装与 pin 数，编辑每个 pin 的复用字段并导出 CSV 作为"芯片引脚数据表"

## 快速开始

```bash
npm install
npm run dev
```

然后在浏览器打开 Vite 提示的本地地址（如 <http://localhost:5173/PinForge/>）。

## 使用方式

### 方式 A：导入已有引脚数据（推荐）

1. 在欢迎页点击「导入引脚数据」，或将 CSV/XLSX 拖入窗口
2. 左侧会自动生成外设/信号列表
3. 开启「配置模式」后，选择信号并在芯片图上点击引脚完成映射
4. 需要保存时通过顶部「导出」菜单：
   - 配置 JSON：映射 + 自定义标签 + pinsData（可再次导入恢复）
   - 引脚表 CSV/XLSX：导出 pinsData（可再次导入作为芯片引脚数据表）
   - C 头文件 / Markdown 报告：生成代码与文档

### 方式 B：从零创建芯片并生成 CSV

1. 欢迎页选择封装类型与 pin 数，点击「生成芯片图」
2. 点击任意 pin，在属性面板：
   - 编辑管脚名/类型/power
   - 填写复用字段（f0–f7、lp_f0/lp_f1、ana_f0/ana_f1），每格填写一个信号名（例如 UART0_TX）
3. 左侧会自动生成信号列表，可继续做映射验证/分配
4. 通过「导出」菜单导出引脚表 CSV，得到可再次导入本工具的引脚数据表

## 数据格式

### pins CSV（可再次导入）

导出的 CSV 列为：

- id, name, type, power
- f0..f7
- lp_f0, lp_f1
- ana_f0, ana_f1

注意：

- f* / lp_* / ana_* 为空表示该 pin 不支持该复用项
- 通用格式下复用列支持 `A/B/C` 斜杠分隔的复合功能，导入时自动拆分为独立信号；含中文的描述列会被自动忽略

### config JSON（用于保存当前项目）

导出的 JSON 包含：

- app/version/savedAt：工具标识与时间
- chip：芯片信息（name/manufacturer/package/pinCount）
- pinsData：引脚数据（id/name/type/power/复用字段）
- mapping：当前信号分配（pinId -> signalId）
- customLabels：自定义网络标签（pinId -> label）

### 生成 C 头文件

```c
/* ---- UART Serial ---- */
#define PIN_USART2_TX             14  /* net: DBG_TX */

static const struct { ... } pinforge_pin_config[] = { ... };
```

按外设类别分节输出 `#define` 宏（自动大写/去特殊字符/去重），并附汇总表便于初始化代码遍历。

### 生成 GPIO 初始化代码

- **ESP-IDF**：`pinforge_gpio_init()`，按推测方向分 `GPIO_MODE_OUTPUT / GPIO_MODE_INPUT` 组调用 `gpio_config()`
- **STM32 HAL**：`MX_PINFORGE_GPIO_Init()`，自动解析 `PA2` 式管脚名、使能对应 GPIO 端口时钟、模拟外设信号设为 `GPIO_MODE_ANALOG`

> 引脚方向按信号名启发式推测（TXD/SCK/MOSI → 输出，RXD/MISO/CTS → 输入，ADC/DAC 类 → 模拟），代码头部已标注"请核对后使用"。

## 交互提示

- 平移：按住 Space 拖拽，或在空白处拖拽
- 缩放：按住 Alt 滚轮（或 Ctrl 滚轮 / 触摸板双指捏合），左下角工具条可精确缩放与适应视图
- 快捷键：`Ctrl+Z/Y` 撤销重做，`Ctrl+S` 导出配置，`F` 适应视图，`Delete` 清除选中引脚，方向键逐脚导航，`?` 查看全部快捷键
- 属性面板：支持左右停靠（面板右上角按钮切换）

## 项目结构

```
├── index.html              # 应用入口（Vite）
├── main.jsx
├── src/
│   ├── App.jsx             # 主应用（状态/交互/布局算法）
│   ├── lib/
│   │   ├── core.js         # 信号分类、分组构建、通用工具
│   │   ├── importer.js     # CSV/XLSX 解析、GBK 解码、复合信号拆分
│   │   ├── presets.js      # 外设实例识别、差分对配对
│   │   ├── drc.js          # 设计规则检查（调试口/差分对/利用率）
│   │   ├── codegen.js      # C 头文件 / GPIO 初始化代码 / Markdown 报告
│   │   ├── share.js        # 分享链接压缩与还原
│   │   ├── storage.js      # 会话与主题本地存储
│   │   ├── samples.js      # 内置示例芯片
│   │   ├── notify.jsx      # 全局 Toast
│   │   └── confirm.jsx     # 全局确认对话框
│   └── components/
│       ├── Welcome.jsx     # 欢迎页
│       ├── PresetPanel.jsx # 外设快速添加面板
│       ├── DrcDrawer.jsx   # 设计审查抽屉
│       ├── PinTable.jsx    # 表格视图
│       ├── ZoomBar.jsx     # 缩放工具条
│       └── ShortcutsModal.jsx
├── public/
│   ├── landing.html        # 功能介绍页（静态）
│   ├── favicon.svg
│   └── samples/            # 示例芯片数据（UTF-8 CSV）
```

## 技术栈

- React 18 + Vite 5
- Tailwind CSS（亮暗双主题）
- SheetJS (xlsx)（前端解析/导出 Excel）
- Lucide Icons

## 许可

见仓库内 LICENSE。
