#!/usr/bin/env node
/**
 * analyze_screen.js — 分析截图坐标信息，输出换算指南
 * 用法: node analyze_screen.js [截图路径]
 * 默认: /tmp/computer-operator/latest.jpg
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  let imagePath = '/tmp/computer-operator/latest.jpg';
  let brief = false;

  for (const arg of argv) {
    if (arg === '--brief') {
      brief = true;
    } else if (arg === '--full') {
      brief = false;
    } else if (!arg.startsWith('--')) {
      imagePath = arg;
    }
  }

  return { imagePath, brief };
}

function getScreenInfo() {
  try {
    const scriptPath = path.join(__dirname, 'screen_info.js');
    const result = spawnSync('node', [scriptPath], {
      encoding: 'utf8',
      timeout: 10000
    });

    if (result.status === 0 && result.stdout) {
      return JSON.parse(result.stdout);
    }
  } catch (error) {
  }

  return null;
}

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

function getSystemContext() {
  const context = { os: 'macOS' };
  try {
    const sw = spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' });
    context.os_version = sw.stdout.trim();
    
    // 检测是否为深色模式
    const dark = spawnSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], { encoding: 'utf8' });
    context.appearance = dark.status === 0 ? 'Dark' : 'Light';

    // 获取当前前台应用
    const activeApp = spawnSync('osascript', ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'], { encoding: 'utf8' });
    context.active_app = activeApp.stdout.trim();
  } catch (e) {}
  return context;
}

function getCaptureMeta(imagePath) {
  const metaPath = '/tmp/computer-operator/latest_meta.json';
  const capture = {};

  if (fs.existsSync(metaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (parsed.captured_at) capture.captured_at = parsed.captured_at;
      if (parsed.captured_at_epoch) capture.captured_at_epoch = parsed.captured_at_epoch;
    } catch (e) {}
  }

  try {
    const stat = fs.statSync(imagePath);
    if (!capture.captured_at) capture.captured_at = stat.mtime.toISOString();
    if (!capture.captured_at_epoch) capture.captured_at_epoch = Math.floor(stat.mtimeMs / 1000);
  } catch (e) {}

  if (capture.captured_at_epoch) {
    const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000 - capture.captured_at_epoch));
    capture.age_seconds = ageSeconds;
    capture.freshness = ageSeconds <= 15 ? 'fresh' : ageSeconds <= 60 ? 'aging' : 'stale';
    capture.resume_rule = '继续执行、用户打断后恢复、或执行过任何可能改变 UI 的动作后，必须先重新截图，禁止沿用历史截图结论。';
  }

  return capture;
}

function getEffectiveScaleFactor(imagePath, imageWidth) {
  const screenInfo = getScreenInfo();
  const baseScale = Number(screenInfo?.scale_factor);
  const fallbackScale = getScaleFactor();
  const highresPath = '/tmp/computer-operator/latest_highres.png';
  let referenceWidth = imageWidth;

  if (fs.existsSync(highresPath)) {
    const highresSize = getImageSize(highresPath);
    if (highresSize.width) {
      referenceWidth = highresSize.width;
    }
  }

  const physicalToLogicalScale = Number.isFinite(baseScale) && baseScale > 0 ? baseScale : fallbackScale;
  const scaledFactor = physicalToLogicalScale * (imageWidth / referenceWidth);

  return Math.round(scaledFactor * 10000) / 10000;
}

function buildGrid(pw, ph, scale) {
  const cols = 4;
  const rows = 4;
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

  return grid;
}

function analyze(imagePath, brief) {
  const result = { 
    image_path: imagePath,
    mode: brief ? 'brief' : 'full',
    system_context: getSystemContext()
  };

  if (!fs.existsSync(imagePath)) {
    result.error = `文件不存在: ${imagePath}`;
    return result;
  }

  const statSize = fs.statSync(imagePath).size;
  result.file_size_kb = Math.round(statSize / 1024 * 10) / 10;
  result.capture = getCaptureMeta(imagePath);
  result.assets = {
    preview_image: '/tmp/computer-operator/latest.jpg',
    precision_image: '/tmp/computer-operator/latest_highres.png',
    recommended_flow: [
      '先用 latest.jpg 做全局理解',
      '发现文字太小或元素密集时，改用 zoom_region.js 截取局部',
      '需要验色或状态确认时使用 get_pixel.js'
    ]
  };

  // 获取截图尺寸
  const { width: pw, height: ph } = getImageSize(imagePath);
  if (pw && ph) {
    result.screenshot_size = { width: pw, height: ph };
  }

  // 获取缩放比例
  const scale = pw ? getEffectiveScaleFactor(imagePath, pw) : getScaleFactor();
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
    scale_factor: scale
  };

  if (pw && ph) {
    result.quick_reference = {
      screen_center: {
        screenshot_coord: [Math.round(pw / 2), Math.round(ph / 2)],
        click_coord: [Math.round(pw / 2 / scale), Math.round(ph / 2 / scale)]
      },
      top_left_hint: {
        screenshot_coord: [400, 200],
        click_coord: [Math.round(400 / scale), Math.round(200 / scale)]
      }
    };
  }

  if (!brief && pw && ph) {
    result.COORDINATE_GUIDE.examples = [
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
    ];
    result.grid_4x4 = buildGrid(pw, ph, scale);
    result.grid_note = 'R=行(1顶-4底)，C=列(1左-4右)。用 zone 定位区域后，使用 click_center 点击。';
  }

  return result;
}

const { imagePath: requestedImagePath, brief } = parseArgs(process.argv.slice(2));
const rawImagePath = requestedImagePath || '/tmp/computer-operator/latest.jpg';
const imagePath = fs.existsSync(rawImagePath) ? fs.realpathSync(rawImagePath) : rawImagePath;
const output = analyze(imagePath, brief);
console.log(JSON.stringify(output, null, 2));
