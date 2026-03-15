#!/usr/bin/env node
/**
 * mouse_action.js — 精细化鼠标控制（自动处理 Retina 坐标换算）
 *
 * 用法（坐标传入截图像素坐标，脚本自动换算为逻辑坐标）：
 *   node mouse_action.js click <x> <y>
 *   node mouse_action.js double_click <x> <y>
 *   node mouse_action.js right_click <x> <y>
 *   node mouse_action.js move <x> <y>
 *   node mouse_action.js drag <x1> <y1> <x2> <y2>
 *   node mouse_action.js scroll <x> <y> <amount>   # 正=向下，负=向上
 *   node mouse_action.js position                   # 获取当前鼠标位置
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getDisplayScaleFactorFallback() {
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
          physicalW = parseInt(line.split(':')[1].trim(), 10);
          break;
        }
      }
    }

    let logicalW = null;
    if (logical.status === 0 && logical.stdout) {
      const parts = logical.stdout.trim().split(', ');
      if (parts.length === 4) {
        logicalW = parseInt(parts[2], 10);
      }
    }

    if (physicalW && logicalW && logicalW > 0) {
      return Math.round((physicalW / logicalW) * 100) / 100;
    }
  } catch (error) {
  }

  return 2.0;
}

function getScreenInfoScaleFactor() {
  try {
    const scriptPath = path.join(__dirname, 'screen_info.js');
    const result = spawnSync('node', [scriptPath], {
      encoding: 'utf8',
      timeout: 10000
    });

    if (result.status === 0 && result.stdout) {
      const parsed = JSON.parse(result.stdout);
      const scaleFactor = Number(parsed.scale_factor);
      if (Number.isFinite(scaleFactor) && scaleFactor > 0) {
        return scaleFactor;
      }
    }
  } catch (error) {
  }

  return getDisplayScaleFactorFallback();
}

function getImageSize(imagePath) {
  const sips = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imagePath], {
    encoding: 'utf8',
    timeout: 10000
  });

  let width = null;
  let height = null;
  for (const line of sips.stdout.split('\n')) {
    if (line.includes('pixelWidth')) width = parseInt(line.split(':')[1].trim(), 10);
    if (line.includes('pixelHeight')) height = parseInt(line.split(':')[1].trim(), 10);
  }

  return { width, height };
}

function parseCliArgs(argv) {
  const logicalMode = argv.includes('--logical');
  const highresMode = argv.includes('--highres');
  const imageFlagIndex = argv.indexOf('--image');
  let sourceImage = highresMode ? '/tmp/computer-operator/latest_highres.png' : '/tmp/computer-operator/latest.jpg';

  if (imageFlagIndex >= 0 && argv[imageFlagIndex + 1]) {
    sourceImage = argv[imageFlagIndex + 1];
  }

  const filteredArgs = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--logical' || arg === '--highres') {
      continue;
    }
    if (arg === '--image') {
      index += 1;
      continue;
    }
    filteredArgs.push(arg);
  }

  return { logicalMode, filteredArgs, sourceImage };
}

function getEffectiveScaleFactor(sourceImage) {
  const normalizedSource = fs.existsSync(sourceImage) ? fs.realpathSync(sourceImage) : sourceImage;
  const currentSize = getImageSize(normalizedSource);
  if (!currentSize.width) {
    return getScreenInfoScaleFactor();
  }

  const highresPath = '/tmp/computer-operator/latest_highres.png';
  let referenceWidth = currentSize.width;
  if (fs.existsSync(highresPath)) {
    const highresSize = getImageSize(highresPath);
    if (highresSize.width) {
      referenceWidth = highresSize.width;
    }
  }

  const baseScale = getScreenInfoScaleFactor();
  const scale = baseScale * (currentSize.width / referenceWidth);
  return Math.round(scale * 10000) / 10000;
}

function toLogical(x, y, scale) {
  return [Math.round(x / scale), Math.round(y / scale)];
}

function runAS(script) {
  const result = spawnSync('osascript', ['-e', script], {
    encoding: 'utf8',
    timeout: 15000
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'AppleScript error');
  }

  return result.stdout.trim();
}

function findCliclick() {
  const result = spawnSync('which', ['cliclick'], {
    encoding: 'utf8',
    timeout: 3000
  });

  return result.status === 0 ? result.stdout.trim() : null;
}

function runCliClick(commands) {
  const binary = findCliclick();
  if (!binary) {
    throw new Error('当前系统未安装 cliclick，move/drag 需要先运行 brew install cliclick');
  }

  const result = spawnSync(binary, commands, {
    encoding: 'utf8',
    timeout: 15000
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'cliclick 执行失败');
  }
}

function ensureFiniteNumbers(values, expectedLength) {
  if (values.length < expectedLength || values.slice(0, expectedLength).some(value => !Number.isFinite(value))) {
    throw new Error('坐标参数无效，请传入完整数字');
  }
}

function click(x, y) {
  if (findCliclick()) {
    runCliClick([`c:${x},${y}`]);
  } else {
    runAS(`
      tell application "System Events"
        click at {${x}, ${y}}
      end tell
    `);
  }

  console.log(`✅ 单击逻辑坐标: (${x}, ${y})`);
}

function doubleClick(x, y) {
  if (findCliclick()) {
    runCliClick([`dc:${x},${y}`]);
  } else {
    runAS(`
      tell application "System Events"
        click at {${x}, ${y}}
        delay 0.1
        click at {${x}, ${y}}
      end tell
    `);
  }

  console.log(`✅ 双击逻辑坐标: (${x}, ${y})`);
}

function rightClick(x, y) {
  if (findCliclick()) {
    runCliClick([`rc:${x},${y}`]);
  } else {
    runAS(`
      tell application "System Events"
        key down control
        click at {${x}, ${y}}
        key up control
      end tell
    `);
  }

  console.log(`✅ 右键点击逻辑坐标: (${x}, ${y})`);
}

function move(x, y) {
  runCliClick([`m:${x},${y}`]);
  console.log(`✅ 移动到逻辑坐标: (${x}, ${y})`);
}

function drag(x1, y1, x2, y2) {
  runCliClick([`dd:${x1},${y1}`, `m:${x2},${y2}`, `du:${x2},${y2}`]);
  console.log(`✅ 拖拽: (${x1}, ${y1}) → (${x2}, ${y2})`);
}

function scroll(x, y, amount) {
  const clicks = Math.max(1, Math.abs(amount));
  const direction = amount > 0 ? -1 : 1;

  runAS(`
    tell application "System Events"
      repeat ${clicks} times
        scroll wheel ${direction} at {${x}, ${y}}
      end repeat
    end tell
  `);

  console.log(`✅ 滚动${amount > 0 ? '向下' : '向上'} ${clicks}格，逻辑坐标: (${x}, ${y})`);
}

function position() {
  const binary = findCliclick();
  if (!binary) {
    throw new Error('position 需要 cliclick 支持；请先运行 brew install cliclick');
  }

  const result = spawnSync(binary, ['p:.'], {
    encoding: 'utf8',
    timeout: 5000
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || '读取鼠标位置失败');
  }

  console.log(`当前鼠标逻辑坐标: ${result.stdout.trim()}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`用法:
  node mouse_action.js click <x> <y>
  node mouse_action.js double_click <x> <y>
  node mouse_action.js right_click <x> <y>
  node mouse_action.js move <x> <y>
  node mouse_action.js drag <x1> <y1> <x2> <y2>
  node mouse_action.js scroll <x> <y> <amount>
  node mouse_action.js position
  --logical  传逻辑坐标模式（跳过自动换算）
  --highres  坐标来自 latest_highres.png
  --image <path>  指定坐标来源图片`);
    process.exit(0);
  }

  const { logicalMode, filteredArgs, sourceImage } = parseCliArgs(args);
  const action = filteredArgs[0].toLowerCase();
  const nums = filteredArgs.slice(1).map(Number);

  let scale = 1.0;
  if (!logicalMode && action !== 'position') {
    scale = getEffectiveScaleFactor(sourceImage);
    console.log(`ℹ️  source_image=${sourceImage}`);
    console.log(`ℹ️  scale_factor=${scale}，截图坐标自动 ÷${scale} = 逻辑点击坐标`);
  }

  try {
    if (action === 'click') {
      ensureFiniteNumbers(nums, 2);
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      click(lx, ly);
    } else if (action === 'double_click') {
      ensureFiniteNumbers(nums, 2);
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      doubleClick(lx, ly);
    } else if (action === 'right_click') {
      ensureFiniteNumbers(nums, 2);
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      rightClick(lx, ly);
    } else if (action === 'move') {
      ensureFiniteNumbers(nums, 2);
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      move(lx, ly);
    } else if (action === 'drag') {
      ensureFiniteNumbers(nums, 4);
      const [lx1, ly1] = toLogical(nums[0], nums[1], scale);
      const [lx2, ly2] = toLogical(nums[2], nums[3], scale);
      drag(lx1, ly1, lx2, ly2);
    } else if (action === 'scroll') {
      ensureFiniteNumbers(nums, 3);
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      scroll(lx, ly, nums[2]);
    } else if (action === 'position') {
      position();
    } else {
      throw new Error(`未知操作: ${action}`);
    }
  } catch (error) {
    console.error(`❌ 操作失败: ${error.message}`);
    process.exit(1);
  }
}

main();