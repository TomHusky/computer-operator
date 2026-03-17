# Computer Operator

这是一个极简版 macOS 电脑操控 skill。

目标只做一件事：给 AI 一张最新截图，再提供少量稳定的动作命令。AI 自己看图判断，不再依赖 task planner、UI map、场景模板和一堆中间层。

## 设计原则

- 只保留两类能力：观察 和 动作。
- 任何“继续执行”都必须先重新截图，不复用历史截图。
- 不做“替 AI 做任务规划”的自动化，不做脆弱的 UI 语义猜测。
- 保留最小但可靠的原子动作：打开应用、点击、输入、滚动、拖拽、放大、验像素。

## 安装

```bash
npm install
chmod +x scripts/*.sh
```

## 必要权限

首次使用前确认：

1. 系统是 macOS。
2. 当前终端有屏幕录制权限。
3. 当前终端和 osascript 有辅助功能权限。

## 最短工作流

```bash
computer-operator
computer-operator zoom 900 120 500 240
computer-operator click 980 220
computer-operator type "你好"
computer-operator send "收到，我现在处理"
computer-operator
```

说明：

- 直接执行 computer-operator，等同于 observe，会重新截图并输出 JSON 分析结果。
- click、drag 默认接收截图像素坐标，脚本会自动换算 Retina 缩放。
- 如果你拿到的是逻辑坐标，追加 --logical。

## 命令

```bash
computer-operator                  # 默认 observe
computer-operator observe [--full]
computer-operator analyze [image] [--full]
computer-operator info

computer-operator open "Visual Studio Code" --fullscreen
computer-operator activate Finder
computer-operator fullscreen QQ

computer-operator click 800 320
computer-operator double-click 800 320
computer-operator right-click 800 320
computer-operator move 800 320
computer-operator drag 500 400 900 400
computer-operator scroll 0 500 8
computer-operator position

computer-operator type "hello"
computer-operator send "你好，已处理"
computer-operator key escape

computer-operator zoom 1200 180 500 220
computer-operator pixel 1330 240
```

## observe 输出

observe 会输出一份给 AI 用的 JSON，核心字段包括：

- 当前前台应用
- 截图路径
- 截图尺寸
- Retina 缩放系数
- 截图坐标如何换算成点击坐标
- 截图是否新鲜

默认图片路径：

- /tmp/computer-operator/latest.jpg：给 AI 做整体观察
- /tmp/computer-operator/latest_highres.png：给 zoom 和 pixel 做精确确认
- /tmp/computer-operator/latest_zoom.png：最近一次局部放大结果

## 为什么删掉旧能力

这次重构删掉了以下整层能力：

- task-plan
- task-run
- ui-map
- 场景化 guidelines
- Swift 视觉检测桥接

原因很直接：这些层试图替 AI 提前理解界面和规划动作，带来了更多失败路径、更多维护成本和更高的使用门槛。对于“截图给 AI 分析怎么操作电脑”这个目标，它们是多余复杂度。

## 保留的核心脚本

- screenshot.sh：抓取最新截图，并维护 preview/highres 两份图
- analyze_screen.js：输出 AI 真正需要的上下文
- app_action.js：打开、激活、全屏
- mouse_action.js：点击、移动、拖拽、滚动
- keyboard_action.js：粘贴文本、发送文本、按键
- zoom_region.js：局部裁剪放大
- get_pixel.js：读取像素颜色做验证

## 兼容性

为了避免旧调用立即全部失效，CLI 还保留了以下兼容入口：

- computer-operator app open ...
- computer-operator mouse click ...
- computer-operator keyboard paste ...

但新的推荐用法只保留顶层原语命令。