# Computer Operator (macOS Skill)

Vision-driven macOS desktop automation. This skill allows an AI agent to control the desktop via screenshots, precise coordinate mapping, and native AppleScript interactions.

Resume rule: if the user interrupts the run and later asks the AI to continue, the AI must capture a fresh screenshot first. Do not continue from historical screenshots or earlier visual conclusions.

---

## 🤖 AI Installation Guide (Self-Setup)

If you are an AI agent tasked with installing and using this skill, follow these steps:

### 1. Repository Setup
Clone the repository and enter the directory:
```bash
git clone <REPOSITORY_URL>
cd computer-operator
```

If your agent uses a local skills directory, copy the whole `computer-operator` folder instead of individual files.
At minimum, keep these paths together:

- `SKILL.md`
- `README.md`
- `package.json`
- `bin/`
- `scripts/`
- `guidelines/`

### 2. Dependency Installation
Initialize the environment and install Node.js dependencies:
```bash
npm install
# Ensure scripts have execution permissions
chmod +x scripts/*.sh
```

### 3. Environment Verification
Verify that the system can access screen parameters and capture screenshots:
```bash
# Verify coordinate detection (Retina/Multi-monitor support)
node scripts/screen_info.js

# Verify screenshot capability
bash scripts/screenshot.sh

# Verify end-to-end observe flow
node bin/cli.js observe

# Verify pure-vision detection flow
node bin/cli.js ui-map --mode fast
```

Success criteria:

- Screen size and scale information can be read
- `/tmp/computer-operator/latest.jpg` is created successfully
- `observe` prints current screen analysis
- `ui-map` returns JSON output

### 4. Skill Registration
Load the `SKILL.md` file located in the root directory. This file contains the execution rules, action strategy, task routing, and scene-specific usage patterns.

If your agent supports auxiliary guides, also keep:

- `guidelines/social_apps.md`
- `guidelines/ide_interaction.md`

### 5. Permission Requirements
Before first real use, confirm all of the following:

1. The current system is macOS
2. The terminal has Screen Recording permission
3. The terminal or `osascript` has Accessibility permission

Without these permissions, screenshot capture, app activation, clicking, and typing may fail.

### 6. First Run Check
After installation, do not click anything immediately. Start with:

```bash
computer-operator observe
```

Then verify the vision pipeline with:

```bash
computer-operator ui-map --mode fast
```

---

## 🛠 Project Structure

- `SKILL.md`: Main technical documentation and behavioral guides for the AI.
- `scripts/`: Implementation of core automation tools (Node.js/AppleScript).
- `bin/cli.js`: CLI entry point for the `computer-operator` command.
- `package.json`: Dependency and metadata definition.
- `guidelines/`: Specialized strategies for specific applications (WeChat, VS Code, etc.).

## App Control

Use the dedicated app controller instead of ad-hoc AppleScript launch snippets:

```bash
computer-operator app open QQ --fullscreen
computer-operator app open "Visual Studio Code"
computer-operator app fullscreen QQ
```

The `open` action uses macOS `open -a`, then activates the app. Fullscreen is attempted with the standard `control+command+f` shortcut, which requires Accessibility permission for the terminal or `osascript`.

## Text Input

Text input now uses a Unicode clipboard paste path by default so Chinese text, punctuation, and emoji are less likely to be corrupted by the current input method or terminal encoding:

```bash
computer-operator keyboard paste "你好，世界"
computer-operator keyboard paste_enter "收到，我现在处理"
```

The script temporarily writes Unicode text to the system clipboard, pastes it into the focused input field, then restores the previous clipboard contents.

## Stability And Token Strategy

The project now uses a two-layer screenshot pipeline by default:

- `latest.jpg`: resized, high-quality preview image for global understanding. This is the default image for `observe` and `analyze`, and it is intentionally smaller to reduce visual token cost.
- `latest_highres.png`: original full-resolution screenshot for precision work such as `zoom`, `pixel`, and dense UI inspection.

This matters because full-resolution Retina screenshots are often too large for efficient model vision. The issue is usually not just “blurry screenshots”, but an unstable combination of oversized images, tiny text, and missing local zoom. The default workflow should now be:

1. `computer-operator observe`
2. If text is small or UI is crowded, run `computer-operator zoom ...`
3. If a click result must be verified, run `computer-operator pixel ...`

To make the agent understand what is probably clickable or editable, the project now also supports a pure-vision UI map:

```bash
computer-operator ui-map
```

This is the desktop equivalent of building a lightweight DOM from pixels. It does not rely on the app exposing its own accessibility tree. Instead, it combines OCR text blocks and visual rectangle candidates, then classifies likely controls such as buttons, toolbar buttons, icon buttons, input boxes, search boxes, list items, tree items, links, sliders, switches, tabs, and menu items. Each returned element also includes a suggested operation method so the model can decide whether it should click, click then type, or drag. For icon-heavy interfaces, likely toolbar and icon controls can also include a conservative semantic hint via `semantic.role`, such as `navigation_back`, `search_trigger`, `settings`, `overflow_menu`, or `expand_collapse`.

