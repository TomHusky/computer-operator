#!/bin/bash
# 基础存储目录
BASE_DIR="/tmp/computer-operator"
mkdir -p "$BASE_DIR"

# 清理历史截图，确保只有当前会话的最新数据
rm -rf "$BASE_DIR"/*

# 设置带时间戳的输出路径
OUTPUT="${1:-$BASE_DIR/screenshot_$(date +%s).png}"

# -x 静默（无快门声）; -t png 格式
/usr/sbin/screencapture -x -t png "$OUTPUT"

if [ $? -eq 0 ]; then
    # 创建软链接到 latest.png，方便统一读取
    ln -sf "$OUTPUT" "$BASE_DIR/latest.png"
    echo "截图成功: $OUTPUT"
    # 输出文件大小供参考
    ls -lh "$OUTPUT" | awk '{print "文件大小: " $5}'
else
    echo "截图失败，请检查 screencapture 权限" >&2
    exit 1
fi
