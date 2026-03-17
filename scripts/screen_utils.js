const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMP_DIR = '/tmp/computer-operator';
const DEFAULT_PREVIEW_IMAGE = `${TMP_DIR}/latest.jpg`;
const DEFAULT_HIGHRES_IMAGE = `${TMP_DIR}/latest_highres.png`;
const DEFAULT_META_FILE = `${TMP_DIR}/latest_meta.json`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 10000,
    ...options
  });

  if (result.error || result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${command} 执行失败`);
  }

  return result.stdout.trim();
}

function maybeRun(command, args, options = {}) {
  try {
    return run(command, args, options);
  } catch (error) {
    return '';
  }
}

function resolveExistingPath(filePath) {
  return fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath;
}

function getImageSize(imagePath) {
  const normalizedPath = resolveExistingPath(imagePath);
  const output = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', normalizedPath]);
  let width = null;
  let height = null;

  for (const line of output.split('\n')) {
    if (line.includes('pixelWidth')) width = parseInt(line.split(':')[1].trim(), 10);
    if (line.includes('pixelHeight')) height = parseInt(line.split(':')[1].trim(), 10);
  }

  return { width, height };
}

function getScreenshotProbeSize() {
  const probePath = path.join(TMP_DIR, 'co_scale_probe.png');
  maybeRun('screencapture', ['-x', '-m', probePath], { timeout: 5000 });

  try {
    const size = getImageSize(probePath);
    return {
      physicalW: size.width,
      physicalH: size.height
    };
  } finally {
    if (fs.existsSync(probePath)) {
      fs.unlinkSync(probePath);
    }
  }
}

function getDisplayInfo() {
  const output = maybeRun('system_profiler', ['SPDisplaysDataType'], { timeout: 10000 });
  if (!output) {
    return [];
  }

  const displays = [];
  let current = null;

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    const resolutionMatch = trimmed.match(/^Resolution:\s*(\d+)\s*x\s*(\d+)/);

    if (resolutionMatch) {
      if (current) {
        displays.push(current);
      }
      current = {
        physicalW: parseInt(resolutionMatch[1], 10),
        physicalH: parseInt(resolutionMatch[2], 10),
        retina: false,
        mirror: false
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (trimmed.includes('Retina') || trimmed.includes('HiDPI')) {
      current.retina = true;
    }
    if (/Mirror:\s*On/i.test(trimmed)) {
      current.mirror = true;
    }
  }

  if (current) {
    displays.push(current);
  }

  return displays;
}

function getTotalLogicalSize() {
  const output = maybeRun('osascript', ['-e', 'tell application "Finder" to get bounds of window of desktop'], { timeout: 5000 });
  const parts = output ? output.trim().split(', ') : [];
  if (parts.length !== 4) {
    return { totalLogicalW: null, totalLogicalH: null };
  }

  return {
    totalLogicalW: parseInt(parts[2], 10),
    totalLogicalH: parseInt(parts[3], 10)
  };
}

function roundScale(scale) {
  return Math.round(scale * 10000) / 10000;
}

function getScreenInfo() {
  const info = {};
  const { physicalW, physicalH } = getScreenshotProbeSize();
  const displays = getDisplayInfo();
  const { totalLogicalW, totalLogicalH } = getTotalLogicalSize();

  info.screenshot_physical = { width: physicalW, height: physicalH };
  info.displays = displays;
  info.total_logical = { width: totalLogicalW, height: totalLogicalH };

  let scaleFactor = 1;
  let mainDisplay = null;

  if (physicalW && displays.length > 0) {
    mainDisplay = displays.reduce((best, current) => {
      if (!best) {
        return current;
      }
      return Math.abs(current.physicalW - physicalW) < Math.abs(best.physicalW - physicalW) ? current : best;
    }, null);

    if (mainDisplay) {
      if (mainDisplay.retina) {
        info.main_logical = {
          width: mainDisplay.physicalW / 2,
          height: mainDisplay.physicalH / 2
        };
      } else {
        info.main_logical = {
          width: mainDisplay.physicalW,
          height: mainDisplay.physicalH
        };
      }

      if (info.main_logical.width) {
        scaleFactor = roundScale(physicalW / info.main_logical.width);
      }
    }
  } else if (physicalW && totalLogicalW && displays.length === 1) {
    scaleFactor = roundScale(physicalW / totalLogicalW);
  }

  info.scale_factor = scaleFactor;
  info.coordinate_tip = scaleFactor === 1
    ? `截图坐标 = 点击坐标（scale=1.0，无需换算）。截图 ${physicalW}x${physicalH}`
    : `截图坐标 ÷ ${scaleFactor} = 点击坐标。例: 截图 (${physicalW / 2 | 0}, ${physicalH / 2 | 0}) → 点击 (${physicalW / 2 / scaleFactor | 0}, ${physicalH / 2 / scaleFactor | 0})`;
  info.IMPORTANT = scaleFactor === 1
    ? '✅ 当前显示器无 HiDPI 缩放，截图坐标可直接用于点击'
    : `⚠️ Retina 显示器：点击坐标 = 截图坐标 ÷ ${scaleFactor}`;

  return info;
}

function getBaseScaleFactor() {
  const scaleFactor = Number(getScreenInfo().scale_factor);
  return Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
}

function getReferenceImageSize(referenceImage = DEFAULT_HIGHRES_IMAGE) {
  if (!fs.existsSync(referenceImage)) {
    return null;
  }

  const size = getImageSize(referenceImage);
  return size.width ? size : null;
}

function getEffectiveScaleFactor(sourceImage, referenceImage = DEFAULT_HIGHRES_IMAGE) {
  const normalizedSource = resolveExistingPath(sourceImage);
  const sourceSize = getImageSize(normalizedSource);
  if (!sourceSize.width) {
    return getBaseScaleFactor();
  }

  const referenceSize = getReferenceImageSize(referenceImage) || sourceSize;
  return roundScale(getBaseScaleFactor() * (sourceSize.width / referenceSize.width));
}

function getCaptureMeta(imagePath, metaFile = DEFAULT_META_FILE) {
  const normalizedPath = resolveExistingPath(imagePath);
  const output = {
    captured_at: null,
    captured_at_epoch: null,
    age_seconds: null,
    freshness: 'unknown'
  };

  if (fs.existsSync(metaFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      output.captured_at = parsed.captured_at || null;
      output.captured_at_epoch = parsed.captured_at_epoch || null;
    } catch (error) {
    }
  }

  if (!output.captured_at_epoch && fs.existsSync(normalizedPath)) {
    const stat = fs.statSync(normalizedPath);
    output.captured_at = stat.mtime.toISOString();
    output.captured_at_epoch = Math.floor(stat.mtimeMs / 1000);
  }

  if (output.captured_at_epoch) {
    output.age_seconds = Math.max(0, Math.floor(Date.now() / 1000 - output.captured_at_epoch));
    if (output.age_seconds <= 15) {
      output.freshness = 'fresh';
    } else if (output.age_seconds <= 60) {
      output.freshness = 'aging';
    } else {
      output.freshness = 'stale';
    }
  }

  return output;
}

module.exports = {
  DEFAULT_HIGHRES_IMAGE,
  DEFAULT_META_FILE,
  DEFAULT_PREVIEW_IMAGE,
  TMP_DIR,
  getBaseScaleFactor,
  getCaptureMeta,
  getDisplayInfo,
  getEffectiveScaleFactor,
  getImageSize,
  getReferenceImageSize,
  getScreenInfo,
  getTotalLogicalSize,
  maybeRun,
  resolveExistingPath,
  run
};