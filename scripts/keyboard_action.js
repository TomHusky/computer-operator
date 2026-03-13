#!/usr/bin/env node
/**
 * keyboard_action.js — 键盘输入控制（支持中文剪贴板方式输入）
 *
 * 用法:
 *   node keyboard_action.js type <文字>          # 输入文字（统一使用剪贴板粘贴方式）
 *   node keyboard_action.js type_enter <文字>    # 输入后按 Enter
 *   node keyboard_action.js key <键名>           # 按单个键
 *   node keyboard_action.js hotkey <组合键>      # 快捷键（用+分隔）
 *
 * 常用键名: return, escape, tab, space, delete, up, down, left, right,
 *           f1-f12, home, end, pageup, pagedown
 *
 * 快捷键示例:
 *   command+c  复制    command+v  粘贴    command+a  全选
 *   command+z  撤销    command+w  关闭    command+q  退出
 *   command+space  Spotlight    command+tab  切换应用
 *
 * 依赖: 使用 osascript (AppleScript) 实现，无需额外安装
 */

const { spawnSync } = require('child_process');

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

// AppleScript 修饰键映射
const MOD_MAP = {
  'command': 'command down', 'cmd': 'command down',
  'shift': 'shift down',
  'option': 'option down', 'opt': 'option down', 'alt': 'option down',
  'control': 'control down', 'ctrl': 'control down',
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

// ─── 输入函数 ────────────────────────────────────────────────────
function typeViaClipboard(text) {
  // 写入剪贴板后粘贴（完美支持中英文、特殊字符和表情）
  const result = spawnSync('pbcopy', [], {
    input: text,
    encoding: 'utf8',
    timeout: 3000
  });
  if (result.status !== 0) throw new Error('pbcopy 失败');

  // 延迟一小段确保剪贴板已更新
  execSleep(50);

  // Command+V 粘贴
  runAppleScript('tell application "System Events" to keystroke "v" using command down');
  console.log(`✅ 文本输入(剪贴板方式): ${JSON.stringify(text)}`);
}

function typeEnter(text) {
  typeViaClipboard(text);
  execSleep(100);
  runAppleScript('tell application "System Events" to key code 36'); // return key
  console.log(`✅ 输入并回车: ${JSON.stringify(text)}`);
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

function hotkey(combo) {
  const parts = combo.toLowerCase().split('+');
  const modifiers = [];
  let keyPart = null;

  for (const part of parts) {
    if (MOD_MAP[part]) {
      modifiers.push(MOD_MAP[part]);
    } else {
      keyPart = part;
    }
  }

  if (!keyPart) {
    throw new Error(`无效的快捷键: ${combo}`);
  }

  let script;
  const modStr = modifiers.length > 0 ? ` using {${modifiers.join(', ')}}` : '';

  // 单字母/数字 keystroke
  if (keyPart.length === 1) {
    script = `tell application "System Events" to keystroke "${keyPart}"${modStr}`;
  } else {
    const mapped = KEY_MAP[keyPart];
    if (mapped) {
      const code = keyCodeForName(mapped);
      script = `tell application "System Events" to key code ${code}${modStr}`;
    } else {
      script = `tell application "System Events" to keystroke "${keyPart}"${modStr}`;
    }
  }

  runAppleScript(script);
  console.log(`✅ 快捷键: ${combo}`);
}

function execSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

// ─── 主函数 ──────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`用法:
  node keyboard_action.js type <文字>
  node keyboard_action.js type_enter <文字>
  node keyboard_action.js key <键名>
  node keyboard_action.js hotkey <组合键>`);
    process.exit(0);
  }

  const action = args[0].toLowerCase();
  const rest = args.slice(1).join(' ');

  try {
    switch (action) {
      case 'type':
      case 'type_cn': // 保留 type_cn 别名
        typeViaClipboard(rest);
        break;
      case 'type_enter':
        typeEnter(rest);
        break;
      case 'key':
        pressKey(args[1]);
        break;
      case 'hotkey':
        hotkey(args[1]);
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
