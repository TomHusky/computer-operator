#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const DEFAULT_PREVIEW = '/tmp/computer-operator/latest.jpg';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function runNodeScript(scriptName, args = [], options = {}) {
  const scriptPath = path.join(SCRIPTS, scriptName);
  return run('node', [scriptPath, ...args], options);
}

function runShellScript(scriptName, args = [], options = {}) {
  const scriptPath = path.join(SCRIPTS, scriptName);
  return run('bash', [scriptPath, ...args], options);
}

function exitWithResult(result, failureMessage) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(result.stderr);
      if (!result.stderr.endsWith('\n')) {
        process.stderr.write('\n');
      }
    }
    if (!result.stderr && failureMessage) {
      process.stderr.write(`${failureMessage}\n`);
    }
    process.exit(result.status || 1);
  }
}

function getImageSize(imagePath) {
  const normalized = fs.existsSync(imagePath) ? fs.realpathSync(imagePath) : imagePath;
  const result = run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', normalized], { timeout: 10000 });
  if (result.status !== 0) {
    return null;
  }

  let width = null;
  let height = null;
  for (const line of result.stdout.split('\n')) {
    if (line.includes('pixelWidth')) width = parseInt(line.split(':')[1].trim(), 10);
    if (line.includes('pixelHeight')) height = parseInt(line.split(':')[1].trim(), 10);
  }

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return { width, height };
}

function printHelp() {
  process.stdout.write(`Computer Operator\n\n` +
    `极简 macOS 电脑操控 CLI。核心思路只有两步：先重新截图给 AI 看，再执行原子动作。\n\n` +
    `用法:\n` +
    `  computer-operator                  默认等同于 observe\n` +
    `  computer-operator observe [--full]\n` +
    `  computer-operator analyze [image] [--full]\n` +
    `  computer-operator info\n` +
    `  computer-operator open <App 名称> [--fullscreen]\n` +
    `  computer-operator activate <App 名称>\n` +
    `  computer-operator fullscreen <App 名称>\n` +
    `  computer-operator click <x> <y> [--logical] [--highres] [--image <path>]\n` +
    `  computer-operator double-click <x> <y> [--logical] [--highres] [--image <path>]\n` +
    `  computer-operator right-click <x> <y> [--logical] [--highres] [--image <path>]\n` +
    `  computer-operator move <x> <y> [--logical] [--highres] [--image <path>]\n` +
    `  computer-operator drag <x1> <y1> <x2> <y2> [--logical] [--highres] [--image <path>]\n` +
    `  computer-operator scroll <x> <y> <amount> [--logical] [--highres] [--image <path>]\n` +
    `  computer-operator position\n` +
    `  computer-operator type <文本...>\n` +
    `  computer-operator send <文本...>\n` +
    `  computer-operator type --direct <文本...>\n` +
    `  computer-operator send --direct <文本...>\n` +
    `  computer-operator key <键名>\n` +
    `  computer-operator zoom <x> <y> <width> <height> [output]\n` +
    `  computer-operator pixel <x> <y> [image]\n\n` +
    `兼容别名:\n` +
    `  app open|activate|fullscreen\n` +
    `  mouse click|double_click|right_click|move|drag|scroll|position\n` +
    `  keyboard paste|type|paste_enter|type_enter|key\n`
  );
}

function normalizeLegacyCommand(argv) {
  const args = [...argv];
  if (args.length === 0) {
    return { command: 'observe', args: [] };
  }

  const top = args.shift();
  if (top === 'app') {
    return { command: args.shift() || 'help', args };
  }

  if (top === 'mouse') {
    const mapping = {
      click: 'click',
      double_click: 'double-click',
      right_click: 'right-click',
      move: 'move',
      drag: 'drag',
      scroll: 'scroll',
      position: 'position'
    };
    const sub = args.shift() || 'help';
    return { command: mapping[sub] || sub, args };
  }

  if (top === 'keyboard') {
    const mapping = {
      type: 'type',
      paste: 'type',
      type_cn: 'type',
      paste_enter: 'send',
      type_enter: 'send',
      key: 'key'
    };
    const sub = args.shift() || 'help';
    return { command: mapping[sub] || sub, args };
  }

  return { command: top, args };
}

function captureOnly() {
  const result = runShellScript('screenshot.sh');
  exitWithResult(result, '截图失败');
}

