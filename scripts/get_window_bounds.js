#!/usr/bin/env node
/**
 * get_window_bounds.js — 获取指定应用的窗口坐标和大小
 * 用法: node get_window_bounds.js "微信"
 */

const { spawnSync } = require('child_process');

function getWindowBounds(appName) {
  const script = `
    tell application "System Events"
      set p to first process whose name contains "${appName}" or name is "${appName}"
      set win to first window of p
      set {x, y} to position of win
      set {w, h} to size of win
      return {x, y, w, h}
    end tell
  `;

  const result = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  
  if (result.status !== 0) {
    return { error: `无法获取应用 "${appName}" 的窗口信息。请确保应用已打开且可见。`, details: result.stderr.trim() };
  }

  // AppleScript returns something like "0, 25, 1200, 800"
  const output = result.stdout.trim();
  const parts = output.split(', ').map(s => parseInt(s));

  if (parts.length === 4) {
    return {
      app: appName,
      logical_bounds: {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3]
      },
      note: "这是逻辑坐标 (Point)，直接用于 AppleScript 点击。如果用于全屏截图分析，请乘以 scale_factor。"
    };
  }

  return { error: "解析窗口信息失败", raw: output };
}

const appName = process.argv[2];
if (!appName) {
  console.log(JSON.stringify({ error: "请提供应用名称，例如: node get_window_bounds.js \"微信\"" }, null, 2));
  process.exit(1);
}

const bounds = getWindowBounds(appName);
console.log(JSON.stringify(bounds, null, 2));
