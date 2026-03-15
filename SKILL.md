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
  version: "3.1"
  platform: macOS
---

# 电脑操控技能 (Computer Operator)

> **⚠️ 重要警告：此技能将真实控制你的鼠标和键盘。在 AI 操作期间，请勿移动鼠标或敲击键盘，以免干扰定位。**

> **⚠️ 恢复执行协议：只要对话中断、用户让 AI “继续”、或上一步动作可能改变了界面，第一步必须重新执行 `computer-operator observe`。禁止复用历史截图和历史视觉判断。**
ßß
## 超短执行版

这是给模型高频读取的执行卡片。目标不是服务某几个 App，而是让模型能用同一套视觉闭环去操作任意 macOS App。
ß
### 条硬规则

1. 新任务、继续执行、界面变化后，先 `computer-operator observe`。
2. 不用历史截图，不复用旧坐标。
3. 先全图判断，再局部放大；不要反复看整张大图。
4. 找控件优先 `computer-operator ui-map`。
5. 输入统一 `computer-operator keyboard paste`，发送统一 `paste_enter`。
6. 每次动作后再 `computer-operator observe` 验证。

### 最短流程

```text
observe
-> ui-map
-> 选元素
-> 必要时 zoom + ui-map --image <局部图>
-> mouse / keyboard
-> observe
```

### 通用任务原语

先把用户目标拆成下面 8 类动作，再组合，不要一上来就套某个 App 的固定脚本：

1. 打开或切换 App
2. 定位区域
3. 找可操作控件
4. 点击或双击
5. 输入或提交
6. 滚动或拖拽
7. 读取状态
8. 验证结果

任何复杂任务，本质上都是这 8 类动作的组合。

### 命令选择

- 打开或切换 App：`computer-operator app open <App>` / `computer-operator app activate <App>`
- 读取当前界面整体状态：`computer-operator observe`
- 如果用户给的是自然语言任务目标，先执行：`computer-operator task-plan "<任务目标>"`
- 找按钮、标签、列表项、菜单项：`computer-operator ui-map`
- 找输入框、搜索框：`computer-operator ui-map`，优先 `input` / `search_box`

如果用户给的是一句完整目标，而不是明确命令，先让 task-router 产出首条命令链，再执行。
- 如果需要直接执行复杂任务，优先使用：`computer-operator task-run "<用户目标>"`
- 目标太密、太小、太模糊：`computer-operator zoom ...` 后再 `computer-operator ui-map --image <局部图>`
- 页面需要往下找内容：`computer-operator mouse scroll <dx> <dy>`
- 需要拖动滑块、窗口、分隔条、文件：`computer-operator mouse drag <x1> <y1> <x2> <y2>`
- 输入文本：先点击，再 `computer-operator keyboard paste "文本"`
- 聊天发送：先点击输入框，再 `computer-operator keyboard paste_enter "文本"`
- 校验颜色或状态：`computer-operator pixel <x> <y>`

### 模式

- `fast`：只想快速定位区域
- `balanced`：默认，绝大多数任务先用它
- `precise`：密集界面或连续两次未命中时再用

### 任务目标 -> 命令序列模板

先用通用模板，只有在确实知道是社交软件或 IDE 时，才套用专用示例。

也可以先运行：

```text
computer-operator task-plan "<用户目标>"
```

让系统先输出参数槽位、建议命令链、场景和推荐阅读的专用指南。

复杂任务也可以直接执行：

```text
computer-operator task-run "<用户目标>"
```

执行器规则：

1. 每一步执行前强制重新截图。
2. 每一步都只基于视觉结果定位目标控件。
3. 动作后必须重新观察并校验预期结果。
4. 单步最多重试 3 次。
5. 超过 3 次仍失败，立即结束整个任务并输出错误原因。

#### 模板 A：打开 App -> 到达目标界面

```text
computer-operator app open <App名>
computer-operator observe
computer-operator ui-map --mode balanced
必要时 mouse click <x> <y>
computer-operator observe
```

#### 模板 B：定位控件 -> 点击

```text
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <目标中心x> <目标中心y>
computer-operator observe
```

#### 模板 C：定位输入控件 -> 输入文本

```text
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <输入框中心x> <输入框中心y>
computer-operator keyboard paste "<文本>"
computer-operator observe
```

