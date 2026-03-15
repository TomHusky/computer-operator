#!/usr/bin/env node

function parseArgs(argv) {
  const options = {
    goal: '',
    json: false
  };

  const goalParts = [];
  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    goalParts.push(arg);
  }

  options.goal = goalParts.join(' ').trim();
  return options;
}

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function quoteCommandText(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function detectApp(goal) {
  const patterns = [
    ['Visual Studio Code', /(visual studio code|vscode|vs code)/i],
    ['Cursor', /cursor/i],
    ['QQ', /(^|\b)qq(\b|$)|腾讯qq/i],
    ['WeChat', /(wechat|微信)/i],
    ['Feishu', /(feishu|飞书|lark)/i],
    ['Telegram', /telegram/i],
    ['Slack', /slack/i],
    ['Safari', /safari/i],
    ['Google Chrome', /(chrome|谷歌浏览器)/i],
    ['Finder', /finder/i]
  ];

  for (const [name, pattern] of patterns) {
    if (pattern.test(goal)) {
      return name;
    }
  }
  return null;
}

function detectScenario(goal, appName) {
  if (/(代码|文件|命令面板|全局搜索|diff|apply|accept|discard|copilot|cursor|vscode|vs code|visual studio code)/i.test(goal)) {
    return 'ide';
  }
  if (/(qq|微信|wechat|飞书|lark|telegram|slack|消息|聊天|联系人|群聊|回复|发送消息)/i.test(goal)) {
    return 'social';
  }
  if (['Visual Studio Code', 'Cursor'].includes(appName)) {
    return 'ide';
  }
  if (['QQ', 'WeChat', 'Feishu', 'Telegram', 'Slack'].includes(appName)) {
    return 'social';
  }
  return 'generic';
}

function extractQuoted(goal) {
  const match = goal.match(/["“](.*?)["”]/);
  return match ? match[1].trim() : null;
}

function extractTarget(goal) {
  const quoted = extractQuoted(goal);
  if (quoted) {
    return quoted;
  }

  const patterns = [
    /(?:搜索框输入|输入|粘贴)\s+([^，。；,]+)$/,
    /(?:全局搜索|搜索代码|搜索联系人|找联系人|找群|群聊|搜索|查找)\s+([^，。；,]+)$/,
    /(?:点击|点按|点开|按下|press|click)\s+([^，。；,]+)$/i,
    /(?:打开文件|open file)\s+([^，。；,]+)$/i,
    /(?:打开)\s+([\w./-]+\.(?:js|ts|tsx|jsx|json|md|java|py|kt|swift|yml|yaml))$/i,
    /(?:find|search)\s+(.+)$/i,
    /(?:open)\s+([\w./-]+\.(?:js|ts|tsx|jsx|json|md|java|py|kt|swift|yml|yaml))$/i
  ];

  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function cleanExtractedValue(value, appName) {
  if (!value) return null;

  let cleaned = normalize(value)
    .replace(/^(帮我|请|麻烦|一下|在|然后)+/g, '')
    .replace(/^(打开|打开到|进入|切到)\s+/g, '')
    .replace(/^(找到|找出|定位到)\s+/g, '')
    .trim();

  if (appName) {
    const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`^${escaped}\s+`, 'i'), '').trim();
  }

  return cleaned || null;
}

function extractFileName(goal) {
  const match = goal.match(/([\w./-]+\.(?:json|tsx|jsx|yaml|yml|swift|java|xml|txt|csv|md|js|ts|py|kt))/i);
  return match ? match[1] : null;
}

function extractCommandName(goal) {
  const quoted = extractQuoted(goal);
  if (quoted && /(命令|command)/i.test(goal)) {
    return quoted;
  }
  const match = goal.match(/(?:命令面板|command palette)(?:执行|运行|输入)?\s*([^，。；,]+)$/i);
  return match ? normalize(match[1]) : null;
}

function extractSearchQuery(goal) {
  const patterns = [
    /(?:全局搜索|搜索代码|搜索联系人|搜索|查找|find|search)\s+([^，。；,]+)$/i,
    /(?:搜索框输入)\s+([^，。；,]+)$/i
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match && match[1]) return normalize(match[1]);
  }
  return null;
}

