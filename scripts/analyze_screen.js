#!/usr/bin/env node

const fs = require('fs');

const {
  DEFAULT_HIGHRES_IMAGE,
  DEFAULT_PREVIEW_IMAGE,
  getCaptureMeta,
  getEffectiveScaleFactor,
  getImageSize,
  maybeRun,
  resolveExistingPath
} = require('./screen_utils');

function parseArgs(argv) {
  let imagePath = DEFAULT_PREVIEW_IMAGE;
  let full = false;

  for (const arg of argv) {
    if (arg === '--full') {
      full = true;
      continue;
    }
    if (arg === '--brief') {
      full = false;
      continue;
    }
    if (!arg.startsWith('--')) {
      imagePath = arg;
    }
  }

  return { imagePath, full };
}

function getActiveApp() {
  return maybeRun('osascript', ['-e', 'tell application "System Events" to get name of first process whose frontmost is true'], 5000);
}

function getAppearance() {
  const output = maybeRun('defaults', ['read', '-g', 'AppleInterfaceStyle'], 5000);
  return output ? 'Dark' : 'Light';
}

function getOsVersion() {
  return maybeRun('sw_vers', ['-productVersion'], 5000);
}

function buildGrid(imageSize, scale) {
  const rows = 3;
  const cols = 3;
  const cellWidth = Math.round(imageSize.width / cols);
  const cellHeight = Math.round(imageSize.height / rows);
  const items = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const centerX = col * cellWidth + Math.round(cellWidth / 2);
      const centerY = row * cellHeight + Math.round(cellHeight / 2);
      items.push({
        zone: `${row + 1}-${col + 1}`,
        screenshot_center: [centerX, centerY],
        click_center: [Math.round(centerX / scale), Math.round(centerY / scale)]
      });
    }
  }

  return items;
}

function analyze(imagePath, full) {
  const normalizedImagePath = resolveExistingPath(imagePath);
  if (!fs.existsSync(normalizedImagePath)) {
    return {
      ok: false,
      error: `文件不存在: ${normalizedImagePath}`
    };
  }

  const imageSize = getImageSize(normalizedImagePath);
  const capture = getCaptureMeta(normalizedImagePath);
  const scaleFactor = getEffectiveScaleFactor(normalizedImagePath, DEFAULT_HIGHRES_IMAGE);
  const logicalSize = {
    width: Math.round(imageSize.width / scaleFactor),
    height: Math.round(imageSize.height / scaleFactor)
  };

  const output = {
    ok: true,
    mode: full ? 'full' : 'brief',
    image_path: normalizedImagePath,
    active_app: getActiveApp(),
    appearance: getAppearance(),
    os_version: getOsVersion(),
    capture,
    images: {
      preview: DEFAULT_PREVIEW_IMAGE,
      highres: DEFAULT_HIGHRES_IMAGE,
      latest_zoom: '/tmp/computer-operator/latest_zoom.png'
    },
    image_size: imageSize,
    logical_size: logicalSize,
    scale_factor: scaleFactor,
    coordinate_rule: {
      input: '传给 click 和 drag 的默认坐标是截图像素坐标',
      conversion: `逻辑点击坐标 = 截图坐标 / ${scaleFactor}`,
      bypass: '如果你已经拿到逻辑坐标，给命令加 --logical'
    },
    workflow: [
      '开始新任务或继续执行前，先重新 observe',
      '先看 preview，文字太小再 zoom',
      '点击或输入后，再 observe 一次确认界面变化'
    ]
  };

  if (full) {
    output.reference = {
      center: {
        screenshot: [Math.round(imageSize.width / 2), Math.round(imageSize.height / 2)],
        click: [Math.round(imageSize.width / 2 / scaleFactor), Math.round(imageSize.height / 2 / scaleFactor)]
      },
      grid_3x3: buildGrid(imageSize, scaleFactor)
    };
  }

  return output;
}

const options = parseArgs(process.argv.slice(2));
const result = analyze(options.imagePath, options.full);
console.log(JSON.stringify(result, null, 2));