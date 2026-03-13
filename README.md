# Computer Operator (macOS Skill)

Vision-driven macOS desktop automation using **glm-4.7**. This skill allows an AI agent to control the desktop via screenshots, precise coordinate mapping, and native AppleScript interactions.

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
Load the `SKILL.md` file located in the root directory. This file contains the full technical specification, tool descriptions, and strategy patterns (including specialized support for WeChat, QQ, and VS Code).

---

## 🛠 Project Structure

- `SKILL.md`: Main technical documentation and behavioral guides for the AI.
- `scripts/`: Implementation of core automation tools (Node.js/AppleScript).
- `bin/cli.js`: CLI entry point for the `computer-operator` command.
- `package.json`: Dependency and metadata definition.

## 🚀 Core Workflow for AI Agents

1. **State Perception**: Use `screenshot.sh` to capture the current screen.
2. **Analysis**: Use `analyze_screen.js` to get the `scale_factor` and grid orientation.
3. **Precision Locking**: Use `get_window_bounds.js` or `zoom_region.js` for small/scaled UI elements.
4. **Action**: Use `mouse_action.js` or `keyboard_action.js` to interact.
5. **Validation**: Use `get_pixel.js` to confirm the UI changed as expected.
6. **Cleanup**: All temporary files and screenshots are stored in `/tmp/computer-operator/`. The `screenshot.sh` script automatically clears this directory before each new capture.

---
## 📂 Screenshot Storage
All visual assets are stored in `/tmp/computer-operator/` to ensure privacy and prevent cluttering the system `/tmp` root.
- `latest.png`: The most recent full-screen screenshot.
- `latest_zoom.png`: The most recent zoomed-in region.

---
*Developed for advanced agentic coding workflows.*
