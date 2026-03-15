# 开发者工具交互指南 (IDE Interaction Guidelines)

适用于 VS Code、Cursor、JetBrains 系 IDE 以及内嵌 AI 助手面板。目标是让模型优先走稳定、低成本、可验证的纯视觉操作路径。

## 1. IDE 场景硬规则

1. 不再使用快捷键。统一走视觉定位、点击、输入和局部放大确认。
2. 每次触发面板、搜索、Diff、AI 弹窗后，都要重新 `observe`。
3. 不要假设布局固定。侧边栏、底栏、面板停靠位置都可能变化。
4. 涉及 AI 应用按钮时，必须做局部放大确认，不要凭模糊全图点击。

启动 IDE 推荐：`computer-operator app open "Visual Studio Code" --fullscreen`

恢复执行推荐：`computer-operator observe`

## 2. 优先操作顺序

### 文件和导航

- 打开文件：先定位资源管理器、搜索框或文件列表
- 全局搜索：先定位搜索输入框或搜索入口
- 命令面板类操作：优先定位顶部输入框、菜单项或工具栏搜索入口
- 行内 AI：优先定位 AI 输入框或 AI 面板入口

纯视觉优先顺序是：

```text
activate/open IDE
-> ui-map
-> 选区域
-> 必要时 zoom
-> observe
-> click / paste
```

## 3. IDE 任务模板

### 模板 A：打开文件

```text
computer-operator app activate "Visual Studio Code"
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <资源管理器或搜索输入框中心x> <中心y>
computer-operator keyboard paste "<文件名>"
computer-operator observe
computer-operator mouse click <文件项中心x> <中心y>
computer-operator observe
```

### 模板 B：全局搜索

```text
computer-operator app activate "Visual Studio Code"
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <搜索框或搜索入口中心x> <中心y>
computer-operator keyboard paste "<搜索词>"
computer-operator observe
```

### 模板 C：执行命令面板操作

```text
computer-operator app activate "Visual Studio Code"
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <顶部搜索框或命令输入入口中心x> <中心y>
computer-operator keyboard paste "<命令名>"
computer-operator observe
computer-operator mouse click <命令项中心x> <中心y>
computer-operator observe
```

### 模板 D：AI 面板输入并应用结果

```text
computer-operator app activate "Visual Studio Code"
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <AI输入框或AI面板入口中心x> <中心y>
computer-operator keyboard paste "<指令>"
computer-operator observe
computer-operator zoom <AI按钮区域x> <y> <w> <h>
computer-operator ui-map --image /tmp/computer-operator/latest_zoom.png --mode precise
computer-operator mouse click <Accept/Apply中心x> <中心y>
computer-operator observe
```

## 4. AI 助手交互协议

当用户要你“让 IDE 里的 AI 帮忙改代码”时，执行顺序固定为：

1. 打开或激活 IDE
2. 用 `ui-map` 找到 AI 输入区或 AI 面板入口
3. `keyboard paste` 输入指令
4. `observe` 看是否出现 Diff、建议卡片、授权弹窗
5. 对底部按钮区 `zoom`
6. 再 `ui-map --image <局部图> --mode precise`
7. 只点击明确识别出的 `Accept`、`Apply`、`Allow`、`Execute`
8. 再 `observe` 验证是否真的生效

## 5. IDE 视觉理解重点

优先按区域理解界面，而不是盯单个像素：

1. 左侧：活动栏、资源管理器、搜索、源码管理
2. 中间：编辑器、Diff 区、标签页
3. 下方：终端、问题、输出、调试控制台
4. 右侧：次级侧栏、AI 面板、预览区
5. 顶部：标签栏、工具栏、面包屑

当界面很密集时，优先顺序：

```text
observe
-> ui-map --mode balanced
-> 先判断目标区域
-> zoom 到局部
-> ui-map --image <局部图> --mode precise
-> 执行动作
```

## 6. 常见风险点

- 不要直接点菜单栏，除非用户明确要求。
- 不要把标签页上的文件名误判成按钮。
- 不要把 Diff 中的加减号、装饰图标误判成主要操作目标。
- 不要在未确认焦点的情况下直接输入文本。

## 7. 失败回退

以下任一情况立即回退：

- 视觉定位后仍没有打开目标面板
- AI 面板没有出现预期输入框
- Apply/Accept 区域太密或标签不清楚
- 点击后编辑器内容没有变化

回退流程：

```text
computer-operator observe
computer-operator zoom <目标区域>
computer-operator ui-map --image /tmp/computer-operator/latest_zoom.png --mode precise
重新定位目标
再执行
```

---
*这些策略是 `computer-operator` 在 IDE 场景下的专用补充，优先强调纯视觉定位、区域理解和局部验证。*
