# 开发者工具交互指南 (IDE Interaction Guidelines)

针对 VS Code、Cursor 及内嵌 AI 助手 (Copilot Chat) 的高效交互策略。

## 1. 快捷键优先原则

不要试图通过视觉点击菜单栏，效率极低且不稳定。优先使用标准快捷键，并用截图验证结果。

- **唤起文件**: `Command + P` -> 输入文件名。
- **全局搜索**: `Command + Shift + F`。
- **唤起 Copilot Chat (行内)**: `Command + I`。
- **命令面板**: `Command + Shift + P`。

## 2. 视觉闭环：AI 助手交互 (Copilot/Cursor)

当指挥内置 AI 修改代码时，必须执行以下验证流程：

1. **观察变化**：输入指令后，截图检查编辑器是否出现了差异 (Diff) 视图。
2. **定位按钮区**：利用 `zoom_region.js` 放大对话框底部的按钮区。
3. **识别动作**：
   - 认清 `Accept` (接受)、`Apply` (应用) 或 `Discard` (放弃)。
   - 寻找 `Allow`、`Execute` 等授权按钮。
4. **准确点击**：换算像素坐标并点击，确保流程不中断。

## 3. 精准范围获取

由于 IDE 元素非常密集，强烈推荐先运行：
```bash
node ./scripts/get_window_bounds.js "Visual Studio Code"
```
获取窗口方位后，再在该局部范围内进行放大 (`zoom_region.js`) 和分析。

---
*这些策略旨在作为 `computer-operator` 核心技能的补充，通过视觉识别 IDE 的具体布局来执行。*