#### 模板 D：翻找内容 -> 再定位 -> 再点击

```text
computer-operator observe
computer-operator ui-map --mode balanced
如果没看到目标，computer-operator mouse scroll 0 -480
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <目标中心x> <目标中心y>
computer-operator observe
```

#### 模板 E：密集区域 -> 局部放大 -> 精确操作

```text
computer-operator observe
computer-operator zoom <区域x> <区域y> <区域w> <区域h>
computer-operator ui-map --image /tmp/computer-operator/latest_zoom.png --mode precise
computer-operator mouse click <目标中心x> <目标中心y>
computer-operator observe
```

#### 模板 F：拖拽类操作

```text
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse drag <起点x> <起点y> <终点x> <终点y>
computer-operator observe
```

#### 模板 G：状态确认类操作

```text
computer-operator observe
必要时 computer-operator zoom <区域x> <区域y> <区域w> <区域h>
必要时 computer-operator pixel <x> <y>
```

#### 专用示例：打开 App -> 找控件 -> 点击

这是示例，不是默认唯一流程。

```text
computer-operator app open <App名>
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <x> <y>
computer-operator observe
```

#### 专用示例：打开 App -> 找输入框 -> 输入文本

这是示例，不是默认唯一流程。

```text
computer-operator app open <App名>
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <输入框中心x> <输入框中心y>
computer-operator keyboard paste "<文本>"
computer-operator observe
```

#### 专用示例：找搜索框 -> 输入查询

这是示例，不是默认唯一流程。

```text
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <搜索框中心x> <搜索框中心y>
computer-operator keyboard paste "<查询词>"
computer-operator observe
```

#### 专用示例：QQ/微信/飞书搜索联系人后发送消息

这是社交软件示例，不应覆盖通用规则。

```text
computer-operator app open <QQ/微信/飞书>
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <搜索框中心x> <搜索框中心y>
computer-operator keyboard paste "<联系人或群名>"
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <联系人项中心x> <联系人项中心y>
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <输入框中心x> <输入框中心y>
computer-operator keyboard paste_enter "<消息内容>"
computer-operator observe
```

#### 专用示例：用户说“帮我打开 QQ 找到搜索框输入 xxx”

优先输出这条动作链：

```text
computer-operator app open QQ
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <搜索框中心x> <搜索框中心y>
computer-operator keyboard paste "xxx"
computer-operator observe
```

如果搜索框不稳定，再降级：

```text
computer-operator observe
computer-operator zoom <疑似搜索区域x> <y> <w> <h>
computer-operator ui-map --image /tmp/computer-operator/latest_zoom.png --mode precise
computer-operator mouse click <搜索框中心x> <搜索框中心y>
computer-operator keyboard paste "xxx"
computer-operator observe
```

### 选元素只看 4 个字段

1. `label` 是否命中目标词
2. `type` 是否符合预期
3. `confidence` 是否足够高
4. `center` 是否便于直接点击

只要其中 2 项不稳，就先 `zoom`，不要硬点。

补充：如果目标是 `icon_button` 或 `toolbar_button`，再额外看 `semantic.role`。它可帮助判断该控件更像返回、搜索、设置、更多、展开/收起，但只应作为辅助，不应压过位置和上下文。

### 通用理解规则

- 不要假设界面结构固定；同一个 App 在不同版本、窗口尺寸、登录状态下都可能完全不同。
- 不要依赖某个 App 的私有节点树；主路径永远是截图、ui-map、zoom、mouse、keyboard。
- 菜单栏、工具栏、侧边栏、列表区、详情区、底部操作栏，都要按视觉区域重新判断。
- 如果用户目标是“完成任务”而不是“点某个按钮”，先把任务拆成多步动作链再执行。

### 回退

以下任一情况立即回退：点击没反应、页面不对、`ui-map` 不稳、区域太密。

```text
computer-operator observe
computer-operator zoom ...
computer-operator ui-map --image <局部图>
重新选元素
再执行
```

### 深度指南

- [社交软件操作指南](./guidelines/social_apps.md)：仅在 QQ、微信、飞书等场景使用
- [开发者工具交互指南](./guidelines/ide_interaction.md)：仅在 VS Code、Cursor、Copilot Chat 等 IDE 场景使用
