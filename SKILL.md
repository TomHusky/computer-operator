---
name: computer-operator
description: |
  极简版 macOS 电脑操控技能。
  只做两件事：重新截图给 AI 看，以及执行少量稳定的原子动作。
  适用于“帮我操作电脑”“点击某个按钮”“打开某个应用”“输入一段文字”这类任务。
license: MIT
metadata:
  author: Copilot
  version: "4.0"
  platform: macOS
---

# Computer Operator

## 核心原则

1. 新任务、继续执行、或任何可能改变界面的动作之后，第一步都必须重新执行 computer-operator observe。
2. 不使用历史截图，不复用旧坐标，不依赖上一次视觉结论。
3. AI 自己看截图做判断；这个 skill 不负责替 AI 规划任务。
4. 优先用最小动作完成目标：打开应用、点击、输入、滚动、拖拽。
5. 看不清就 zoom，点完不放心就 observe 或 pixel 验证。

## 唯一推荐工作流

```text
observe
-> AI 分析截图
-> click / type / key / scroll / drag
-> observe
```

如果局部太小：

```text
observe
-> zoom
-> AI 分析局部图
-> click
-> observe
```

## 推荐命令

- 重新截图并输出分析：computer-operator
- 显式重新截图：computer-operator observe
- 只分析现有截图：computer-operator analyze
- 打开应用：computer-operator open "Visual Studio Code"
- 点击：computer-operator click <x> <y>
- 输入文本：computer-operator type "文本"
- 输入并回车：computer-operator send "文本"
- 按单键：computer-operator key escape
- 滚动：computer-operator scroll <x> <y> <amount>
- 拖拽：computer-operator drag <x1> <y1> <x2> <y2>
- 局部放大：computer-operator zoom <x> <y> <w> <h>
- 像素验证：computer-operator pixel <x> <y>

## AI 执行要求

- 任何恢复执行都必须先 observe。
- click 和 drag 默认使用截图像素坐标，不是逻辑坐标。
- observe 输出里的 scale_factor 会告诉你如何换算点击坐标。
- 如果已经是逻辑坐标，给动作命令加 --logical。
- 如果用户目标本质上是多步骤任务，不要调用不存在的“自动任务规划器”；直接按截图一步一步执行。

## 禁止事项

- 不要假设某个 App 有固定布局。
- 不要依赖私有 accessibility 树或硬编码业务模板。
- 不要继续维护 task-plan、task-run、ui-map 这类复杂抽象。

## 输出偏好

当你基于这个 skill 操作电脑时，优先围绕以下信息组织判断：

- 当前前台应用是不是对的
- 当前截图是不是刚拍的
- 目标控件大概在哪个区域
- 是否需要先 zoom 再点
- 动作之后界面是否发生了预期变化