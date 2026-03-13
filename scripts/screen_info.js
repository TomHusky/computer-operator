#!/usr/bin/env node
/**
 * screen_info.js — 获取屏幕分辨率和缩放比例
 * 用法: node screen_info.js
 *
 * 关键输出:
 *   scale_factor  — 截图坐标换算因子（= 截图宽 / 主屏逻辑宽）
 *   coordinate_tip — 坐标换算提示
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── 获取截图物理像素尺寸 ────────────────────────────────────────
function getScreenshotSize() {
  const tmpPath = path.join(os.tmpdir(), 'co_scale_probe.png');
  spawnSync('screencapture', ['-x', '-m', tmpPath], { timeout: 5000 });  // -m 仅截主屏

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

// ─── 从 system_profiler 获取主屏分辨率 ──────────────────────────
function getDisplayInfo() {
  const result = spawnSync('system_profiler', ['SPDisplaysDataType'], { encoding: 'utf8', timeout: 10000 });
  const screens = [];
  
  if (!result.stdout) {
    return screens;
  }

  const lines = result.stdout.split('\n');
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    // 检测 Resolution 行：  "Resolution: 2560 x 1440 (QHD...)"
    const resMatch = trimmed.match(/^Resolution:\s*(\d+)\s*x\s*(\d+)/);
    if (resMatch) {
      if (current) screens.push(current);
      current = {
        physicalW: parseInt(resMatch[1]),
        physicalH: parseInt(resMatch[2]),
        retina: false,
        mirror: false,
      };
    }
    if (current) {
      if (trimmed.includes('Retina') || trimmed.includes('HiDPI')) current.retina = true;
      if (trimmed.match(/Mirror:\s*On/i)) current.mirror = true;
    }
  }
  if (current) screens.push(current);
  return screens;
}

// ─── 获取 AppleScript 全屏逻辑尺寸 ──────────────────────────────
function getTotalLogicalSize() {
  const r = spawnSync('osascript', ['-e',
    'tell application "Finder" to get bounds of window of desktop'
  ], { encoding: 'utf8', timeout: 5000 });

  if (r.status === 0 && r.stdout) {
    const parts = r.stdout.trim().split(', ');
    if (parts.length === 4) {
      return { totalLogicalW: parseInt(parts[2]), totalLogicalH: parseInt(parts[3]) };
    }
  }
  return { totalLogicalW: null, totalLogicalH: null };
}

// ─── 主逻辑 ──────────────────────────────────────────────────────
function getScreenInfo() {
  const info = {};

  // 获取截图物理尺寸（-m 仅截主屏）
  const { physicalW, physicalH } = getScreenshotSize();
  info.screenshot_physical = { width: physicalW, height: physicalH };

  // 获取显示器列表
  const displays = getDisplayInfo();
  info.displays = displays;

  // 获取总逻辑尺寸
  const { totalLogicalW, totalLogicalH } = getTotalLogicalSize();
  info.total_logical = { width: totalLogicalW, height: totalLogicalH };

  // ─── 计算 scale_factor ─────────────────────────────────────────
  // 策略：截图物理宽 / 主屏逻辑宽
  // 主屏逻辑宽 = 找第一个非镜像显示器，physicalW 与截图最匹配
  let scaleFactor = null;
  let mainDisplay = null;

  if (physicalW && displays.length > 0) {
    // 找与截图物理宽最接近的显示器
    mainDisplay = displays.reduce((best, d) =>
      Math.abs(d.physicalW - physicalW) < Math.abs(best.physicalW - physicalW) ? d : best,
      displays[0]
    );

    if (mainDisplay.retina) {
      // Retina: 逻辑宽 = 物理宽 / 2
      info.main_logical = { width: mainDisplay.physicalW / 2, height: mainDisplay.physicalH / 2 };
      // 截图物理宽 和 主屏物理宽相同 → scale = 2
      scaleFactor = physicalW / info.main_logical.width;
    } else {
      // 非 Retina: 逻辑宽 = 物理宽
      info.main_logical = { width: mainDisplay.physicalW, height: mainDisplay.physicalH };
      scaleFactor = physicalW / info.main_logical.width; // 应为 1.0
    }
    scaleFactor = Math.round(scaleFactor * 100) / 100;
  } else if (physicalW && totalLogicalW) {
    // 备用：如果单屏，总逻辑 = 主屏逻辑
    if (displays.length === 1) {
      scaleFactor = Math.round((physicalW / totalLogicalW) * 100) / 100;
    } else {
      // 多屏：假设主屏占多屏总宽的 physicalW / totalLogicalW 比例
      scaleFactor = 1.0; // 安全默认
      info.scale_note = '多显示器环境，默认 scale=1.0，请根据实际情况调整';
    }
  } else {
    scaleFactor = 1.0;
    info.scale_note = '无法自动检测，默认 scale=1.0';
  }

  info.scale_factor = scaleFactor;

  // 换算说明
  info.coordinate_tip = scaleFactor === 1.0
    ? `截图坐标 = 点击坐标（scale=1.0，无需换算）。截图 ${physicalW}x${physicalH}`
    : `截图坐标 ÷ ${scaleFactor} = 点击坐标。例: 截图 (${physicalW/2|0}, ${physicalH/2|0}) → 点击 (${physicalW/2/scaleFactor|0}, ${physicalH/2/scaleFactor|0})`;

  info.IMPORTANT = scaleFactor === 1.0
    ? '✅ 当前显示器无 HiDPI 缩放，截图坐标可直接用于点击'
    : `⚠️ Retina 显示器：点击坐标 = 截图坐标 ÷ ${scaleFactor}`;

  return info;
}

console.log(JSON.stringify(getScreenInfo(), null, 2));
