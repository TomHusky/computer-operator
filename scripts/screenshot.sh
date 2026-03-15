#!/bin/bash
# 基础存储目录
BASE_DIR="/tmp/computer-operator"
mkdir -p "$BASE_DIR"

# 清理历史截图
rm -rf "$BASE_DIR"/*

TS=$(date +%s)
OUTPUT_HIGHRES="$BASE_DIR/screenshot_highres_${TS}.png"
OUTPUT_COMPRESSED="$BASE_DIR/screenshot_${TS}.jpg"
META_FILE="$BASE_DIR/latest_meta.json"

# 静默截取高质量原图
/usr/sbin/screencapture -x -t png "$OUTPUT_HIGHRES"

if [ $? -eq 0 ]; then
    # 生成压缩版 (normal 质量选项)，保持像素尺寸完全一致，解决 low 质量过于模糊的问题
    sips -s format jpeg -s formatOptions normal "$OUTPUT_HIGHRES" --out "$OUTPUT_COMPRESSED" >/dev/null 2>&1
    
    # 创建软链接到 latest.png 和 latest_highres.png，方便统一读取
    ln -sf "$OUTPUT_HIGHRES" "$BASE_DIR/latest_highres.png"
    ln -sf "$OUTPUT_HIGHRES" "$BASE_DIR/latest.png"
    ln -sf "$OUTPUT_COMPRESSED" "$BASE_DIR/latest.jpg"

    CAPTURED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    cat > "$META_FILE" <<EOF
{
  "captured_at": "$CAPTURED_AT",
  "captured_at_epoch": $TS,
  "latest_jpg": "$OUTPUT_COMPRESSED",
  "latest_png": "$OUTPUT_HIGHRES"
}
EOF
    
    echo "截图成功:"
    ls -lh "$OUTPUT_HIGHRES" "$OUTPUT_COMPRESSED" | awk '{print "  " $9 " (大小: " $5 ")"}'
    echo "  capture_time: $CAPTURED_AT"
else
    echo "截图失败，请检查 screencapture 权限" >&2
    exit 1
fi