function observe(args) {
  const capture = runShellScript('screenshot.sh');
  if (capture.status !== 0) {
    exitWithResult(capture, '截图失败');
  }

  const analyzeArgs = [DEFAULT_PREVIEW];
  if (args.includes('--full')) {
    analyzeArgs.push('--full');
  } else {
    analyzeArgs.push('--brief');
  }

  const analysis = runNodeScript('analyze_screen.js', analyzeArgs);
  exitWithResult(analysis, '分析失败');
}

function analyze(args) {
  const forwarded = [...args];
  const hasImage = forwarded.some((arg) => !arg.startsWith('--'));
  if (!hasImage) {
    forwarded.unshift(DEFAULT_PREVIEW);
  }
  if (!forwarded.includes('--brief') && !forwarded.includes('--full')) {
    forwarded.push('--brief');
  }

  const result = runNodeScript('analyze_screen.js', forwarded);
  exitWithResult(result, '分析失败');
}

function appAction(action, args) {
  if (args.length === 0) {
    process.stderr.write('缺少 App 名称\n');
    process.exit(1);
  }
  const result = runNodeScript('app_action.js', [action, ...args]);
  exitWithResult(result, '应用操作失败');
}

function mouseAction(action, args) {
  const mapping = {
    'double-click': 'double_click',
    'right-click': 'right_click'
  };
  const result = runNodeScript('mouse_action.js', [mapping[action] || action, ...args]);
  exitWithResult(result, '鼠标操作失败');
}

function keyboardAction(action, args) {
  const passthroughFlags = [];
  const textParts = [];

  for (const arg of args) {
    if (arg === '--direct' || arg === '--clipboard') {
      passthroughFlags.push(arg);
      continue;
    }
    textParts.push(arg);
  }

  const text = textParts.join(' ');
  if ((action === 'type' || action === 'send') && !text) {
    process.stderr.write('缺少输入文本\n');
    process.exit(1);
  }

  const mapping = {
    type: 'paste',
    send: 'paste_enter',
    key: 'key'
  };
  const payload = action === 'key' ? textParts : [...passthroughFlags, text];
  const result = runNodeScript('keyboard_action.js', [mapping[action], ...payload]);
  exitWithResult(result, '键盘操作失败');
}

function zoom(args) {
  const result = runNodeScript('zoom_region.js', args);
  exitWithResult(result, '局部放大失败');
}

function pixel(args) {
  const result = runNodeScript('get_pixel.js', args);
  exitWithResult(result, '像素读取失败');
}

function info() {
  const result = runNodeScript('screen_info.js');
  exitWithResult(result, '屏幕信息读取失败');
}

function scrollCenterShortcut(args) {
  const numeric = args.filter((arg) => !arg.startsWith('--'));
  if (numeric.length !== 1) {
    return args;
  }

  const imageFlagIndex = args.indexOf('--image');
  let imagePath = DEFAULT_PREVIEW;
  if (args.includes('--highres')) {
    imagePath = '/tmp/computer-operator/latest_highres.png';
  }
  if (imageFlagIndex >= 0 && args[imageFlagIndex + 1]) {
    imagePath = args[imageFlagIndex + 1];
  }

  const size = getImageSize(imagePath);
  if (!size) {
    return args;
  }

  const amount = numeric[0];
  const passthroughFlags = [];
  let consumed = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!consumed && arg === amount) {
      consumed = true;
      continue;
    }
    passthroughFlags.push(arg);
  }

  return [String(Math.round(size.width / 2)), String(Math.round(size.height / 2)), amount, ...passthroughFlags];
}

function main() {
  const { command, args } = normalizeLegacyCommand(process.argv.slice(2));

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    case 'observe':
      observe(args);
      return;
    case 'screenshot':
      captureOnly();
      return;
    case 'analyze':
      analyze(args);
      return;
    case 'info':
      info();
      return;
    case 'open':
      appAction('open', args);
      return;
    case 'activate':
      appAction('activate', args);
      return;
    case 'fullscreen':
      appAction('fullscreen', args);
      return;
    case 'click':
    case 'double-click':
    case 'right-click':
    case 'move':
    case 'drag':
    case 'position':
      mouseAction(command, args);
      return;
    case 'scroll':
      mouseAction('scroll', scrollCenterShortcut(args));
      return;
    case 'type':
    case 'send':
    case 'key':
      keyboardAction(command, args);
      return;
    case 'zoom':
      zoom(args);
      return;
    case 'pixel':
      pixel(args);
      return;
    default:
      process.stderr.write(`未知命令: ${command}\n\n`);
      printHelp();
      process.exit(1);
  }
}

main();