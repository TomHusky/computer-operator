#!/usr/bin/env node
/**
 * zoom_region.js — 截取并放大截图的指定区域
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
  
  从 /tmp/computer-operator/latest.png 裁剪指定区域并放大 2 倍后保存
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

  const sipsOut = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', sourceImg]);
  let imgW = 0, imgH = 0;
  for (const line of sipsOut.split('\n')) {
    if (line.includes('pixelWidth')) imgW = parseInt(line.split(':')[1].trim());
    if (line.includes('pixelHeight')) imgH = parseInt(line.split(':')[1].trim());
  }

  const cx = Math.max(0, Math.min(x, imgW - 1));
  const cy = Math.max(0, Math.min(y, imgH - 1));
  const cw = Math.min(w, imgW - cx);
  const ch = Math.min(h, imgH - cy);

  if (cw <= 0 || ch <= 0) {
    console.error(`❌ 区域超出图像边界: 图像 ${imgW}x${imgH}，请求区域 (${x},${y}) ${w}x${h}`);
    process.exit(1);
  }

  const tmpCrop = `${baseDir}/zoom_crop_temp.png`;
  fs.copyFileSync(sourceImg, tmpCrop);
  run('sips', [
    tmpCrop,
    '--cropOffset', String(cy), String(cx),
    '-c', String(ch), String(cw),
    '-o', tmpCrop
  ]);

  const targetW = Math.min(cw * 2, 2560);
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
