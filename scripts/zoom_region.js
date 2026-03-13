#!/usr/bin/env node
/**
 * zoom_region.js — 截取并放大截图的指定区域
 *
 * 用法:
 *   node zoom_region.js <x> <y> <width> <height> [输出路径]
 *
 * 参数为【截图像素坐标】（无需换算），坐标对应全屏截图 /tmp/computer-operator/latest_highres.png
 *
 * 例:
 *   node zoom_region.js 800 100 400 200          # 放大左上角区域
 *   node zoom_region.js 800 100 400 200 /tmp/computer-operator/zoom.png
 *
 * 输出:
 *   /tmp/co_zoom.png（默认）—— 放大 2x 的区域截图，方便 AI 精细分析
 *
 * 依赖: macOS 原生 sips / screencapture（无需安装）
 */

const { spawnSync } = require('child_process');
const fs = require('fs');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr?.trim() || r.stdout?.trim()}`);
  return r.stdout.trim();
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    console.log(`用法:
  node zoom_region.js <x> <y> <width> <height> [输出路径]
  
  从 /tmp/computer-operator/latest_highres.png 裁剪指定区域并放大 2 倍后保存
  坐标使用截图像素坐标
  
示例:
  node zoom_region.js 100 50 600 300           → 输出 /tmp/computer-operator/latest_zoom.png
  node zoom_region.js 100 50 600 300 /tmp/computer-operator/z.png`);
    process.exit(0);
  }

  const [x, y, w, h] = args.slice(0, 4).map(Number);
  const baseDir = '/tmp/computer-operator';
  const outputPath = args[4] || `${baseDir}/zoom_${Date.now()}.png`;
  const rawSourceImg = `${baseDir}/latest.png`;
  const sourceImg = fs.existsSync(rawSourceImg) ? fs.realpathSync(rawSourceImg) : rawSourceImg;

  if (!fs.existsSync(sourceImg)) {
    console.error(`❌ 源截图不存在: ${sourceImg}，请先运行截图`);
    process.exit(1);
  }

  // 1. 先用 sips 获取截图尺寸确认参数合法
  const sipsOut = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', sourceImg]);
  let imgW = 0, imgH = 0;
  for (const line of sipsOut.split('\n')) {
    if (line.includes('pixelWidth')) imgW = parseInt(line.split(':')[1].trim());
    if (line.includes('pixelHeight')) imgH = parseInt(line.split(':')[1].trim());
  }

  // 边界检查
  const cx = Math.max(0, Math.min(x, imgW - 1));
  const cy = Math.max(0, Math.min(y, imgH - 1));
  const cw = Math.min(w, imgW - cx);
  const ch = Math.min(h, imgH - cy);

  if (cw <= 0 || ch <= 0) {
    console.error(`❌ 区域超出图像边界: 图像 ${imgW}x${imgH}，请求区域 (${x},${y}) ${w}x${h}`);
    process.exit(1);
  }

  // 2. 用 sips 裁剪区域
  //    sips crop: sips -c <height> <width> --cropOffset <y> <x> input -o output
  const tmpCrop = `${baseDir}/zoom_crop_temp.png`;
  
  // 先复制一份
  fs.copyFileSync(sourceImg, tmpCrop);
  
  // sips crop需要先设置裁剪偏移，然后裁剪高度宽度
  run('sips', [
    tmpCrop,
    '--cropOffset', String(cy), String(cx),
    '-c', String(ch), String(cw),
    '-o', tmpCrop
  ]);

  // 3. 放大 2 倍以便 AI 看清细节
  const targetW = Math.min(cw * 2, 2560);  // 最大不超过 2560
  const targetH = Math.min(ch * 2, 1440);
  
  run('sips', [
    tmpCrop,
    '-z', String(targetH), String(targetW),
    '-o', outputPath
  ]);

  if (fs.existsSync(tmpCrop)) fs.unlinkSync(tmpCrop);

  if (!args[4]) {
    const latestZoom = `${baseDir}/latest_zoom.png`;
    try { fs.unlinkSync(latestZoom); } catch(e) {}
    try { fs.symlinkSync(outputPath, latestZoom); } catch(e) {}
  }

  console.log(JSON.stringify({
    status: 'ok',
    source: sourceImg,
    source_region: { x: cx, y: cy, width: cw, height: ch },
    output: outputPath,
    output_size: { width: targetW, height: targetH },
    tip: `已将截图 (${cx},${cy}) ${cw}x${ch} 区域放大 2x 保存到 ${outputPath}，请用 read_file 读取并分析`
  }, null, 2));
}

try {
  main();
} catch (e) {
  console.error('❌', e.message);
  process.exit(1);
}
