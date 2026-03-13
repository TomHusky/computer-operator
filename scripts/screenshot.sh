#!/bin/bash
# screenshot.sh — 静默全屏截图
# 用法：bash screenshot.sh [输出路径]
# 默认输出：/tmp/co_screenshot.png

OUTPUT="${1:-/tmp/co_screenshot.png}"

# -x 静默（无快门声）; -t png 格式
screencapture -x -t png "$OUTPUT"

if [ $? -eq 0 ]; then
    echo "截图成功: $OUTPUT"
    # 输出文件大小供参考
    ls -lh "$OUTPUT" | awk '{print "文件大小: " $5}'
else
    echo "截图失败，请检查 screencapture 权限" >&2
    exit 1
fi
