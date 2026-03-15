#!/usr/bin/env node
/**
 * ui_map.js — 基于截图生成纯视觉 UI 地图。
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = {
    image: '/tmp/computer-operator/latest.jpg',
    maxElements: 80,
    debug: false,
    mode: 'balanced',
    maxRefinements: 2,
    timeBudgetMs: null
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--image' && argv[index + 1]) {
      options.image = argv[index + 1];
      index += 1;
    } else if (arg === '--mode' && argv[index + 1]) {
      options.mode = argv[index + 1];
      index += 1;
    } else if (arg === '--max-elements' && argv[index + 1]) {
      options.maxElements = parseInt(argv[index + 1], 10) || options.maxElements;
      index += 1;
    } else if (arg === '--max-refinements' && argv[index + 1]) {
      options.maxRefinements = parseInt(argv[index + 1], 10) || options.maxRefinements;
      index += 1;
    } else if (arg === '--time-budget-ms' && argv[index + 1]) {
      options.timeBudgetMs = parseInt(argv[index + 1], 10) || options.timeBudgetMs;
      index += 1;
    } else if (arg === '--debug') {
      options.debug = true;
    }
  }

  return options;
}

function resolveModeOptions(options) {
  const resolved = { ...options };
  if (resolved.mode === 'fast') {
    resolved.maxRefinements = 0;
    resolved.timeBudgetMs = resolved.timeBudgetMs || 1400;
  } else if (resolved.mode === 'balanced') {
    resolved.maxRefinements = Math.min(resolved.maxRefinements, 1);
    resolved.timeBudgetMs = resolved.timeBudgetMs || 1900;
  } else {
    resolved.timeBudgetMs = resolved.timeBudgetMs || 3200;
  }
  return resolved;
}

function runVisionDetector(imagePath, mode, phase) {
  const scriptPath = path.join(__dirname, 'vision_ui_detect.swift');
  const result = spawnSync('xcrun', ['swift', scriptPath, '--image', imagePath, '--mode', mode, '--phase', phase], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || '视觉检测失败');
  }

  return JSON.parse(result.stdout);
}

function centerOf(bounds) {
  return {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2)
  };
}

function area(bounds) {
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
}

function overlapArea(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function intersectionOverMin(a, b) {
  const minArea = Math.max(1, Math.min(area(a), area(b)));
  return overlapArea(a, b) / minArea;
}

function isInside(inner, outer, tolerance = 6) {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function verticalOverlapRatio(a, b) {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, bottom - top);
  return overlap / Math.max(1, Math.min(a.height, b.height));
}

function horizontalGap(a, b) {
  if (a.x + a.width < b.x) {
    return b.x - (a.x + a.width);
  }
  if (b.x + b.width < a.x) {
    return a.x - (b.x + b.width);
  }
  return 0;
}

function semanticFromLabel(label) {
  const lower = normalizeText(label).toLowerCase();
  if (!lower) return null;

  const mappings = [
    { role: 'navigation_back', confidence: 0.92, pattern: /^(back|返回|上一步|上一页)$/i },
    { role: 'navigation_forward', confidence: 0.92, pattern: /^(next|forward|下一步|下一页|前往)$/i },
    { role: 'search_trigger', confidence: 0.94, pattern: /^(search|搜索|查找|find)$/i },
    { role: 'settings', confidence: 0.94, pattern: /^(settings|preferences|设置|偏好设置)$/i },
    { role: 'close', confidence: 0.96, pattern: /^(close|关闭|cancel|取消)$/i },
    { role: 'confirm', confidence: 0.94, pattern: /^(ok|done|apply|save|submit|确定|完成|应用|保存|提交)$/i },
    { role: 'add_create', confidence: 0.94, pattern: /^(add|new|create|plus|新增|新建|创建|添加)$/i },
    { role: 'refresh', confidence: 0.94, pattern: /^(refresh|reload|刷新|重新加载)$/i },
    { role: 'overflow_menu', confidence: 0.9, pattern: /^(more|更多|详情|details)$/i },
    { role: 'expand_collapse', confidence: 0.82, pattern: /^(expand|collapse|展开|收起)$/i }
  ];

  return mappings.find(item => item.pattern.test(lower)) || null;
}

function classifyActions(type) {
  if (type === 'input' || type === 'search_box') {
    return ['click', 'type'];
  }
  if (type === 'slider') {
    return ['drag', 'click'];
  }
  if (type === 'checkbox') {
    return ['click', 'toggle'];
  }
  if (type === 'toggle_switch') {
    return ['click', 'toggle'];
  }
  return ['click'];
}

function buildOperation(type, center) {
  const target = `${center.x} ${center.y}`;
  if (type === 'input' || type === 'search_box') {
    return {
      primary_action: 'click_then_type',
      steps: ['mouse click center', 'keyboard paste text'],
      command_hint: [`computer-operator mouse click ${target}`, 'computer-operator keyboard paste "<text>"']
    };
  }
  if (type === 'checkbox') {
    return {
      primary_action: 'toggle',
      steps: ['mouse click center'],
      command_hint: [`computer-operator mouse click ${target}`]
    };
  }
  if (type === 'toggle_switch') {
    return {
      primary_action: 'toggle',
      steps: ['mouse click center'],
      command_hint: [`computer-operator mouse click ${target}`]
    };
  }
  if (type === 'slider') {
    return {
      primary_action: 'drag',
      steps: ['mouse drag from center to target position'],
      command_hint: [`computer-operator mouse drag ${center.x} ${center.y} <target_x> ${center.y}`]
    };
  }
  return {
    primary_action: 'click',
    steps: ['mouse click center'],
    command_hint: [`computer-operator mouse click ${target}`]
  };
}

function classifyTextOnly(textBlock, imageSize) {
  const label = normalizeText(textBlock.text);
  const lower = label.toLowerCase();
  const topBar = textBlock.bounds.y < Math.max(72, imageSize.height * 0.08);
  const menuLike = /^(file|edit|view|go|run|terminal|help|窗口|文件|编辑|查看|运行|帮助)$/.test(lower);
  const tabLike = label.length > 0 && label.length <= 24 && textBlock.bounds.width > textBlock.bounds.height * 1.8;
  const linkLike = /(https?:\/\/|www\.|learn more|more|details|docs|documentation|打开链接|详情|了解更多)/i.test(label);
  const treeItemLike = /^(▸|▾|▶|▼|>|v|⌄)\s*/.test(label) || (textBlock.bounds.x < imageSize.width * 0.35 && textBlock.bounds.width < imageSize.width * 0.4 && textBlock.bounds.height >= 18 && textBlock.bounds.height <= 34);

  if (menuLike || topBar) {
    return 'menu_item';
  }
  if (linkLike) {
    return 'link';
  }
  if (treeItemLike) {
    return 'tree_item';
  }
  if (tabLike) {
    return 'tab';
  }
  return 'text';
}

