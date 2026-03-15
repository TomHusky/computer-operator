#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const { createPlan, normalize } = require('./task_router');

const HARD_MAX_RETRIES = 3;
const DEFAULT_RETRIES = 3;
const DEFAULT_IMAGE = '/tmp/computer-operator/latest.jpg';

function parseArgs(argv) {
  const options = {
    goal: '',
    json: false,
    dryRun: false,
    maxRetries: DEFAULT_RETRIES
  };

  const goalParts = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--max-retries' && argv[index + 1]) {
      options.maxRetries = Math.min(HARD_MAX_RETRIES, Math.max(1, parseInt(argv[index + 1], 10) || DEFAULT_RETRIES));
      index += 1;
      continue;
    }
    goalParts.push(arg);
  }

  options.goal = goalParts.join(' ').trim();
  return options;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runNodeScript(scriptName, args = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync('node', [scriptPath, ...args], {
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || `${scriptName} 执行失败`;
    throw new Error(message);
  }

  return result.stdout.trim();
}

function runShellScript(scriptName, args = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || `${scriptName} 执行失败`;
    throw new Error(message);
  }

  return result.stdout.trim();
}

function captureState(mode) {
  runShellScript('screenshot.sh');
  const analysis = JSON.parse(runNodeScript('analyze_screen.js', [DEFAULT_IMAGE, '--brief']));
  const uiMap = JSON.parse(runNodeScript('ui_map.js', ['--image', DEFAULT_IMAGE, '--mode', mode, '--max-elements', '120', '--debug']));
  return {
    analysis,
    ui: uiMap,
    mode,
    captured_at: new Date().toISOString()
  };
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/["“”'`]/g, '').replace(/\s+/g, ' ').trim();
}

function splitTerms(text) {
  return normalizeText(text).split(/[\s/_.-]+/).filter(Boolean);
}

function getSearchTexts(target = {}) {
  return [target.text, ...(target.labels || [])].filter(Boolean).map(normalizeText).filter(Boolean);
}

function textScore(haystack, needle) {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedNeedle = normalizeText(needle);

  if (!normalizedNeedle) {
    return 0;
  }
  if (normalizedHaystack === normalizedNeedle) {
    return 1;
  }
  if (normalizedHaystack.includes(normalizedNeedle)) {
    return 0.9;
  }
  if (normalizedNeedle.includes(normalizedHaystack) && normalizedHaystack.length >= 2) {
    return 0.72;
  }

  const haystackTerms = splitTerms(normalizedHaystack);
  const needleTerms = splitTerms(normalizedNeedle);
  if (!haystackTerms.length || !needleTerms.length) {
    return 0;
  }

  const matchedTerms = needleTerms.filter((term) => normalizedHaystack.includes(term));
  if (!matchedTerms.length) {
    return 0;
  }

  return 0.4 + (matchedTerms.length / needleTerms.length) * 0.35;
}

function getRegionScore(center, imageSize, region) {
  if (!region || !imageSize?.width || !imageSize?.height) {
    return 0;
  }

  const xRatio = center.x / imageSize.width;
  const yRatio = center.y / imageSize.height;

  const rules = {
    top: yRatio <= 0.35,
    bottom: yRatio >= 0.65,
    left: xRatio <= 0.35,
    right: xRatio >= 0.65,
    center: xRatio >= 0.2 && xRatio <= 0.8 && yRatio >= 0.2 && yRatio <= 0.8,
    'top-left': xRatio <= 0.45 && yRatio <= 0.35,
    'top-right': xRatio >= 0.55 && yRatio <= 0.35,
    'bottom-left': xRatio <= 0.45 && yRatio >= 0.65,
    'bottom-right': xRatio >= 0.55 && yRatio >= 0.65
  };

  return rules[region] ? 0.1 : 0;
}

function buildVisualEntries(state) {
  const elements = (state.ui.elements || []).map((element) => ({
    source: 'element',
    type: element.type,
    label: element.label || '',
    confidence: Number(element.confidence || 0),
    center: element.center,
    bounds: element.bounds,
    semantic_role: element.semantic?.role || null,
    operation: element.operation || null,
    raw: element
  }));

  const rawTexts = (state.ui.debug?.raw_texts || []).map((item) => ({
    source: 'raw_text',
    type: 'raw_text',
    label: item.text || '',
    confidence: Number(item.confidence || 0),
    center: item.center,
    bounds: item.bounds,
    semantic_role: null,
    operation: null,
    raw: item
  }));

  return elements.concat(rawTexts);
}

function scoreCandidate(candidate, target, imageSize) {
  let score = 0;
  const searchTexts = getSearchTexts(target);
  const bestTextScore = searchTexts.length
    ? Math.max(...searchTexts.map((query) => textScore(candidate.label, query)), 0)
    : 0;

  if (target.types?.length && target.types.includes(candidate.type)) {
    score += 0.28;
  } else if (!target.types?.length && candidate.source === 'element') {
    score += 0.08;
  }

  if (target.semantic_roles?.length && candidate.semantic_role && target.semantic_roles.includes(candidate.semantic_role)) {
    score += 0.24;
  }

  score += bestTextScore * 0.5;
  score += getRegionScore(candidate.center, imageSize, target.region);
  score += Math.min(0.15, candidate.confidence * 0.15);

  if (candidate.source === 'element') {
    score += 0.04;
  }

  return Math.round(score * 1000) / 1000;
}

function findBestVisualMatch(state, target) {
  const entries = buildVisualEntries(state);
  const imageSize = state.ui.image_size || { width: 0, height: 0 };
  const ranked = entries
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, target, imageSize)
    }))
    .sort((left, right) => right.score - left.score || right.candidate.confidence - left.candidate.confidence);

  const best = ranked[0];
  const searchTexts = getSearchTexts(target);
  const threshold = searchTexts.length || target.types?.length ? 0.44 : 0.32;

  if (!best || best.score < threshold) {
    return null;
  }

  return best;
}

