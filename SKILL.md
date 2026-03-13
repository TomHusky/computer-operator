---
name: computer-operator
description: |
  视觉驱动的 macOS 电脑操控技能。使用视觉作为核心识别引擎。
  通过截图-分析-操作-验证的闭环流程，精细化控制电脑桌面。
  使用原生 macOS 工具（screencapture, osascript）+ Node.js 实现，支持多显示器、Retina 缩放、中文输入及复杂 IDE 交互。

  触发词：帮我操作电脑、截图看看、点击xxx、打开xxx应用、输入文字、滚动页面、自动化操作、使用分析屏幕
license: MIT
metadata:
  author: Copilot
  version: "2.1"
  platform: macOS
---

# 电脑操控技能 (Computer Operator)

> **⚠️ 重要警告：此技能将真实控制你的鼠标和键盘，操作期间请勿手动操作电脑。**

---

## 核心工作流程

```
╔══════════════════════════════════════════════════════════════╗
║                  电脑操控闭环工作流（二级精准定位）            ║
║                                                              ║
║  用户任务                                                    ║
║      │                                                       ║
║      ▼                                                       ║
║  [1] 环境初始化  ──▶  screen_info.js 获取屏幕参数与比例       ║
║      │                （确定 scale_factor，明确坐标系）       ║
║      ▼                                                       ║
║  [2] 全屏截图    ──▶  screenshot.sh 采集当前视图              ║
║      │               → analyze_screen.js 获取网格与换算指南   ║
║      ▼                                                       ║
║  [3] 区域定位    ──▶  AI 识别目标所在的大致区域 (R1C1~R4C4)    ║
║      │                                                       ║
║      ▼                                                       ║
║  [4] 精准缩放★  ──▶  zoom_region.js 放大目标区域             ║
║      │               → 读取放大图精确定位元素像素坐标         ║
║      ▼                                                       ║
║  [5] 动作执行    ──▶  mouse_action.js (自动处理比例换算)      ║
║      │                keyboard_action.js (支持中文)           ║
║      ▼                                                       ║
║  [6] 验证闭环    ──▶  get_pixel.js 校验颜色或再次截图         ║
║      │                                                       ║
║      └──── 未完成 ──▶ 回到 [2] 继续循环                      ║
║            已完成 ──▶ 汇报任务结果                           ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 第一步：环境自检

在开始任何操作前，必须确保环境已初始化并确认屏幕参数。

1. **自检依赖**:
   如果运行后续脚本出现 `Module Not Found` 或指令缺失，请参照 [README.md](./README.md) 执行 `npm install`。

2. **获取屏幕缩放比例 (scale_factor)**:
   ```bash
   node ./scripts/screen_info.js
   ```
   记录输出中的 `scale_factor` (Retina 屏通常为 2)。
> **⚠️ Retina 规则**：主屏幕截图通常是物理像素（如 2560x1600），而 `osascript` 交互使用逻辑坐标（1280x800）。
> `scale_factor = 物理分辨率 / 逻辑分辨率`。**`mouse_action.js` 已内置自动换算逻辑，建议直接传入截图像素坐标。**

---

## 第二步：截图与分析环境

### 2.1 全屏截图
```bash
bash ./scripts/screenshot.sh
```
保存路径：`/tmp/co_screenshot.png`。使用 `read_file` 查看全貌。

### 2.2 坐标换算指南（必看）
每次截图后运行此脚本，获取最新的坐标映射示例：
```bash
node ./scripts/analyze_screen.js
```

---

## 第三步：精准定位方案（核心）

直接在 2560px 宽的全图上找小图标会导致坐标偏移几像素而点不中。必须使用**二级定位**：

### 3.1 一级：粗定位
利用 `analyze_screen.js` 输出的 4x4 网格识别元素所在象限：
- **R1...R4**：屏幕从顶到底的 25% 步长。
- **C1...C4**：屏幕从左到右的 25% 步长。

### 3.2 二级：区域放大★
识别到大致区域后，对该处进行放大分析：
```bash
# 语法: node zoom_region.js <x> <y> <w> <h>
# 示例: 放大左上角搜索框区域
node ./scripts/zoom_region.js 0 0 400 200
```
读取并分析 `/tmp/co_zoom.png` 以获得**精确到像素**的坐标。

> **坐标回算公式**：`原图坐标 = (放大图坐标 / 2) + 区域起点`
> （`zoom_region.js` 会在输出 JSON 中回显此换算逻辑）。

### 3.3 窗口锁定定位★ (针对非全屏/小窗)
当目标应用不是全屏显示时，直接使用全屏截图网格可能效率较低。优先使用“窗口锁定”：

1. **自动获取窗口范围**：
   ```bash
   node ./scripts/get_window_bounds.js "微信"
   ```
   输出包含 `logical_bounds` (x, y, width, height)。

2. **锁定缩放**：
   将返回的逻辑坐标乘以 `scale_factor` 得到像素坐标，传给 `zoom_region.js`。
   这样得到的 `/tmp/co_zoom.png` 将**只包含目标软件界面**，极大提高识别精度。

3. **视觉边界锁定 (Fallback)**：
   若获取失败，先在全屏截图中观察软件窗口的四角坐标（x1,y1,x2,y2），然后用 `zoom_region.js` 裁切出该窗口区域，后续所有分析仅在窗口区域内进行。

---

## 第四步：任务执行

### 4.1 鼠标动作
所有坐标默认接受**原始全屏截图中的像素坐标**，脚本会自动处理 scale_factor。

```bash
# 单击/双击/右键 (截图像素坐标)
node ./scripts/mouse_action.js click 400 300
node ./scripts/mouse_action.js double_click 400 300
node ./scripts/mouse_action.js right_click 400 300