function classifyRectCandidate(rect, texts, imageSize) {
  const label = normalizeText(texts.map(item => item.text).join(' '));
  const lower = label.toLowerCase();
  const aspectRatio = rect.bounds.height > 0 ? rect.bounds.width / rect.bounds.height : 0;
  const hasActionWord = /^(ok|open|save|submit|apply|send|next|done|cancel|登录|确定|打开|保存|发送|继续|搜索|查找)/i.test(label);
  const hasSearchWord = /(search|搜索|查找)/i.test(label);
  const hasSelectWord = /(select|choose|option|options|选择|筛选|下拉)/i.test(label);
  const fileTabLike = /\.(js|ts|tsx|jsx|json|md|java|py|kt|swift)\b/i.test(label) || label.includes('|');
  const timeLike = /\b\d{1,2}:\d{2}\b/.test(label);
  const checkboxLike = rect.bounds.width <= 42 && rect.bounds.height <= 42 && label.length <= 20;
  const inputLike = rect.bounds.width >= 120 && rect.bounds.height >= 24 && rect.bounds.height <= 64;
  const wideFieldLike = inputLike && aspectRatio >= 3;
  const topBar = rect.bounds.y < Math.max(72, imageSize.height * 0.08);
  const placeholderLike = /^(search|搜索|查找|filter|筛选|find|输入|type)/i.test(label);
  const iconButtonLike = !label && rect.bounds.width >= 20 && rect.bounds.width <= 56 && rect.bounds.height >= 20 && rect.bounds.height <= 56 && aspectRatio >= 0.75 && aspectRatio <= 1.35;
  const toolbarButtonLike = topBar && rect.bounds.width >= 22 && rect.bounds.width <= 88 && rect.bounds.height >= 20 && rect.bounds.height <= 40;
  const sliderLike = rect.bounds.width >= 90 && rect.bounds.height >= 8 && rect.bounds.height <= 28 && aspectRatio >= 4.2 && (!label || label.length <= 8);
  const switchLike = rect.bounds.width >= 28 && rect.bounds.width <= 76 && rect.bounds.height >= 16 && rect.bounds.height <= 38 && aspectRatio >= 1.2 && aspectRatio <= 3.4 && (!label || /^(on|off|开|关)$/i.test(label));
  const linkLike = /(https?:\/\/|www\.|learn more|more|details|docs|documentation|打开链接|详情|了解更多)/i.test(label);
  const treeLike = (rect.bounds.x < imageSize.width * 0.4 && rect.bounds.width >= 80 && rect.bounds.width <= imageSize.width * 0.42 && rect.bounds.height >= 18 && rect.bounds.height <= 34);

  if (checkboxLike) return 'checkbox';
  if (switchLike) return 'toggle_switch';
  if (sliderLike) return 'slider';
  if (iconButtonLike) return topBar ? 'toolbar_button' : 'icon_button';
  if (toolbarButtonLike && label.length <= 18) return 'toolbar_button';
  if (topBar && fileTabLike) return 'tab';
  if (hasSearchWord && wideFieldLike) return 'search_box';
  if (hasSelectWord && inputLike) return 'dropdown';
  if (linkLike && rect.bounds.height <= 32) return 'link';
  if (treeLike && label.length > 0 && label.length <= 40) return 'tree_item';
  if (timeLike && rect.bounds.width >= 80) return 'list_item';
  if ((hasActionWord || label.length <= 20) && rect.bounds.height >= 22 && rect.bounds.height <= 60 && aspectRatio >= 1.2 && aspectRatio <= 8) {
    return topBar && label.length <= 18 ? 'tab' : 'button';
  }
  if (wideFieldLike && (!label || placeholderLike || lower.length <= 12)) return 'input';
  if (rect.bounds.width >= imageSize.width * 0.22 && rect.bounds.height >= 24 && rect.bounds.height <= 70) return 'list_item';
  return 'container';
}