function hasVisibleText(state, text) {
  const query = normalizeText(text);
  if (!query) {
    return false;
  }

  const entries = buildVisualEntries(state);
  return entries.some((entry) => textScore(entry.label, query) >= 0.72);
}

function activeAppMatches(state, appName) {
  const activeApp = normalizeText(state.analysis?.system_context?.active_app || '');
  const expected = normalizeText(appName);
  return Boolean(activeApp && expected && activeApp.includes(expected));
}

function buildStateSignature(state) {
  const activeApp = normalizeText(state.analysis?.system_context?.active_app || '');
  const topLabels = (state.ui.elements || [])
    .slice(0, 15)
    .map((item) => `${item.type}:${normalizeText(item.label)}`)
    .join('|');
  return `${activeApp}|${topLabels}`;
}

function stateChanged(beforeState, afterState) {
  return buildStateSignature(beforeState) !== buildStateSignature(afterState);
}

function validateExpectation(expect, beforeState, afterState) {
  const errors = [];

  if (!expect) {
    return { ok: true, errors };
  }

  if (expect.active_app && !activeAppMatches(afterState, expect.active_app)) {
    errors.push(`前台应用不是 ${expect.active_app}`);
  }

  if (expect.visible_target && !findBestVisualMatch(afterState, expect.visible_target)) {
    errors.push(`未找到预期目标: ${expect.visible_target.description || expect.visible_target.text || '目标控件'}`);
  }

  if (expect.absent_target && findBestVisualMatch(afterState, expect.absent_target)) {
    errors.push(`目标仍然存在: ${expect.absent_target.description || expect.absent_target.text || '目标控件'}`);
  }

  if (expect.visible_text && !hasVisibleText(afterState, expect.visible_text)) {
    errors.push(`未识别到文本: ${expect.visible_text}`);
  }

  if (expect.state_changed && !stateChanged(beforeState, afterState)) {
    errors.push('界面状态未发生可见变化');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function clickAt(center) {
  runNodeScript('mouse_action.js', ['click', String(center.x), String(center.y), '--image', DEFAULT_IMAGE]);
}

function performStep(step, preState) {
  if (step.action === 'open_app') {
    const args = ['open', step.app_name];
    if (step.fullscreen) {
      args.push('--fullscreen');
    }
    runNodeScript('app_action.js', args);
    sleep(900);
    return { action: step.action, selected: null };
  }

  if (step.action === 'click_target') {
    const match = findBestVisualMatch(preState, step.target);
    if (!match) {
      throw new Error(`未找到可点击目标: ${step.target.description || step.target.text || '目标控件'}`);
    }
    clickAt(match.candidate.center);
    sleep(450);
    return {
      action: step.action,
      selected: {
        label: match.candidate.label,
        type: match.candidate.type,
        center: match.candidate.center,
        score: match.score
      }
    };
  }

  if (step.action === 'type_into_target') {
    const match = findBestVisualMatch(preState, step.target);
    if (!match) {
      throw new Error(`未找到输入目标: ${step.target.description || '输入框'}`);
    }
    clickAt(match.candidate.center);
    sleep(280);
    runNodeScript('keyboard_action.js', [step.submit ? 'paste_enter' : 'paste', step.text]);
    sleep(step.submit ? 600 : 360);
    return {
      action: step.action,
      selected: {
        label: match.candidate.label,
        type: match.candidate.type,
        center: match.candidate.center,
        score: match.score
      }
    };
  }

  if (step.action === 'drag') {
    throw new Error('drag 步骤需要明确起止坐标，当前规划器尚未提供可执行坐标');
  }

  throw new Error(`不支持的步骤类型: ${step.action}`);
}

function runTask(goal, options = {}) {
  const maxRetries = Math.min(HARD_MAX_RETRIES, Math.max(1, options.maxRetries || DEFAULT_RETRIES));
  const plan = createPlan(goal);
  const result = {
    status: 'success',
    goal: plan.goal,
    scenario: plan.scenario,
    intent: plan.intent,
    max_retries: maxRetries,
    steps: []
  };

  for (let index = 0; index < plan.steps.length; index++) {
    const step = plan.steps[index];
    let completed = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const mode = attempt >= 2 ? 'precise' : 'balanced';
      try {
        const preState = captureState(mode);
        const execution = performStep(step, preState);
        const postState = captureState(mode);
        const validation = validateExpectation(step.expect, preState, postState);

        result.steps.push({
          index: index + 1,
          description: step.description,
          action: step.action,
          attempt,
          mode,
          selected: execution.selected,
          validation
        });

        if (!validation.ok) {
          if (attempt === maxRetries) {
            result.status = 'failed';
            result.error = `步骤失败且超过 ${HARD_MAX_RETRIES} 次重试上限: ${step.description}`;
            result.failed_step = {
              index: index + 1,
              description: step.description,
              action: step.action,
              validation_errors: validation.errors
            };
            return result;
          }
          continue;
        }

        completed = true;
        break;
      } catch (error) {
        result.steps.push({
          index: index + 1,
          description: step.description,
          action: step.action,
          attempt,
          mode,
          error: error.message
        });

        if (attempt === maxRetries) {
          result.status = 'failed';
          result.error = `步骤失败且超过 ${HARD_MAX_RETRIES} 次重试上限: ${step.description}`;
          result.failed_step = {
            index: index + 1,
            description: step.description,
            action: step.action,
            validation_errors: [error.message]
          };
          return result;
        }

        sleep(500);
      }
    }

    if (!completed) {
      break;
    }
  }

  return result;
}

function formatResult(plan, result) {
  const lines = [
    `Goal: ${plan.goal}`,
    `Scenario: ${plan.scenario}`,
    `Intent: ${plan.intent}`,
    `Status: ${result.status}`,
    `Retry limit: ${result.max_retries}`
  ];

  result.steps.forEach((step) => {
    if (step.error) {
      lines.push(`- Step ${step.index} attempt ${step.attempt}: ${step.description} -> ${step.error}`);
      return;
    }

    const validationSummary = step.validation?.ok
      ? '校验通过'
      : `校验失败: ${step.validation.errors.join('；')}`;
    lines.push(`- Step ${step.index} attempt ${step.attempt}: ${step.description} -> ${validationSummary}`);
  });

  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }

  return lines.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.goal) {
    console.error('Usage: node scripts/task_executor.js <goal> [--max-retries 3] [--json] [--dry-run]');
    process.exit(1);
  }

  const goal = normalize(options.goal);
  const plan = createPlan(goal);

  if (options.dryRun) {
    const dryRunResult = {
      status: 'dry-run',
      goal,
      max_retries: options.maxRetries,
      plan
    };
    if (options.json) {
      console.log(JSON.stringify(dryRunResult, null, 2));
      return;
    }
    console.log(formatResult(plan, { status: 'dry-run', steps: [], max_retries: options.maxRetries }));
    console.log('\nPlanned steps:');
    plan.steps.forEach((step, index) => {
      console.log(`- ${index + 1}. ${step.description}`);
    });
    return;
  }

  const result = runTask(goal, { maxRetries: options.maxRetries });
  if (options.json) {
    console.log(JSON.stringify({ plan, result }, null, 2));
  } else {
    console.log(formatResult(plan, result));
  }

  if (result.status !== 'success') {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  runTask,
  captureState,
  findBestVisualMatch,
  validateExpectation
};