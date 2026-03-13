#!/bin/bash
# screenshot.sh — 静默全屏截图
# 用法：bash screenshot.sh [输出路径]
# 默认输出：/tmp/co_screenshot.png

OUTPUT="${1:-/tmp/co_screenshot_$(date +%s).png}"

# -x 静默（无快门声）; -t png 格式
screencapture -x -t png "$OUTPUT"

if [ $? -eq 0 ]; then
    # 创建软链接，确保读取时可获取真实的带时间戳的路径，避免 AI 缓存
    ln -sf "$OUTPUT" "/tmp/co_screenshot.png"
    echo "截图成功: $OUTPUT"
    # 输出文件大小供参考
    ls -lh "$OUTPUT" | awk '{print "文件大小: " $5}'
    
    # 清理超过1分钟的历史截图和放大图，避免占用磁盘空间
    find /tmp -name "co_screenshot_*.png" -mmin +1 -delete 2>/dev/null || true
    find /tmp -name "co_zoom_*.png" -mmin +1 -delete 2>/dev/null || true
else
    echo "截图失败，请检查 screencapture 权限" >&2
    exit 1
fi