function extractContactName(goal) {
  const patterns = [
    /(?:找到|找|搜索联系人|搜索|联系人|群聊|群|会话|给)\s*([^，。；,\s]+?)(?:并|后|然后|发消息|回复|发送消息|聊天|$)/,
    /(?:给|找|搜索联系人|联系人|群聊|群|会话)\s*([^，。；,]+?)(?:发消息|回复|发送消息|聊天|$)/,
    /(?:输入|搜索框输入|搜索)\s+([^，。；,]+)$/
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match && match[1]) return normalize(match[1]);
  }
  return null;
}

function extractMessageContent(goal) {
  const quoted = extractQuoted(goal);
  if (quoted && /(发消息|回复|发送|消息内容)/i.test(goal)) {
    return quoted;
  }
  const patterns = [
    /(?:发消息|回复|发送消息|发送)\s+([^，。；,]+)$/,
    /(?:消息内容是|内容是)\s+([^，。；,]+)$/
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match && match[1]) return normalize(match[1]);
  }
  return null;
}

function extractClickTarget(goal) {
  const patterns = [
    /(?:点击|点按|点开|press|click)\s+([^，。；,]+)$/i,
    /(?:按钮|控件|标签|菜单项)\s*[:：]?\s*([^，。；,]+)$/i
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match && match[1]) return normalize(match[1]);
  }
  return null;
}

function buildSlots(goal, appName, scenario, intent) {
  const rawTarget = extractTarget(goal);
  const slots = {
    app_name: appName || null,
    target_text: cleanExtractedValue(rawTarget, appName)
  };

  if (intent === 'ide_open_file') {
    slots.file_name = extractFileName(goal) || slots.target_text || null;
  }

  if (intent === 'ide_global_search') {
    slots.search_query = cleanExtractedValue(extractSearchQuery(goal), appName) || slots.target_text || null;
  }

  if (intent === 'ide_command_palette') {
    slots.command_name = cleanExtractedValue(extractCommandName(goal), appName) || slots.target_text || null;
  }

  if (intent === 'ide_ai_apply') {
    slots.ai_prompt = cleanExtractedValue(extractQuoted(goal) || rawTarget, appName) || null;
  }

  if (scenario === 'social') {
    slots.contact_name = cleanExtractedValue(extractContactName(goal), appName) || slots.target_text || null;
  }

  if (intent === 'social_reply') {
    slots.message_content = cleanExtractedValue(extractMessageContent(goal), appName) || null;
  }

  if (intent === 'generic_search') {
    slots.search_query = cleanExtractedValue(extractSearchQuery(goal), appName) || slots.target_text || null;
  }

  if (intent === 'generic_input') {
    slots.input_text = cleanExtractedValue(rawTarget, appName) || null;
  }

  if (intent === 'generic_click') {
    slots.ui_label = cleanExtractedValue(extractClickTarget(goal), appName) || slots.target_text || null;
  }

  return Object.fromEntries(Object.entries(slots).filter(([, value]) => value));
}

function detectIntent(goal, scenario) {
  if (scenario === 'ide') {
    if (/(打开.*文件|open.*file|文件名|打开\s+[\w./-]+\.(js|ts|tsx|jsx|json|md|java|py|kt|swift|yml|yaml))/i.test(goal)) return 'ide_open_file';
    if (/(全局搜索|搜索代码|搜索|查找|search in files|find|search)/i.test(goal)) return 'ide_global_search';
    if (/(命令面板|command palette)/i.test(goal)) return 'ide_command_palette';
    if (/(copilot|cursor|apply|accept|让ai|让 AI|修改代码|生成代码)/i.test(goal)) return 'ide_ai_apply';
    return 'generic_click';
  }

  if (scenario === 'social') {
    if (/(回复|发送消息|发消息|send message)/i.test(goal)) return 'social_reply';
    if (/(搜索框|搜索联系人|找联系人|找群|群聊)/i.test(goal)) return 'social_search_contact';
    return 'social_open_chat';
  }

  if (/(搜索框|search box|search)/i.test(goal)) return 'generic_search';
  if (/(输入|type|paste)/i.test(goal)) return 'generic_input';
  if (/(拖动|滑块|drag|slider)/i.test(goal)) return 'generic_drag';
  if (/(点击|click|press)/i.test(goal)) return 'generic_click';
  return 'generic_open';
}

