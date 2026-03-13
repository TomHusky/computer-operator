#!/usr/bin/env node
/**
 * screen_info.js — 获取屏幕分辨率和缩放比例
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getScreenshotSize() {
  const baseDir = '/tmp/computer-operator';
  mkdirSyncRecursive(baseDir);
  const tmpPath = path.join(baseDir, 'co_scale_probe.png');
  spawnSync('screencapture', ['-x', '-m', tmpPath], { timeout: 5000 });

  const sips = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', tmpPath], { encoding: 'utf8' });
  let w = null, h = null;
  if (sips.stdout) {
    for (const line of sips.stdout.split('\n')) {
      if (line.includes('pixelWidth')) w = parseInt(line.split(':')[1].trim());
      if (line.includes('pixelHeight')) h = parseInt(line.split(':')[1].trim());
    }
  }
  if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  return { physicalW: w, physicalH: h };
}

function mkdirSyncRecursive(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDisplayInfo() {
  const result = spawnSync('system_profiler', ['SPDisplaysDataType'], { encoding: 'utf8', timeout: 10000 });
  const screens = [];
  if (!result.stdout) return screens;

  const lines = result.stdout.split('\n');
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const resMatch = trimmed.match(/^Resolution:\s*(\d+)\s*x\s*(\d+)/);
    if (resMatch) {
      if (current) screens.push(current);
      current = { physicalW: parseInt(resMatch[1]), physicalH: parseInt(resMatch[2]), retina: false };
    }
    if (current && (trimmed.includes('Retina') || trimmed.includes('HiDPI'))) current.retina = true;
  }
  if (current) screens.push(current);
  return screens;
}

function getScreenInfo() {
  const { physicalW, physicalH } = getScreenshotSize();
  const displays = getDisplayInfo();
  let scaleFactor = 2.0;

  if (physicalW && displays.length > 0) {
    const mainDisplay = displays.reduce((best, d) =>
      Math.abs(d.physicalW - physicalW) < Math.abs(best.physicalW - physicalW) ? d : best,
      displays[0]
    );
    scaleFactor = mainDisplay.retina ? 2.0 : 1.0;
  }

  return {
    screenshot_physical: { width: physicalW, height: physicalH },
    scale_factor: scaleFactor,
    coordinate_tip: `截图坐标 ÷ ${scaleFactor} = 点击坐标。`
  };
}

console.log(JSON.stringify(getScreenInfo(), null, 2));