`ui-map` now supports three recognition modes:

- `fast`: only one global pass, minimum latency.
- `balanced`: default. One global pass plus at most one local second-pass refinement, and it stops early when the latency budget is about to be exceeded.
- `precise`: more aggressive local refinement, slower but more stable for crowded interfaces.

There is also a soft latency budget. By default, `balanced` tries to stay around 1.9s, `fast` around 1.4s, and `precise` around 3.2s. You can override this with `--time-budget-ms`.

Mouse coordinates now default to the preview image used by `observe` and `analyze`. If coordinates come from the original screenshot instead, use `--highres` or `--image` with the mouse script.

For the most stable `move`, `drag`, and `position` behavior on macOS, install `cliclick`:

```bash
brew install cliclick
```

## 🚀 Core Workflow for AI Agents

1. **State Perception**: Use `computer-operator observe` or `screenshot.sh` to capture the current screen.
2. **Analysis**: Use `analyze_screen.js` to get the `scale_factor` and coordinate guide. `observe` now defaults to a brief output to reduce token usage; use `analyze --full` when the full grid is needed.
3. **Semantic Locking**: Use `ui-map` to inspect likely actionable elements from the screenshot itself.
	Start with `balanced`; switch to `precise` only for dense interfaces or repeated misses.
4. **Precision Locking**: Use `zoom_region.js` for small/scaled UI elements.
5. **Action**: Use `app_action.js`, `mouse_action.js`, or `keyboard_action.js` to interact.
5. **Validation**: Use `get_pixel.js` to confirm the UI changed as expected.
6. **Cleanup**: All temporary files and screenshots are stored in `/tmp/computer-operator/`. The `screenshot.sh` script automatically clears this directory before each new capture.

Recommended resume command:

```bash
computer-operator observe
```

This command always captures a new screenshot and prints analysis output including capture timestamp and freshness.

---
## 📂 Screenshot Storage
All visual assets are stored in `/tmp/computer-operator/` to ensure privacy and prevent cluttering the system.
- `latest.jpg`: **Resized high-quality preview** for **AI observation and goal planning**.
- `latest_highres.png`: **High-resolution** original screenshot for **precision actions** (zoom_region, get_pixel).
- `latest.png`: Symlink to the high-resolution original for backward compatibility.
- `latest_zoom.png`: The most recent zoomed-in region for fine-detail analysis.

## CLI Coverage

The CLI now exposes the full closed loop:

```bash
computer-operator observe
computer-operator analyze --full
computer-operator mouse click 800 320
computer-operator zoom 1200 180 500 220
computer-operator pixel 1330 240
computer-operator ui-map
computer-operator ui-map --mode precise
computer-operator ui-map --mode balanced --time-budget-ms 1600
computer-operator ui-map --image /tmp/computer-operator/latest_zoom.png --mode fast
computer-operator task-plan "帮我打开 QQ 找到搜索框输入 张三"
computer-operator task-plan "在 VS Code 打开 package.json" --json
```

## Task Router

If the agent receives a natural-language goal and needs a stable first action chain, use:

```bash
computer-operator task-plan "帮我打开 QQ 找到搜索框输入 张三"
computer-operator task-plan "在 VS Code 里全局搜索 TODO" --json
computer-operator task-run "帮我打开 QQ 找到张三并发送消息 你好"
computer-operator task-run "在 VS Code 里搜索 TODO" --dry-run
```

This planner performs a lightweight route decision:

- Detects likely app and scenario (`social`, `ide`, `generic`)
- Maps the goal to a likely intent such as search, input, open file, global search, AI apply, or generic click
- Returns structured slots such as app name, file name, contact name, search query, input text, or message content
- Returns a suggested command chain and which specialized guideline file should be read first

## Vision Task Runner

The project now includes a closed-loop executor for multi-step desktop tasks:

```bash
computer-operator task-run "帮我打开 QQ 找到张三并发送消息 你好"
computer-operator task-run "在 VS Code 里搜索 TODO" --dry-run
computer-operator task-run "点击保存按钮" --max-retries 3 --json
```

Execution rules:

- Every step is re-observed from a fresh screenshot before matching the target.
- Matching is based on pure vision output from `ui-map`, not fixed coordinates or hotkeys.
- After each click or input, the runner captures a fresh screenshot and validates the expected visual change.
- Retry count is hard-capped at 3 for every step. If validation still fails after the third attempt, the task stops immediately and returns an explicit error.

It is intentionally conservative: it does not execute actions, it only generates the first stable command sequence.
```

---
*Developed for advanced agentic coding workflows.*
