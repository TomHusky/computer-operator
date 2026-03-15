#!/usr/bin/env node
/**
 * keyboard_action.js — 键盘输入控制（中文统一走剪贴板粘贴）
 *
 * 用法:
 *   node keyboard_action.js type <文字>          # 粘贴文字
 *   node keyboard_action.js paste <文字>         # 粘贴文字（别名）
 *   node keyboard_action.js type_enter <文字>    # 粘贴后按 Enter
 *   node keyboard_action.js paste_enter <文字>   # 粘贴后按 Enter（别名）
 *   node keyboard_action.js key <键名>           # 按单个键
 *
 * 常用键名: return, escape, tab, space, delete, up, down, left, right,
 *           f1-f12, home, end, pageup, pagedown
 *
 * 依赖: 使用 osascript (AppleScript) 实现，无需额外安装
 */

const { spawnSync } = require('child_process');

const DEFAULT_DELAY_MS = 180;

// ─── AppleScript 键名映射 ────────────────────────────────────────
const KEY_MAP = {
  'return': 'return', 'enter': 'return',
  'escape': 'escape', 'esc': 'escape',
  'tab': 'tab',
  'space': 'space',
  'delete': 'delete', 'backspace': 'delete',
  'up': 'up arrow', 'down': 'down arrow',
  'left': 'left arrow', 'right': 'right arrow',
  'home': 'home', 'end': 'end',
  'pageup': 'page up', 'pagedown': 'page down',
  'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4',
  'f5': 'f5', 'f6': 'f6', 'f7': 'f7', 'f8': 'f8',
  'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12',
};

function runAppleScript(script) {
  const result = spawnSync('osascript', ['-e', script], {
    encoding: 'utf8',
    timeout: 10000
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'AppleScript 执行失败');
  }
  return result.stdout.trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withRetries(label, fn, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        sleep(DEFAULT_DELAY_MS * attempt);
      }
    }
  }

  throw new Error(`${label}: ${lastError.message}`);
}

function runAppleScriptWithArgs(lines, args = []) {
  const commandArgs = [];
  for (const line of lines) {
    commandArgs.push('-e', line);
  }
  if (args.length > 0) {
    commandArgs.push('--', ...args);
  }

  const result = spawnSync('osascript', commandArgs, {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8'
    }
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'AppleScript 参数调用失败');
  }
  return result.stdout.trim();
}

// ─── 输入函数 ────────────────────────────────────────────────────
function readClipboard() {
  try {
    return runAppleScript('the clipboard as text');
  } catch (error) {
    return '';
  }
}

function writeClipboard(text) {
  runAppleScriptWithArgs([
    'on run argv',
    'set the clipboard to item 1 of argv',
    'end run'
  ], [text]);
}

function typeViaClipboard(text) {
  const previousClipboard = withRetries('读取剪贴板失败', () => readClipboard(), 2);

  try {
    withRetries('写入剪贴板失败', () => writeClipboard(text), 3);
    sleep(DEFAULT_DELAY_MS);
    withRetries('执行粘贴失败', () => runAppleScript('tell application "System Events" to keystroke "v" using command down'), 3);
    sleep(DEFAULT_DELAY_MS + 60);
    console.log(`✅ 文本已粘贴: ${JSON.stringify(text)}`);
  } finally {
    try {
      sleep(DEFAULT_DELAY_MS);
      writeClipboard(previousClipboard);
    } catch (error) {
      console.warn(`⚠️ 恢复剪贴板失败: ${error.message}`);
    }
  }
}

function typeEnter(text) {
  typeViaClipboard(text);
  sleep(DEFAULT_DELAY_MS);
  withRetries('回车失败', () => runAppleScript('tell application "System Events" to key code 36'), 3);
  console.log(`✅ 粘贴并回车: ${JSON.stringify(text)}`);
}

function pressKey(keyName) {
  const lower = keyName.toLowerCase();
  const mapped = KEY_MAP[lower];
  if (mapped) {
    runAppleScript(`tell application "System Events" to key code ${keyCodeForName(mapped)}`);
  } else if (lower.length === 1) {
    const escaped = lower.replace(/"/g, '\\"');
    runAppleScript(`tell application "System Events" to keystroke "${escaped}"`);
  } else {
    throw new Error(`未知键名: ${keyName}，请参考文档`);
  }
  console.log(`✅ 按键: ${keyName}`);
}

// key code 映射（常用键）
function keyCodeForName(name) {
  const codes = {
    'return': 36, 'tab': 48, 'space': 49, 'delete': 51,
    'escape': 53, 'up arrow': 126, 'down arrow': 125,
    'left arrow': 123, 'right arrow': 124,
    'home': 115, 'end': 119, 'page up': 116, 'page down': 121,
    'f1': 122, 'f2': 120, 'f3': 99, 'f4': 118,
    'f5': 96, 'f6': 97, 'f7': 98, 'f8': 100,
    'f9': 101, 'f10': 109, 'f11': 103, 'f12': 111,
  };
  return codes[name] !== undefined ? codes[name] : 36;
}

// ─── 主函数 ──────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`用法:
  node keyboard_action.js type <文字>
  node keyboard_action.js paste <文字>
  node keyboard_action.js type_enter <文字>
  node keyboard_action.js paste_enter <文字>
  node keyboard_action.js key <键名>`);
    process.exit(0);
  }

  const action = args[0].toLowerCase();
  const rest = args.slice(1).join(' ');

  try {
    switch (action) {
      case 'type':
      case 'paste':
      case 'type_cn': // 保留 type_cn 别名
        typeViaClipboard(rest);
        break;
      case 'type_enter':
      case 'paste_enter':
        typeEnter(rest);
        break;
      case 'key':
        if (!args[1]) throw new Error('请提供键名');
        pressKey(args[1]);
        break;
      default:
        console.error(`❌ 未知操作: ${action}`);
        process.exit(1);
    }
  } catch (e) {
    console.error(`❌ 键盘操作失败: ${e.message}`);
    process.exit(1);
  }
}

main();