function quoteApp(appName) {
  return appName.includes(' ') ? `"${appName}"` : appName;
}

function createTarget(options = {}) {
  return Object.fromEntries(Object.entries({
    description: options.description || null,
    text: options.text || null,
    labels: options.labels || null,
    types: options.types || null,
    semantic_roles: options.semantic_roles || null,
    region: options.region || null
  }).filter(([, value]) => value && (!Array.isArray(value) || value.length > 0)));
}

function buildCommandsFromSteps(steps) {
  return steps.map((step) => {
    if (step.action === 'open_app') {
      return `computer-operator app open ${quoteApp(step.app_name)}${step.fullscreen ? ' --fullscreen' : ''}`;
    }
    if (step.action === 'click_target') {
      return `computer-operator mouse click <${step.target.description || '目标'}中心x> <中心y>`;
    }
    if (step.action === 'type_into_target') {
      return `computer-operator keyboard ${step.submit ? 'paste_enter' : 'paste'} ${quoteCommandText(step.text)}`;
    }
    if (step.action === 'drag') {
      return 'computer-operator mouse drag <起点x> <起点y> <终点x> <终点y>';
    }
    return 'computer-operator observe';
  });
}

function buildExecutionSteps(goal, appName, scenario, intent, slots) {
  const steps = [];
  const shouldFullscreen = scenario === 'ide' || scenario === 'social';

  const searchBoxTarget = createTarget({
    description: '搜索框',
    labels: ['search', '搜索', '查找', 'find'],
    types: ['search_box', 'input', 'toolbar_button', 'icon_button'],
    semantic_roles: ['search_trigger'],
    region: scenario === 'social' ? 'top-left' : 'top'
  });

  const messageInputTarget = createTarget({
    description: '消息输入框',
    labels: ['message', '消息', '发送', '输入', 'reply', 'chat'],
    types: ['input', 'search_box'],
    region: 'bottom'
  });

  const aiInputTarget = createTarget({
    description: 'AI 输入框',
    labels: ['copilot', 'cursor', 'chat', 'ask', 'prompt', 'agent', '输入'],
    types: ['input', 'search_box', 'button', 'tab'],
    region: 'right'
  });

  const applyButtonTarget = createTarget({
    description: '应用按钮',
    labels: ['accept', 'apply', 'allow', 'execute', 'run', '确认', '应用', '执行'],
    types: ['button', 'toolbar_button', 'menu_item', 'tab'],
    region: 'right'
  });

  if (appName) {
    steps.push({
      action: 'open_app',
      description: `打开并激活 ${appName}`,
      app_name: appName,
      fullscreen: shouldFullscreen,
      expect: {
        active_app: appName
      }
    });
  }

  if (intent === 'ide_open_file') {
    const fileName = slots.file_name || '<文件名>';
    steps.push({
      action: 'type_into_target',
      description: `定位文件搜索入口并输入 ${fileName}`,
      target: createTarget({
        description: '资源管理器搜索框',
        labels: ['search', '搜索', 'explorer', '文件', '资源管理器', 'filter'],
        types: ['search_box', 'input', 'toolbar_button', 'icon_button'],
        semantic_roles: ['search_trigger'],
        region: 'left'
      }),
      text: fileName,
      submit: false,
      expect: {
        visible_text: fileName
      }
    });
    steps.push({
      action: 'click_target',
      description: `打开文件 ${fileName}`,
      target: createTarget({
        description: '文件项',
        text: fileName,
        types: ['list_item', 'tree_item', 'tab', 'button'],
        region: 'left'
      }),
      expect: {
        visible_text: fileName,
        state_changed: true
      }
    });
    return steps;
  }

  if (intent === 'ide_global_search') {
    const searchQuery = slots.search_query || '<搜索词>';
    steps.push({
      action: 'type_into_target',
      description: `在 IDE 中搜索 ${searchQuery}`,
      target: searchBoxTarget,
      text: searchQuery,
      submit: false,
      expect: {
        visible_text: searchQuery
      }
    });
    return steps;
  }

  if (intent === 'ide_command_palette') {
    const commandName = slots.command_name || '<命令名>';
    steps.push({
      action: 'type_into_target',
      description: `打开命令输入入口并输入 ${commandName}`,
      target: createTarget({
        description: '命令输入框',
        labels: ['command', 'palette', 'search', '命令', '搜索'],
        types: ['search_box', 'input', 'toolbar_button', 'icon_button'],
        semantic_roles: ['search_trigger'],
        region: 'top'
      }),
      text: commandName,
      submit: false,
      expect: {
        visible_text: commandName
      }
    });
    steps.push({
      action: 'click_target',
      description: `执行命令 ${commandName}`,
      target: createTarget({
        description: '命令项',
        text: commandName,
        types: ['list_item', 'menu_item', 'button'],
        region: 'top'
      }),
      expect: {
        state_changed: true
      }
    });
    return steps;
  }

  if (intent === 'ide_ai_apply') {
    const aiPrompt = slots.ai_prompt || slots.target_text || '<AI 指令>';
    steps.push({
      action: 'click_target',
      description: '打开 AI 面板或输入入口',
      target: createTarget({
        description: 'AI 入口',
        labels: ['copilot', 'cursor', 'chat', 'agent', 'ask', 'ai'],
        types: ['button', 'toolbar_button', 'icon_button', 'tab'],
        region: 'right'
      }),
      expect: {
        visible_target: aiInputTarget,
        state_changed: true
      }
    });
    steps.push({
      action: 'type_into_target',
      description: '向 AI 输入框发送指令',
      target: aiInputTarget,
      text: aiPrompt,
      submit: false,
      expect: {
        visible_target: applyButtonTarget,
        visible_text: aiPrompt
      }
    });
    steps.push({
      action: 'click_target',
      description: '点击 Accept 或 Apply',
      target: applyButtonTarget,
      expect: {
        state_changed: true,
        absent_target: applyButtonTarget
      }
    });
    return steps;
  }

  if (intent === 'social_reply') {
    const contactName = slots.contact_name || '<联系人或群名>';
    const messageContent = slots.message_content || '<回复内容>';
    steps.push({
      action: 'type_into_target',
      description: `搜索联系人 ${contactName}`,
      target: searchBoxTarget,
      text: contactName,
      submit: false,
      expect: {
        visible_text: contactName
      }
    });
    steps.push({
      action: 'click_target',
      description: `打开会话 ${contactName}`,
      target: createTarget({
        description: '联系人项',
        text: contactName,
        types: ['list_item', 'tree_item', 'tab', 'button'],
        region: 'left'
      }),
      expect: {
        visible_target: messageInputTarget,
        state_changed: true
      }
    });
    steps.push({
      action: 'type_into_target',
      description: '在消息输入框中发送消息',
      target: messageInputTarget,
      text: messageContent,
      submit: true,
      expect: {
        visible_text: messageContent,
        state_changed: true
      }
    });
    return steps;
  }

  if (intent === 'social_search_contact' || intent === 'social_open_chat') {
    const contactName = slots.contact_name || '<联系人或群名>';
    steps.push({
      action: 'type_into_target',
      description: `搜索联系人 ${contactName}`,
      target: searchBoxTarget,
      text: contactName,
      submit: false,
      expect: {
        visible_text: contactName
      }
    });
    steps.push({
      action: 'click_target',
      description: `打开会话 ${contactName}`,
      target: createTarget({
        description: '联系人项',
        text: contactName,
        types: ['list_item', 'tree_item', 'tab', 'button'],
        region: 'left'
      }),
      expect: {
        visible_target: messageInputTarget,
        state_changed: true
      }
    });
    return steps;
  }

  if (intent === 'generic_search') {
    const searchQuery = slots.search_query || '<查询词>';
    steps.push({
      action: 'type_into_target',
      description: `在搜索框中输入 ${searchQuery}`,
      target: searchBoxTarget,
      text: searchQuery,
      submit: false,
      expect: {
        visible_text: searchQuery
      }
    });
    return steps;
  }

  if (intent === 'generic_input') {
    const inputText = slots.input_text || '<文本>';
    steps.push({
      action: 'type_into_target',
      description: `定位输入框并输入 ${inputText}`,
      target: createTarget({
        description: '输入框',
        labels: ['input', '输入', 'message', '内容', 'text'],
        types: ['input', 'search_box'],
        region: 'center'
      }),
      text: inputText,
      submit: false,
      expect: {
        visible_text: inputText
      }
    });
    return steps;
  }

  if (intent === 'generic_drag') {
    steps.push({
      action: 'drag',
      description: '拖动目标控件',
      expect: {
        state_changed: true
      }
    });
    return steps;
  }

  if (intent === 'generic_click') {
    const label = slots.ui_label || slots.target_text || '<目标>';
    steps.push({
      action: 'click_target',
      description: `点击 ${label}`,
      target: createTarget({
        description: '目标按钮',
        text: label,
        types: ['button', 'toolbar_button', 'icon_button', 'list_item', 'tree_item', 'tab', 'menu_item'],
        region: 'center'
      }),
      expect: {
        state_changed: true
      }
    });
    return steps;
  }

  steps.push({
    action: 'click_target',
    description: '执行通用视觉点击',
    target: createTarget({
      description: '目标控件',
      text: slots.target_text || null,
      types: ['button', 'toolbar_button', 'icon_button', 'list_item', 'tree_item', 'tab'],
      region: 'center'
    }),
    expect: {
      state_changed: true
    }
  });

  return steps;
}

