#!/usr/bin/env node
/**
 * get_pixel.js — 获取截图指定坐标的颜色，用于验证 UI 元素定位是否正确
 *
 * 用法:
 *   node get_pixel.js <x> <y> [截图路径]
 *
 * 坐标为【截图像素坐标】
 *
 * 例:
 *   node get_pixel.js 960 540          # 获取 (960,540) 处颜色
 *   node get_pixel.js 960 540 /tmp/co_screenshot.png
 *
 * 用途:
 *   - 点击后截图，获取点击坐标像素颜色，确认点击到了正确的 UI 元素
 *   - 验证按钮状态变化（颜色变化 = 状态改变）
 *   - 确认文字区域、背景色等
 *
 * 依赖: macOS 原生 sips（无需安装）
 */

const { spawnSync } = require('child_process');
const fs = require('fs');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr?.trim()}`);
  return r.stdout.trim();
}

function hexToRgb(hex) {
  // sips 返回格式 "RRGGBB" 或 "AARRGGBB"
  hex = hex.replace('#', '');
  if (hex.length === 8) hex = hex.slice(2); // 去掉alpha
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
}

function classifyColor(r, g, b) {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness > 230) return '白色/浅色区域';
  if (brightness < 30) return '黑色/深色区域';
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  
  if (diff < 20) return '灰色区域';
  
  if (r > g && r > b) return '红色系（可能是关闭按钮/警告）';
  if (g > r && g > b) return '绿色系（可能是确认按钮/成功状态）';
  if (b > r && b > g) return '蓝色系（可能是主按钮/链接/选中状态）';
  if (r > 200 && g > 150 && b < 100) return '橙/黄色系';
  
  return '其他颜色';
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log(`用法:
  node get_pixel.js <x> <y> [截图路径]
  
  获取截图中指定坐标的像素颜色，用于验证 UI 元素定位
  
示例:
  node get_pixel.js 960 540
  node get_pixel.js 200 100 /tmp/co_screenshot.png`);
    process.exit(0);
  }

  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const rawImgPath = args[2] || '/tmp/co_screenshot.png';
  const imgPath = fs.existsSync(rawImgPath) ? fs.realpathSync(rawImgPath) : rawImgPath;

  if (!fs.existsSync(imgPath)) {
    console.error(`❌ 截图不存在: ${imgPath}`);
    process.exit(1);
  }

  // 获取图像尺寸
  const sipsInfo = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imgPath]);
  let imgW = 0, imgH = 0;
  for (const line of sipsInfo.split('\n')) {
    if (line.includes('pixelWidth')) imgW = parseInt(line.split(':')[1].trim());
    if (line.includes('pixelHeight')) imgH = parseInt(line.split(':')[1].trim());
  }

  if (x < 0 || x >= imgW || y < 0 || y >= imgH) {
    console.error(`❌ 坐标 (${x},${y}) 超出图像范围 ${imgW}x${imgH}`);
    process.exit(1);
  }

  // 用 sips 裁剪 1x1 像素
  const tmpPixel = '/tmp/co_pixel_probe.png';
  
  // 复制并裁剪到 1x1
  fs.copyFileSync(imgPath, tmpPixel);
  run('sips', [tmpPixel, '--cropOffset', String(y), String(x), '-c', '1', '1', '-o', tmpPixel]);

  // 读取 hex 颜色
  const hexOut = run('python3', ['-c', `
import struct, zlib, sys

def read_png_pixel(path):
    with open(path, 'rb') as f:
        data = f.read()
    # 找到 IDAT chunk
    pos = 8
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        chunk_type = data[pos+4:pos+8]
        if chunk_type == b'IHDR':
            w = struct.unpack('>I', data[pos+8:pos+12])[0]
            h = struct.unpack('>I', data[pos+12:pos+16])[0]
            bit_depth = data[pos+16]
            color_type = data[pos+17]
        if chunk_type == b'IDAT':
            compressed = data[pos+8:pos+8+length]
            raw = zlib.decompress(compressed)
            # 第一行，跳过滤波字节
            filter_byte = raw[0]
            r = raw[1]
            g = raw[2] if len(raw) > 2 else 0
            b = raw[3] if len(raw) > 3 else 0
            return r, g, b
        pos += 12 + length
    return 0, 0, 0

r, g, b = read_png_pixel('${tmpPixel}')
print(f'{r:02x}{g:02x}{b:02x} {r} {g} {b}')
`]);

  if (fs.existsSync(tmpPixel)) fs.unlinkSync(tmpPixel);

  const parts = hexOut.split(' ');
  const hex = parts[0];
  const r = parseInt(parts[1]);
  const g = parseInt(parts[2]);
  const b = parseInt(parts[3]);

  const colorClass = classifyColor(r, g, b);

  console.log(JSON.stringify({
    coordinate: { x, y },
    hex: `#${hex.toUpperCase()}`,
    rgb: { r, g, b },
    color_description: colorClass,
    image_size: { width: imgW, height: imgH },
    tip: `坐标 (${x},${y}) 的颜色是 #${hex.toUpperCase()} (${colorClass})。可用于验证点击位置是否在正确的 UI 元素上。`
  }, null, 2));
}

try {
  main();
} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
}