function buildCandidates(raw) {
  const textBlocks = raw.texts.map((item, index) => ({
    id: `text-${index + 1}`,
    text: normalizeText(item.text),
    confidence: Number(item.confidence || 0),
    bounds: item.bounds,
    center: centerOf(item.bounds)
  })).filter(item => item.text);

  const rects = raw.rectangles.map((item, index) => ({
    id: `rect-${index + 1}`,
    confidence: Number(item.confidence || 0),
    bounds: item.bounds,
    center: centerOf(item.bounds)
  }));

  const usedTexts = new Set();
  const candidates = [];

  for (const rect of rects) {
    const attachedTexts = textBlocks.filter(text => {
      const overlap = intersectionOverMin(text.bounds, rect.bounds);
      return overlap >= 0.45 || isInside(text.bounds, rect.bounds, 8);
    });

    if (!attachedTexts.length && rect.bounds.width < 26 && rect.bounds.height < 26) {
      continue;
    }

    for (const text of attachedTexts) {
      usedTexts.add(text.id);
    }

    const type = classifyRectCandidate(rect, attachedTexts, raw.image);
    if (type === 'container' && attachedTexts.length === 0) {
      continue;
    }

    const label = normalizeText(attachedTexts.map(item => item.text).join(' '));
    const averageTextConfidence = attachedTexts.length
      ? attachedTexts.reduce((sum, item) => sum + item.confidence, 0) / attachedTexts.length
      : 0;

    candidates.push({
      source: 'rect+text',
      type,
      label,
      bounds: rect.bounds,
      center: rect.center,
      confidence: Math.round(Math.min(0.98, 0.35 + rect.confidence * 0.35 + averageTextConfidence * 0.3) * 1000) / 1000,
      suggested_actions: classifyActions(type),
      operation: buildOperation(type, rect.center),
      evidence: {
        rect_confidence: rect.confidence,
        text_count: attachedTexts.length,
        texts: attachedTexts.map(item => item.text)
      }
    });
  }

  const leftoverTexts = textBlocks.filter(item => !usedTexts.has(item.id));
  for (const text of leftoverTexts) {
    if (text.text.length > 36) continue;
    const type = classifyTextOnly(text, raw.image);
    if (type === 'text') continue;
    candidates.push({
      source: 'text-only',
      type,
      label: text.text,
      bounds: text.bounds,
      center: text.center,
      confidence: Math.round((0.42 + text.confidence * 0.4) * 1000) / 1000,
      suggested_actions: classifyActions(type),
      operation: buildOperation(type, text.center),
      evidence: {
        text_confidence: text.confidence,
        texts: [text.text]
      }
    });
  }

  return { candidates, textBlocks };
}

