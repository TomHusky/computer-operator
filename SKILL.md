---
name: computer-operator
description: |
  视觉驱动的 macOS 电脑操控通用技能。
  基于“观察-理解-规划-执行”的闭环，通过视觉识别任何 App 的 UI 并进行精准操作。
  **核心语义理解：此技能运行在 Apple macOS 系统上。AI 应识别标准的 macOS 元素，如顶栏菜单 (Menu Bar)、底栏 (Dock)、红黄绿窗口控制按钮。**
  支持多显示器、Retina 缩放、复杂 UI 元素识别。

  触发词：帮我操作电脑、截图看看、点击xxx、打开xxx、输入文字、自动化操作
license: MIT
metadata:
  author: Copilot
  version: "3.0"
  platform: macOS
---

# 电脑操控技能 (Computer Operator)

> **⚠️ 重要警告：此技能将真实控制你的鼠标和键盘。在 AI 操作期间，请勿移动鼠标或敲击键盘，以免干扰定位。**

---

## 核心哲学：视觉驱动的自主推理

本技能不依赖于对特定软件的硬编码规则，而是模拟人类的视觉交互过程：

1. **观察 (Observe)**：实时截取屏幕，获取当前的“所见即所得”状态。
2. **逻辑理解 (Understand)**：AI 识别屏幕上的视觉模式（按钮、图标、文本框、状态栏）。
3. **任务规划 (Plan)**：基于理解结果，拆解达到目标所需的原子动作。
4. **动作执行 (Execute)**：精准换算像素坐标并执行物理操作。

---

## 工作流程闭环

```
╔═══════════════════════════════════════════════════════════════════╗
║                  Vision-Thinking 操控闭环                         ║
║                                                                   ║
║  [1] 全屏截图 (screenshot.sh) -> 生成 latest.jpg (压缩版全视野) 与 latest_highres.png (原始像素)         ║
║  [2] 环境分析 (analyze_screen.js) -> 获取换算比例与定位参考        ║
║  [3] 意图解析 (Vision Reasoning) -> 识别目标元素及特征              ║
║  [4] 区域放大 (zoom_region.js) -> 对密集 UI 进行像素级二次确认     ║
║  [5] 动作执行 (操作脚本) -> 执行点击、输入或拖拽                   ║
║  [6] 验证状态 -> 再次截图确认 UI 反馈，若未达标则回溯循环          ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 精准定位与操作

### 1. 坐标系规则 (Retina 适配)
- **物理像素**：截图采用的原始分辨率（如 2560x1600）。
- **逻辑坐标**：系统交互采用的分辨率（如 1280x800）。
- **换算指南**：始终运行 `analyze_screen.js`。**`mouse_action.js` 接受截图像素坐标，内部会自动处理缩放。**

### 2. 存储与缓存管理
- 所有文件在 `/tmp/computer-operator/` 下。
- 每次全捕获前会清空目录。
- **Actionable AI 准则**：严禁使用对话历史中的旧图。必须以最新的 `/tmp/computer-operator/latest.jpg` 为全局观察入口，而精准操作（如 zoom/get_pixel）必须引用 `/tmp/computer-operator/latest_highres.png`。

### 3. 应用打开与全屏
- 打开应用统一使用 `app_action.js`，避免外部直接拼接不稳定的 AppleScript。
- 推荐命令：`computer-operator app open QQ --fullscreen`
- `open` 内部使用 macOS `open -a`，随后激活窗口；`--fullscreen` 会尝试发送系统标准全屏快捷键 `control+command+f`。
- 若提示“不允许辅助功能访问”，说明当前终端或 `osascript` 没有辅助功能权限，需要在系统设置中授权。

### 4. 文本输入策略
- 文本输入统一走 `computer-operator keyboard paste` 或 `paste_enter`。
- 中文、符号、emoji 一律通过“写入剪贴板 -> `command+v` 粘贴”的方式输入，避免输入法组合态造成乱码或未确认。
- `paste_enter` 适用于聊天发送框等需要立即确认发送的场景。

---

## 模块化指南

针对特定复杂场景，本技能引用了外部深度指南。当任务涉及以下 App 时，**必须阅读**对应文件：

- [社交软件操作指南](./guidelines/social_apps.md) (WeChat, QQ, Feishu)
- [开发者工具交互指南](./guidelines/ide_interaction.md) (VS Code, Copilot Chat)

---

## 通用 UI 模式识别建议

AI 在面对未知 App 时应寻找以下模式：
- **操作性按钮**：通常带有背景色块、圆角或阴影，且包含动词（OK, Apply, Submit）。
- **状态指示器**：检查颜色变化（红/绿/黄）或进度条百分比。
- **导航栏/侧边栏**：寻找图标加文字的垂直或水平排列。
- **输入域**：寻找带有光标或占位符文本的框。

---

## 依赖脚本速查

| 脚本 | 功能 |
|------|------|
| `app_action.js` | 打开/激活/全屏应用 |
| `screenshot.sh` | 采集 |
| `screen_info.js` | 参数 |
| `mouse_action.js`| 鼠标操作 |
| `keyboard_action.js`| 键盘/输入 |
| `zoom_region.js` | 像素级放大 |
| `analyze_screen.js` | 坐标换算指南 |
| `get_pixel.js` | 颜色/状态校验 |

---
