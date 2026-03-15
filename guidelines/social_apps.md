# 社交软件操作指南 (Social Apps Guidelines)

适用于微信、QQ、飞书、Telegram、Slack 等以聊天列表 + 会话区 + 输入框为主结构的社交软件。

## 1. 社交场景硬规则

1. 先确定当前是否在“消息列表页”还是“具体会话页”。
2. 搜联系人、找会话、读消息、发消息是四个独立步骤，不要混成一步。
3. 输入统一使用 `keyboard paste` / `paste_enter`，不要逐字模拟中文输入。
4. 发送前尽量重新观察一次，避免发错会话。
5. 如果任务是回复消息，先读最近上下文，再生成回复，不要只看到一个名字就直接发。

进入社交软件前推荐：`computer-operator app open QQ --fullscreen`

恢复执行推荐：`computer-operator observe`

## 2. 社交软件通用布局

大多数社交软件都可拆成这几个区：

1. 左侧：导航或聊天列表
2. 中间：当前会话消息区
3. 下方：输入框和发送区
4. 顶部：会话标题、搜索、更多按钮

先判断自己在哪个区，再做动作。

## 3. 社交任务模板

### 模板 A：搜索联系人或群聊

```text
computer-operator app activate <QQ/微信/飞书>
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <搜索框中心x> <搜索框中心y>
computer-operator keyboard paste "<联系人或群名>"
computer-operator observe
```

### 模板 B：打开会话

```text
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <联系人项中心x> <联系人项中心y>
computer-operator observe
```

### 模板 C：读取最近消息

```text
computer-operator observe
computer-operator zoom <右侧消息区最后几条消息区域>
computer-operator observe
```

### 模板 D：发送消息

```text
computer-operator observe
computer-operator ui-map --mode balanced
computer-operator mouse click <输入框中心x> <输入框中心y>
computer-operator keyboard paste_enter "<消息内容>"
computer-operator observe
```

### 模板 E：搜索联系人并发送消息

```text
computer-operator app activate <QQ/微信/飞书>
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

## 4. 回复协议

当任务是“帮我回消息”时，顺序固定：

1. 找到正确联系人或群
2. 打开会话
3. 放大最后几条消息区域
4. 理解最近上下文
5. 生成符合场景的自然回复
6. 点击输入框
7. `paste_enter` 发送
8. 重新观察确认消息已发出

回复风格建议：

- 简洁，不要像客服模板
- 口语化，不要机械解释
- 不确定上下文时，宁可短回复，也不要编造细节

## 5. 视觉理解重点

优先识别这些元素：

- 搜索框
- 未读红点、数字角标
- 联系人列表项
- 当前会话标题
- 输入框
- 发送按钮
- 更多按钮

如果是密集聊天列表或消息气泡太小，优先：

```text
observe
-> ui-map --mode balanced
-> 先判断列表区 / 会话区
-> zoom 到局部
-> 必要时 ui-map --image <局部图> --mode precise
```

## 6. 轮询与盯消息

如果任务是“盯某人回复”或“看有没有新消息”：

1. `observe`
2. 看是否有红点、未读数字、列表顺序变化
3. 若疑似有新消息，打开对应会话
4. `zoom` 读取最后消息
5. 再决定是否回复

频率控制：每 10 到 20 秒一次，避免过于机械。

## 7. 常见风险点

- 不要把搜索框的历史记录误当联系人结果。
- 不要没确认当前会话标题就直接发消息。
- 不要把表情按钮、附件按钮误当发送按钮。
- 不要只看左侧列表的名字就推断右侧会话已切换成功。

## 8. 失败回退

以下任一情况立即回退：

- 搜索框没获取到焦点
- 联系人结果不清晰
- 会话没切对
- 输入框位置不稳定
- 发送后界面没有出现新气泡

回退流程：

```text
computer-operator observe
computer-operator zoom <问题区域>
computer-operator ui-map --image /tmp/computer-operator/latest_zoom.png --mode precise
重新定位目标
再执行
```

---
*这些策略是 `computer-operator` 在社交场景下的专用补充，优先强调会话确认、上下文读取和发送前验证。*
