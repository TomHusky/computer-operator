#!/bin/bash
# 基础存储目录
BASE_DIR="/tmp/computer-operator"
mkdir -p "$BASE_DIR"

# 清理历史截图
rm -rf "$BASE_DIR"/*

TS=$(date +%s)
OUTPUT_HIGHRES="$BASE_DIR/screenshot_highres_${TS}.png"
OUTPUT_COMPRESSED="$BASE_DIR/screenshot_${TS}.jpg"

# 静默截取高质量原图
/usr/sbin/screencapture -x -t png "$OUTPUT_HIGHRES"

if [ $? -eq 0 ]; then
    # 生成压缩版 (low 质量选项，减小体积)，保持像素尺寸完全一致
    sips -s format jpeg -s formatOptions low "$OUTPUT_HIGHRES" --out "$OUTPUT_COMPRESSED" >/dev/null 2>&1
    
    # 创建软链接，分离 AI 视图用图与精准裁剪用图
    ln -sf "$OUTPUT_HIGHRES" "$BASE_DIR/latest_highres.png"
    ln -sf "$OUTPUT_COMPRESSED" "$BASE_DIR/latest.jpg"
    
    echo "截图成功:"
    ls -lh "$OUTPUT_HIGHRES" "$OUTPUT_COMPRESSED" | awk '{print "  " $9 " (大小: " $5 ")"}'
else
    echo "截图失败，请检查 screencapture 权限" >&2
    exit 1
fi