# 拖拽 (从起点到终点)
node ./scripts/mouse_action.js drag 100 100 500 500

# 滚动 (正数向下，负数向上)
node ./scripts/mouse_action.js scroll 600 400 5
```

### 4.2 键盘动作
支持通过剪贴板完美输入中文及复杂快捷键。

```bash
# 智能输入 (自动检测中英文，输入后按回车)
node ./scripts/keyboard_action.js type_enter "hello world！"

# 快捷键 (command/shift/option/control)
node ./scripts/keyboard_action.js hotkey "command+a"
node ./scripts/keyboard_action.js hotkey "command+v"
```

---

---

## 第五步：特定软件策略：微信/QQ (WeChat/QQ/Lark)

针对社交软件的持续化、自然化交互，采用**“观察-理解-回复”**的循环逻辑。

### 5.1 聊天内容深度识别
当目标是回复消息时，必须先读取上下文：
1. **定位联系人**：在左侧聊天列表定位目标好友/群聊。注意 QQ 的联系人列表与微信略有不同，可能需要点击“消息”图标。
2. **读取气泡文字**：使用 `zoom_region.js` 放大右侧最后几条消息气泡。
3. **理解意图**：分析对方最后一段话的话题（如“约饭”、“代码报错”、“日常寒暄”）。

### 5.2 自然对话原则 (去 AI 感)
为了让回复不生硬，请遵循以下策略：
- **口语化**：避免使用“好的”、“我理解了”等标准 AI 开场。多用“哈喽”、“收到”、“欧克”、“滴滴”或其他符合环境的词汇。
- **表情包/Emoji**：适量使用 Emoji 增加亲和力。
- **上下文关联**：回复必须引用对方提到的关键词。
- **控制长度**：不要回复长篇大论，尽量简短有力，模拟真实人类习惯。

### 5.3 持续交互循环 (Looping)
若用户要求“盯着 QQ/微信并回复”，采用以下逻辑：
```
while (未达到结束条件):
    1. 全屏截图 -> 检查是否有红点、数字跳动或新消息气泡
    2. if 有新消息:
        a. zoom 精确读取新内容
        b. 生成自然、带上下文的回复
        c. keyboard_action.js type_enter 发送
    3. sleep 10~20秒 (社交软件回复通常有延迟，避免操作过频)
```

---

## 第六步：特定软件策略：VS Code & Copilot Chat

针对代码编辑器及 AI 助手（Copilot/Cursor）的交互，采用**“快捷键驱动 + 区域确认”**模式。

### 6.1 快速文件导航
不要通过文件树点击搜索文件，优先使用快捷键：
1. **唤起搜索**：`keyboard_action.js hotkey "command+p"`。
2. **输入文件名**：`keyboard_action.js type_enter "filename.ext"`。
3. **确认打开**：截图确认编辑器已载入目标文件。

### 6.2 Copilot Chat 交互逻辑
当需要通过 Copilot 修改代码时：
1. **唤起行内对话**：选中代码或定位后，`keyboard_action.js hotkey "command+i"`。
2. **输入指令**：`keyboard_action.js type_enter "在此处添加错误处理..."`。
3. **等待生成**：截图观察界面变化。
4. **决策处理 (关键)**：
   - 使用 `zoom_region.js` 放大 Copilot 的操作按钮区（通常在输入框下方）。
   - **识别代码动作**：找到 `Accept` (接受)、`Apply` (应用) 或 `Discard` (放弃)。
   - **识别权限请求**：Copilot 执行脚本或修改环境时会弹出 **“Allow”**、**“Execute”**、**“Trust”** 或 **“Always Allow”** 等安全确认按钮。
   - **执行点击**：根据分析结果点击对应按钮的中心坐标，确保流程不中断。

### 6.3 获取窗口精准范围
VS Code 的 UI 元素（如按钮、状态栏）通常很小，强烈建议配合：
```bash
node ./scripts/get_window_bounds.js "Visual Studio Code"
```
获取窗口位置后，对 Copilot 的对话框区域进行精细缩放。

---

## 第七步：验证与闭环

### 5.1 像素验证
判断某个位置是否变色（如按钮是否被选中，页面是否加载）：
```bash
node ./scripts/get_pixel.js 400 300
```

---

## 依赖说明

| 工具 | 角色 | 路径 |
|------|------|------|
| `screenshot.sh` | 采集 | `scripts/screenshot.sh` |
| `screen_info.js` | 参数 | `scripts/screen_info.js` |
| `mouse_action.js`| 鼠标 | `scripts/mouse_action.js` |
| `keyboard_action.js`| 键盘 | `scripts/keyboard_action.js` |
| `zoom_region.js` | 放大 | `scripts/zoom_region.js` |
| `get_window_bounds.js` | 窗口定位 | `scripts/get_window_bounds.js` |
| `analyze_screen.js` | 换算 | `scripts/analyze_screen.js` |
| `get_pixel.js` | 校验 | `scripts/get_pixel.js` |

---

## 常用 AppleScript 场景
对于应用启动或窗口管理，AppleScript 往往比坐标点击更稳：
- **打开飞书**: `osascript -e 'tell application "Lark" to activate'`
- **前置应用**: `osascript -e 'tell application "System Events" to set frontmost of process "Lark" to true'`
- **获取当前应用**: `osascript -e 'tell application "System Events" to name of first application process whose frontmost is true'`
