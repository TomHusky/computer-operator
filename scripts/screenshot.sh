#!/bin/bash
# 基础存储目录
BASE_DIR="/tmp/computer-operator"
mkdir -p "$BASE_DIR"

# 预览图最长边，默认压到 1800 以减少视觉 token，同时保留足够清晰的 UI 结构
PREVIEW_MAX_DIM="${COMPUTER_OPERATOR_PREVIEW_MAX_DIM:-1800}"

# 清理上一轮生成的中间产物，但不粗暴删除整个目录
rm -f "$BASE_DIR"/screenshot_*.jpg
rm -f "$BASE_DIR"/screenshot_highres_*.png
rm -f "$BASE_DIR"/screenshot_preview_*.jpg
rm -f "$BASE_DIR"/latest.jpg "$BASE_DIR"/latest.png "$BASE_DIR"/latest_highres.png
rm -f "$BASE_DIR"/latest_zoom.png "$BASE_DIR"/latest_meta.json
rm -f "$BASE_DIR"/co_scale_probe.png "$BASE_DIR"/zoom_crop_temp.png "$BASE_DIR"/pixel_probe_temp.png

TS=$(date +%s)
OUTPUT_HIGHRES="$BASE_DIR/screenshot_highres_${TS}.png"
OUTPUT_PREVIEW="$BASE_DIR/screenshot_preview_${TS}.jpg"
META_FILE="$BASE_DIR/latest_meta.json"

# 静默截取高质量原图
/usr/sbin/screencapture -x -t png "$OUTPUT_HIGHRES"

if [ $? -eq 0 ]; then
    # 生成缩放后的高质量预览图，专门给 AI 做全局观察，兼顾清晰度与 token 成本
    if ! sips -Z "$PREVIEW_MAX_DIM" -s format jpeg -s formatOptions best "$OUTPUT_HIGHRES" --out "$OUTPUT_PREVIEW" >/dev/null 2>&1; then
        echo "预览图生成失败，回退为原尺寸 JPEG" >&2
        sips -s format jpeg -s formatOptions best "$OUTPUT_HIGHRES" --out "$OUTPUT_PREVIEW" >/dev/null 2>&1
    fi
    
    # 创建软链接到 latest.png 和 latest_highres.png，方便统一读取
    ln -sf "$OUTPUT_HIGHRES" "$BASE_DIR/latest_highres.png"
    ln -sf "$OUTPUT_HIGHRES" "$BASE_DIR/latest.png"
    ln -sf "$OUTPUT_PREVIEW" "$BASE_DIR/latest.jpg"

    CAPTURED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    cat > "$META_FILE" <<EOF
{
  "captured_at": "$CAPTURED_AT",
  "captured_at_epoch": $TS,
  "latest_jpg": "$OUTPUT_PREVIEW",
  "latest_png": "$OUTPUT_HIGHRES",
  "preview_max_dimension": $PREVIEW_MAX_DIM
}
EOF
    
    echo "截图成功:"
    ls -lh "$OUTPUT_HIGHRES" "$OUTPUT_PREVIEW" | awk '{print "  " $9 " (大小: " $5 ")"}'
    echo "  capture_time: $CAPTURED_AT"
    echo "  preview_usage: latest.jpg 用于全局观察；latest_highres.png 用于 zoom/get_pixel 精细确认"
else
    echo "截图失败，请检查 screencapture 权限" >&2
    exit 1
fi
