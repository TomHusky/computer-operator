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
    slots.contact_name = slots.target_text || cleanExtractedValue(extractContactName(goal), appName) || null;
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

  return Object.fromEntries(Object.entries(slots).filter(([, value]) => value));
}

function detectIntent(goal, scenario) {
  if (scenario === 'ide') {
    if (/(打开.*文件|open.*file|文件名|打开\s+[\w./-]+\.(js|ts|tsx|jsx|json|md|java|py|kt|swift|yml|yaml))/i.test(goal)) return 'ide_open_file';
    if (/(全局搜索|搜索代码|search in files)/i.test(goal)) return 'ide_global_search';
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

function buildPlan(goal, appName, scenario, intent) {
  const target = cleanExtractedValue(extractTarget(goal), appName);
  const slots = buildSlots(goal, appName, scenario, intent);
  const plan = {
    goal,
    app: appName,
    scenario,
    intent,
    slots,
    read_guides: [],
    commands: [],
    notes: []
  };

  if (scenario === 'ide') plan.read_guides.push('./guidelines/ide_interaction.md');
  if (scenario === 'social') plan.read_guides.push('./guidelines/social_apps.md');

  const openApp = appName ? [`computer-operator app open ${quoteApp(appName)}`] : [];

  if (intent === 'ide_open_file') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <资源管理器或搜索输入框中心x> <中心y>', `computer-operator keyboard paste "${slots.file_name || target || '<文件名>'}"`, 'computer-operator observe', 'computer-operator mouse click <文件项中心x> <中心y>', 'computer-operator observe'];
    plan.notes.push('不再依赖快捷键，改用视觉定位文件入口。');
    return plan;
  }

  if (intent === 'ide_global_search') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <搜索框或搜索入口中心x> <中心y>', `computer-operator keyboard paste "${slots.search_query || target || '<搜索词>'}"`, 'computer-operator observe'];
    return plan;
  }

  if (intent === 'ide_command_palette') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <顶部搜索框或命令输入入口中心x> <中心y>', `computer-operator keyboard paste "${slots.command_name || target || '<命令名>'}"`, 'computer-operator observe', 'computer-operator mouse click <命令项中心x> <中心y>', 'computer-operator observe'];
    return plan;
  }

  if (intent === 'ide_ai_apply') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <AI输入框或AI面板入口中心x> <中心y>', `computer-operator keyboard paste "${slots.ai_prompt || target || '<AI 指令>'}"`, 'computer-operator observe', 'computer-operator zoom <AI按钮区域x> <y> <w> <h>', 'computer-operator ui-map --image /tmp/computer-operator/latest_zoom.png --mode precise', 'computer-operator mouse click <Accept/Apply中心x> <中心y>', 'computer-operator observe'];
    plan.notes.push('AI 输入和应用都改为视觉定位。');
    return plan;
  }

  if (intent === 'social_reply') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <搜索框或联系人项中心x> <中心y>', slots.contact_name ? `computer-operator keyboard paste "${slots.contact_name}"` : 'computer-operator keyboard paste "<联系人或群名>"', 'computer-operator observe', 'computer-operator mouse click <联系人项中心x> <中心y>', 'computer-operator observe', 'computer-operator zoom <最近消息区域x> <y> <w> <h>', 'computer-operator observe', 'computer-operator mouse click <输入框中心x> <中心y>', `computer-operator keyboard paste_enter "${slots.message_content || '<回复内容>'}"`, 'computer-operator observe'];
    plan.notes.push('社交场景先确认会话，再发送。');
    return plan;
  }

  if (intent === 'social_search_contact' || intent === 'social_open_chat') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <搜索框中心x> <搜索框中心y>', `computer-operator keyboard paste "${slots.contact_name || target || '<联系人或群名>'}"`, 'computer-operator observe', 'computer-operator mouse click <联系人项中心x> <中心y>', 'computer-operator observe'];
    return plan;
  }

  if (intent === 'generic_search') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <搜索框中心x> <搜索框中心y>', `computer-operator keyboard paste "${slots.search_query || target || '<查询词>'}"`, 'computer-operator observe'];
    return plan;
  }

  if (intent === 'generic_input') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <输入框中心x> <输入框中心y>', `computer-operator keyboard paste "${slots.input_text || target || '<文本>'}"`, 'computer-operator observe'];
    return plan;
  }

  if (intent === 'generic_drag') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse drag <起点x> <起点y> <终点x> <终点y>', 'computer-operator observe'];
    return plan;
  }

  if (intent === 'generic_click') {
    plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', 'computer-operator mouse click <目标中心x> <目标中心y>', 'computer-operator observe'];
    return plan;
  }

  plan.commands = [...openApp, 'computer-operator observe', 'computer-operator ui-map --mode balanced', '必要时 computer-operator zoom <区域x> <区域y> <区域w> <区域h>', '必要时 computer-operator ui-map --image /tmp/computer-operator/latest_zoom.png --mode precise', 'computer-operator observe'];
  plan.notes.push('先用通用视觉闭环，再决定点击、输入或拖拽。');
  return plan;
}

function formatText(plan) {
  const lines = [
    `Goal: ${plan.goal}`,
    `Scenario: ${plan.scenario}`,
    `Intent: ${plan.intent}`,
    `App: ${plan.app || 'N/A'}`
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.goal) {
    console.error('Usage: node scripts/task_router.js <goal> [--json]');
    process.exit(1);
  }

  const goal = normalize(options.goal);
  const appName = detectApp(goal);
  const scenario = detectScenario(goal, appName);
  const intent = detectIntent(goal, scenario);
  const plan = buildPlan(goal, appName, scenario, intent);

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log(formatText(plan));
}

main();