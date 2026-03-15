#!/usr/bin/env node

/**
 * CLI Entry for Computer Operator
 * Provides a high-level command to execute desktop automation tasks.
 */

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const { spawnSync } = require('child_process');
const path = require('path');

function runNodeScript(scriptPath, args = [], options = {}) {
  return spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    ...options
  });
}

function runShellScript(scriptPath, args = [], options = {}) {
  return spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    ...options
  });
}

program
  .name('computer-operator')
  .description('Vision-driven macOS desktop automation using natural language')
  .version('2.1.0');

program
  .command('info')
  .description('Display screen information and scale factor')
  .action(() => {
    const scriptPath = path.join(__dirname, '../scripts/screen_info.js');
    const result = runNodeScript(scriptPath, [], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nFailed to get screen info.'));
    }
  });

program
  .command('screenshot')
  .description('Capture a screenshot of the main screen')
  .action(() => {
    const scriptPath = path.join(__dirname, '../scripts/screenshot.sh');
    const spinner = ora('Capturing screenshot...').start();
    const result = runShellScript(scriptPath);
    if (result.status === 0) {
      spinner.succeed(chalk.green('Screenshot saved to /tmp/computer-operator/latest.jpg and /tmp/computer-operator/latest_highres.png'));
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
    } else {
      spinner.fail(chalk.red('Failed to capture screenshot.'));
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
  });

program
  .command('analyze')
  .description('Analyze the latest screenshot and output coordinate guide')
  .argument('[image]', 'Path to the image to analyze', '/tmp/computer-operator/latest.jpg')
  .option('--full', 'Include detailed grid output')
  .action((image, options) => {
    const scriptPath = path.join(__dirname, '../scripts/analyze_screen.js');
    const args = [image, options.full ? '--full' : '--brief'];
    const result = runNodeScript(scriptPath, args, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nAnalysis failed.'));
    }
  });

program
  .command('observe')
  .description('Capture a fresh screenshot and immediately analyze it')
  .option('--full', 'Include detailed grid output')
  .action((options) => {
    const screenshotPath = path.join(__dirname, '../scripts/screenshot.sh');
    const analyzePath = path.join(__dirname, '../scripts/analyze_screen.js');
    const spinner = ora('Capturing a fresh screenshot and analyzing screen state...').start();

    const screenshot = runShellScript(screenshotPath);
    if (screenshot.status !== 0) {
      spinner.fail(chalk.red('Failed to capture screenshot.'));
      if (screenshot.stderr) {
        process.stderr.write(screenshot.stderr);
      }
      return;
    }

    spinner.text = 'Analyzing fresh screenshot...';
    const analyze = runNodeScript(analyzePath, ['/tmp/computer-operator/latest.jpg', options.full ? '--full' : '--brief']);

    if (analyze.status !== 0) {
      spinner.fail(chalk.red('Failed to analyze screenshot.'));
      if (analyze.stderr) {
        process.stderr.write(analyze.stderr);
      }
      return;
    }

    spinner.succeed(chalk.green('Fresh screenshot captured and analyzed.'));
    if (screenshot.stdout) {
      process.stdout.write(screenshot.stdout);
    }
    process.stdout.write(analyze.stdout);
  });

program
  .command('app')
  .description('Open, activate, or fullscreen an app')
  .argument('<action>', 'open | activate | fullscreen')
  .argument('<name...>', 'App name')
  .option('-f, --fullscreen', 'Enter fullscreen after opening')
  .action((action, nameParts, options) => {
    const scriptPath = path.join(__dirname, '../scripts/app_action.js');
    const args = [scriptPath, action, ...nameParts];

    if (options.fullscreen) {
      args.push('--fullscreen');
    }

    const result = spawnSync('node', args, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nApp action failed.'));
    }
  });

program
  .command('keyboard')
  .description('Paste text or press a single key')
  .argument('<action>', 'type | paste | type_enter | paste_enter | key')
  .argument('[value...]', 'Text or key payload')
  .action((action, valueParts) => {
    const scriptPath = path.join(__dirname, '../scripts/keyboard_action.js');
    const args = [scriptPath, action, ...valueParts];
    const result = spawnSync('node', args, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nKeyboard action failed.'));
    }
  });

program
  .command('mouse')
  .description('Click, scroll, move, or drag with screenshot coordinates')
  .argument('<action>', 'click | double_click | right_click | move | drag | scroll | position')
  .argument('[value...]', 'Coordinates and parameters')
  .action((action, valueParts) => {
    const scriptPath = path.join(__dirname, '../scripts/mouse_action.js');
    const result = runNodeScript(scriptPath, [action, ...valueParts], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nMouse action failed.'));
    }
  });

program
  .command('zoom')
  .description('Crop and enlarge a region from the latest high-resolution screenshot')
  .argument('<x>', 'Screenshot x coordinate')
  .argument('<y>', 'Screenshot y coordinate')
  .argument('<width>', 'Region width')
  .argument('<height>', 'Region height')
  .argument('[output]', 'Optional output path')
  .action((x, y, width, height, output) => {
    const scriptPath = path.join(__dirname, '../scripts/zoom_region.js');
    const args = [x, y, width, height];
    if (output) {
      args.push(output);
    }
    const result = runNodeScript(scriptPath, args, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nZoom action failed.'));
    }
  });

program
  .command('pixel')
  .description('Read pixel color from the latest high-resolution screenshot')
  .argument('<x>', 'Screenshot x coordinate')
  .argument('<y>', 'Screenshot y coordinate')
  .argument('[image]', 'Optional image path')
  .action((x, y, image) => {
    const scriptPath = path.join(__dirname, '../scripts/get_pixel.js');
    const args = [x, y];
    if (image) {
      args.push(image);
    }
    const result = runNodeScript(scriptPath, args, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nPixel lookup failed.'));
    }
  });

program
  .command('ui-map')
  .description('Extract actionable UI elements from a screenshot using pure vision')
  .option('--image <path>', 'Image path to analyze', '/tmp/computer-operator/latest.jpg')
  .option('--mode <mode>', 'Detection mode: fast | balanced | precise', 'balanced')
  .option('--max-elements <n>', 'Maximum returned elements', '120')
  .option('--max-refinements <n>', 'Maximum local second-pass refinements', '2')
  .option('--time-budget-ms <n>', 'Soft latency budget for the whole detection flow')
  .option('--debug', 'Include raw OCR and rectangle candidates')
  .action((options) => {
    const scriptPath = path.join(__dirname, '../scripts/ui_map.js');
    const args = ['--image', options.image, '--mode', options.mode, '--max-elements', options.maxElements, '--max-refinements', options.maxRefinements];
    if (options.timeBudgetMs) {
      args.push('--time-budget-ms', options.timeBudgetMs);
    }
    if (options.debug) {
      args.push('--debug');
    }
    const result = runNodeScript(scriptPath, args, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nUI map extraction failed.'));
    }
  });
  
program
  .command('task-plan')
  .description('Convert a natural-language desktop goal into a suggested command chain')
  .argument('<goal...>', 'Natural-language goal')
  .option('--json', 'Print JSON output')
  .action((goalParts, options) => {
    const scriptPath = path.join(__dirname, '../scripts/task_router.js');
    const args = [...goalParts];
    if (options.json) {
      args.push('--json');
    }
    const result = runNodeScript(scriptPath, args, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nTask planning failed.'));
    }
  });

program.parse();
