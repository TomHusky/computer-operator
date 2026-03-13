#!/usr/bin/env node
/**
 * analyze_screen.js — 分析截图坐标信息，输出换算指南
 * 用法: node analyze_screen.js [截图路径]
 * 默认: /tmp/computer-operator/latest.jpg
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getScaleFactor() {
  try {
    const logical = spawnSync('osascript', [
      '-e',
      'tell application "Finder" to get bounds of window of desktop'
    ], { encoding: 'utf8', timeout: 5000 });

    const baseDir = '/tmp/computer-operator';
    const tmpPath = path.join(baseDir, 'co_scale_probe.png');
    spawnSync('screencapture', ['-x', tmpPath], { timeout: 5000 });
    const sips = spawnSync('sips', ['-g', 'pixelWidth', tmpPath], { encoding: 'utf8' });
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

    let physicalW = null;
    if (sips.stdout) {
      for (const line of sips.stdout.split('\n')) {
        if (line.includes('pixelWidth')) {
          physicalW = parseInt(line.split(':')[1].trim());
          break;
        }
      }
    }

    let logicalW = null;
    if (logical.status === 0 && logical.stdout) {
      const parts = logical.stdout.trim().split(', ');
      if (parts.length === 4) logicalW = parseInt(parts[2]);
    }

    if (physicalW && logicalW) return Math.round((physicalW / logicalW) * 100) / 100;
  } catch (e) {}
  return 2.0;
}

function getImageSize(imagePath) {
  const sips = spawnSync('sips', [
    '-g', 'pixelWidth', '-g', 'pixelHeight', imagePath
  ], { encoding: 'utf8', timeout: 10000 });

  let w = null, h = null;
  for (const line of sips.stdout.split('\n')) {
    if (line.includes('pixelWidth')) w = parseInt(line.split(':')[1].trim());
    if (line.includes('pixelHeight')) h = parseInt(line.split(':')[1].trim());
  }
  return { width: w, height: h };
}

function analyze(imagePath) {
  const result = { image_path: imagePath };

  if (!fs.existsSync(imagePath)) {
    result.error = `文件不存在: ${imagePath}`;
    return result;
  }

  const statSize = fs.statSync(imagePath).size;
  result.file_size_kb = Math.round(statSize / 1024 * 10) / 10;

  // 获取截图尺寸
  const { width: pw, height: ph } = getImageSize(imagePath);
  if (pw && ph) {
    result.screenshot_size = { width: pw, height: ph };
  }

  // 获取缩放比例
  const scale = getScaleFactor();
  result.scale_factor = scale;

  // 逻辑屏幕尺寸
  if (pw && ph) {
    result.logical_size = {
      width: Math.round(pw / scale),
      height: Math.round(ph / scale)
    };
  }

  // ⚠️ 最重要：坐标换算指南
  result.COORDINATE_GUIDE = {
    WARNING: '⚠️ AI 读取截图识别到的坐标是【截图像素坐标】，必须换算后才能点击！',
    formula: `点击坐标 = 截图坐标 ÷ ${scale}`,
    scale_factor: scale,
    examples: pw && ph ? [
      {
        desc: '屏幕中心',
        screenshot_coord: [Math.round(pw / 2), Math.round(ph / 2)],
        click_coord: [Math.round(pw / 2 / scale), Math.round(ph / 2 / scale)]
      },
      {
        desc: '左上区域示例',
        screenshot_coord: [400, 200],
        click_coord: [Math.round(400 / scale), Math.round(200 / scale)]
      },
      {
        desc: '右下区域示例',
        screenshot_coord: [pw - 400, ph - 200],
        click_coord: [Math.round((pw - 400) / scale), Math.round((ph - 200) / scale)]
      }
    ] : []
  };

  // 屏幕网格分区（帮助 AI 定位元素）
  if (pw && ph) {
    const cols = 4, rows = 4;
    const cellW = Math.round(pw / cols);
    const cellH = Math.round(ph / rows);
    const grid = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = cellW * col + Math.round(cellW / 2);
        const cy = cellH * row + Math.round(cellH / 2);
        grid.push({
          zone: `R${row + 1}C${col + 1}`,
          screenshot_region: [cellW * col, cellH * row, cellW * (col + 1), cellH * (row + 1)],
          screenshot_center: [cx, cy],
          click_center: [Math.round(cx / scale), Math.round(cy / scale)]
        });
      }
    }

    result.grid_4x4 = grid;
    result.grid_note = 'R=行(1顶-4底)，C=列(1左-4右)。用 zone 定位区域后，使用 click_center 点击。';
  }

  return result;
}

const rawImagePath = process.argv[2] || '/tmp/computer-operator/latest.jpg';
const imagePath = fs.existsSync(rawImagePath) ? fs.realpathSync(rawImagePath) : rawImagePath;
const output = analyze(imagePath);
console.log(JSON.stringify(output, null, 2));
