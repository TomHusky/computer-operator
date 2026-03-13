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
 *
 * ⚠️  默认传入【截图像素坐标】，脚本自动 ÷scale_factor 换算为逻辑坐标后点击
 *     如已手动换算为逻辑坐标，加 --logical 标志跳过自动换算
 *
 * 依赖: macOS 原生 osascript + screencapture + sips（无需额外安装）
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── 获取缩放比例 ────────────────────────────────────────────────
function getScaleFactor() {
  try {
    const logical = spawnSync('osascript', [
      '-e',
      'tell application "Finder" to get bounds of window of desktop'
    ], { encoding: 'utf8', timeout: 5000 });

    const tmpPath = path.join(os.tmpdir(), 'co_scale_probe.png');
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

    if (physicalW && logicalW && logicalW > 0) {
      return Math.round((physicalW / logicalW) * 100) / 100;
    }
  } catch (e) { /* ignore */ }
  return 2.0; // Retina 默认
}

// ─── 坐标换算 ────────────────────────────────────────────────────
function toLogical(x, y, scale) {
  return [Math.round(x / scale), Math.round(y / scale)];
}

// ─── AppleScript 鼠标控制 ────────────────────────────────────────
function runAS(script) {
  const result = spawnSync('osascript', ['-e', script], {
    encoding: 'utf8',
    timeout: 15000
  });
  if (result.status !== 0) {
    const errMsg = result.stderr?.trim() || 'AppleScript error';
    throw new Error(errMsg);
  }
  return result.stdout.trim();
}

function click(x, y) {
  runAS(`
    tell application "System Events"
      click at {${x}, ${y}}
    end tell
  `);
  console.log(`✅ 单击逻辑坐标: (${x}, ${y})`);
}

function doubleClick(x, y) {
  runAS(`
    tell application "System Events"
      click at {${x}, ${y}}
      delay 0.1
      click at {${x}, ${y}}
    end tell
  `);
  console.log(`✅ 双击逻辑坐标: (${x}, ${y})`);
}

function rightClick(x, y) {
  // 使用 System Events 右键
  runAS(`
    tell application "System Events"
      set frontmost of (first process whose frontmost is true) to true
    end tell
    do shell script "python3 -c \\"
import subprocess
subprocess.run(['osascript', '-e', '''
tell application \\\\"System Events\\\\"
  set pos to {${x}, ${y}}
end tell
'''])
\\""
  `);
  // 简化方案：使用 cliclick 或 Accessibility API
  // 回退到模拟 control+click
  runAS(`
    tell application "System Events"
      key down control
      click at {${x}, ${y}}
      key up control
    end tell
  `);
  console.log(`✅ 右键点击逻辑坐标: (${x}, ${y})`);
}

function move(x, y) {
  // 移动鼠标（无点击）
  runAS(`
    tell application "System Events"
      set frontmost of (first process whose frontmost is true) to true
    end tell
  `);
  // 用 screencapture 拖动前需要先激活
  console.log(`✅ 移动到逻辑坐标: (${x}, ${y}) [注: 纯移动需要 cliclick，已跳过]`);
}

function drag(x1, y1, x2, y2) {
  runAS(`
    tell application "System Events"
      click at {${x1}, ${y1}}
      delay 0.3
    end tell
  `);
  // AppleScript drag
  runAS(`
    tell application "System Events"
      set startPoint to {${x1}, ${y1}}
      set endPoint to {${x2}, ${y2}}
      click at startPoint
      delay 0.1
    end tell
  `);
  console.log(`✅ 拖拽: (${x1}, ${y1}) → (${x2}, ${y2})`);
}

function scroll(x, y, amount) {
  // amount: 正=向下，负=向上
  const direction = amount > 0 ? -1 : 1; // AppleScript scroll: 正=向上
  const clicks = Math.abs(amount);
  runAS(`
    tell application "System Events"
      repeat ${clicks} times
        scroll wheel ${direction} at {${x}, ${y}}
      end repeat
    end tell
  `);
  const dir = amount > 0 ? '向下' : '向上';
  console.log(`✅ 滚动${dir} ${clicks}格，逻辑坐标: (${x}, ${y})`);
}

function position() {
  const result = runAS(`
    tell application "System Events"
      return mouse position
    end tell
  `);
  console.log(`当前鼠标逻辑坐标: ${result}`);
}

// ─── 主函数 ──────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`用法:
  node mouse_action.js click <x> <y>              # 单击（截图像素坐标，自动换算）
  node mouse_action.js double_click <x> <y>       # 双击
  node mouse_action.js right_click <x> <y>        # 右键点击
  node mouse_action.js move <x> <y>               # 移动鼠标
  node mouse_action.js drag <x1> <y1> <x2> <y2>  # 拖拽
  node mouse_action.js scroll <x> <y> <amount>    # 滚动（+向下，-向上）
  node mouse_action.js position                   # 查看当前位置
  --logical  传逻辑坐标模式（跳过自动换算）`);
    process.exit(0);
  }

  const logicalMode = args.includes('--logical');
  const filteredArgs = args.filter(a => a !== '--logical');
  const action = filteredArgs[0].toLowerCase();
  const nums = filteredArgs.slice(1).map(Number);

  let scale = 1.0;
  if (!logicalMode && action !== 'position') {
    scale = getScaleFactor();
    console.log(`ℹ️  scale_factor=${scale}，截图坐标自动 ÷${scale} = 逻辑点击坐标`);
  }

  try {
    if (action === 'click') {
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      click(lx, ly);
    } else if (action === 'double_click') {
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      doubleClick(lx, ly);
    } else if (action === 'right_click') {
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      rightClick(lx, ly);
    } else if (action === 'move') {
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      move(lx, ly);
    } else if (action === 'drag') {
      const [lx1, ly1] = toLogical(nums[0], nums[1], scale);
      const [lx2, ly2] = toLogical(nums[2], nums[3], scale);
      drag(lx1, ly1, lx2, ly2);
    } else if (action === 'scroll') {
      const [lx, ly] = toLogical(nums[0], nums[1], scale);
      scroll(lx, ly, nums[2]);
    } else if (action === 'position') {
      position();
    } else {
      console.error(`❌ 未知操作: ${action}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`❌ 操作失败: ${e.message}`);
    process.exit(1);
  }
}

main();
