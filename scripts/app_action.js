#!/usr/bin/env node
/**
 * app_action.js — 应用启动与窗口状态控制
 *
 * 用法:
 *   node app_action.js open <App 名称> [--fullscreen]
 *   node app_action.js activate <App 名称>
 *   node app_action.js fullscreen <App 名称>
 */

const { spawnSync } = require('child_process');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `${command} 执行失败`);
  }

  return result.stdout.trim();
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function escapeAppleScriptString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function openApp(appName) {
  run('open', ['-a', appName]);
  console.log(`✅ 已打开应用: ${appName}`);
}

function activateApp(appName) {
  const escapedAppName = escapeAppleScriptString(appName);
  run('osascript', ['-e', `tell application "${escapedAppName}" to activate`]);
  console.log(`✅ 已激活应用: ${appName}`);
}

function ensureAccessibilityPermission() {
  try {
    run('osascript', ['-e', 'tell application "System Events" to count every process']);
  } catch (error) {
    if (String(error.message).includes('不允许辅助功能访问') || String(error.message).includes('Not authorised') || String(error.message).includes('not allowed assistive access')) {
      throw new Error('需要辅助功能权限：请在“系统设置 > 隐私与安全性 > 辅助功能”中授权当前终端和 osascript');
    }
    throw error;
  }
}

function enterFullScreen(appName) {
  const escapedAppName = escapeAppleScriptString(appName);

  try {
    ensureAccessibilityPermission();
    run('osascript', ['-e', `tell application "${escapedAppName}" to activate`]);
    sleep(300);
    run('osascript', ['-e', `tell application "System Events"
  tell process "${escapedAppName}"
    set frontmost to true
    keystroke "f" using {command down, control down}
  end tell
end tell`]);
    console.log(`✅ 已尝试将应用切换为全屏: ${appName}`);
  } catch (error) {
    if (String(error.message).includes('不允许辅助功能访问') || String(error.message).includes('Not authorised')) {
      throw new Error('全屏切换失败：当前终端或 osascript 没有辅助功能权限，请在“系统设置 > 隐私与安全性 > 辅助功能”中授权后重试');
    }
    throw error;
  }
}

function parseArgs(argv) {
  const fullscreen = argv.includes('--fullscreen');
  const args = argv.filter(arg => arg !== '--fullscreen');
  const action = args[0];
  const appName = args.slice(1).join(' ').trim();
  return { action, appName, fullscreen };
}

function main() {
  const { action, appName, fullscreen } = parseArgs(process.argv.slice(2));

  if (!action || !appName) {
    console.log(`用法:
  node app_action.js open <App 名称> [--fullscreen]
  node app_action.js activate <App 名称>
  node app_action.js fullscreen <App 名称>`);
    process.exit(action ? 1 : 0);
  }

  try {
    if (action === 'open') {
      openApp(appName);
      sleep(1200);
      activateApp(appName);
      if (fullscreen) {
        sleep(500);
        enterFullScreen(appName);
      }
      return;
    }

    if (action === 'activate') {
      activateApp(appName);
      return;
    }

    if (action === 'fullscreen') {
      enterFullScreen(appName);
      return;
    }

    console.error(`❌ 未知操作: ${action}`);
    process.exit(1);
  } catch (error) {
    console.error(`❌ 应用操作失败: ${error.message}`);
    process.exit(1);
  }
}

main();