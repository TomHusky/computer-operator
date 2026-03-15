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
```

### 4. Skill Registration
Load the `SKILL.md` file located in the root directory. This file contains the full technical specification, tool descriptions, and strategy patterns.

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

Text input now uses clipboard paste by default so Chinese text, punctuation, and emoji are not affected by the current input method:

```bash
computer-operator keyboard paste "你好，世界"
computer-operator keyboard paste_enter "收到，我现在处理"
```

The script temporarily writes to the clipboard, pastes with `command+v`, then restores the previous clipboard contents.

## 🚀 Core Workflow for AI Agents

1. **State Perception**: Use `computer-operator observe` or `screenshot.sh` to capture the current screen.
2. **Analysis**: Use `analyze_screen.js` to get the `scale_factor` and grid orientation.
3. **Precision Locking**: Use `zoom_region.js` for small/scaled UI elements.
4. **Action**: Use `app_action.js`, `mouse_action.js`, or `keyboard_action.js` to interact.
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
- `latest.jpg`: **Compressed** screenshot (low-res) for **AI observation and goal planning** (fast transmission).
- `latest_highres.png`: **High-resolution** original screenshot for **precision actions** (zoom_region, get_pixel).
- `latest.png`: Symlink to the high-resolution original for backward compatibility.
- `latest_zoom.png`: The most recent zoomed-in region for fine-detail analysis.

---
*Developed for advanced agentic coding workflows.*