function buildPlan(goal, appName, scenario, intent) {
  const slots = buildSlots(goal, appName, scenario, intent);
  const steps = buildExecutionSteps(goal, appName, scenario, intent, slots);
  const plan = {
    goal,
    app: appName,
    scenario,
    intent,
    slots,
    mode: 'vision-only-execution',
    retry_policy: {
      max_retries_per_step: 3,
      on_exhausted: 'stop_task_and_report_error'
    },
    read_guides: [],
    steps,
    commands: buildCommandsFromSteps(steps),
    notes: [
      '所有交互步骤都要求先重新观察当前界面，再基于 ui-map 做目标匹配。',
      '执行器会在每一步动作后重新截图验证，超过 3 次仍失败会自动结束任务。'
    ]
  };

  if (scenario === 'ide') plan.read_guides.push('./guidelines/ide_interaction.md');
  if (scenario === 'social') plan.read_guides.push('./guidelines/social_apps.md');

  return plan;
}

function formatText(plan) {
  const lines = [
    `Goal: ${plan.goal}`,
    `Mode: ${plan.mode}`,
    `Scenario: ${plan.scenario}`,
    `Intent: ${plan.intent}`,
    `App: ${plan.app || 'N/A'}`,
    `Retry policy: 每步最多 ${plan.retry_policy.max_retries_per_step} 次，超限自动结束`
  ];

  if (plan.read_guides.length) {
    lines.push(`Read guides: ${plan.read_guides.join(', ')}`);
  }

  if (Object.keys(plan.slots || {}).length) {
    lines.push('Slots:');
    for (const [key, value] of Object.entries(plan.slots)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  lines.push('Steps:');
  plan.steps.forEach((step, index) => {
    lines.push(`- ${index + 1}. ${step.description} [${step.action}]`);
  });

  lines.push('Commands:');
  for (const command of plan.commands) {
    lines.push(`- ${command}`);
  }

  if (plan.notes.length) {
    lines.push('Notes:');
    for (const note of plan.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join('\n');
}

function createPlan(goal) {
  const normalizedGoal = normalize(goal);
  const appName = detectApp(normalizedGoal);
  const scenario = detectScenario(normalizedGoal, appName);
  const intent = detectIntent(normalizedGoal, scenario);
  return buildPlan(normalizedGoal, appName, scenario, intent);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.goal) {
    console.error('Usage: node scripts/task_router.js <goal> [--json]');
    process.exit(1);
  }

  const plan = createPlan(options.goal);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log(formatText(plan));
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  normalize,
  detectApp,
  detectScenario,
  detectIntent,
  buildSlots,
  buildPlan,
  createPlan,
  formatText
};