function annotateSemanticRoles(candidates, imageSize) {
  const actionable = candidates.filter(candidate => candidate.type !== 'container');

  for (const candidate of actionable) {
    const labeledSemantic = semanticFromLabel(candidate.label);
    if (labeledSemantic) {
      candidate.semantic = {
        role: labeledSemantic.role,
        confidence: labeledSemantic.confidence,
        source: 'label'
      };
      continue;
    }

    if (candidate.type !== 'icon_button' && candidate.type !== 'toolbar_button') {
      continue;
    }

    const searchField = actionable.find(other =>
      (other.type === 'search_box' || other.type === 'input')
      && verticalOverlapRatio(candidate.bounds, other.bounds) >= 0.5
      && horizontalGap(candidate.bounds, other.bounds) <= 120
    );
    if (searchField) {
      const role = candidate.center.x <= searchField.bounds.x + searchField.bounds.width * 0.35
        ? 'search_trigger'
        : 'clear_or_filter';
      candidate.semantic = {
        role,
        confidence: role === 'search_trigger' ? 0.76 : 0.58,
        source: 'nearby_input'
      };
      continue;
    }

    const treeItem = actionable.find(other =>
      other.type === 'tree_item'
      && verticalOverlapRatio(candidate.bounds, other.bounds) >= 0.6
      && candidate.bounds.x <= other.bounds.x + 24
      && horizontalGap(candidate.bounds, other.bounds) <= 20
    );
    if (treeItem) {
      candidate.semantic = {
        role: 'expand_collapse',
        confidence: 0.72,
        source: 'nearby_tree_item'
      };
      continue;
    }

    const topBar = candidate.bounds.y < Math.max(72, imageSize.height * 0.08);
    if (topBar && candidate.center.x < Math.max(84, imageSize.width * 0.08)) {
      candidate.semantic = {
        role: 'navigation_back',
        confidence: 0.46,
        source: 'top_left_toolbar'
      };
      continue;
    }

    if (topBar && candidate.center.x > imageSize.width * 0.9) {
      candidate.semantic = {
        role: 'overflow_or_window_action',
        confidence: 0.32,
        source: 'top_right_toolbar'
      };
      continue;
    }

    if (topBar) {
      candidate.semantic = {
        role: 'top_toolbar_action',
        confidence: 0.24,
        source: 'toolbar_zone'
      };
      continue;
    }

    if (candidate.center.y > imageSize.height * 0.85) {
      candidate.semantic = {
        role: 'bottom_bar_action',
        confidence: 0.34,
        source: 'bottom_zone'
      };
      continue;
    }

    if (candidate.center.x < imageSize.width * 0.2) {
      candidate.semantic = {
        role: 'sidebar_action',
        confidence: 0.3,
        source: 'sidebar_zone'
      };
      continue;
    }

    candidate.semantic = {
      role: 'icon_action',
      confidence: 0.18,
      source: 'generic_icon'
    };
  }
}

