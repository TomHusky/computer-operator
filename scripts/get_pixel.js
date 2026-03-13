#!/usr/bin/env node
/**
 * get_pixel.js — 获取截图指定坐标的颜色
 */

const { spawnSync } = require('child_process');
const fs = require('fs');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr?.trim()}`);
  return r.stdout.trim();
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
  return '其他颜色';
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log(`用法: node get_pixel.js <x> <y> [截图路径]`);
    process.exit(0);
  }

  const x = parseInt(args[0]);
  const y = parseInt(args[1]);
  const rawImgPath = args[2] || '/tmp/computer-operator/latest.png';
  const imgPath = fs.existsSync(rawImgPath) ? fs.realpathSync(rawImgPath) : rawImgPath;

  if (!fs.existsSync(imgPath)) {
    console.error(`❌ 截图不存在: ${imgPath}`);
    process.exit(1);
  }

  const sipsInfo = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imgPath]);
  let imgW = 0, imgH = 0;
  for (const line of sipsInfo.split('\n')) {
    if (line.includes('pixelWidth')) imgW = parseInt(line.split(':')[1].trim());
    if (line.includes('pixelHeight')) imgH = parseInt(line.split(':')[1].trim());
  }

  const baseDir = '/tmp/computer-operator';
  const tmpPixel = `${baseDir}/pixel_probe_temp.png`;
  
  fs.copyFileSync(imgPath, tmpPixel);
  run('sips', [tmpPixel, '--cropOffset', String(y), String(x), '-c', '1', '1', '-o', tmpPixel]);

  const hexOut = run('python3', ['-c', `
import struct, zlib, sys
def read_png_pixel(path):
    with open(path, 'rb') as f:
        data = f.read()
    pos = 8
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        chunk_type = data[pos+4:pos+8]
        if chunk_type == b'IDAT':
            compressed = data[pos+8:pos+8+length]
            raw = zlib.decompress(compressed)
            return raw[1], raw[2], raw[3]
        pos += 12 + length
    return 0, 0, 0
r, g, b = read_png_pixel('${tmpPixel}')
print(f'{r:02x}{g:02x}{b:02x} {r} {g} {b}')
`]);

  if (fs.existsSync(tmpPixel)) fs.unlinkSync(tmpPixel);

  const parts = hexOut.split(' ');
  const r = parseInt(parts[1]);
  const g = parseInt(parts[2]);
  const b = parseInt(parts[3]);
  const colorClass = classifyColor(r, g, b);

  console.log(JSON.stringify({
    coordinate: { x, y },
    hex: `#${parts[0].toUpperCase()}`,
    rgb: { r, g, b },
    color_description: colorClass,
    tip: `坐标 (${x},${y}) 的颜色是 #${parts[0].toUpperCase()} (${colorClass})。`
  }, null, 2));
}

try {
  main();
} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
}
