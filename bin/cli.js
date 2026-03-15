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

program
  .name('computer-operator')
  .description('Vision-driven macOS desktop automation using natural language')
  .version('2.1.0');

program
  .command('info')
  .description('Display screen information and scale factor')
  .action(() => {
    const scriptPath = path.join(__dirname, '../scripts/screen_info.js');
    const result = spawnSync('node', [scriptPath], { stdio: 'inherit' });
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
    const result = spawnSync('bash', [scriptPath]);
    if (result.status === 0) {
      spinner.succeed(chalk.green('Screenshot saved to /tmp/computer-operator/latest.jpg'));
    } else {
      spinner.fail(chalk.red('Failed to capture screenshot.'));
    }
  });

program
  .command('analyze')
  .description('Analyze the latest screenshot and output coordinate guide')
  .argument('[image]', 'Path to the image to analyze', '/tmp/computer-operator/latest.jpg')
  .action((image) => {
    const scriptPath = path.join(__dirname, '../scripts/analyze_screen.js');
    const result = spawnSync('node', [scriptPath, image], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nAnalysis failed.'));
    }
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
  .description('Paste text, press keys, or send hotkeys')
  .argument('<action>', 'type | paste | type_enter | paste_enter | key | hotkey')
  .argument('[value...]', 'Text or key payload')
  .action((action, valueParts) => {
    const scriptPath = path.join(__dirname, '../scripts/keyboard_action.js');
    const args = [scriptPath, action, ...valueParts];
    const result = spawnSync('node', args, { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(chalk.red('\nKeyboard action failed.'));
    }
  });

program.parse();