function offsetBounds(bounds, dx, dy) {
  return {
    x: bounds.x + dx,
    y: bounds.y + dy,
    width: bounds.width,
    height: bounds.height
  };
}

function offsetCandidate(candidate, dx, dy) {
  const bounds = offsetBounds(candidate.bounds, dx, dy);
  const center = centerOf(bounds);
  return {
    ...candidate,
    bounds,
    center,
    operation: buildOperation(candidate.type, center)
  };
}

function cropImage(imagePath, region, suffix) {
  const baseDir = '/tmp/computer-operator';
  const outputPath = path.join(baseDir, `ui_map_refine_${suffix}_${Date.now()}.png`);
  const result = spawnSync('sips', [
    imagePath,
    '--cropOffset', String(region.y), String(region.x),
    '-c', String(region.height), String(region.width),
    '-o', outputPath
  ], {
    encoding: 'utf8',
    timeout: 30000
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || '局部裁图失败');
  }

  return outputPath;
}

function clampRegion(region, imageSize) {
  const x = Math.max(0, Math.min(region.x, imageSize.width - 1));
  const y = Math.max(0, Math.min(region.y, imageSize.height - 1));
  const width = Math.max(1, Math.min(region.width, imageSize.width - x));
  const height = Math.max(1, Math.min(region.height, imageSize.height - y));
  return { x, y, width, height };
}

function expandRegion(bounds, imageSize, paddingRatio) {
  const padX = Math.round(Math.max(36, bounds.width * paddingRatio));
  const padY = Math.round(Math.max(28, bounds.height * paddingRatio));
  const expanded = {
    x: bounds.x - padX,
    y: bounds.y - padY,
    width: bounds.width + padX * 2,
    height: bounds.height + padY * 2
  };
  return clampRegion(expanded, imageSize);
}

function unionRegions(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function regionsOverlap(a, b) {
  return overlapArea(a, b) > 0;
}

function mergeRegions(regions, imageSize, maxAreaRatio) {
  const merged = [];
  for (const region of regions) {
    let nextRegion = region;
    let mergedIntoExisting = false;
    for (let index = 0; index < merged.length; index++) {
      if (regionsOverlap(merged[index], nextRegion) || intersectionOverMin(merged[index], nextRegion) > 0.2) {
        const union = clampRegion(unionRegions(merged[index], nextRegion), imageSize);
        if (area(union) <= imageSize.width * imageSize.height * maxAreaRatio) {
          merged[index] = union;
          mergedIntoExisting = true;
          break;
        }
      }
    }
    if (!mergedIntoExisting) {
      merged.push(nextRegion);
    }
  }
  return merged;
}

function shouldRefineCandidate(candidate, mode) {
  if (candidate.type === 'menu_item') {
    return false;
  }
  if (mode === 'precise') {
    return candidate.confidence < 0.93 || candidate.type === 'input' || candidate.type === 'search_box' || candidate.type === 'list_item' || candidate.type === 'tree_item' || candidate.type === 'slider';
  }
  return candidate.confidence < 0.84 || candidate.type === 'input' || candidate.type === 'search_box' || candidate.type === 'tree_item';
}

function selectRefineRegions(candidates, imageSize, mode, maxRefinements) {
  if (mode === 'fast') {
    return [];
  }

  const sorted = [...candidates]
    .filter(candidate => shouldRefineCandidate(candidate, mode))
    .sort((a, b) => a.confidence - b.confidence || area(a.bounds) - area(b.bounds));

  const paddingRatio = mode === 'precise' ? 1.1 : 0.75;
  const maxAreaRatio = mode === 'precise' ? 0.28 : 0.18;
  const preliminary = sorted
    .slice(0, mode === 'precise' ? Math.max(maxRefinements, 3) : maxRefinements)
    .map(candidate => expandRegion(candidate.bounds, imageSize, paddingRatio))
    .filter(region => area(region) >= imageSize.width * imageSize.height * 0.01);

  return mergeRegions(preliminary, imageSize, maxAreaRatio).slice(0, maxRefinements);
}

function shouldSkipRefinement(candidates, mode) {
  if (mode === 'fast') {
    return true;
  }

  const actionable = candidates.filter(candidate => candidate.type !== 'container' && candidate.type !== 'menu_item');
  if (actionable.length === 0) {
    return false;
  }

  const topCandidates = actionable
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);

  const averageConfidence = topCandidates.reduce((sum, item) => sum + item.confidence, 0) / topCandidates.length;
  const lowConfidenceCount = actionable.filter(item => item.confidence < 0.84).length;

  if (mode === 'balanced') {
    return averageConfidence >= 0.9 && lowConfidenceCount === 0;
  }

  return false;
}

function hasTimeForRefinement(startedAt, timeBudgetMs, passIndex) {
  if (!timeBudgetMs) {
    return true;
  }

  const elapsed = Date.now() - startedAt;
  const reserve = passIndex === 0 ? 700 : 850;
  return elapsed + reserve < timeBudgetMs;
}

function analyzeImage(imagePath, options, phase = 'primary') {
  const raw = runVisionDetector(imagePath, options.mode, phase);
  const { candidates, textBlocks } = buildCandidates(raw);
  clusterListItems(candidates);
  annotateSemanticRoles(candidates, raw.image);
  return { raw, candidates, textBlocks };
}

function clusterListItems(items) {
  const sorted = [...items].sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
  const clusters = [];

  for (const item of sorted) {
    let matched = false;
    for (const cluster of clusters) {
      const nearX = Math.abs(cluster.avgX - item.bounds.x) <= 40;
      const similarW = Math.abs(cluster.avgW - item.bounds.width) <= 80;
      const verticalGap = Math.abs(item.bounds.y - cluster.lastY) <= 90;
      if (nearX && similarW && verticalGap) {
        cluster.items.push(item);
        cluster.avgX = Math.round((cluster.avgX * (cluster.items.length - 1) + item.bounds.x) / cluster.items.length);
        cluster.avgW = Math.round((cluster.avgW * (cluster.items.length - 1) + item.bounds.width) / cluster.items.length);
        cluster.lastY = item.bounds.y;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ items: [item], avgX: item.bounds.x, avgW: item.bounds.width, lastY: item.bounds.y });
    }
  }

  for (const cluster of clusters) {
    if (cluster.items.length >= 3) {
      for (const item of cluster.items) {
        if (item.type === 'button' || item.type === 'tab' || item.type === 'menu_item' || item.type === 'toolbar_button' || item.type === 'icon_button' || item.type === 'tree_item') continue;
        item.type = 'list_item';
        item.suggested_actions = ['click'];
        item.confidence = Math.min(0.99, item.confidence + 0.08);
      }
    }
  }
}

function dedupeCandidates(candidates) {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence || area(b.bounds) - area(a.bounds));
  const deduped = [];

  for (const candidate of sorted) {
    const duplicate = deduped.some(existing => {
      const overlap = intersectionOverMin(existing.bounds, candidate.bounds);
      const sameLabel = normalizeText(existing.label).toLowerCase() === normalizeText(candidate.label).toLowerCase();
      return overlap >= 0.75 && (existing.type === candidate.type || sameLabel);
    });
    if (!duplicate) deduped.push(candidate);
  }

  return deduped;
}

function buildSummary(elements) {
  const summary = {
    button: 0,
    toolbar_button: 0,
    icon_button: 0,
    input: 0,
    search_box: 0,
    dropdown: 0,
    list_item: 0,
    tree_item: 0,
    link: 0,
    slider: 0,
    checkbox: 0,
    toggle_switch: 0,
    tab: 0,
    menu_item: 0
  };

  for (const element of elements) {
    if (summary[element.type] !== undefined) summary[element.type] += 1;
  }

  return summary;
}

function main() {
  const options = resolveModeOptions(parseArgs(process.argv.slice(2)));
  const imagePath = fs.existsSync(options.image) ? fs.realpathSync(options.image) : options.image;

  if (!fs.existsSync(imagePath)) {
    console.error(JSON.stringify({ error: `截图不存在: ${imagePath}` }, null, 2));
    process.exit(1);
  }

  try {
    const startedAt = Date.now();
    const primaryPass = analyzeImage(imagePath, options, 'primary');
    let combinedCandidates = [...primaryPass.candidates];
    const shouldRefine = !shouldSkipRefinement(primaryPass.candidates, options.mode);
    const refineRegions = shouldRefine
      ? selectRefineRegions(primaryPass.candidates, primaryPass.raw.image, options.mode, options.maxRefinements)
      : [];
    const refinementPasses = [];
    let refinementStoppedReason = null;

    for (let index = 0; index < refineRegions.length; index++) {
      if (!hasTimeForRefinement(startedAt, options.timeBudgetMs, index)) {
        refinementStoppedReason = 'time_budget_reached';
        break;
      }

      const region = refineRegions[index];
      const croppedPath = cropImage(imagePath, region, `${index + 1}`);
      try {
        const refined = analyzeImage(croppedPath, options, 'refine');
        const shifted = refined.candidates.map(candidate => offsetCandidate(candidate, region.x, region.y));
        combinedCandidates = combinedCandidates.concat(shifted);
        refinementPasses.push({
          region,
          image_path: croppedPath,
          candidate_count: shifted.length
        });
      } finally {
        try {
          fs.unlinkSync(croppedPath);
        } catch (error) {
        }
      }
    }

    const actionable = dedupeCandidates(combinedCandidates)
      .filter(item => item.type !== 'container')
      .sort((a, b) => b.confidence - a.confidence || a.bounds.y - b.bounds.y)
      .slice(0, options.maxElements)
      .map((item, index) => ({ id: index + 1, ...item }));

    const result = {
      image_path: imagePath,
      mode: 'pure-vision-ui-map',
      strategy: {
        mode: options.mode,
        time_budget_ms: options.timeBudgetMs,
        refinement_triggered: refinementPasses.length > 0,
        refinement_passes: refinementPasses.length,
        refinement_planned: refineRegions.length,
        refinement_stopped_reason: refinementStoppedReason,
        elapsed_ms: Date.now() - startedAt
      },
      coordinate_reference: '所有 bounds 和 center 都基于当前传入图片坐标，可直接配合默认 mouse 命令；若传入 latest_highres.png，则使用 mouse --highres。',
      detection_pipeline: ['ocr_text', 'rectangles', 'heuristic_classification'],
      image_size: primaryPass.raw.image,
      summary: buildSummary(actionable),
      usage_hint: [
        '先根据 type 和 label 选目标控件，再使用 center 点击',
        '若是 icon_button 或 toolbar_button，优先结合 semantic.role 判断它更像返回、搜索、设置还是更多',
        '输入类控件优先 click 后 keyboard paste',
        '低置信度或密集区域先 zoom 再二次确认'
      ],
      elements: actionable
    };

    if (options.debug) {
      result.debug = {
        raw_text_count: primaryPass.textBlocks.length,
        raw_rectangle_count: primaryPass.raw.rectangles.length,
        raw_texts: primaryPass.textBlocks.slice(0, 80),
        raw_rectangles: primaryPass.raw.rectangles.slice(0, 80),
        refine_regions: refineRegions,
        refinement_passes: refinementPasses
      };
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      error: error.message,
      hint: '纯视觉 UI 地图依赖 macOS Vision 框架。若 OCR 太弱，请先 observe，再对目标区域执行 zoom 后重新用 --image 分析局部图。'
    }, null, 2));
    process.exit(1);
  }
}

main();